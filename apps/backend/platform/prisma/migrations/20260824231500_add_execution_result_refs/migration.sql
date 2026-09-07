CREATE TABLE IF NOT EXISTS "execution_result_refs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "execution_id" UUID NOT NULL,
  "producer_step_id" UUID,
  "schema_digest" VARCHAR(64) NOT NULL,
  "payload_json" JSONB NOT NULL,
  "preview_json" JSONB,
  "size_bytes" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "execution_result_refs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "execution_result_refs_execution_id_fkey"
    FOREIGN KEY ("execution_id") REFERENCES "executions"("id") ON DELETE CASCADE,
  CONSTRAINT "execution_result_refs_producer_step_id_fkey"
    FOREIGN KEY ("producer_step_id") REFERENCES "execution_steps"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "execution_result_refs_execution_id_created_at_idx"
  ON "execution_result_refs"("execution_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "execution_result_refs_producer_step_id_idx"
  ON "execution_result_refs"("producer_step_id");
