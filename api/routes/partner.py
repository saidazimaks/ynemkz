"""Кабинет партнёра: статистика, погашение фолбэк-кода."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.auth import require_role
from bot import db
from bot.services import redemption

router = APIRouter(dependencies=[Depends(require_role("partner", "admin"))])


async def _partner_of(user_id: int) -> dict:
    row = await db.fetchrow("SELECT * FROM partners WHERE user_id = $1 AND is_active", user_id)
    if row is None:
        raise HTTPException(404, "partner profile not found")
    return dict(row)


@router.get("/stats")
async def stats(user: dict = Depends(require_role("partner", "admin"))) -> dict:
    partner = await _partner_of(user["id"])
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
    """Моя карточка (просмотр; изменения — через админа, раздел 3.6)."""
    return await _partner_of(user["id"])


@router.get("/activations")
async def activations(user: dict = Depends(require_role("partner", "admin"))) -> list[dict]:
    """Лента последних визитов."""
    partner = await _partner_of(user["id"])
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
    """Пауза скидки («отпуск») — карточка скрывается из каталога и карты."""
    partner = await _partner_of(user["id"])
    await db.execute("UPDATE partners SET is_paused = $2 WHERE id = $1",
                     partner["id"], body.paused)
    return {"is_paused": body.paused}


class RedeemBody(BaseModel):
    code: str


@router.post("/redeem")
async def redeem(body: RedeemBody, user: dict = Depends(require_role("partner", "admin"))) -> dict:
    """Фолбэк A: кассир вводит код клиента в Mini App."""
    partner = await _partner_of(user["id"])
    row = await redemption.redeem_by_code(body.code, partner["id"])
    if row is None:
        raise HTTPException(409, "код неверный, уже использован или истёк")
    client = await db.fetchrow("SELECT full_name FROM users WHERE id = $1", row["user_id"])
    return {"ok": True, "client_name": client["full_name"] if client else None}
