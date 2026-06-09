-- Platform schema baseline built from the current Prisma schema.
-- Apply this migration only when provisioning a brand-new database.
-- For existing environments, mark it as applied with Prisma migrate resolve
-- and introduce any future table changes as new incremental migrations.

-- CreateEnum
CREATE TYPE "UserRoleType" AS ENUM ('employee', 'admin', 'agent');

-- CreateEnum
CREATE TYPE "OrganizationType" AS ENUM ('enterprise', 'subsidiary', 'partner');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('active', 'invited', 'suspended', 'left');

-- CreateEnum
CREATE TYPE "IdentityProviderType" AS ENUM ('microsoft_oidc', 'oidc', 'saml');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "username" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255),
    "role" "UserRoleType" NOT NULL DEFAULT 'employee',
    "ldap_dn" VARCHAR(255),
    "ad_sid" VARCHAR(255),
    "external_id" VARCHAR(255),
    "active_org_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" VARCHAR(500),
    "permissions" JSONB NOT NULL DEFAULT '{}',
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_by" UUID,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "type" "OrganizationType" NOT NULL DEFAULT 'enterprise',
    "description" VARCHAR(500),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "parent_id" UUID,
    "name" VARCHAR(255) NOT NULL,
    "code" VARCHAR(100),
    "manager_user_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "department_id" UUID,
    "name" VARCHAR(255) NOT NULL,
    "code" VARCHAR(100),
    "lead_user_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_memberships" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "department_id" UUID,
    "title" VARCHAR(255),
    "status" "MembershipStatus" NOT NULL DEFAULT 'active',
    "joined_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_memberships" (
    "id" UUID NOT NULL,
    "org_membership_id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "role" VARCHAR(100),
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_role_bindings" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "scope_type" VARCHAR(50) NOT NULL DEFAULT 'organization',
    "scope_ref_id" UUID,
    "assigned_by" UUID,
    "assigned_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_role_bindings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity_provider_configs" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "provider_type" "IdentityProviderType" NOT NULL,
    "tenant_id" VARCHAR(255),
    "issuer" VARCHAR(500),
    "client_id" VARCHAR(255) NOT NULL,
    "client_secret_enc" TEXT,
    "discovery_url" VARCHAR(500),
    "auth_url" VARCHAR(500),
    "token_url" VARCHAR(500),
    "jwks_url" VARCHAR(500),
    "scopes" JSONB NOT NULL DEFAULT '[]',
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identity_provider_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "execution_flow_templates" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" VARCHAR(500),
    "goal" VARCHAR(1000),
    "expected_result" VARCHAR(1000),
    "params_schema" JSONB NOT NULL DEFAULT '{}',
    "category" VARCHAR(50) NOT NULL DEFAULT 'document',
    "steps" JSONB NOT NULL DEFAULT '[]',
    "execution_flow_keys" JSONB NOT NULL DEFAULT '[]',
    "validation" JSONB,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "execution_flow_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_configs" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" VARCHAR(500),
    "trigger_keywords" JSONB NOT NULL DEFAULT '[]',
    "params_schema" JSONB NOT NULL DEFAULT '{}',
    "template_id" VARCHAR(255),
    "carbone_template_id" VARCHAR(255),
    "carbone_skill_id" VARCHAR(255),
    "api_endpoints" JSONB,
    "execution_flow" JSONB NOT NULL DEFAULT '[]',
    "execution_flow_template_ids" JSONB NOT NULL DEFAULT '[]',
    "tools" JSONB NOT NULL DEFAULT '[]',
    "config_status" VARCHAR(32) NOT NULL DEFAULT 'draft',
    "last_validation_summary" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skill_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_permissions" (
    "skill_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "granted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "granted_by" UUID,

    CONSTRAINT "skill_permissions_pkey" PRIMARY KEY ("skill_id","role_id")
);

