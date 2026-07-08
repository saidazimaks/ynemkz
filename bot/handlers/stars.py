"""Оплата подписки Telegram Stars (XTR): мгновенная активация без админа.

Инвойс создаёт API (POST /api/stars-invoice → createInvoiceLink), Mini App
открывает его через openInvoice. Telegram шлёт pre_checkout и successful_payment
боту — обрабатываем здесь.

pre_checkout_query не проходит AuthMiddleware (она висит на message/callback),
поэтому бан и регистрацию проверяем тут сами — ДО списания денег. Активная
подписка оплату не блокирует: продление стекуется (+30 дней, раздел 3.1).
"""
from __future__ import annotations

import contextlib
import logging

from aiogram import F, Router
from aiogram.types import Message, PreCheckoutQuery

from bot import db
from bot.services import payments
from bot.texts import t

log = logging.getLogger(__name__)
router = Router(name="stars")


@router.pre_checkout_query()
async def pre_checkout(query: PreCheckoutQuery) -> None:
    row = await db.fetchrow(
        "SELECT is_banned FROM users WHERE id = $1", query.from_user.id
    )
    if row is None:
        # Незарегистрированный: отклоняем до списания, иначе упрёмся в FK users.
        await query.answer(ok=False, error_message=t("pay_not_registered"))
        return
    if row["is_banned"]:
        await query.answer(ok=False, error_message=t("pay_banned"))
        return
    await query.answer(ok=True)


@router.message(F.successful_payment)
async def on_payment(message: Message) -> None:
    """Деньги уже списаны — платёж учитываем всегда (в т.ч. для забаненных:
    AuthMiddleware пропускает successful_payment)."""
    pay = message.successful_payment

    # Страховка от FK-падения: если пользователя нет (оплатил в обход
    # pre_checkout-проверки), заводим минимальную запись — деньги уплачены.
    await db.execute(
        """
        INSERT INTO users (id, username, full_name)
        VALUES ($1, $2, $3)
        ON CONFLICT (id) DO NOTHING
        """,
        message.from_user.id,
        message.from_user.username,
        message.from_user.full_name,
    )

    sub = await payments.approve_stars(
        message.from_user.id,
        pay.telegram_payment_charge_id,
        pay.total_amount,
    )
    if sub is None:
        # Повторная доставка successful_payment — платёж уже учтён.
        log.warning("stars payment: повторная доставка charge=%s user=%s",
                    pay.telegram_payment_charge_id, message.from_user.id)
        return

    log.info("stars payment: user=%s sub=%s charge=%s",
             message.from_user.id, sub["id"], pay.telegram_payment_charge_id)
    await message.answer(t("stars_paid", date=f"{sub['expires_at']:%d.%m.%Y}"))

    referrer_id = await payments.apply_referral_bonus(message.from_user.id)
    if referrer_id:
        with contextlib.suppress(Exception):
            await message.bot.send_message(referrer_id, t("referral_bonus"))
