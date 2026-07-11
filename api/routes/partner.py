"""Кабинет партнёра: статистика, погашение фолбэк-кода, сотрудники, скидка."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from api.auth import require_role
from bot import db
from bot.services import partners, redemption

router = APIRouter(dependencies=[Depends(require_role("partner", "admin"))])


async def _partner_of(user_id: int, owner_only: bool = False) -> tuple[dict, bool]:
    """Заведение пользователя (владелец или кассир) + флаг владения."""
    res = await partners.partner_for_user(user_id)
    if res is None:
        raise HTTPException(404, "partner profile not found")
    partner, is_owner = res
    if owner_only and not is_owner:
        raise HTTPException(403, "доступно только владельцу заведения")
    return partner, is_owner


@router.get("/stats")
async def stats(user: dict = Depends(require_role("partner", "admin"))) -> dict:
    partner, _ = await _partner_of(user["id"])
    row = await db.fetchrow(
        """
        SELECT
          count(*) FILTER (WHERE used_at::date = now()::date)                    AS today,
          count(*) FILTER (WHERE used_at >= now() - interval '7 days')           AS week,
          count(*) FILTER (WHERE used_at >= now() - interval '30 days')          AS month,
          count(DISTINCT user_id) FILTER
            (WHERE used_at >= now() - interval '30 days')                        AS unique_month
        FROM redemptions
        WHERE partner_id = $1 AND status = 'used'
        """,
        partner["id"],
    )
    # Новые vs повторные за месяц: новый = первый визит к этому партнёру в этом месяце
    clients = await db.fetchrow(
        """
        SELECT
          count(*) FILTER (WHERE first_visit >= now() - interval '30 days') AS new_clients,
          count(*) FILTER (WHERE first_visit <  now() - interval '30 days') AS repeat_clients
        FROM (
          SELECT user_id, min(used_at) AS first_visit
          FROM redemptions
          WHERE partner_id = $1 AND status = 'used'
          GROUP BY user_id
          HAVING max(used_at) >= now() - interval '30 days'
        ) t
        """,
        partner["id"],
    )
    # По дням за месяц — для графика
    days = await db.fetch(
        """
        SELECT used_at::date AS day, count(*) AS visits
        FROM redemptions
        WHERE partner_id = $1 AND status = 'used' AND used_at >= now() - interval '30 days'
        GROUP BY 1 ORDER BY 1
        """,
        partner["id"],
    )
    return {**dict(row), **dict(clients), "by_day": [dict(d) for d in days]}


@router.get("/me")
async def my_card(user: dict = Depends(require_role("partner", "admin"))) -> dict:
    """Моя карточка. Владелец меняет % (10–15) и паузу сам, остальное — через админа."""
    partner, is_owner = await _partner_of(user["id"])
    return {**partner, "is_owner": is_owner}


@router.get("/activations")
async def activations(user: dict = Depends(require_role("partner", "admin"))) -> list[dict]:
    """Лента последних визитов."""
    partner, _ = await _partner_of(user["id"])
    rows = await db.fetch(
        """
        SELECT u.full_name, r.used_at,
               coalesce(r.discount,
                 CASE WHEN r.type = 'premium' THEN $2 ELSE $3 END) AS discount
        FROM redemptions r JOIN users u ON u.id = r.user_id
        WHERE r.partner_id = $1 AND r.status = 'used'
        ORDER BY r.used_at DESC LIMIT 30
        """,
        partner["id"], partner["discount_premium"], partner["discount_free"],
    )
    return [dict(r) for r in rows]


class PauseBody(BaseModel):
    paused: bool


@router.post("/pause")
async def set_pause(body: PauseBody,
                    user: dict = Depends(require_role("partner", "admin"))) -> dict:
    """Пауза скидки («отпуск») — карточка скрывается из каталога и карты. Только владелец."""
    partner, _ = await _partner_of(user["id"], owner_only=True)
    await db.execute("UPDATE partners SET is_paused = $2 WHERE id = $1",
                     partner["id"], body.paused)
    return {"is_paused": body.paused}


class RedeemBody(BaseModel):
    code: str


@router.post("/redeem")
async def redeem(body: RedeemBody, user: dict = Depends(require_role("partner", "admin"))) -> dict:
    """Фолбэк A: кассир вводит код клиента в Mini App."""
    partner, _ = await _partner_of(user["id"])
    row = await redemption.redeem_by_code(body.code, partner["id"])
    if row is None:
        raise HTTPException(409, "код неверный, уже использован или истёк")
    client = await db.fetchrow("SELECT full_name FROM users WHERE id = $1", row["user_id"])
    return {"ok": True, "client_name": client["full_name"] if client else None}


# --- Сотрудники-кассиры (владелец управляет, кассиры получают пинги) -------------

class StaffBody(BaseModel):
    telegram_id: int


@router.get("/staff")
async def staff(user: dict = Depends(require_role("partner", "admin"))) -> list[dict]:
    partner, _ = await _partner_of(user["id"], owner_only=True)
    return await partners.staff_list(partner["id"])


@router.post("/staff")
async def staff_add(body: StaffBody,
                    user: dict = Depends(require_role("partner", "admin"))) -> dict:
    partner, _ = await _partner_of(user["id"], owner_only=True)
    try:
        await partners.staff_add(partner["id"], user["id"], body.telegram_id)
    except partners.StaffError as e:
        raise HTTPException(409, str(e))
    return {"ok": True}


@router.delete("/staff/{telegram_id}")
async def staff_remove(telegram_id: int,
                       user: dict = Depends(require_role("partner", "admin"))) -> dict:
    partner, _ = await _partner_of(user["id"], owner_only=True)
    await partners.staff_remove(partner["id"], telegram_id)
    return {"ok": True}


# --- Моя скидка: владелец меняет % для подписчиков в пределах 10–15 --------------

class DiscountBody(BaseModel):
    discount: int = Field(ge=partners.DISCOUNT_MIN, le=partners.DISCOUNT_MAX)


@router.post("/discount")
async def set_discount(body: DiscountBody,
                       user: dict = Depends(require_role("partner", "admin"))) -> dict:
    partner, _ = await _partner_of(user["id"], owner_only=True)
    try:
        value = await partners.set_premium_discount(partner["id"], body.discount)
    except ValueError as e:
        raise HTTPException(422, str(e))
    return {"discount_premium": value}
