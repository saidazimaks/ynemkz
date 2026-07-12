"""Админка в Mini App: чеки, метрики, партнёры (CRUD + QR), подписчики,
календарь скидки дня, рассылки, бан, возвраты Stars."""
from __future__ import annotations

import asyncio
import contextlib
from typing import Literal

from aiogram import Bot
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel

# Канонические категории каталога (Mini App показывает их чипами в этом порядке).
# Не подходит ничего — оставляем NULL, витрина покажет «Другое».
Category = Literal["Еда", "Красота", "Фитнес", "Развлечения", "Шопинг"]

from api.auth import require_role
from bot import db
from bot.config import settings
from bot.services import broadcast as broadcast_svc
from bot.services import partners as partners_svc
from bot.services import payments, qr
from bot.texts import t

router = APIRouter(dependencies=[Depends(require_role("admin"))])

# Ссылки на фоновые задачи: без них garbage collector может убить task на лету.
_bg_tasks: set[asyncio.Task] = set()


def _spawn(coro) -> asyncio.Task:
    task = asyncio.create_task(coro)
    _bg_tasks.add(task)
    task.add_done_callback(_bg_tasks.discard)
    return task

_bot_username: str | None = None


async def _get_bot_username(bot: Bot) -> str:
    global _bot_username
    if _bot_username is None:
        _bot_username = (await bot.get_me()).username or ""
    return _bot_username


# --- Сводка и чеки ---------------------------------------------------------------

@router.get("/receipts")
async def receipts() -> list[dict]:
    rows = await db.fetch(
        """
        SELECT s.id, s.amount, s.receipt_url, s.created_at,
               u.id AS user_id, u.full_name, u.username, u.phone
        FROM subscriptions s JOIN users u ON u.id = s.user_id
        WHERE s.status = 'pending' ORDER BY s.created_at
        """
    )
    return [dict(r) for r in rows]


class DecideBody(BaseModel):
    approve: bool


@router.post("/receipts/{sub_id}/decide")
async def decide(sub_id: int, body: DecideBody,
                 user: dict = Depends(require_role("admin"))) -> dict:
    if body.approve:
        sub = await payments.approve(sub_id, user["id"])
    else:
        sub = await payments.reject(sub_id, user["id"])
    if sub is None:
        raise HTTPException(409, "заявка не найдена или уже обработана")

    bot = Bot(token=settings.bot_token)
    with contextlib.suppress(Exception):
        await bot.send_message(
            sub["user_id"],
            t("sub_approved", date=f"{sub['expires_at']:%d.%m.%Y}") if body.approve
            else "❌ Заявка отклонена. Проверьте чек и попробуйте снова.",
        )
    if body.approve:
        referrer_id = await payments.apply_referral_bonus(sub["user_id"])
        if referrer_id:
            with contextlib.suppress(Exception):
                await bot.send_message(referrer_id, t("referral_bonus"))
    await bot.session.close()
    return {"ok": True}


@router.get("/stats")
async def stats() -> dict:
    row = await db.fetchrow(
        """
        SELECT
          (SELECT count(*) FROM users)                                        AS users_total,
          (SELECT count(*) FROM users WHERE created_at::date = now()::date)   AS users_today,
          (SELECT count(*) FROM subscriptions
             WHERE status = 'active' AND expires_at > now())                  AS subs_active,
          (SELECT count(*) FROM subscriptions WHERE status = 'pending')       AS subs_pending,
          (SELECT count(*) FROM redemptions
             WHERE status = 'used' AND used_at::date = now()::date)           AS visits_today,
          (SELECT count(*) FROM redemptions
             WHERE status = 'used' AND used_at >= now() - interval '30 days') AS visits_month
        """
    )
    return dict(row)


# --- Партнёры: CRUD + QR ----------------------------------------------------------

@router.get("/partners")
async def partners_list() -> list[dict]:
    rows = await db.fetch("SELECT * FROM partners ORDER BY is_active DESC, name")
    return [dict(r) for r in rows]


