-- 003: фиксы аудита — деньги и фрод (идемпотентность Stars, лимит активаций,
-- одна pending-заявка). Идемпотентна: повторный прогон не падает.

BEGIN;

-- 1. Идемпотентность Stars-платежей: повторная доставка successful_payment
--    не должна создавать вторую подписку (раздел 3.1 ARCHITECTURE.md).
CREATE UNIQUE INDEX IF NOT EXISTS uq_subscriptions_tg_charge_id
    ON subscriptions (tg_charge_id)
    WHERE tg_charge_id IS NOT NULL;

-- 2. Атомарный лимит «1 активация у партнёра в день» (раздел 3.2).
--    Обычная колонка с локальной (Asia/Almaty) датой выдачи: индекс по выражению
--    timestamptz AT TIME ZONE / ::date не IMMUTABLE и не создастся.
ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS issued_on date;

-- Backfill для существующих строк — локальный день выдачи.
UPDATE redemptions
SET issued_on = (issued_at AT TIME ZONE 'Asia/Almaty')::date
WHERE issued_on IS NULL;

-- Защитная дедупликация: строки, нарушающие лимит (возможны из-за старой
-- гонки check-then-insert), удаляем, оставляя самую раннюю за день.
DELETE FROM redemptions r
USING redemptions r2
WHERE r.user_id = r2.user_id
  AND r.partner_id = r2.partner_id
  AND r.issued_on = r2.issued_on
  AND r.id > r2.id;

ALTER TABLE redemptions
    ALTER COLUMN issued_on SET DEFAULT ((now() AT TIME ZONE 'Asia/Almaty')::date);
ALTER TABLE redemptions
    ALTER COLUMN issued_on SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_redemptions_user_partner_day
    ON redemptions (user_id, partner_id, issued_on);

-- 3. Не более одной pending-заявки на пользователя (раздел 3.1).
--    Сначала гасим возможные дубли (старая гонка): оставляем самую раннюю.
UPDATE subscriptions s
SET status = 'rejected'
WHERE s.status = 'pending'
  AND EXISTS (
      SELECT 1 FROM subscriptions s2
      WHERE s2.user_id = s.user_id AND s2.status = 'pending' AND s2.id < s.id
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_subscriptions_one_pending
    ON subscriptions (user_id)
    WHERE status = 'pending';

COMMIT;
