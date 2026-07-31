-- CreateTable
CREATE TABLE IF NOT EXISTS "builtin_skills" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "capability_key" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(255) NOT NULL,
    "description" VARCHAR(1000),
    "owner" VARCHAR(255) NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "default_access" VARCHAR(32) NOT NULL DEFAULT 'authenticated',
    "lifecycle" VARCHAR(32) NOT NULL DEFAULT 'stable',
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "active_version_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "builtin_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "builtin_skill_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "builtin_skill_id" UUID NOT NULL,
    "definition_version" VARCHAR(64) NOT NULL,
    "api_version" VARCHAR(64) NOT NULL,
    "definition_digest" VARCHAR(71) NOT NULL,
    "manifest_json" JSONB NOT NULL,
    "workflow_json" JSONB NOT NULL DEFAULT '{}',
    "runtime_build" VARCHAR(255),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "builtin_skill_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "builtin_skill_deployments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "builtin_skill_version_id" UUID NOT NULL,
    "environment" VARCHAR(64) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "runtime_build" VARCHAR(255),
    "deployed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "smoke_test_status" VARCHAR(32),
    "smoke_test_digest" VARCHAR(71),
    "failure_code" VARCHAR(64),

    CONSTRAINT "builtin_skill_deployments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "builtin_skill_permission_overrides" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "builtin_skill_id" UUID NOT NULL,
    "org_id" VARCHAR(255),
    "principal_type" VARCHAR(32) NOT NULL,
    "principal_id" VARCHAR(255) NOT NULL,
    "effect" VARCHAR(16) NOT NULL,
    "reason" VARCHAR(500),
    "created_by" VARCHAR(255),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ,

    CONSTRAINT "builtin_skill_permission_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "builtin_skill_audit_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "builtin_skill_id" UUID NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "version_id" UUID,
    "operator" VARCHAR(255),
    "payload" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "builtin_skill_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "builtin_skills_capability_key_key" ON "builtin_skills"("capability_key");
CREATE INDEX IF NOT EXISTS "builtin_skills_is_enabled_category_idx" ON "builtin_skills"("is_enabled", "category");
CREATE UNIQUE INDEX IF NOT EXISTS "builtin_skill_versions_builtin_skill_id_definition_version_key" ON "builtin_skill_versions"("builtin_skill_id", "definition_version");
CREATE UNIQUE INDEX IF NOT EXISTS "builtin_skill_versions_builtin_skill_id_definition_digest_key" ON "builtin_skill_versions"("builtin_skill_id", "definition_digest");
CREATE UNIQUE INDEX IF NOT EXISTS "builtin_skill_deployments_builtin_skill_version_id_environment_key" ON "builtin_skill_deployments"("builtin_skill_version_id", "environment");
CREATE INDEX IF NOT EXISTS "builtin_skill_permission_overrides_builtin_skill_id_principal_type_principal_id_idx" ON "builtin_skill_permission_overrides"("builtin_skill_id", "principal_type", "principal_id");
CREATE INDEX IF NOT EXISTS "builtin_skill_audit_events_builtin_skill_id_created_at_idx" ON "builtin_skill_audit_events"("builtin_skill_id", "created_at");

-- AddForeignKey
ALTER TABLE "builtin_skill_versions" ADD CONSTRAINT "builtin_skill_versions_builtin_skill_id_fkey" FOREIGN KEY ("builtin_skill_id") REFERENCES "builtin_skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "builtin_skill_deployments" ADD CONSTRAINT "builtin_skill_deployments_builtin_skill_version_id_fkey" FOREIGN KEY ("builtin_skill_version_id") REFERENCES "builtin_skill_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "builtin_skill_permission_overrides" ADD CONSTRAINT "builtin_skill_permission_overrides_builtin_skill_id_fkey" FOREIGN KEY ("builtin_skill_id") REFERENCES "builtin_skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "builtin_skill_audit_events" ADD CONSTRAINT "builtin_skill_audit_events_builtin_skill_id_fkey" FOREIGN KEY ("builtin_skill_id") REFERENCES "builtin_skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;
