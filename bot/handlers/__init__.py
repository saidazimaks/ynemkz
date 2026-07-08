"""Регистрация всех роутеров бота."""
from __future__ import annotations

from aiogram import Dispatcher

from bot.handlers import admin, buyer, partner, stars


def setup_routers(dp: Dispatcher) -> None:
    # Порядок важен: admin отфильтрован по роли (MagicData), partner проверяет
    # роль в хэндлерах, buyer — фолбэк. access_router (/admin_access) — без
    # фильтра роли, иначе admin не получить.
    dp.include_router(stars.router)
    dp.include_router(admin.access_router)
    dp.include_router(admin.router)
    dp.include_router(partner.router)
    dp.include_router(buyer.router)
