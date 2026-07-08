"""Профиль, визиты, активация скидки, оплата Stars."""
from __future__ import annotations

import asyncio
import contextlib
from datetime import datetime, timezone

from aiogram import Bot
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.auth import get_user
from bot import db
from bot.config import settings
from bot.services import payments, qr, redemption
from bot.texts import t

router = APIRouter()

# Ссылки на фоновые задачи: без них garbage collector может убить task на лету.
_bg_tasks: set[asyncio.Task] = set()


def _spawn(coro) -> asyncio.Task:
    task = asyncio.create_task(coro)
    _bg_tasks.add(task)
    task.add_done_callback(_bg_tasks.discard)
    return task


def _bot() -> Bot:
    """aiogram Bot без polling — для пингов и инвойсов из API."""
    return Bot(token=settings.bot_token)


async def _ping_partner(chat_id: int, text: str) -> None:
    bot = _bot()
    with contextlib.suppress(Exception):
        await bot.send_message(chat_id, text)
    await bot.session.close()


@router.get("/me")
async def me(user: dict = Depends(get_user)) -> dict:
    sub = await payments.active_subscription(user["id"])
    visits, saved = await payments.savings(user["id"])
    days_left = None
    if sub:
        days_left = max((sub["expires_at"] - datetime.now(timezone.utc)).days, 0)
    return {
        "id": user["id"],
        "full_name": user["full_name"],
        "role": user["role"],
        "notify_daily": user["notify_daily"],
        "subscription": {
            "active": sub is not None,
            "days_left": days_left,
            "pending": await payments.has_pending(user["id"]) if not sub else False,
        },
        "visits": visits,
        "saved": saved,
        "daily_sign": qr.daily_sign(),
    }


@router.get("/me/visits")
async def my_visits(user: dict = Depends(get_user)) -> list[dict]:
    rows = await db.fetch(
        """
        SELECT p.name, r.used_at,
               coalesce(r.discount,
                 CASE WHEN r.type = 'premium' THEN p.discount_premium ELSE p.discount_free END) AS discount
        FROM redemptions r JOIN partners p ON p.id = r.partner_id
        WHERE r.user_id = $1 AND r.status = 'used'
        ORDER BY r.used_at DESC LIMIT 50
        """,
        user["id"],
    )
    return [dict(r) for r in rows]


class NotifyBody(BaseModel):
    enabled: bool


@router.post("/me/notify")
async def set_notify(body: NotifyBody, user: dict = Depends(get_user)) -> dict:
    await db.execute("UPDATE users SET notify_daily = $2 WHERE id = $1", user["id"], body.enabled)
    return {"notify_daily": body.enabled}


class ActivateBody(BaseModel):
    partner_id: int


@router.post("/activate")
async def activate(body: ActivateBody, user: dict = Depends(get_user)) -> dict:
    """Экран активации в Mini App (вариант C): визит пишется сразу + пинг партнёру."""
    try:
        result = await redemption.activate(user["id"], body.partner_id)
    except redemption.NeedSubscription as e:
        raise HTTPException(402, {"reason": "need_subscription",
                                  "partner": e.partner_name, "discount": e.discount})
    except redemption.RedeemError as e:
        raise HTTPException(409, str(e))

    now = datetime.now(timezone.utc)
    partner = result["partner"]
    if partner["user_id"]:
        # Пинг партнёру — в фоне: клиент не должен ждать Telegram API
        _spawn(_ping_partner(
            partner["user_id"],
            t("partner_ping", name=user["full_name"] or "Клиент",
              discount=result["discount"], time=now.strftime("%H:%M")),
        ))

    return {
        "partner_name": partner["name"],
        "discount": result["discount"],
        "kind": result["kind"],
        "client_name": user["full_name"],
        "daily_sign": qr.daily_sign(),
        "server_time": now.isoformat(),
        "expires_at": result["redemption"]["expires_at"].isoformat(),
    }


@router.post("/stars-invoice")
async def stars_invoice(user: dict = Depends(get_user)) -> dict:
    """Ссылка на инвойс в Stars (XTR) — Mini App открывает её через openInvoice.

    Активная подписка не блокирует оплату: продление стекуется — +30 дней
    к текущему сроку (раздел 3.1).
    """
    bot = _bot()
    try:
        link = await bot.create_invoice_link(
            title="Подписка Ynem",
            description="Скидки 10–15% у всех партнёров на 30 дней "
                        "(при активной подписке — продление, дни сложатся)",
            payload=f"sub:{user['id']}",
            currency="XTR",
            prices=[{"label": "Подписка на 30 дней",
                     "amount": settings.subscription_price_stars}],
        )
    finally:
        await bot.session.close()
    return {"invoice_link": link}
