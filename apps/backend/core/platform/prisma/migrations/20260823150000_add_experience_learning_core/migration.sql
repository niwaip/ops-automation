CREATE TABLE "user_workflow_aliases" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "owner_user_id" UUID NOT NULL,
  "skill_id" UUID NOT NULL,
  "skill_version" INTEGER NOT NULL,
  "alias" VARCHAR(255) NOT NULL,
  "normalized_alias" VARCHAR(255) NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'active',
  "confirmed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_workflow_aliases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_workflow_aliases_skill_id_fkey" FOREIGN KEY ("skill_id")
    REFERENCES "user_saved_skills"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "user_workflow_aliases_status_check" CHECK ("status" IN ('active', 'disabled'))
);

CREATE UNIQUE INDEX "user_workflow_aliases_owner_normalized_key"
  ON "user_workflow_aliases"("owner_user_id", "normalized_alias");
CREATE UNIQUE INDEX "user_workflow_aliases_skill_version_normalized_key"
  ON "user_workflow_aliases"("skill_id", "skill_version", "normalized_alias");
CREATE INDEX "user_workflow_aliases_owner_status_idx"
  ON "user_workflow_aliases"("owner_user_id", "status");

CREATE TABLE "routing_observations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "owner_user_id" UUID NOT NULL,
  "request_fingerprint" VARCHAR(64) NOT NULL,
  "route_source" VARCHAR(32) NOT NULL,
  "match_method" VARCHAR(32),
  "selected_source_id" UUID,
  "selected_version" VARCHAR(50),
  "candidate_count" INTEGER NOT NULL DEFAULT 0,
  "match_score" DOUBLE PRECISION,
  "planner_invoked" BOOLEAN NOT NULL DEFAULT false,
  "planner_input_tokens" INTEGER,
  "contract_status" VARCHAR(32),
  "business_status" VARCHAR(32),
  "error_code" VARCHAR(100),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "routing_observations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "routing_observations_owner_created_idx"
  ON "routing_observations"("owner_user_id", "created_at" DESC);
CREATE INDEX "routing_observations_source_created_idx"
  ON "routing_observations"("route_source", "created_at" DESC);

CREATE TABLE "habit_learning_runs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "idempotency_key" VARCHAR(128) NOT NULL,
  "policy_version" VARCHAR(50) NOT NULL,
  "status" VARCHAR(32) NOT NULL,
  "window_start" TIMESTAMPTZ NOT NULL,
  "window_end" TIMESTAMPTZ NOT NULL,
  "lease_owner" VARCHAR(128),
  "lease_expires_at" TIMESTAMPTZ,
  "candidate_count" INTEGER NOT NULL DEFAULT 0,
  "processed_users" INTEGER NOT NULL DEFAULT 0,
  "error_summary" TEXT,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ,
  CONSTRAINT "habit_learning_runs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "habit_learning_runs_idempotency_key"
  ON "habit_learning_runs"("idempotency_key");
CREATE INDEX "habit_learning_runs_status_started_idx"
  ON "habit_learning_runs"("status", "started_at" DESC);

CREATE TABLE "user_habit_candidates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "idempotency_key" VARCHAR(128) NOT NULL,
  "owner_user_id" UUID NOT NULL,
  "kind" VARCHAR(32) NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'candidate',
  "risk_level" VARCHAR(32) NOT NULL DEFAULT 'low',
  "intent_key" VARCHAR(255) NOT NULL,
  "saved_skill_id" UUID,
  "saved_version" INTEGER,
  "evidence_json" JSONB NOT NULL DEFAULT '{}',
  "review_json" JSONB,
  "shadow_json" JSONB,
  "source_run_id" UUID NOT NULL,
  "policy_version" VARCHAR(50) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_habit_candidates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_habit_candidates_kind_check"
    CHECK ("kind" IN ('workflow_reuse', 'parameter_default', 'presentation_preference')),
  CONSTRAINT "user_habit_candidates_status_check"
    CHECK ("status" IN ('candidate', 'shadow', 'active', 'held', 'rejected', 'expired'))
);
CREATE UNIQUE INDEX "user_habit_candidates_idempotency_key"
  ON "user_habit_candidates"("idempotency_key");
CREATE INDEX "user_habit_candidates_owner_status_idx"
  ON "user_habit_candidates"("owner_user_id", "status");
CREATE INDEX "user_habit_candidates_run_created_idx"
  ON "user_habit_candidates"("source_run_id", "created_at" DESC);

CREATE TABLE "user_habits" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "owner_user_id" UUID NOT NULL,
  "kind" VARCHAR(32) NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'active',
  "intent_key" VARCHAR(255) NOT NULL,
  "saved_skill_id" UUID,
  "saved_version" INTEGER,
  "value_json" JSONB NOT NULL DEFAULT '{}',
  "source_candidate_id" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "contract_digest" VARCHAR(128),
  "expires_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_habits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_habits_status_check"
    CHECK ("status" IN ('active', 'disabled', 'held', 'expired'))
);
CREATE UNIQUE INDEX "user_habits_owner_kind_intent_key"
  ON "user_habits"("owner_user_id", "kind", "intent_key");
CREATE INDEX "user_habits_owner_status_idx"
  ON "user_habits"("owner_user_id", "status");

CREATE TABLE "user_personalization_preferences" (
  "owner_user_id" UUID NOT NULL,
  "recommendation_enabled" BOOLEAN NOT NULL DEFAULT false,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_personalization_preferences_pkey" PRIMARY KEY ("owner_user_id")
);

CREATE TABLE "habit_governance_audits" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "actor_user_id" UUID NOT NULL,
  "target_type" VARCHAR(32) NOT NULL,
  "target_id" UUID NOT NULL,
  "action" VARCHAR(32) NOT NULL,
  "reason" VARCHAR(1000),
  "before_json" JSONB,
  "after_json" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "habit_governance_audits_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "habit_governance_audits_target_idx"
  ON "habit_governance_audits"("target_type", "target_id", "created_at" DESC);
