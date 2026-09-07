-- Add phase-level execution tracking for P0 browser/document unified execution view.

ALTER TABLE "executions"
  ADD COLUMN IF NOT EXISTS "current_phase_key" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "current_phase_status" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "takeover_status" VARCHAR(50);

CREATE TABLE IF NOT EXISTS "execution_phases" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "execution_id" UUID NOT NULL,
  "phase_key" VARCHAR(255) NOT NULL,
  "phase_name" VARCHAR(255) NOT NULL,
  "phase_type" VARCHAR(100) NOT NULL,
  "status" VARCHAR(50) NOT NULL,
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "runtime_session_id" UUID,
  "input_json" JSONB,
  "output_json" JSONB,
  "precheck_json" JSONB,
  "postcheck_json" JSONB,
  "recovery_decision_json" JSONB,
  "error_code" VARCHAR(50),
  "error_message" TEXT,
  "started_at" TIMESTAMPTZ,
  "completed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "execution_phases_execution_id_fkey"
    FOREIGN KEY ("execution_id") REFERENCES "executions"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "execution_phases_execution_id_phase_key_key"
  ON "execution_phases" ("execution_id", "phase_key");
CREATE INDEX IF NOT EXISTS "execution_phases_execution_id_status_idx"
  ON "execution_phases" ("execution_id", "status");
CREATE INDEX IF NOT EXISTS "execution_phases_runtime_session_id_idx"
  ON "execution_phases" ("runtime_session_id");

CREATE TABLE IF NOT EXISTS "execution_phase_artifacts" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "phase_id" UUID NOT NULL,
  "artifact_type" VARCHAR(50) NOT NULL,
  "snapshot_id" VARCHAR(255),
  "page_url" TEXT,
  "page_fingerprint" VARCHAR(255),
  "payload_json" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "execution_phase_artifacts_phase_id_fkey"
    FOREIGN KEY ("phase_id") REFERENCES "execution_phases"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "execution_phase_artifacts_phase_id_artifact_type_idx"
  ON "execution_phase_artifacts" ("phase_id", "artifact_type");

CREATE TABLE IF NOT EXISTS "execution_takeovers" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "execution_id" UUID NOT NULL,
  "phase_id" UUID NOT NULL,
  "runtime_session_id" UUID,
  "status" VARCHAR(50) NOT NULL,
  "reason" TEXT,
  "requested_by" UUID,
  "resolved_by" UUID,
  "resolution_note" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "resolved_at" TIMESTAMPTZ,
  CONSTRAINT "execution_takeovers_execution_id_fkey"
    FOREIGN KEY ("execution_id") REFERENCES "executions"("id") ON DELETE CASCADE,
  CONSTRAINT "execution_takeovers_phase_id_fkey"
    FOREIGN KEY ("phase_id") REFERENCES "execution_phases"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "execution_takeovers_execution_id_status_idx"
  ON "execution_takeovers" ("execution_id", "status");
CREATE INDEX IF NOT EXISTS "execution_takeovers_phase_id_idx"
  ON "execution_takeovers" ("phase_id");
