"""Партнёр: ввод кода клиента (фолбэк A), статистика, пауза (раздел 3.3)."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import Message

from bot import db
from bot.services import partners, redemption
from bot.texts import t

router = Router(name="partner")


class EnterCode(StatesGroup):
    code = State()


async def _partner_of(user_id: int) -> tuple[dict, bool] | None:
    """Заведение пользователя (владелец или кассир из partner_staff) + флаг владения."""
    return await partners.partner_for_user(user_id)


@router.message(Command("partner"))
async def partner_menu(message: Message, role: str, lang: str) -> None:
    if role != "partner":
        return
    await message.answer(t("partner_menu", lang))


@router.message(Command("code"))
async def ask_code(message: Message, role: str, state: FSMContext) -> None:
    if role != "partner":
        return
    await state.set_state(EnterCode.code)
    await message.answer("Введите 6-значный код клиента:")


@router.message(EnterCode.code, F.text)
async def apply_code(message: Message, state: FSMContext) -> None:
    await state.clear()
    res = await _partner_of(message.from_user.id)
    if res is None:
        await message.answer("Вы не привязаны к партнёру.")
        return
    partner, _ = res

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
    res = await _partner_of(message.from_user.id)
    if res is None:
        return
    partner, _ = res
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
async def toggle_pause(message: Message, role: str, lang: str) -> None:
    if role != "partner":
        return
    res = await _partner_of(message.from_user.id)
    if res is None:
        return
    partner, is_owner = res
    if not is_owner:
        await message.answer(t("pause_owner_only", lang))
        return
    new = not partner["is_paused"]
    await db.execute("UPDATE partners SET is_paused = $2 WHERE id = $1", partner["id"], new)
    await message.answer("⏸ Скидка на паузе." if new else "▶️ Скидка снова активна.")
