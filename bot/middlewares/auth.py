"""Middleware авторизации: подтягивает пользователя из БД, кладёт роль в контекст.

Роль = users.role, но telegram_id из ADMIN_IDS всегда admin (раздел 4).
Забаненных отсекает сразу.
"""
from __future__ import annotations

from typing import Any, Awaitable, Callable

from aiogram import BaseMiddleware
from aiogram.types import Message, TelegramObject, User

from bot import db
from bot.config import settings


class AuthMiddleware(BaseMiddleware):
    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        tg_user: User | None = data.get("event_from_user")
        if tg_user is None:
            return await handler(event, data)

        row = await db.fetchrow("SELECT * FROM users WHERE id = $1", tg_user.id)

        if row is not None and row["is_banned"]:
            # successful_payment пропускаем даже для забаненных: деньги уже
            # списаны, платёж обязан быть учтён (bot/handlers/stars.py).
            is_payment = isinstance(event, Message) and event.successful_payment
            if not is_payment:
                return  # молча игнорируем забаненных

        role = row["role"] if row else "buyer"
        if tg_user.id in settings.admin_id_set:
            role = "admin"

        data["db_user"] = dict(row) if row else None
        data["role"] = role
        data["lang"] = (row["lang"] if row else settings.default_lang)
        return await handler(event, data)
