"""Оплата подписки Telegram Stars (XTR): мгновенная активация без админа.

Инвойс создаёт API (POST /api/stars-invoice → createInvoiceLink), Mini App
открывает его через openInvoice. Telegram шлёт pre_checkout и successful_payment
боту — обрабатываем здесь.
"""
from __future__ import annotations

import contextlib
import logging

from aiogram import F, Router
from aiogram.types import Message, PreCheckoutQuery

from bot.services import payments
from bot.texts import t

log = logging.getLogger(__name__)
router = Router(name="stars")


@router.pre_checkout_query()
async def pre_checkout(query: PreCheckoutQuery) -> None:
    # Двойная оплата: если подписка уже активна — отклоняем до списания.
    if await payments.active_subscription(query.from_user.id):
        await query.answer(ok=False, error_message="Подписка уже активна.")
        return
    await query.answer(ok=True)


@router.message(F.successful_payment)
async def on_payment(message: Message) -> None:
    pay = message.successful_payment
    sub = await payments.approve_stars(
        message.from_user.id,
        pay.telegram_payment_charge_id,
        pay.total_amount,
    )
    log.info("stars payment: user=%s sub=%s charge=%s",
             message.from_user.id, sub["id"], pay.telegram_payment_charge_id)
    await message.answer("⭐️ Оплата получена — подписка активна на 30 дней!")

    referrer_id = await payments.apply_referral_bonus(message.from_user.id)
    if referrer_id:
        with contextlib.suppress(Exception):
            await message.bot.send_message(referrer_id, t("referral_bonus"))
