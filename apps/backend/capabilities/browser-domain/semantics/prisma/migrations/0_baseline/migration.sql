-- Baseline migration for browser-domain semantics
-- Defines semantic rules, sets, domains, releases, targetings, and logging tables

-- CreateEnum
CREATE TYPE "SemanticRuleSetStatus" AS ENUM ('DRAFT', 'VALIDATING', 'CANARY', 'ACTIVE', 'ARCHIVED', 'ROLLED_BACK');

-- CreateEnum
CREATE TYPE "SemanticRuleType" AS ENUM ('INTENT_ALIAS', 'FIELD_ALIAS', 'REGION_ALIAS', 'ENTITY_ALIAS', 'ROW_REFERENCE', 'READ_INTENT', 'LOGIN_PHRASE');

-- CreateEnum
CREATE TYPE "SemanticRuleReleaseMode" AS ENUM ('MANUAL', 'SCHEDULED', 'ROLLBACK');

-- CreateTable
CREATE TABLE "semantic_rule_domains" (
    "id" UUID NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" VARCHAR(1000),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "semantic_rule_domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "semantic_rule_sets" (
    "id" UUID NOT NULL,
    "domain_id" UUID NOT NULL,
    "key" VARCHAR(120) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "version" VARCHAR(50) NOT NULL,
    "status" "SemanticRuleSetStatus" NOT NULL,
    "description" VARCHAR(1000),
    "based_on_rule_set_id" UUID,
    "change_summary" VARCHAR(1000),
    "created_by" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activated_at" TIMESTAMP(6),
    "archived_at" TIMESTAMP(6),

    CONSTRAINT "semantic_rule_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "semantic_rules" (
    "id" UUID NOT NULL,
    "rule_set_id" UUID NOT NULL,
    "type" "SemanticRuleType" NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL,
    "stop_on_match" BOOLEAN NOT NULL DEFAULT false,
    "flags" VARCHAR(50),
    "patterns" JSONB NOT NULL,
    "outputs" JSONB NOT NULL,
    "examples" JSONB,
    "negative_examples" JSONB,
    "tags" JSONB,
    "note" VARCHAR(1000),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "semantic_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "semantic_rule_releases" (
    "id" UUID NOT NULL,
    "rule_set_id" UUID NOT NULL,
    "release_mode" "SemanticRuleReleaseMode" NOT NULL,
    "from_status" VARCHAR(50) NOT NULL,
    "to_status" VARCHAR(50) NOT NULL,
    "released_by" VARCHAR(255) NOT NULL,
    "release_note" VARCHAR(1000),
    "targeting" JSONB,
    "triggered_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_at" TIMESTAMP(6),
    "previous_active_rule_set_id" UUID,

    CONSTRAINT "semantic_rule_releases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "semantic_rule_targetings" (
    "id" UUID NOT NULL,
    "rule_set_id" UUID NOT NULL,
    "environments" JSONB,
    "hosts" JSONB,
    "tenant_ids" JSONB,
    "user_ids" JSONB,
    "skill_ids" JSONB,
    "page_types" JSONB,
    "sample_rate" DOUBLE PRECISION,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "semantic_rule_targetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "semantic_rule_hit_logs" (
    "id" UUID NOT NULL,
    "domain_id" UUID NOT NULL,
    "rule_set_id" UUID,
    "matched_rule_ids" JSONB NOT NULL,
    "input_text" TEXT NOT NULL,
    "normalized_input" TEXT,
    "page_url" TEXT,
    "page_title" VARCHAR(500),
    "page_type" VARCHAR(120),
    "observation_summary" TEXT,
    "available_candidate_ids" JSONB,
    "normalized_semantic" JSONB,
    "parser_output" JSONB,
    "used_ai_fallback" BOOLEAN NOT NULL DEFAULT false,
    "final_execution_success" BOOLEAN,
    "failure_reason" VARCHAR(1000),
    "trace_id" VARCHAR(255),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "semantic_rule_hit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "semantic_rule_error_logs" (
    "id" UUID NOT NULL,
    "domain_id" UUID NOT NULL,
    "rule_set_id" UUID,
    "source" VARCHAR(120) NOT NULL,
    "error_type" VARCHAR(120) NOT NULL,
    "error_code" VARCHAR(120),
    "error_message" TEXT NOT NULL,
    "input_text" TEXT,
    "normalized_input" TEXT,
    "trace_id" VARCHAR(255),
    "session_id" VARCHAR(255),
    "task_id" VARCHAR(255),
    "step_id" VARCHAR(255),
    "page_url" TEXT,
    "page_title" VARCHAR(500),
    "host" VARCHAR(255),
    "page_type" VARCHAR(120),
    "observation_summary" TEXT,
    "candidate_summary" JSONB,
    "matched_rule_ids" JSONB,
    "normalized_semantic" JSONB,
    "parser_output" JSONB,
    "ai_fallback_input" JSONB,
    "ai_fallback_output" JSONB,
    "screenshot_url" TEXT,
    "dom_snippet" TEXT,
    "locator_info" JSONB,
    "console_errors" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "semantic_rule_error_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "semantic_rule_domains_code_key" ON "semantic_rule_domains"("code");

-- CreateIndex
CREATE INDEX "semantic_rule_sets_domain_id_status_idx" ON "semantic_rule_sets"("domain_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "semantic_rule_sets_domain_id_key_version_key" ON "semantic_rule_sets"("domain_id", "key", "version");

-- CreateIndex
CREATE INDEX "semantic_rules_rule_set_id_type_priority_idx" ON "semantic_rules"("rule_set_id", "type", "priority");

-- CreateIndex
CREATE INDEX "semantic_rule_releases_rule_set_id_triggered_at_idx" ON "semantic_rule_releases"("rule_set_id", "triggered_at");

-- CreateIndex
CREATE INDEX "semantic_rule_targetings_rule_set_id_enabled_idx" ON "semantic_rule_targetings"("rule_set_id", "enabled");

-- CreateIndex
CREATE INDEX "semantic_rule_hit_logs_domain_id_created_at_idx" ON "semantic_rule_hit_logs"("domain_id", "created_at");

-- CreateIndex
CREATE INDEX "semantic_rule_hit_logs_rule_set_id_created_at_idx" ON "semantic_rule_hit_logs"("rule_set_id", "created_at");

-- CreateIndex
CREATE INDEX "semantic_rule_hit_logs_trace_id_idx" ON "semantic_rule_hit_logs"("trace_id");

-- CreateIndex
CREATE INDEX "semantic_rule_error_logs_domain_id_created_at_idx" ON "semantic_rule_error_logs"("domain_id", "created_at");

-- CreateIndex
CREATE INDEX "semantic_rule_error_logs_rule_set_id_created_at_idx" ON "semantic_rule_error_logs"("rule_set_id", "created_at");

-- CreateIndex
CREATE INDEX "semantic_rule_error_logs_trace_id_idx" ON "semantic_rule_error_logs"("trace_id");

-- CreateIndex
CREATE INDEX "semantic_rule_error_logs_source_error_type_created_at_idx" ON "semantic_rule_error_logs"("source", "error_type", "created_at");

-- AddForeignKey
ALTER TABLE "semantic_rule_sets" ADD CONSTRAINT "semantic_rule_sets_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "semantic_rule_domains"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semantic_rules" ADD CONSTRAINT "semantic_rules_rule_set_id_fkey" FOREIGN KEY ("rule_set_id") REFERENCES "semantic_rule_sets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semantic_rule_releases" ADD CONSTRAINT "semantic_rule_releases_rule_set_id_fkey" FOREIGN KEY ("rule_set_id") REFERENCES "semantic_rule_sets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semantic_rule_targetings" ADD CONSTRAINT "semantic_rule_targetings_rule_set_id_fkey" FOREIGN KEY ("rule_set_id") REFERENCES "semantic_rule_sets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semantic_rule_hit_logs" ADD CONSTRAINT "semantic_rule_hit_logs_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "semantic_rule_domains"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semantic_rule_hit_logs" ADD CONSTRAINT "semantic_rule_hit_logs_rule_set_id_fkey" FOREIGN KEY ("rule_set_id") REFERENCES "semantic_rule_sets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semantic_rule_error_logs" ADD CONSTRAINT "semantic_rule_error_logs_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "semantic_rule_domains"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semantic_rule_error_logs" ADD CONSTRAINT "semantic_rule_error_logs_rule_set_id_fkey" FOREIGN KEY ("rule_set_id") REFERENCES "semantic_rule_sets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
