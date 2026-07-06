"""Загрузка файлов в Supabase Storage (чеки Kaspi, логотипы партнёров)."""
from __future__ import annotations

from bot.config import settings
from bot.db import supabase


def _upload(file_bytes: bytes, path: str, content_type: str = "image/jpeg") -> str:
    """Залить файл в bucket, вернуть публичный URL."""
    bucket = settings.storage_bucket
    supabase().storage.from_(bucket).upload(
        path, file_bytes, {"content-type": content_type, "upsert": "true"}
    )
    return supabase().storage.from_(bucket).get_public_url(path)


def upload_receipt(file_bytes: bytes, filename: str) -> str:
    return _upload(file_bytes, f"receipts/{filename}")


def upload_logo(file_bytes: bytes, partner_id: int) -> str:
    return _upload(file_bytes, f"logos/{partner_id}.jpg")
