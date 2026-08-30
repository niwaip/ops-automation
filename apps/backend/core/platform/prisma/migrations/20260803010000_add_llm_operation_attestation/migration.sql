-- Phase 2-γ §9.2: independent Attestation storage
CREATE TABLE IF NOT EXISTS "llm_operation_attestations" (
    "id" UUID NOT NULL,
    "operation_id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "operation_digest" VARCHAR(128) NOT NULL,
    "contract_digest" VARCHAR(128) NOT NULL,
    "eval_suite_digest" VARCHAR(128),
    "validator_version" VARCHAR(32) NOT NULL,
    "schema_tests" VARCHAR(16) NOT NULL,
    "offline_evals" VARCHAR(16) NOT NULL,
    "live_evals" VARCHAR(16) NOT NULL,
    "security_evals" VARCHAR(16) NOT NULL,
    "gate_results_json" JSONB NOT NULL,
    "created_by" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "llm_operation_attestations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "llm_operation_attestations_version_id_operation_digest_key"
    ON "llm_operation_attestations"("version_id", "operation_digest");

CREATE INDEX IF NOT EXISTS "llm_operation_attestations_operation_id_created_at_idx"
    ON "llm_operation_attestations"("operation_id", "created_at" DESC);

-- FK from llm_operation_attestations to llm_operations / llm_operation_versions
ALTER TABLE "llm_operation_attestations"
    DROP CONSTRAINT IF EXISTS "llm_operation_attestations_operation_id_fkey";
ALTER TABLE "llm_operation_attestations"
    ADD CONSTRAINT "llm_operation_attestations_operation_id_fkey"
    FOREIGN KEY ("operation_id") REFERENCES "llm_operations"("id") ON DELETE CASCADE;

ALTER TABLE "llm_operation_attestations"
    DROP CONSTRAINT IF EXISTS "llm_operation_attestations_version_id_fkey";
ALTER TABLE "llm_operation_attestations"
    ADD CONSTRAINT "llm_operation_attestations_version_id_fkey"
    FOREIGN KEY ("version_id") REFERENCES "llm_operation_versions"("id") ON DELETE CASCADE;