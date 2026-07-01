-- Add scheduler table and trigger fields to executions

ALTER TABLE "executions"
  ADD COLUMN IF NOT EXISTS "trigger_type" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "schedule_id" UUID;

CREATE TABLE IF NOT EXISTS "skill_schedules" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" VARCHAR(255) NOT NULL,
  "description" VARCHAR(500),
  "skill_id" UUID NOT NULL,
  "skill_version" VARCHAR(50),
  "input_json" JSONB NOT NULL DEFAULT '{}',
  "cron_expression" VARCHAR(100) NOT NULL,
  "timezone" VARCHAR(50) NOT NULL DEFAULT 'UTC',
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "last_run_at" TIMESTAMPTZ,
  "next_run_at" TIMESTAMPTZ NOT NULL,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "skill_schedules_is_active_next_run_at_idx"
  ON "skill_schedules" ("is_active", "next_run_at");
