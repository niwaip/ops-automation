-- Phase 1 §5.1: LLM Operation Registry tables
-- Creates 8 models: LlmOperation, LlmOperationVersion, LlmOperationActivation,
-- LlmOperationActivationEvent, LlmOperationEvalSuite, LlmOperationEvalCase,
-- LlmOperationEvalRun, LlmOperationInvocation

-- CreateTable: LlmOperation
CREATE TABLE IF NOT EXISTS "llm_operations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "operation_key" VARCHAR(100) NOT NULL,
    "display_name" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL,
    "owner" VARCHAR(100) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'active',
    "source" VARCHAR(32) NOT NULL DEFAULT 'admin_created',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "llm_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable: LlmOperationVersion
CREATE TABLE IF NOT EXISTS "llm_operation_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "operation_id" UUID NOT NULL,
    "version" VARCHAR(50) NOT NULL,
    "state" VARCHAR(32) NOT NULL DEFAULT 'draft',
    "manifest_json" JSONB NOT NULL,
    "operation_digest" VARCHAR(128) NOT NULL,
    "contract_digest" VARCHAR(128) NOT NULL,
    "change_summary" TEXT NOT NULL DEFAULT '',
    "source" VARCHAR(32) NOT NULL DEFAULT 'admin_created',
    "approved_by" VARCHAR(255),
    "approved_at" TIMESTAMPTZ,
    "created_by" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "llm_operation_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: LlmOperationActivation
CREATE TABLE IF NOT EXISTS "llm_operation_activations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "operation_id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "environment" VARCHAR(32) NOT NULL,
    "label" VARCHAR(32),
    "activated_by" VARCHAR(255) NOT NULL,
    "reason" TEXT NOT NULL,
    "rollout_percent" INTEGER,
    "activated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "llm_operation_activations_pkey" PRIMARY KEY ("id")
);

-- CreateTable: LlmOperationActivationEvent
CREATE TABLE IF NOT EXISTS "llm_operation_activation_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "operation_id" UUID NOT NULL,
    "previous_version_id" UUID,
    "new_version_id" UUID NOT NULL,
    "environment" VARCHAR(32) NOT NULL,
    "action" VARCHAR(32) NOT NULL,
    "actor" VARCHAR(255) NOT NULL,
    "reason" TEXT NOT NULL,
    "metadata_json" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "llm_operation_activation_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable: LlmOperationEvalSuite
CREATE TABLE IF NOT EXISTS "llm_operation_eval_suites" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "operation_id" UUID NOT NULL,
    "version_id" UUID,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "suite_digest" VARCHAR(128) NOT NULL,
    "created_by" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "llm_operation_eval_suites_pkey" PRIMARY KEY ("id")
);

-- CreateTable: LlmOperationEvalCase
CREATE TABLE IF NOT EXISTS "llm_operation_eval_cases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "suite_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "input_json" JSONB NOT NULL,
    "expected_json" JSONB,
    "is_negative" BOOLEAN NOT NULL DEFAULT false,
    "error_contains" VARCHAR(255),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "llm_operation_eval_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable: LlmOperationEvalRun
CREATE TABLE IF NOT EXISTS "llm_operation_eval_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "version_id" UUID NOT NULL,
    "suite_id" UUID NOT NULL,
    "model_policy_snapshot" JSONB NOT NULL,
    "results_json" JSONB NOT NULL,
    "metrics_json" JSONB NOT NULL,
    "baseline_version_id" UUID,
    "executed_by" VARCHAR(255) NOT NULL,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ,

    CONSTRAINT "llm_operation_eval_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: LlmOperationInvocation
CREATE TABLE IF NOT EXISTS "llm_operation_invocations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "version_id" UUID NOT NULL,
    "execution_id" UUID,
    "step_id" UUID,
    "tenant_id" UUID,
    "provider" VARCHAR(64) NOT NULL,
    "requested_model" VARCHAR(128) NOT NULL,
    "resolved_model" VARCHAR(128),
    "input_digest" VARCHAR(128),
    "output_digest" VARCHAR(128),
    "input_storage_ref" VARCHAR(255),
    "output_storage_ref" VARCHAR(255),
    "token_usage_json" JSONB,
    "latency_ms" INTEGER,
    "estimated_cost" DECIMAL(20, 8),
    "parse_attempts" INTEGER NOT NULL DEFAULT 1,
    "repair_attempts" INTEGER NOT NULL DEFAULT 0,
    "validation_result" VARCHAR(32) NOT NULL,
    "finish_reason" VARCHAR(64),
    "error_code" VARCHAR(64),
    "actor" VARCHAR(255) NOT NULL,
    "environment" VARCHAR(32) NOT NULL,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ,

    CONSTRAINT "llm_operation_invocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: LlmOperation
