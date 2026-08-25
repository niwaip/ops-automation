-- Run once by a database administrator. Login roles and credentials are managed by the Secret Provider.
-- These NOLOGIN roles are logical ownership groups. A transitional process may host multiple
-- logical modules and inherit their groups; table ownership still has exactly one logical writer.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ops_governance_writer') THEN CREATE ROLE ops_governance_writer NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ops_registry_writer') THEN CREATE ROLE ops_registry_writer NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ops_execution_writer') THEN CREATE ROLE ops_execution_writer NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ops_runtime_writer') THEN CREATE ROLE ops_runtime_writer NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ops_intelligence_writer') THEN CREATE ROLE ops_intelligence_writer NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ops_experience_writer') THEN CREATE ROLE ops_experience_writer NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ops_browser_semantics_writer') THEN CREATE ROLE ops_browser_semantics_writer NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ops_application_reader') THEN CREATE ROLE ops_application_reader NOLOGIN; END IF;
END $$;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO ops_application_reader, ops_governance_writer,
  ops_registry_writer, ops_execution_writer, ops_runtime_writer,
  ops_intelligence_writer, ops_experience_writer, ops_browser_semantics_writer;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ops_application_reader;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  users, organizations, departments, teams, team_memberships, org_memberships,
  roles, user_roles, org_role_bindings, identity_provider_configs, audit_logs
TO ops_governance_writer;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  builtin_skills, builtin_skill_versions, builtin_skill_deployments,
  builtin_skill_permission_overrides, builtin_skill_audit_events,
  capability_releases, capability_source_snapshots, capability_builds,
  capability_validations, capability_fixtures, capability_attestations,
  deployment_records, release_audit_events, skill_configs, skill_drafts,
  skill_permissions, skill_access_requests, skill_tool_bindings, tool_catalogs
TO ops_registry_writer;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  executions, execution_steps, execution_events, execution_plans, execution_artifacts,
  execution_result_refs, execution_phases, execution_phase_steps, execution_phase_artifacts,
  execution_takeovers, execution_outbox, schedule_fires, skill_schedules,
  execution_flow_templates, temporal_workflows
TO ops_execution_writer;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE runtime_sessions TO ops_runtime_writer;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  chat_sessions, chat_messages
TO ops_intelligence_writer;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  habit_learning_runs, user_habit_candidates, user_habits, habit_governance_audits,
  user_personalization_preferences, user_saved_skills, user_saved_skill_versions,
  user_workflow_aliases, scoped_memories, candidate_recipes, candidate_recipe_evaluations,
  planning_decisions, prompt_snapshots, llm_usage_ledger, routing_observations,
  assistant_feedback_current, assistant_feedback_events
TO ops_experience_writer;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE activities TO ops_browser_semantics_writer;

-- Tables mostly use UUID defaults, but legacy tables can still own sequences.
-- Writers need sequence usage without receiving any additional table privileges.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO
  ops_governance_writer, ops_registry_writer, ops_execution_writer,
  ops_runtime_writer, ops_intelligence_writer, ops_experience_writer,
  ops_browser_semantics_writer;

-- Existing login roles are cut over explicitly by the DBA.  Do not reuse a
-- DATABASE_URL across these identities: Compose requires the matching secret.
-- GRANT ops_application_reader, ops_execution_writer, ops_experience_writer TO control_plane_app;
-- GRANT ops_application_reader, ops_intelligence_writer TO ai_orchestrator_app;
-- GRANT ops_application_reader, ops_runtime_writer TO runtime_worker_app;
-- REVOKE ops_execution_writer, ops_registry_writer FROM ai_orchestrator_app;
-- REVOKE ops_registry_writer FROM control_plane_app;
