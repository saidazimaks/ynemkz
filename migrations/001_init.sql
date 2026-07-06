-- Выгодный Город — начальная схема (Фаза 1 MVP)
-- Раздел 2 ARCHITECTURE.md. RLS не включаем — бот ходит через service key.

BEGIN;

CREATE TABLE IF NOT EXISTS users (
    id            bigint PRIMARY KEY,               -- telegram_id
    username      text,
    full_name     text,
    phone         text,
    role          text        NOT NULL DEFAULT 'buyer',  -- buyer | partner | admin
    referrer_id   bigint      REFERENCES users(id),      -- кто пригласил
    lang          text        NOT NULL DEFAULT 'ru',
    notify_daily  boolean     NOT NULL DEFAULT true,
    is_banned     boolean     NOT NULL DEFAULT false,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS partners (
    id               serial PRIMARY KEY,
    user_id          bigint  REFERENCES users(id),       -- владелец кабинета
    name             text    NOT NULL,
    category         text,
    address          text,
    discount_free    int     NOT NULL DEFAULT 5,          -- % по скидке дня
    discount_premium int     NOT NULL DEFAULT 10,         -- % для подписчиков (10–15)
    avg_check        int,
    work_hours       text,
    is_active        boolean NOT NULL DEFAULT true,       -- админ выключил
    is_paused        boolean NOT NULL DEFAULT false,      -- партнёр сам на паузе
    created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id            serial PRIMARY KEY,
    user_id       bigint  NOT NULL REFERENCES users(id),
    status        text    NOT NULL DEFAULT 'pending',     -- pending | active | expired | rejected
    receipt_url   text,
    amount        int     NOT NULL DEFAULT 2000,
    paid_at       timestamptz,
    expires_at    timestamptz,                            -- paid_at + 30 дней
    confirmed_by  bigint,                                 -- admin id
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS daily_deals (
    id          serial PRIMARY KEY,
    partner_id  int  NOT NULL REFERENCES partners(id),
    deal_date   date NOT NULL UNIQUE,
    description text
);

CREATE TABLE IF NOT EXISTS redemptions (
    id          serial PRIMARY KEY,
    code        text    NOT NULL UNIQUE,                  -- 6 символов, он же в QR
    user_id     bigint  NOT NULL REFERENCES users(id),
    partner_id  int     NOT NULL REFERENCES partners(id),
    type        text    NOT NULL,                         -- daily | premium
    status      text    NOT NULL DEFAULT 'issued',        -- issued | used | expired
    issued_at   timestamptz NOT NULL DEFAULT now(),
    used_at     timestamptz,
    expires_at  timestamptz NOT NULL                      -- issued_at + 30 мин
);

CREATE TABLE IF NOT EXISTS raffles (
    id         serial PRIMARY KEY,
    title      text,
    prize      text,
    starts_at  timestamptz,
    ends_at    timestamptz,
    winner_id  bigint REFERENCES users(id),
    status     text NOT NULL DEFAULT 'open'               -- open | finished
);

CREATE TABLE IF NOT EXISTS raffle_entries (
    raffle_id int    NOT NULL REFERENCES raffles(id),
    user_id   bigint NOT NULL REFERENCES users(id),
    PRIMARY KEY (raffle_id, user_id)
);

CREATE TABLE IF NOT EXISTS broadcasts (
    id         serial PRIMARY KEY,
    text       text,
    sent_at    timestamptz,
    sent_count int
);

-- Индексы (раздел 2)
CREATE INDEX IF NOT EXISTS idx_redemptions_code            ON redemptions(code);
CREATE INDEX IF NOT EXISTS idx_redemptions_partner_used    ON redemptions(partner_id, used_at);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status   ON subscriptions(user_id, status);

COMMIT;