CREATE UNIQUE INDEX IF NOT EXISTS "llm_operations_operation_key_key" ON "llm_operations"("operation_key");

-- CreateIndex: LlmOperationVersion
CREATE UNIQUE INDEX IF NOT EXISTS "llm_operation_versions_operation_id_version_key" ON "llm_operation_versions"("operation_id", "version");
CREATE UNIQUE INDEX IF NOT EXISTS "llm_operation_versions_operation_id_operation_digest_key" ON "llm_operation_versions"("operation_id", "operation_digest");
CREATE INDEX IF NOT EXISTS "llm_operation_versions_operation_id_state_idx" ON "llm_operation_versions"("operation_id", "state");

-- CreateIndex: LlmOperationActivation
CREATE UNIQUE INDEX IF NOT EXISTS "llm_operation_activations_operation_id_environment_key" ON "llm_operation_activations"("operation_id", "environment");
CREATE INDEX IF NOT EXISTS "llm_operation_activations_environment_idx" ON "llm_operation_activations"("environment");

-- CreateIndex: LlmOperationActivationEvent
CREATE INDEX IF NOT EXISTS "llm_operation_activation_events_operation_id_created_at_idx" ON "llm_operation_activation_events"("operation_id", "created_at" DESC);

-- CreateIndex: LlmOperationEvalSuite
CREATE INDEX IF NOT EXISTS "llm_operation_eval_suites_operation_id_version_id_idx" ON "llm_operation_eval_suites"("operation_id", "version_id");

-- CreateIndex: LlmOperationEvalCase
CREATE INDEX IF NOT EXISTS "llm_operation_eval_cases_suite_id_idx" ON "llm_operation_eval_cases"("suite_id");

-- CreateIndex: LlmOperationEvalRun
CREATE INDEX IF NOT EXISTS "llm_operation_eval_runs_version_id_idx" ON "llm_operation_eval_runs"("version_id");
CREATE INDEX IF NOT EXISTS "llm_operation_eval_runs_suite_id_idx" ON "llm_operation_eval_runs"("suite_id");

-- CreateIndex: LlmOperationInvocation
CREATE INDEX IF NOT EXISTS "llm_operation_invocations_version_id_started_at_idx" ON "llm_operation_invocations"("version_id", "started_at" DESC);
CREATE INDEX IF NOT EXISTS "llm_operation_invocations_execution_id_idx" ON "llm_operation_invocations"("execution_id");

-- AddForeignKey: LlmOperationVersion
ALTER TABLE "llm_operation_versions" ADD CONSTRAINT "llm_operation_versions_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "llm_operations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: LlmOperationActivation
ALTER TABLE "llm_operation_activations" ADD CONSTRAINT "llm_operation_activations_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "llm_operations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "llm_operation_activations" ADD CONSTRAINT "llm_operation_activations_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "llm_operation_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: LlmOperationActivationEvent
ALTER TABLE "llm_operation_activation_events" ADD CONSTRAINT "llm_operation_activation_events_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "llm_operations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "llm_operation_activation_events" ADD CONSTRAINT "llm_operation_activation_events_new_version_id_fkey" FOREIGN KEY ("new_version_id") REFERENCES "llm_operation_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: LlmOperationEvalSuite
ALTER TABLE "llm_operation_eval_suites" ADD CONSTRAINT "llm_operation_eval_suites_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "llm_operations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "llm_operation_eval_suites" ADD CONSTRAINT "llm_operation_eval_suites_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "llm_operation_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: LlmOperationEvalCase
ALTER TABLE "llm_operation_eval_cases" ADD CONSTRAINT "llm_operation_eval_cases_suite_id_fkey" FOREIGN KEY ("suite_id") REFERENCES "llm_operation_eval_suites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: LlmOperationEvalRun
ALTER TABLE "llm_operation_eval_runs" ADD CONSTRAINT "llm_operation_eval_runs_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "llm_operation_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "llm_operation_eval_runs" ADD CONSTRAINT "llm_operation_eval_runs_suite_id_fkey" FOREIGN KEY ("suite_id") REFERENCES "llm_operation_eval_suites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: LlmOperationInvocation
ALTER TABLE "llm_operation_invocations" ADD CONSTRAINT "llm_operation_invocations_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "llm_operation_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;