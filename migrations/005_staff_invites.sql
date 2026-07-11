-- 005: приглашения кассиров по ссылке (deep link t.me/<bot>?start=staff_<token>).
-- Одноразовые, TTL 24 часа; гасятся атомарным UPDATE (used_by).
-- Идемпотентна: повторный прогон не падает.

BEGIN;

CREATE TABLE IF NOT EXISTS staff_invites (
    token      text PRIMARY KEY,                                  -- secrets.token_urlsafe
    partner_id int NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    used_by    bigint REFERENCES users(id)                        -- кассир, принявший приглашение
);

COMMIT;
