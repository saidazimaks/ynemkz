"""FastAPI для Mini App. Общий слой db/services с ботом, отдельный процесс (раздел 4.5)."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import admin, catalog, me, partner
from bot import db
from bot.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.init_pool()
    yield
    await db.close_pool()


app = FastAPI(title="Выгодный Город API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.miniapp_url] if settings.miniapp_url else ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(catalog.router, prefix="/api")
app.include_router(me.router, prefix="/api")
app.include_router(partner.router, prefix="/api/partner")
app.include_router(admin.router, prefix="/api/admin")


@app.get("/health")
async def health() -> dict:
    return {"ok": True}
