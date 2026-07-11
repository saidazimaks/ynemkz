-- 004: сотрудники-кассиры партнёра (раздел 3.2 ARCHITECTURE.md, edge case
-- «несколько кассиров»): владелец добавляет кассиров, пинги активаций идут всем.
-- Идемпотентна: повторный прогон не падает.

BEGIN;

CREATE TABLE IF NOT EXISTS partner_staff (
    partner_id int    NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    user_id    bigint NOT NULL REFERENCES users(id),  -- кассир обязан существовать в users
    added_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (partner_id, user_id)
);

-- Кассир ровно одного заведения: однозначность partner_for_user() и логики ролей.
CREATE UNIQUE INDEX IF NOT EXISTS uq_partner_staff_user ON partner_staff (user_id);

COMMIT;
