CREATE TABLE IF NOT EXISTS "prompt_snapshots" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "owner_user_id" UUID NOT NULL,
  "execution_id" UUID,
  "purpose" VARCHAR(64) NOT NULL,
  "prompt_template_version" VARCHAR(100) NOT NULL,
  "prompt_template_digest" VARCHAR(64) NOT NULL,
  "system_prompt_digest" VARCHAR(64) NOT NULL,
  "catalog_snapshot_digest" VARCHAR(64),
  "model_policy_digest" VARCHAR(64),
  "generation_params_json" JSONB NOT NULL DEFAULT '{}',
  "input_refs_json" JSONB NOT NULL DEFAULT '[]',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "prompt_snapshots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "prompt_snapshots_execution_id_fkey"
    FOREIGN KEY ("execution_id") REFERENCES "executions"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "llm_usage_ledger" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "owner_user_id" UUID NOT NULL,
  "execution_id" UUID,
  "planning_decision_id" UUID,
  "step_id" UUID,
  "prompt_snapshot_id" UUID NOT NULL,
  "trace_id" VARCHAR(128),
  "purpose" VARCHAR(64) NOT NULL,
  "provider" VARCHAR(64) NOT NULL,
  "model_id" VARCHAR(255) NOT NULL,
  "input_tokens" INTEGER NOT NULL DEFAULT 0,
  "output_tokens" INTEGER NOT NULL DEFAULT 0,
  "cached_tokens" INTEGER NOT NULL DEFAULT 0,
  "estimated_cost" DECIMAL(18,8),
  "currency" VARCHAR(8),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "llm_usage_ledger_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "llm_usage_ledger_execution_id_fkey"
    FOREIGN KEY ("execution_id") REFERENCES "executions"("id") ON DELETE CASCADE,
  CONSTRAINT "llm_usage_ledger_planning_decision_id_fkey"
    FOREIGN KEY ("planning_decision_id") REFERENCES "planning_decisions"("id") ON DELETE SET NULL,
  CONSTRAINT "llm_usage_ledger_step_id_fkey"
    FOREIGN KEY ("step_id") REFERENCES "execution_steps"("id") ON DELETE SET NULL,
  CONSTRAINT "llm_usage_ledger_prompt_snapshot_id_fkey"
    FOREIGN KEY ("prompt_snapshot_id") REFERENCES "prompt_snapshots"("id") ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "prompt_snapshots_execution_id_created_at_idx"
  ON "prompt_snapshots"("execution_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "prompt_snapshots_owner_user_id_created_at_idx"
  ON "prompt_snapshots"("owner_user_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "llm_usage_ledger_execution_id_created_at_idx"
  ON "llm_usage_ledger"("execution_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "llm_usage_ledger_planning_decision_id_idx"
  ON "llm_usage_ledger"("planning_decision_id");
CREATE INDEX IF NOT EXISTS "llm_usage_ledger_purpose_created_at_idx"
  ON "llm_usage_ledger"("purpose", "created_at" DESC);
