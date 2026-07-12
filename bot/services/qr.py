"""Генерация кодов активации и QR-наклеек для касс.

- gen_code(): короткий человекочитаемый код (фолбэк-вариант A).
- partner_qr(): PNG с deep link t.me/bot?start=p_<id> для наклейки (вариант C).
- daily_sign(): «знак дня» — эмодзи, которое утром рассылается партнёрам и
  показывается на экране активации (анти-фрод, раздел 3.2).
"""
from __future__ import annotations

import io
import secrets
from datetime import date, datetime
from zoneinfo import ZoneInfo

import qrcode

# Без похожих символов (0/O, 1/I) — чтобы кассир не ошибся при вводе.
_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
_SIGNS = ["🔴", "🟢", "🔵", "🟡", "🟣", "🟠", "⭐️", "❤️", "🔶", "🔷", "🍀", "⚡️"]


def gen_code(length: int = 6) -> str:
    return "".join(secrets.choice(_ALPHABET) for _ in range(length))


def gen_client_token() -> str:
    """Токен персонального QR клиента (вариант D, раздел 3.2).

    URL-safe алфавит [A-Za-z0-9_-] — токен целиком влезает в startapp=c_<token>.
    """
    return secrets.token_urlsafe(9)  # 12 символов


def partner_qr(bot_username: str, partner_id: int, app_name: str = "app") -> bytes:
    """PNG QR-кода наклейки: Direct Link в Mini App на экран активации.

    t.me/<bot>/<app>?startapp=p_<id> — Mini App открывается сразу.
    Для незарегистрированных Mini App отправит в бот (фолбэк ?start=p_<id>).
    """
    link = f"https://t.me/{bot_username}/{app_name}?startapp=p_{partner_id}"
    img = qrcode.make(link)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def daily_sign(day: date | None = None) -> str:
    """Детерминированный знак дня — одинаковый у всех, меняется каждый день.

    День считаем по Asia/Almaty, а не по TZ сервера: иначе знак «переключался»
    бы среди рабочего дня или ночью не в полночь Экибастуза.
    """
    day = day or datetime.now(ZoneInfo("Asia/Almaty")).date()
    return _SIGNS[day.toordinal() % len(_SIGNS)]
