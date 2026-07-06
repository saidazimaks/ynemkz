"""Партнёр: ввод кода клиента (фолбэк A), статистика, пауза (раздел 3.3)."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import Message

from bot import db
from bot.services import redemption

router = Router(name="partner")


class EnterCode(StatesGroup):
    code = State()


async def _partner_of(user_id: int) -> dict | None:
    row = await db.fetchrow("SELECT * FROM partners WHERE user_id = $1 AND is_active", user_id)
    return dict(row) if row else None


@router.message(Command("partner"))
async def partner_menu(message: Message, role: str) -> None:
    if role != "partner":
        return
    await message.answer(
        "Кабинет партнёра:\n"
        "/code — ввести код клиента\n"
        "/stats — статистика визитов\n"
        "/pause — поставить скидку на паузу / снять"
    )


@router.message(Command("code"))
async def ask_code(message: Message, role: str, state: FSMContext) -> None:
    if role != "partner":
        return
    await state.set_state(EnterCode.code)
    await message.answer("Введите 6-значный код клиента:")


@router.message(EnterCode.code, F.text)
async def apply_code(message: Message, state: FSMContext) -> None:
    await state.clear()
    partner = await _partner_of(message.from_user.id)
    if partner is None:
        await message.answer("Вы не привязаны к партнёру.")
        return

    row = await redemption.redeem_by_code(message.text.strip(), partner["id"])
    if row is None:
        await message.answer("❌ Код неверный, уже использован или истёк.")
        return

    client = await db.fetchrow("SELECT full_name FROM users WHERE id = $1", row["user_id"])
    await message.answer(f"✅ Визит записан. Клиент: {client['full_name'] if client else row['user_id']}")


@router.message(Command("stats"))
async def partner_stats(message: Message, role: str) -> None:
    if role != "partner":
        return
    partner = await _partner_of(message.from_user.id)
    if partner is None:
        return
    row = await db.fetchrow(
        """
        SELECT
          count(*) FILTER (WHERE used_at::date = now()::date) AS today,
          count(*) FILTER (WHERE used_at >= now() - interval '7 days') AS week,
          count(*) FILTER (WHERE used_at >= now() - interval '30 days') AS month
        FROM redemptions
        WHERE partner_id = $1 AND status = 'used'
        """,
        partner["id"],
    )
    await message.answer(
        f"📊 Визиты\nСегодня: {row['today']}\nНеделя: {row['week']}\nМесяц: {row['month']}"
    )


@router.message(Command("pause"))
async def toggle_pause(message: Message, role: str) -> None:
    if role != "partner":
        return
    partner = await _partner_of(message.from_user.id)
    if partner is None:
        return
    new = not partner["is_paused"]
    await db.execute("UPDATE partners SET is_paused = $2 WHERE id = $1", partner["id"], new)
    await message.answer("⏸ Скидка на паузе." if new else "▶️ Скидка снова активна.")
