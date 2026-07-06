"""Подписки: приём чека Kaspi и ручное подтверждение админом (раздел 3.1)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from bot import db
from bot.config import settings

SUB_PERIOD = timedelta(days=30)


async def has_pending(user_id: int) -> bool:
    """Защита: не более 1 pending-заявки на пользователя."""
    n = await db.fetchval(
        "SELECT count(*) FROM subscriptions WHERE user_id = $1 AND status = 'pending'",
        user_id,
    )
    return bool(n)


async def create_pending(user_id: int, receipt_url: str) -> dict:
    row = await db.fetchrow(
        """
        INSERT INTO subscriptions (user_id, status, receipt_url, amount)
        VALUES ($1, 'pending', $2, $3)
        RETURNING *
        """,
        user_id,
        receipt_url,
        settings.subscription_price,
    )
    return dict(row)


async def approve(subscription_id: int, admin_id: int) -> dict | None:
    now = datetime.now(timezone.utc)
    row = await db.fetchrow(
        """
        UPDATE subscriptions
        SET status = 'active', paid_at = $2, expires_at = $3, confirmed_by = $4
        WHERE id = $1 AND status = 'pending'
        RETURNING *
        """,
        subscription_id,
        now,
        now + SUB_PERIOD,
        admin_id,
    )
    return dict(row) if row else None


async def reject(subscription_id: int, admin_id: int) -> dict | None:
    row = await db.fetchrow(
        """
        UPDATE subscriptions SET status = 'rejected', confirmed_by = $2
        WHERE id = $1 AND status = 'pending'
        RETURNING *
        """,
        subscription_id,
        admin_id,
    )
    return dict(row) if row else None


async def approve_stars(user_id: int, charge_id: str, amount_stars: int) -> dict:
    """Оплата Telegram Stars: подписка активируется мгновенно, без админа."""
    now = datetime.now(timezone.utc)
    row = await db.fetchrow(
        """
        INSERT INTO subscriptions (user_id, status, amount, paid_at, expires_at,
                                   payment_method, tg_charge_id)
        VALUES ($1, 'active', $2, $3, $4, 'stars', $5)
        RETURNING *
        """,
        user_id,
        amount_stars,
        now,
        now + SUB_PERIOD,
        charge_id,
    )
    return dict(row)


async def refund_stars(bot, subscription_id: int) -> dict:
    """Возврат Stars-платежа: звёзды назад, подписка гаснет. Бросает ValueError.

    bot — aiogram Bot (у бота свой, у API — временный без polling).
    """
    sub = await db.fetchrow(
        """
        SELECT * FROM subscriptions
        WHERE id = $1 AND payment_method = 'stars' AND tg_charge_id IS NOT NULL
          AND status != 'refunded'
        """,
        subscription_id,
    )
    if sub is None:
        raise ValueError("Заявка не найдена, не Stars-платёж или уже возвращена.")
    await bot.refund_star_payment(
        user_id=sub["user_id"],
        telegram_payment_charge_id=sub["tg_charge_id"],
    )
    await db.execute("UPDATE subscriptions SET status = 'refunded' WHERE id = $1", sub["id"])
    return dict(sub)


async def apply_referral_bonus(user_id: int) -> int | None:
    """+7 дней рефереру при ПЕРВОЙ подписке приглашённого (раздел 3.6).

    Возвращает telegram_id реферера, если бонус начислен, иначе None.
    """
    row = await db.fetchrow(
        """
        SELECT u.referrer_id,
               (SELECT count(*) FROM subscriptions
                WHERE user_id = u.id AND status IN ('active', 'expired')) AS paid_count
        FROM users u WHERE u.id = $1
        """,
        user_id,
    )
    if row is None or row["referrer_id"] is None or row["paid_count"] != 1:
        return None
    bonus = await db.fetchrow(
        """
        UPDATE subscriptions SET expires_at = expires_at + interval '7 days'
        WHERE user_id = $1 AND status = 'active' AND expires_at > now()
        RETURNING user_id
        """,
        row["referrer_id"],
    )
    return row["referrer_id"] if bonus else None


async def savings(user_id: int) -> tuple[int, int]:
    """(визитов, сэкономлено ₸) — счётчик «вы сэкономили» по avg_check партнёра."""
    row = await db.fetchrow(
        """
        SELECT count(*) AS visits,
               coalesce(sum(
                 p.avg_check * coalesce(r.discount,
                   CASE WHEN r.type = 'premium'
                        THEN p.discount_premium ELSE p.discount_free END) / 100
               ), 0)::int AS saved
        FROM redemptions r JOIN partners p ON p.id = r.partner_id
        WHERE r.user_id = $1 AND r.status = 'used'
        """,
        user_id,
    )
    return row["visits"], row["saved"]


async def active_subscription(user_id: int) -> dict | None:
    row = await db.fetchrow(
        """
        SELECT * FROM subscriptions
        WHERE user_id = $1 AND status = 'active' AND expires_at > now()
        ORDER BY expires_at DESC LIMIT 1
        """,
        user_id,
    )
    return dict(row) if row else None
