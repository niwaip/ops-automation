CREATE TABLE IF NOT EXISTS "execution_outbox" (
  "id" UUID NOT NULL,
  "aggregate_type" VARCHAR(64) NOT NULL,
  "aggregate_id" UUID NOT NULL,
  "event_type" VARCHAR(100) NOT NULL,
  "payload_json" JSONB NOT NULL,
  "available_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimed_by" VARCHAR(255),
  "lease_expires_at" TIMESTAMPTZ,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "published_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "execution_outbox_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "execution_outbox_published_at_available_at_idx"
  ON "execution_outbox"("published_at", "available_at");
CREATE INDEX IF NOT EXISTS "execution_outbox_lease_expires_at_idx"
  ON "execution_outbox"("lease_expires_at");
CREATE INDEX IF NOT EXISTS "execution_outbox_aggregate_type_aggregate_id_idx"
  ON "execution_outbox"("aggregate_type", "aggregate_id");

CREATE TABLE IF NOT EXISTS "schedule_fires" (
  "id" UUID NOT NULL,
  "schedule_id" UUID NOT NULL,
  "scheduled_at" TIMESTAMPTZ NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'pending',
  "execution_id" UUID,
  "claimed_by" VARCHAR(255),
  "lease_expires_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "schedule_fires_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "schedule_fires_schedule_id_scheduled_at_key" UNIQUE ("schedule_id", "scheduled_at")
);

CREATE INDEX IF NOT EXISTS "schedule_fires_status_lease_expires_at_idx"
  ON "schedule_fires"("status", "lease_expires_at");
CREATE INDEX IF NOT EXISTS "schedule_fires_execution_id_idx"
  ON "schedule_fires"("execution_id");
