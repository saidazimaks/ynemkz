"""Регистрация всех роутеров бота."""
from __future__ import annotations

from aiogram import Dispatcher

from bot.handlers import admin, buyer, partner, stars


def setup_routers(dp: Dispatcher) -> None:
    # Порядок важен: admin/partner проверяют роль, buyer — фолбэк.
    dp.include_router(stars.router)
    dp.include_router(admin.router)
    dp.include_router(partner.router)
    dp.include_router(buyer.router)