-- CreateTable
CREATE TABLE "tool_catalogs" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "display_name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "category" VARCHAR(50),
    "runtime_type" VARCHAR(50),
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "risk_level" VARCHAR(10) NOT NULL DEFAULT 'L0',
    "allow_skill_binding" BOOLEAN NOT NULL DEFAULT true,
    "prompt_exposure" VARCHAR(30) NOT NULL DEFAULT 'prompt_and_runtime',
    "default_requires_confirmation" BOOLEAN NOT NULL DEFAULT false,
    "default_requires_approval" BOOLEAN NOT NULL DEFAULT false,
    "metadata_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tool_catalogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_tool_bindings" (
    "id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "tool_name" VARCHAR(100) NOT NULL,
    "binding_source" VARCHAR(30) NOT NULL DEFAULT 'declared',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skill_tool_bindings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" VARCHAR(255),
    "model_id" VARCHAR(255),
    "status" VARCHAR(50) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "role" VARCHAR(20) NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "executions" (
    "id" UUID NOT NULL,
    "org_id" UUID,
    "created_by" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "skill_version" VARCHAR(50),
    "status" VARCHAR(50) NOT NULL,
    "runtime_type" VARCHAR(50) NOT NULL DEFAULT 'browser',
    "risk_level" VARCHAR(10) NOT NULL DEFAULT 'L0',
    "input_json" JSONB,
    "normalized_input_json" JSONB,
    "result_json" JSONB,
    "failure_reason" TEXT,
    "failure_code" VARCHAR(50),
    "current_step_id" UUID,
    "requires_approval" BOOLEAN NOT NULL DEFAULT false,
    "approval_status" VARCHAR(50),
    "takeover_required" BOOLEAN NOT NULL DEFAULT false,
    "takeover_reason" TEXT,
    "started_at" TIMESTAMPTZ,
    "ended_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "runtime_sessions" (
    "id" UUID NOT NULL,
    "execution_id" UUID,
    "runtime_type" VARCHAR(50) NOT NULL DEFAULT 'browser',
    "worker_id" VARCHAR(255),
    "profile_id" VARCHAR(255),
    "state" VARCHAR(50) NOT NULL,
    "control_mode" VARCHAR(50) NOT NULL DEFAULT 'AGENT_RUNNING',
    "lease_expires_at" TIMESTAMPTZ,
    "connection_info_json" JSONB,
    "capabilities_json" JSONB DEFAULT '[]',
    "health_status" VARCHAR(50),
    "freeze_reason" TEXT,
    "last_activity_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ,

    CONSTRAINT "runtime_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "execution_steps" (
    "id" UUID NOT NULL,
    "execution_id" UUID NOT NULL,
    "step_index" INTEGER NOT NULL,
    "name" VARCHAR(255),
    "type" VARCHAR(50) NOT NULL,
    "status" VARCHAR(50) NOT NULL,
    "action" VARCHAR(100),
    "target_json" JSONB,
    "input_json" JSONB,
    "output_json" JSONB,
    "assertion_json" JSONB,
    "error_message" TEXT,
    "error_code" VARCHAR(50),
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "snapshot_id" VARCHAR(255),
    "takeover_triggered" BOOLEAN NOT NULL DEFAULT false,
    "started_at" TIMESTAMPTZ,
    "ended_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "execution_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "execution_events" (
    "id" UUID NOT NULL,
    "execution_id" UUID NOT NULL,
    "runtime_session_id" UUID,
    "step_id" UUID,
    "event_type" VARCHAR(100) NOT NULL,
    "event_source" VARCHAR(50),
    "payload_json" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "execution_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "action" VARCHAR(255) NOT NULL,
    "resource" VARCHAR(255) NOT NULL,
    "ip_address" VARCHAR(50),
    "status_code" INTEGER,
    "duration_ms" INTEGER,
    "request_body" JSONB,
    "response_body" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "fn" VARCHAR(255) NOT NULL,
    "timeout" VARCHAR(50) NOT NULL DEFAULT '30s',
    "retry_policy" JSONB,
    "handler" VARCHAR(50) NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "generated_code" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "temporal_workflows" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" VARCHAR(500),
    "taskQueue" VARCHAR(255) NOT NULL,
    "workflow_dsl" JSONB NOT NULL,
    "activity_dsl" JSONB NOT NULL,
    "generated_code" TEXT,
    "artifact_version" INTEGER NOT NULL DEFAULT 0,
    "artifact_hash" VARCHAR(128),
    "validation_status" VARCHAR(32) NOT NULL DEFAULT 'draft',
    "validation_score" INTEGER NOT NULL DEFAULT 0,
    "validation_result_json" JSONB,
    "validated_at" TIMESTAMPTZ,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deployed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "temporal_workflows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_username_idx" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_is_active_idx" ON "users"("is_active");

-- CreateIndex
CREATE INDEX "users_active_org_id_idx" ON "users"("active_org_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE INDEX "roles_name_idx" ON "roles"("name");

-- CreateIndex
CREATE INDEX "roles_permissions_idx" ON "roles"("permissions");

-- CreateIndex
CREATE INDEX "user_roles_user_id_idx" ON "user_roles"("user_id");

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_code_key" ON "organizations"("code");

-- CreateIndex
CREATE INDEX "organizations_code_idx" ON "organizations"("code");

-- CreateIndex
CREATE INDEX "organizations_is_active_idx" ON "organizations"("is_active");

-- CreateIndex
CREATE INDEX "departments_org_id_idx" ON "departments"("org_id");

-- CreateIndex
CREATE INDEX "departments_parent_id_idx" ON "departments"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "departments_org_id_name_key" ON "departments"("org_id", "name");

-- CreateIndex
CREATE INDEX "teams_org_id_idx" ON "teams"("org_id");

-- CreateIndex
CREATE INDEX "teams_department_id_idx" ON "teams"("department_id");

-- CreateIndex
CREATE UNIQUE INDEX "teams_org_id_name_key" ON "teams"("org_id", "name");

-- CreateIndex
CREATE INDEX "org_memberships_org_id_status_idx" ON "org_memberships"("org_id", "status");

-- CreateIndex
CREATE INDEX "org_memberships_department_id_idx" ON "org_memberships"("department_id");

-- CreateIndex
CREATE UNIQUE INDEX "org_memberships_user_id_org_id_key" ON "org_memberships"("user_id", "org_id");

-- CreateIndex
CREATE INDEX "team_memberships_team_id_idx" ON "team_memberships"("team_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_memberships_org_membership_id_team_id_key" ON "team_memberships"("org_membership_id", "team_id");

-- CreateIndex
CREATE INDEX "org_role_bindings_org_id_role_id_idx" ON "org_role_bindings"("org_id", "role_id");

-- CreateIndex
CREATE INDEX "org_role_bindings_assigned_by_idx" ON "org_role_bindings"("assigned_by");

-- CreateIndex
CREATE UNIQUE INDEX "org_role_bindings_membership_id_role_id_scope_type_scope_re_key" ON "org_role_bindings"("membership_id", "role_id", "scope_type", "scope_ref_id");

-- CreateIndex
CREATE INDEX "identity_provider_configs_org_id_provider_type_is_enabled_idx" ON "identity_provider_configs"("org_id", "provider_type", "is_enabled");

-- CreateIndex
CREATE UNIQUE INDEX "identity_provider_configs_org_id_name_key" ON "identity_provider_configs"("org_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "execution_flow_templates_name_key" ON "execution_flow_templates"("name");

-- CreateIndex
CREATE INDEX "execution_flow_templates_name_idx" ON "execution_flow_templates"("name");

-- CreateIndex
CREATE INDEX "execution_flow_templates_category_idx" ON "execution_flow_templates"("category");

-- CreateIndex
CREATE INDEX "execution_flow_templates_is_public_idx" ON "execution_flow_templates"("is_public");

-- CreateIndex
CREATE INDEX "execution_flow_templates_is_active_idx" ON "execution_flow_templates"("is_active");

-- CreateIndex
CREATE INDEX "execution_flow_templates_usage_count_idx" ON "execution_flow_templates"("usage_count");

-- CreateIndex
CREATE UNIQUE INDEX "skill_configs_name_key" ON "skill_configs"("name");

-- CreateIndex
CREATE INDEX "skill_configs_name_idx" ON "skill_configs"("name");

-- CreateIndex
CREATE INDEX "skill_configs_is_active_idx" ON "skill_configs"("is_active");

-- CreateIndex
CREATE INDEX "skill_configs_config_status_idx" ON "skill_configs"("config_status");

-- CreateIndex
CREATE INDEX "skill_permissions_skill_id_idx" ON "skill_permissions"("skill_id");

-- CreateIndex
CREATE INDEX "skill_permissions_role_id_idx" ON "skill_permissions"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "tool_catalogs_name_key" ON "tool_catalogs"("name");

-- CreateIndex
CREATE INDEX "tool_catalogs_status_idx" ON "tool_catalogs"("status");

-- CreateIndex
CREATE INDEX "tool_catalogs_category_status_idx" ON "tool_catalogs"("category", "status");

-- CreateIndex
CREATE INDEX "tool_catalogs_runtime_type_status_idx" ON "tool_catalogs"("runtime_type", "status");

-- CreateIndex
CREATE INDEX "skill_tool_bindings_tool_name_idx" ON "skill_tool_bindings"("tool_name");

-- CreateIndex
CREATE UNIQUE INDEX "skill_tool_bindings_skill_id_tool_name_key" ON "skill_tool_bindings"("skill_id", "tool_name");

-- CreateIndex
CREATE INDEX "chat_sessions_user_id_idx" ON "chat_sessions"("user_id");

-- CreateIndex
CREATE INDEX "chat_sessions_status_idx" ON "chat_sessions"("status");

-- CreateIndex
CREATE INDEX "chat_messages_session_id_idx" ON "chat_messages"("session_id");

-- CreateIndex
CREATE INDEX "chat_messages_role_idx" ON "chat_messages"("role");

-- CreateIndex
CREATE INDEX "executions_created_by_created_at_idx" ON "executions"("created_by", "created_at" DESC);

-- CreateIndex
CREATE INDEX "executions_skill_id_created_at_idx" ON "executions"("skill_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "executions_status_created_at_idx" ON "executions"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "runtime_sessions_execution_id_idx" ON "runtime_sessions"("execution_id");

-- CreateIndex
CREATE INDEX "runtime_sessions_state_updated_at_idx" ON "runtime_sessions"("state", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "runtime_sessions_worker_id_state_idx" ON "runtime_sessions"("worker_id", "state");

-- CreateIndex
CREATE INDEX "runtime_sessions_profile_id_state_idx" ON "runtime_sessions"("profile_id", "state");

-- CreateIndex
CREATE INDEX "execution_steps_execution_id_status_idx" ON "execution_steps"("execution_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "execution_steps_execution_id_step_index_key" ON "execution_steps"("execution_id", "step_index");

-- CreateIndex
CREATE INDEX "execution_events_execution_id_created_at_idx" ON "execution_events"("execution_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_resource_created_at_idx" ON "audit_logs"("resource", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "activities_name_key" ON "activities"("name");

-- CreateIndex
CREATE INDEX "activities_name_idx" ON "activities"("name");

-- CreateIndex
CREATE INDEX "activities_handler_idx" ON "activities"("handler");

-- CreateIndex
CREATE INDEX "activities_is_active_idx" ON "activities"("is_active");

-- CreateIndex
CREATE INDEX "temporal_workflows_name_idx" ON "temporal_workflows"("name");

-- CreateIndex
CREATE INDEX "temporal_workflows_taskQueue_idx" ON "temporal_workflows"("taskQueue");

-- CreateIndex
CREATE INDEX "temporal_workflows_is_active_idx" ON "temporal_workflows"("is_active");

-- CreateIndex
CREATE INDEX "temporal_workflows_validation_status_idx" ON "temporal_workflows"("validation_status");

-- CreateIndex
CREATE INDEX "temporal_workflows_validated_at_idx" ON "temporal_workflows"("validated_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_active_org_id_fkey" FOREIGN KEY ("active_org_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_memberships" ADD CONSTRAINT "org_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_memberships" ADD CONSTRAINT "org_memberships_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_memberships" ADD CONSTRAINT "org_memberships_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_org_membership_id_fkey" FOREIGN KEY ("org_membership_id") REFERENCES "org_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_role_bindings" ADD CONSTRAINT "org_role_bindings_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_role_bindings" ADD CONSTRAINT "org_role_bindings_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "org_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_role_bindings" ADD CONSTRAINT "org_role_bindings_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_role_bindings" ADD CONSTRAINT "org_role_bindings_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_provider_configs" ADD CONSTRAINT "identity_provider_configs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_permissions" ADD CONSTRAINT "skill_permissions_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skill_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_permissions" ADD CONSTRAINT "skill_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_tool_bindings" ADD CONSTRAINT "skill_tool_bindings_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skill_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runtime_sessions" ADD CONSTRAINT "runtime_sessions_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "executions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_steps" ADD CONSTRAINT "execution_steps_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_events" ADD CONSTRAINT "execution_events_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
