CREATE TABLE "user_saved_skills" (
    "id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" VARCHAR(1000),
    "visibility" VARCHAR(32) NOT NULL DEFAULT 'private',
    "status" VARCHAR(32) NOT NULL DEFAULT 'pending_review',
    "active_version_id" UUID,
    "latest_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_saved_skills_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_saved_skills_visibility_private_check" CHECK ("visibility" = 'private')
);

CREATE TABLE "user_saved_skill_versions" (
    "id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "source_execution_id" UUID NOT NULL,
    "schema_version" VARCHAR(100) NOT NULL,
    "plan_snapshot_json" JSONB NOT NULL,
    "plan_hash" VARCHAR(128) NOT NULL,
    "fixed_input_json" JSONB NOT NULL,
    "input_hash" VARCHAR(128) NOT NULL,
    "output_schema_json" JSONB,
    "sample_result_json" JSONB,
    "ai_review_json" JSONB NOT NULL,
    "review_status" VARCHAR(32) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_saved_skill_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_saved_skill_versions_skill_id_fkey"
        FOREIGN KEY ("skill_id") REFERENCES "user_saved_skills"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "user_saved_skills_owner_user_id_status_idx"
    ON "user_saved_skills"("owner_user_id", "status");

CREATE UNIQUE INDEX "user_saved_skill_versions_skill_id_version_key"
    ON "user_saved_skill_versions"("skill_id", "version");

CREATE UNIQUE INDEX "user_saved_skill_versions_owner_source_input_key"
    ON "user_saved_skill_versions"("owner_user_id", "source_execution_id", "input_hash");

CREATE INDEX "user_saved_skill_versions_owner_created_at_idx"
    ON "user_saved_skill_versions"("owner_user_id", "created_at" DESC);

CREATE INDEX "user_saved_skill_versions_source_execution_id_idx"
    ON "user_saved_skill_versions"("source_execution_id");
