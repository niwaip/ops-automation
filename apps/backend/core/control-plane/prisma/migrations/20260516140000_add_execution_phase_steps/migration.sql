-- Add ExecutionPhaseStep table for internal step tracking within a phase
CREATE TABLE IF NOT EXISTS "execution_phase_steps" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "phase_id" UUID NOT NULL,
  "step_index" INTEGER NOT NULL,
  "step_id" VARCHAR(255),
  "action" VARCHAR(100) NOT NULL,
  "status" VARCHAR(50) NOT NULL,
  "input_json" JSONB,
  "output_json" JSONB,
  "error_message" TEXT,
  "error_code" VARCHAR(50),
  "snapshot_id" VARCHAR(255),
  "started_at" TIMESTAMPTZ,
  "ended_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "execution_phase_steps_phase_id_fkey"
    FOREIGN KEY ("phase_id") REFERENCES "execution_phases"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "execution_phase_steps_phase_id_idx"
  ON "execution_phase_steps" ("phase_id");
