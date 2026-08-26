-- Corrective foundation for the Capability Release models.  This migration is
-- ordered before 20260801130000, which adds build_diff_json to capability_builds.
-- Existing environments already contain these tables; IF NOT EXISTS keeps the
-- corrective history adoption safe while making an empty database reproducible.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "capability_releases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source_type" VARCHAR(64) NOT NULL,
    "source_id" UUID,
    "source_name" VARCHAR(255),
    "source_status" VARCHAR(32) NOT NULL DEFAULT 'draft',
    "release_version" INTEGER NOT NULL DEFAULT 1,
    "status" VARCHAR(32) NOT NULL DEFAULT 'draft',
    "approval_status" VARCHAR(32) NOT NULL DEFAULT 'not_required',
    "deployment_status" VARCHAR(32) NOT NULL DEFAULT 'not_started',
    "current_source_snapshot_id" UUID,
    "current_build_id" UUID,
    "latest_successful_build_id" UUID,
    "latest_validation_id" UUID,
    "latest_successful_validation_id" UUID,
    "current_skill_draft_id" UUID,
    "published_skill_id" UUID,
    "last_deployment_id" UUID,
    "rollback_of_release_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ,
    CONSTRAINT "capability_releases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "capability_source_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "release_id" UUID NOT NULL,
    "snapshot_version" INTEGER NOT NULL,
    "source_type" VARCHAR(64) NOT NULL,
    "source_id" UUID,
    "source_payload_json" JSONB NOT NULL,
    "summary" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "capability_source_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "capability_builds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "release_id" UUID NOT NULL,
    "source_snapshot_id" UUID NOT NULL,
    "build_type" VARCHAR(64) NOT NULL,
    "model_id" VARCHAR(128) NOT NULL,
    "prompt_version" VARCHAR(64),
    "prompt_snapshot" TEXT,
    "input_snapshot_json" JSONB NOT NULL,
    "generated_code" TEXT,
    "generated_config_json" JSONB,
    "logs_json" JSONB NOT NULL DEFAULT '[]',
    "diff_summary" TEXT,
    "status" VARCHAR(32) NOT NULL,
    "error_summary" TEXT,
    "started_at" TIMESTAMPTZ,
    "finished_at" TIMESTAMPTZ,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "capability_builds_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "capability_validations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "release_id" UUID NOT NULL,
    "build_id" UUID NOT NULL,
    "validation_type" VARCHAR(32) NOT NULL,
    "input_snapshot_json" JSONB,
    "result_snapshot_json" JSONB,
    "logs_json" JSONB NOT NULL DEFAULT '[]',
    "score" INTEGER NOT NULL DEFAULT 0,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "error_summary" TEXT,
    "started_at" TIMESTAMPTZ,
    "finished_at" TIMESTAMPTZ,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "capability_validations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "skill_drafts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "release_id" UUID NOT NULL,
    "generated_from_build_id" UUID,
    "generated_from_validation_id" UUID,
    "source_type" VARCHAR(64) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL,
    "trigger_keywords" JSONB NOT NULL DEFAULT '[]',
    "params_schema" JSONB NOT NULL DEFAULT '{}',
    "execution_flow_template_ids" JSONB NOT NULL DEFAULT '[]',
    "tools" JSONB NOT NULL DEFAULT '[]',
    "api_endpoints" JSONB,
    "draft_payload_json" JSONB NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'draft',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "skill_drafts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "deployment_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "release_id" UUID NOT NULL,
    "published_skill_id" UUID,
    "environment" VARCHAR(32) NOT NULL,
    "runtime_type" VARCHAR(32) NOT NULL,
    "artifact_uri" TEXT,
    "artifact_hash" VARCHAR(128),
    "worker_version" VARCHAR(128),
    "reload_strategy" VARCHAR(32),
    "request_payload_json" JSONB,
    "result_snapshot_json" JSONB,
    "logs_json" JSONB NOT NULL DEFAULT '[]',
    "status" VARCHAR(32) NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "smoke_validation_id" UUID,
    "rollback_target_release_id" UUID,
    "started_at" TIMESTAMPTZ,
    "finished_at" TIMESTAMPTZ,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "deployment_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "release_audit_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "release_id" UUID NOT NULL,
    "event_type" VARCHAR(64) NOT NULL,
    "actor_id" UUID,
    "actor_name" VARCHAR(255),
    "success" BOOLEAN NOT NULL DEFAULT true,
    "summary" TEXT NOT NULL,
    "details_json" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "release_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "capability_releases_status_updated_at_idx"
  ON "capability_releases" ("status", "updated_at" DESC);
CREATE INDEX IF NOT EXISTS "capability_source_snapshots_release_id_created_at_idx"
  ON "capability_source_snapshots" ("release_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "capability_builds_release_id_created_at_idx"
  ON "capability_builds" ("release_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "capability_validations_release_id_created_at_idx"
  ON "capability_validations" ("release_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "skill_drafts_release_id_updated_at_idx"
  ON "skill_drafts" ("release_id", "updated_at" DESC);
CREATE INDEX IF NOT EXISTS "release_audit_events_release_id_created_at_idx"
  ON "release_audit_events" ("release_id", "created_at" DESC);