class PartnerCreate(BaseModel):
    name: str
    user_tg_id: int | None = None  # владелец кабинета (получит роль partner)
    category: Category | None = None
    address: str | None = None


@router.post("/partners")
async def partner_create(body: PartnerCreate) -> dict:
    if body.user_tg_id:
        await db.execute(
            """INSERT INTO users (id, role) VALUES ($1, 'partner')
               ON CONFLICT (id) DO UPDATE SET role = 'partner'""",
            body.user_tg_id,
        )
    pid = await db.fetchval(
        """INSERT INTO partners (user_id, name, category, address)
           VALUES ($1, $2, $3, $4) RETURNING id""",
        body.user_tg_id, body.name, body.category, body.address,
    )
    return {"id": pid}


class PartnerPatch(BaseModel):
    name: str | None = None
    category: Category | None = None
    address: str | None = None
    work_hours: str | None = None
    discount_free: int | None = None
    discount_premium: int | None = None
    avg_check: int | None = None
    lat: float | None = None
    lng: float | None = None
    is_active: bool | None = None
    is_paused: bool | None = None
    user_tg_id: int | None = None


@router.patch("/partners/{partner_id}")
async def partner_patch(partner_id: int, body: PartnerPatch) -> dict:
    fields = body.model_dump(exclude_none=True)
    tg_id = fields.pop("user_tg_id", None)
    if tg_id:
        await db.execute(
            """INSERT INTO users (id, role) VALUES ($1, 'partner')
               ON CONFLICT (id) DO UPDATE SET role = 'partner'""",
            tg_id,
        )
        fields["user_id"] = tg_id
    if not fields:
        raise HTTPException(422, "нет полей для обновления")

    sets = ", ".join(f"{k} = ${i + 2}" for i, k in enumerate(fields))
    row = await db.fetchrow(
        f"UPDATE partners SET {sets} WHERE id = $1 RETURNING *",  # noqa: S608 — ключи из модели
        partner_id, *fields.values(),
    )
    if row is None:
        raise HTTPException(404, "partner not found")
    return dict(row)


@router.get("/partners/{partner_id}/qr")
async def partner_qr_png(partner_id: int) -> Response:
    """PNG наклейки — Mini App показывает и даёт сохранить."""
    exists = await db.fetchval("SELECT 1 FROM partners WHERE id = $1", partner_id)
    if not exists:
        raise HTTPException(404, "partner not found")
    bot = Bot(token=settings.bot_token)
    try:
        username = await _get_bot_username(bot)
    finally:
        await bot.session.close()
    png = qr.partner_qr(username, partner_id)
    return Response(content=png, media_type="image/png")


# --- Заявки партнёров на изменение карточки (модерация) ---------------------------

@router.get("/partner-edits")
async def partner_edits() -> list[dict]:
    """Очередь заявок: изменения + текущие значения для диффа."""
    return await partners_svc.edits_pending()


@router.post("/partner-edits/{edit_id}/decide")
async def partner_edit_decide(edit_id: int, body: DecideBody,
                              user: dict = Depends(require_role("admin"))) -> dict:
    result = await partners_svc.decide_edit(edit_id, user["id"], body.approve)
    if result is None:
        raise HTTPException(409, "заявка не найдена или уже обработана")

    # Владельцу — решение в бот
    owner_id = result["partner"]["user_id"]
    if owner_id:
        bot = Bot(token=settings.bot_token)
        with contextlib.suppress(Exception):
            await bot.send_message(
                owner_id,
                t("edit_approved" if body.approve else "edit_rejected",
                  partner=result["partner"]["name"]),
            )
        await bot.session.close()
    return {"ok": True}


# --- Люди: все пользователи, поиск, бан, возвраты ---------------------------------

# Фильтр поиска: имя, @username или телефон
_USERS_WHERE = """($1::text IS NULL
               OR u.full_name ILIKE '%' || $1 || '%'
               OR u.username ILIKE '%' || $1 || '%'
               OR u.phone LIKE '%' || $1 || '%')"""


