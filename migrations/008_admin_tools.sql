-- 008: инструменты админки (раздел 3.5 ARCHITECTURE.md):
-- сегмент рассылки в истории — вкладка «Рассылка» показывает, кому уходило.
-- Идемпотентна: повторный прогон не падает.

BEGIN;

ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS segment text;  -- all | subscribers | expired

COMMIT;
