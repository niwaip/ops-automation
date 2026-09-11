ALTER TABLE "llm_operation_invocations"
  ADD COLUMN "idempotency_key" VARCHAR(255),
  ADD COLUMN "result_json" JSONB;

CREATE UNIQUE INDEX "llm_operation_invocations_version_id_idempotency_key_key"
  ON "llm_operation_invocations"("version_id", "idempotency_key");