@router.get("/users")
async def users_list(q: str | None = None) -> dict:
    """Все пользователи, новые сверху; активная подписка и визиты — если есть.

    LIMIT 200 — на масштабе города достаточно, точечно ищут поиском;
    total показывает настоящий размер базы.
    """
    rows = await db.fetch(
        f"""
        SELECT u.id, u.full_name, u.username, u.phone, u.role, u.is_banned,
               u.created_at, s.id AS sub_id, s.expires_at, s.payment_method,
               (SELECT count(*) FROM redemptions r
                WHERE r.user_id = u.id AND r.status = 'used') AS visits
        FROM users u
        LEFT JOIN LATERAL (
            SELECT id, expires_at, payment_method FROM subscriptions
            WHERE user_id = u.id AND status = 'active' AND expires_at > now()
            ORDER BY expires_at DESC LIMIT 1
        ) s ON true
        WHERE {_USERS_WHERE}
        ORDER BY u.created_at DESC
        LIMIT 200
        """,
        q,
    )
    total = await db.fetchval(f"SELECT count(*) FROM users u WHERE {_USERS_WHERE}", q)
    return {"total": total, "users": [dict(r) for r in rows]}


class BanBody(BaseModel):
    banned: bool


@router.post("/users/{user_id}/ban")
async def ban_user(user_id: int, body: BanBody) -> dict:
    res = await db.execute("UPDATE users SET is_banned = $2 WHERE id = $1", user_id, body.banned)
    if res.endswith("0"):
        raise HTTPException(404, "user not found")
    return {"ok": True}


@router.post("/subscriptions/{sub_id}/refund")
async def refund(sub_id: int) -> dict:
    bot = Bot(token=settings.bot_token)
    try:
        sub = await payments.refund_stars(bot, sub_id)
        with contextlib.suppress(Exception):
            await bot.send_message(sub["user_id"], "⭐️ Платёж возвращён, подписка отменена.")
    except ValueError as e:
        raise HTTPException(409, str(e))
    finally:
        await bot.session.close()
    return {"ok": True}


# --- Календарь скидки дня ----------------------------------------------------------

class DailyDealBody(BaseModel):
    partner_id: int
    deal_date: str  # YYYY-MM-DD
    description: str | None = None


@router.post("/daily-deals")
async def set_daily_deal(body: DailyDealBody) -> dict:
    await db.execute(
        """
        INSERT INTO daily_deals (partner_id, deal_date, description)
        VALUES ($1, $2::date, $3)
        ON CONFLICT (deal_date) DO UPDATE
          SET partner_id = EXCLUDED.partner_id, description = EXCLUDED.description
        """,
        body.partner_id,
        body.deal_date,
        body.description,
    )
    return {"ok": True}


@router.get("/daily-deals")
async def daily_deals() -> list[dict]:
    rows = await db.fetch(
        """
        SELECT d.deal_date, d.description, p.id AS partner_id, p.name
        FROM daily_deals d JOIN partners p ON p.id = d.partner_id
        WHERE d.deal_date >= now()::date
        ORDER BY d.deal_date
        """
    )
    return [dict(r) for r in rows]


# --- Рассылка (предпросмотр → отправка) ---------------------------------------------

class BroadcastBody(BaseModel):
    segment: str  # all | subscribers | expired
    text: str
    dry_run: bool = False


async def _send_broadcast(text: str, segment: str) -> None:
    bot = Bot(token=settings.bot_token)
    try:
        await broadcast_svc.send(bot, text, segment)
    finally:
        await bot.session.close()


@router.post("/broadcast")
async def do_broadcast(body: BroadcastBody) -> dict:
    if body.segment not in ("all", "subscribers", "expired"):
        raise HTTPException(422, "segment: all | subscribers | expired")
    recipients = len(await broadcast_svc.segment_ids(body.segment))
    if body.dry_run:
        return {"recipients": recipients, "sent": False}
    # Батчи по 25 msg/сек — может идти минуты, не держим запрос
    _spawn(_send_broadcast(body.text, body.segment))
    return {"recipients": recipients, "sent": True}
