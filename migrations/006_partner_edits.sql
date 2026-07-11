-- 006: заявки партнёров на изменение карточки (модерация админом, раздел 3.3).
-- Партнёр правит карточку в кабинете → заявка → админ одобряет/отклоняет.
-- Идемпотентна: повторный прогон не падает.

BEGIN;

CREATE TABLE IF NOT EXISTS partner_edits (
    id          serial PRIMARY KEY,
    partner_id  int    NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    proposed_by bigint NOT NULL REFERENCES users(id),   -- владелец, подавший заявку
    changes     jsonb  NOT NULL,                        -- поле → новое значение
    status      text   NOT NULL DEFAULT 'pending',      -- pending | approved | rejected
    created_at  timestamptz NOT NULL DEFAULT now(),
    decided_at  timestamptz,
    decided_by  bigint                                  -- admin id
);

-- Не более одной заявки на модерации у заведения.
CREATE UNIQUE INDEX IF NOT EXISTS uq_partner_edits_pending
    ON partner_edits (partner_id) WHERE status = 'pending';

COMMIT;
