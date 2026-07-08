"""Entrypoint бота: Dispatcher, long polling (раздел 5 — webhook не нужен)."""
from __future__ import annotations

import asyncio
import logging

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.fsm.storage.memory import MemoryStorage

from bot import db
from bot.config import settings
from bot.handlers import setup_routers
from bot.middlewares.auth import AuthMiddleware
from bot.scheduler import setup_scheduler

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("bot")


async def main() -> None:
    await db.init_pool()

    bot = Bot(
        token=settings.bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    dp = Dispatcher(storage=MemoryStorage())

    # Middleware авторизации на сообщения и колбэки. Именно outer:
    # роль должна попадать в data ДО фильтров роутеров (MagicData в admin.py),
    # inner-middleware выполняется уже после них.
    dp.message.outer_middleware(AuthMiddleware())
    dp.callback_query.outer_middleware(AuthMiddleware())

    setup_routers(dp)

    scheduler = setup_scheduler(bot)
    scheduler.start()

    log.info("Бот запущен (long polling)")
    try:
        await dp.start_polling(bot)
    finally:
        scheduler.shutdown(wait=False)
        await db.close_pool()
        await bot.session.close()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        log.info("Остановлено")
