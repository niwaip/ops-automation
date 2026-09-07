CREATE TABLE "assistant_feedback_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" VARCHAR(128) NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "session_id" VARCHAR(255) NOT NULL,
    "message_id" VARCHAR(255) NOT NULL,
    "execution_id" UUID,
    "revision" INTEGER NOT NULL,
    "event_type" VARCHAR(16) NOT NULL,
    "rating" VARCHAR(16),
    "reason_code" VARCHAR(64),
    "sanitized_comment" TEXT,
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_feedback_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "assistant_feedback_events_event_type_check"
      CHECK ("event_type" IN ('set', 'clear')),
    CONSTRAINT "assistant_feedback_events_rating_check"
      CHECK ("rating" IS NULL OR "rating" IN ('positive', 'negative'))
);

CREATE TABLE "assistant_feedback_current" (
    "owner_user_id" UUID NOT NULL,
    "session_id" VARCHAR(255) NOT NULL,
    "message_id" VARCHAR(255) NOT NULL,
    "event_id" VARCHAR(128) NOT NULL,
    "revision" INTEGER NOT NULL,
    "event_type" VARCHAR(16) NOT NULL,
    "rating" VARCHAR(16),
    "reason_code" VARCHAR(64),
    "sanitized_comment" TEXT,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_feedback_current_pkey"
      PRIMARY KEY ("owner_user_id", "session_id", "message_id"),
    CONSTRAINT "assistant_feedback_current_event_type_check"
      CHECK ("event_type" IN ('set', 'clear')),
    CONSTRAINT "assistant_feedback_current_rating_check"
      CHECK ("rating" IS NULL OR "rating" IN ('positive', 'negative'))
);

CREATE UNIQUE INDEX "assistant_feedback_events_event_id_key"
  ON "assistant_feedback_events"("event_id");
CREATE UNIQUE INDEX "assistant_feedback_events_owner_session_message_revision_key"
  ON "assistant_feedback_events"("owner_user_id", "session_id", "message_id", "revision");
CREATE INDEX "assistant_feedback_events_owner_created_at_idx"
  ON "assistant_feedback_events"("owner_user_id", "created_at" DESC);
CREATE INDEX "assistant_feedback_events_session_message_idx"
  ON "assistant_feedback_events"("session_id", "message_id");
CREATE INDEX "assistant_feedback_current_owner_updated_at_idx"
  ON "assistant_feedback_current"("owner_user_id", "updated_at" DESC);
