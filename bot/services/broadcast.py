"""Рассылки батчами (лимит Telegram ~25 msg/сек, раздел 3.5).

Фаза 1: минимальная реализация для админ-рассылки с подтверждением.
"""
from __future__ import annotations

import asyncio

from aiogram import Bot

from bot import db

BATCH_SIZE = 25
BATCH_PAUSE = 1.0  # секунда между батчами


async def segment_ids(segment: str) -> list[int]:
    """Сегменты: all | subscribers | expired."""
    if segment == "subscribers":
        q = """SELECT DISTINCT s.user_id
               FROM subscriptions s JOIN users u ON u.id = s.user_id
               WHERE s.status = 'active' AND s.expires_at > now()
                 AND NOT u.is_banned"""
    elif segment == "expired":
        q = """SELECT DISTINCT s.user_id
               FROM subscriptions s JOIN users u ON u.id = s.user_id
               WHERE (s.status = 'expired'
                      OR (s.status = 'active' AND s.expires_at <= now()))
                 AND NOT u.is_banned"""
    else:
        q = "SELECT id FROM users WHERE is_banned = false"
    rows = await db.fetch(q)
    return [r[0] for r in rows]


async def send(bot: Bot, text: str, segment: str = "all") -> int:
    """Разослать текст сегменту, вернуть число успешных отправок."""
    ids = await segment_ids(segment)
    sent = 0
    for i in range(0, len(ids), BATCH_SIZE):
        batch = ids[i : i + BATCH_SIZE]
        for uid in batch:
            try:
                await bot.send_message(uid, text)
                sent += 1
            except Exception:  # noqa: BLE001 — заблокировавшие бота и т.п.
                continue
        await asyncio.sleep(BATCH_PAUSE)
    await db.execute(
        "INSERT INTO broadcasts (text, sent_at, sent_count) VALUES ($1, now(), $2)",
        text,
        sent,
    )
    return sent
