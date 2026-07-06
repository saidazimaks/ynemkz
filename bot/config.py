"""Конфигурация из окружения (env)."""
from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Telegram
    bot_token: str = Field(alias="BOT_TOKEN")
    admin_ids: str = Field(default="", alias="ADMIN_IDS")  # "111,222"

    # Supabase / Postgres
    supabase_url: str = Field(alias="SUPABASE_URL")
    supabase_key: str = Field(alias="SUPABASE_KEY")
    database_url: str = Field(alias="DATABASE_URL")
    storage_bucket: str = Field(default="receipts", alias="STORAGE_BUCKET")

    # Платежи
    kaspi_phone: str = Field(default="", alias="KASPI_PHONE")
    subscription_price: int = Field(default=2000, alias="SUBSCRIPTION_PRICE")
    subscription_price_stars: int = Field(default=1300, alias="SUBSCRIPTION_PRICE_STARS")

    # Mini App
    miniapp_url: str = Field(default="", alias="MINIAPP_URL")  # https://<app>.vercel.app, без слэша

    default_lang: str = Field(default="ru", alias="DEFAULT_LANG")

    @property
    def admin_id_set(self) -> set[int]:
        return {int(x) for x in self.admin_ids.replace(" ", "").split(",") if x}


settings = Settings()  # type: ignore[call-arg]
