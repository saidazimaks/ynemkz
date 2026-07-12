-- 007: персональный QR клиента (раздел 3.2 ARCHITECTURE.md, вариант D):
-- кассир сканирует QR клиента в кабинете Mini App — визит пишется сразу,
-- клиенту сканировать наклейку не нужно. Токен генерируется лениво в GET /api/me.
-- Идемпотентна: повторный прогон не падает.

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS qr_token text;

-- Поиск клиента по скану + гарантия уникальности токена
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_qr_token ON users (qr_token);

COMMIT;
