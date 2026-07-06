-- Фаза 2: Mini App как основной интерфейс.
-- Карта (координаты партнёров), Telegram Stars, фиксация % на момент визита.

BEGIN;

-- Карта заведений + витрина
ALTER TABLE partners ADD COLUMN IF NOT EXISTS lat double precision;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS lng double precision;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS logo_url text;

-- Оплата Telegram Stars (мгновенная активация без админа)
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'kaspi'; -- kaspi | stars
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS tg_charge_id text;                            -- для возвратов

-- Процент скидки на момент визита (история не должна меняться при смене % партнёра)
ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS discount int;

COMMIT;
