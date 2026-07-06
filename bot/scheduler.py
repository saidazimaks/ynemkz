"""APScheduler: скидка дня, деактивация подписок, напоминания, протухание QR (раздел 1)."""
from __future__ import annotations

import asyncio
import contextlib
import logging

from aiogram import Bot
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from bot import db
from bot.services import qr
from bot.texts import t

log = logging.getLogger(__name__)


async def expire_subscriptions() -> None:
    """Просроченные active → expired."""
    res = await db.execute(
        "UPDATE subscriptions SET status = 'expired' "
        "WHERE status = 'active' AND expires_at <= now()"
    )
    log.info("expire_subscriptions: %s", res)


async def expire_redemptions() -> None:
    """Непогашенные коды с истёкшим TTL → expired."""
    await db.execute(
        "UPDATE redemptions SET status = 'expired' "
        "WHERE status = 'issued' AND expires_at <= now()"
    )


async def remind_expiring(bot: Bot) -> None:
    """За 3 дня до expires_at — напоминание о продлении (раздел 3.1).

    Запускается раз в день; выбирает подписки, истекающие ровно через 3 дня, —
    так каждый получает одно напоминание без флага «уже напомнили».
    """
    rows = await db.fetch(
        """
        SELECT user_id, expires_at FROM subscriptions
        WHERE status = 'active'
          AND expires_at::date = (now() + interval '3 days')::date
        """
    )
    for r in rows:
        with contextlib.suppress(Exception):
            await bot.send_message(r["user_id"], t("sub_reminder", days=3))
        await asyncio.sleep(0.05)
    if rows:
        log.info("remind_expiring: напомнили %d", len(rows))


async def notify_daily_deal(bot: Bot) -> None:
    """Утро: скидка дня пользователям (notify_daily) + знак дня партнёрам (раздел 3.2)."""
    sign = qr.daily_sign()

    # Знак дня — всем активным партнёрам (анти-фрод сверка на кассе).
    partners = await db.fetch(
        "SELECT user_id FROM partners WHERE is_active AND user_id IS NOT NULL"
    )
    for p in partners:
        with contextlib.suppress(Exception):
            await bot.send_message(p["user_id"], f"Знак дня сегодня: {sign}")
        await asyncio.sleep(0.05)

    # Карточка скидки дня — пользователям с включёнными уведомлениями.
    deal = await db.fetchrow(
        """
        SELECT p.name, p.address, p.discount_free, d.description
        FROM daily_deals d JOIN partners p ON p.id = d.partner_id
        WHERE d.deal_date = now()::date
        """
    )
    if deal is None:
        log.info("notify_daily_deal: скидка дня не назначена")
        return

    text = (
        f"🔥 Скидка дня: <b>{deal['name']}</b> — {deal['discount_free']}%\n"
        f"{deal['description'] or ''}\n📍 {deal['address'] or ''}"
    )
    users = await db.fetch(
        "SELECT id FROM users WHERE notify_daily AND NOT is_banned AND role = 'buyer'"
    )
    sent = 0
    for u in users:
        with contextlib.suppress(Exception):
            await bot.send_message(u["id"], text)
            sent += 1
        await asyncio.sleep(0.05)  # ~20 msg/сек, под лимитом Telegram
    log.info("notify_daily_deal: отправлено %d, знак %s", sent, sign)


def setup_scheduler(bot: Bot) -> AsyncIOScheduler:
    sched = AsyncIOScheduler(timezone="Asia/Almaty")
    sched.add_job(expire_subscriptions, "interval", hours=1, id="expire_subs")
    sched.add_job(expire_redemptions, "interval", minutes=10, id="expire_redemptions")
    sched.add_job(notify_daily_deal, "cron", hour=9, minute=0, args=[bot], id="daily_deal")
    sched.add_job(remind_expiring, "cron", hour=11, minute=0, args=[bot], id="remind_expiring")
    return sched
