-- Migration: Add deterministic execution plan tables and fields

-- 1. Update executions table
ALTER TABLE "executions"
  ALTER COLUMN "skill_id" DROP NOT NULL;

ALTER TABLE "executions"
  ADD COLUMN IF NOT EXISTS "execution_mode" VARCHAR(50) NOT NULL DEFAULT 'single_skill';

UPDATE "executions"
  SET "execution_mode" = 'single_skill'
  WHERE "execution_mode" IS NULL;

CREATE INDEX IF NOT EXISTS "executions_execution_mode_status_idx"
  ON "executions" ("execution_mode", "status");

-- 2. Create execution_plans table
CREATE TABLE IF NOT EXISTS "execution_plans" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "execution_id" UUID UNIQUE NOT NULL REFERENCES "executions"("id") ON DELETE CASCADE,
  "schema_version" VARCHAR(100) NOT NULL,
  "planner_version" VARCHAR(100) NOT NULL,
  "catalog_version" VARCHAR(100) NOT NULL,
  "plan_type" VARCHAR(50) NOT NULL,
  "status" VARCHAR(50) NOT NULL,
  "objective" TEXT NOT NULL,
  "plan_json" JSONB NOT NULL,
  "validation_json" JSONB NOT NULL,
  "plan_hash" VARCHAR(128),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "frozen_at" TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS "execution_plans_status_created_at_idx"
  ON "execution_plans" ("status", "created_at" DESC);

-- 3. Create execution_artifacts table
CREATE TABLE IF NOT EXISTS "execution_artifacts" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "execution_id" UUID NOT NULL REFERENCES "executions"("id") ON DELETE CASCADE,
  "producer_step_id" UUID,
  "producer_node_id" VARCHAR(255) NOT NULL,
  "artifact_type" VARCHAR(100) NOT NULL,
  "external_artifact_id" VARCHAR(255),
  "name" VARCHAR(500) NOT NULL,
  "url" TEXT NOT NULL,
  "mime_type" VARCHAR(255) NOT NULL,
  "size_bytes" BIGINT,
  "sha256" VARCHAR(128),
  "metadata_json" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "execution_artifacts_execution_id_created_at_idx"
  ON "execution_artifacts" ("execution_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "execution_artifacts_producer_step_id_idx"
  ON "execution_artifacts" ("producer_step_id");

-- 4. Update execution_steps table with deterministic plan extension fields
ALTER TABLE "execution_steps"
  ADD COLUMN IF NOT EXISTS "plan_node_id" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "node_kind" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "capability_id" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "capability_version" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "depends_on_json" JSONB,
  ADD COLUMN IF NOT EXISTS "input_bindings_json" JSONB,
  ADD COLUMN IF NOT EXISTS "output_contract_json" JSONB,
  ADD COLUMN IF NOT EXISTS "resolved_input_json" JSONB,
  ADD COLUMN IF NOT EXISTS "idempotency_key" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "lease_owner" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "lease_expires_at" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "execution_steps_status_lease_expires_at_idx"
  ON "execution_steps" ("status", "lease_expires_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'execution_steps_execution_id_plan_node_id_key'
  ) THEN
    ALTER TABLE "execution_steps" ADD CONSTRAINT "execution_steps_execution_id_plan_node_id_key" UNIQUE ("execution_id", "plan_node_id");
  END IF;
END $$;

-- 5. Record migration in _prisma_migrations table for Prisma lifecycle tracking
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id" VARCHAR(36) PRIMARY KEY NOT NULL,
    "checksum" VARCHAR(64) NOT NULL,
    "finished_at" TIMESTAMPTZ,
    "migration_name" VARCHAR(255) NOT NULL,
    "logs" TEXT,
    "rolled_back_at" TIMESTAMPTZ,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "applied_steps_count" INTEGER NOT NULL DEFAULT 0
);

INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
VALUES ('20260728120000-deterministic-plan', '20260728120000_add_deterministic_execution_plan', NOW(), '20260728120000_add_deterministic_execution_plan', NULL, NULL, NOW(), 1)
ON CONFLICT ("id") DO UPDATE SET "finished_at" = NOW();
