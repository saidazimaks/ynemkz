"""Партнёры: владелец и кассиры (partner_staff), получатели пингов, смена скидки.

Раздел 3.2 ARCHITECTURE.md (edge case «несколько кассиров») и 3.3 («Моя скидка»).
Роль кассира статическая: users.role='partner' ставится при добавлении и снимается
при удалении, если не осталось связей. Админа в обе стороны не трогаем.
Кассир добавляется по @username/id или инвайт-ссылкой (staff_invites, миграция 005).
"""
from __future__ import annotations

import secrets

import asyncpg

from bot import db

DISCOUNT_MIN, DISCOUNT_MAX = 10, 15
INVITE_TTL_HOURS = 24


class StaffError(Exception):
    """Ошибка бизнес-правила управления кассирами (текст показывается пользователю)."""


async def partner_for_user(user_id: int) -> tuple[dict, bool] | None:
    """Заведение пользователя: владелец (partners.user_id) или кассир (partner_staff).

    Возвращает (partner_row, is_owner) или None. Владение приоритетнее
    (uq_partner_staff_user гарантирует не больше одного заведения у кассира).
    """
    row = await db.fetchrow(
        """
        SELECT p.*, (p.user_id = $1) AS is_owner
        FROM partners p
        LEFT JOIN partner_staff s ON s.partner_id = p.id AND s.user_id = $1
        WHERE p.is_active AND (p.user_id = $1 OR s.user_id IS NOT NULL)
        ORDER BY (p.user_id = $1) DESC
        LIMIT 1
        """,
        user_id,
    )
    if row is None:
        return None
    partner = dict(row)
    is_owner = partner.pop("is_owner")
    return partner, is_owner


async def ping_recipients(partner_id: int) -> list[int]:
    """telegram_id владельца и всех кассиров заведения (без забаненных)."""
    rows = await db.fetch(
        """
        SELECT u.id FROM users u
        WHERE NOT u.is_banned AND (
              u.id = (SELECT user_id FROM partners WHERE id = $1)
           OR u.id IN (SELECT user_id FROM partner_staff WHERE partner_id = $1))
        """,
        partner_id,
    )
    return [r["id"] for r in rows]


async def staff_list(partner_id: int) -> list[dict]:
    rows = await db.fetch(
        """
        SELECT s.user_id, u.full_name, u.username, s.added_at
        FROM partner_staff s JOIN users u ON u.id = s.user_id
        WHERE s.partner_id = $1
        ORDER BY s.added_at
        """,
        partner_id,
    )
    return [dict(r) for r in rows]


async def staff_add(partner_id: int, owner_id: int, cashier_id: int) -> None:
    """Добавить кассира к заведению. Бросает StaffError с понятным текстом.

    Повторное добавление того же кассира — идемпотентно (не ошибка).
    """
    if cashier_id == owner_id:
        raise StaffError("Это владелец заведения — он и так получает пинги.")

    cashier = await db.fetchrow("SELECT role FROM users WHERE id = $1", cashier_id)
    if cashier is None:
        raise StaffError("Кассир должен сначала запустить бота и зарегистрироваться.")

    other_owner = await db.fetchval(
        "SELECT 1 FROM partners WHERE user_id = $1 AND id <> $2", cashier_id, partner_id
    )
    if other_owner:
        raise StaffError("Этот пользователь — владелец другого заведения.")

    try:
        await db.execute(
            """INSERT INTO partner_staff (partner_id, user_id) VALUES ($1, $2)
               ON CONFLICT (partner_id, user_id) DO NOTHING""",
            partner_id, cashier_id,
        )
    except asyncpg.UniqueViolationError:
        # uq_partner_staff_user: кассир может работать только в одном заведении
        raise StaffError("Этот пользователь уже кассир другого заведения.")

    # Роль повышаем только покупателю: admin не трогаем.
    await db.execute(
        "UPDATE users SET role = 'partner' WHERE id = $1 AND role = 'buyer'", cashier_id
    )


async def staff_remove(partner_id: int, cashier_id: int) -> None:
    """Удалить кассира; вернуть роль buyer, если связей с заведениями не осталось."""
    await db.execute(
        "DELETE FROM partner_staff WHERE partner_id = $1 AND user_id = $2",
        partner_id, cashier_id,
    )
    await db.execute(
        """
        UPDATE users SET role = 'buyer'
        WHERE id = $1 AND role = 'partner'
          AND NOT EXISTS (SELECT 1 FROM partners WHERE user_id = $1 AND is_active)
          AND NOT EXISTS (SELECT 1 FROM partner_staff WHERE user_id = $1)
        """,
        cashier_id,
    )


async def resolve_user_id(query: str) -> int:
    """@username или числовой id → telegram_id зарегистрированного пользователя."""
    q = query.strip().lstrip("@")
    if q.isdigit():
        return int(q)
    user_id = await db.fetchval("SELECT id FROM users WHERE lower(username) = lower($1)", q)
    if user_id is None:
        raise StaffError(
            f"Пользователь @{q} не найден — он ещё не запускал бота. "
            "Пригласите его по ссылке."
        )
    return user_id


async def create_invite(partner_id: int) -> str:
    """Одноразовая инвайт-ссылка кассира: t.me/<bot>?start=staff_<token>, TTL 24 ч."""
    # Подчищаем использованные и просроченные приглашения заведения
    await db.execute(
        """DELETE FROM staff_invites
           WHERE partner_id = $1 AND (used_by IS NOT NULL OR expires_at < now())""",
        partner_id,
    )
    token = secrets.token_urlsafe(12)  # 16 url-safe символов — влезает в start payload
    await db.execute(
        """INSERT INTO staff_invites (token, partner_id, expires_at)
           VALUES ($1, $2, now() + make_interval(hours => $3))""",
        token, partner_id, INVITE_TTL_HOURS,
    )
    return token


async def use_invite(token: str, cashier_id: int) -> dict:
    """Погасить приглашение (атомарно) и добавить кассира. Возвращает заведение.

    Если добавить не вышло по бизнес-правилу (уже кассир и т.п.) — приглашение
    возвращается неиспользованным, чтобы владельцу не пришлось делать новое.
    """
    row = await db.fetchrow(
        """UPDATE staff_invites SET used_by = $2
           WHERE token = $1 AND used_by IS NULL AND expires_at > now()
           RETURNING partner_id""",
        token, cashier_id,
    )
    if row is None:
        raise StaffError(
            "Ссылка-приглашение недействительна или уже использована. "
            "Попросите владельца прислать новую."
        )
    partner = await db.fetchrow(
        "SELECT * FROM partners WHERE id = $1 AND is_active", row["partner_id"]
    )
    if partner is None:
        raise StaffError("Заведение не найдено или отключено.")
    try:
        await staff_add(partner["id"], partner["user_id"], cashier_id)
    except StaffError:
        await db.execute("UPDATE staff_invites SET used_by = NULL WHERE token = $1", token)
        raise
    return dict(partner)


async def set_premium_discount(partner_id: int, value: int) -> int:
    """Смена % для подписчиков владельцем — только в пределах 10–15 (раздел 3.3).

    История визитов не меняется: redemptions.discount фиксируется на момент визита.
    """
    new = await db.fetchval(
        """UPDATE partners SET discount_premium = $2
           WHERE id = $1 AND $2 BETWEEN 10 AND 15
           RETURNING discount_premium""",
        partner_id, value,
    )
    if new is None:
        raise ValueError(f"скидка должна быть от {DISCOUNT_MIN} до {DISCOUNT_MAX}%")
    return new
