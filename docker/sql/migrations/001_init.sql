-- DEPRECATED
-- This legacy bootstrap SQL no longer reflects the current shared database schema.
-- Do not execute this file for new or existing environments.
--
-- Current supported entrypoints:
--   1. bash ./docker/scripts/ops-menu.sh
--   2. bash ./docker/scripts/apply-latest-db-schema.sh
--   3. Platform baseline:
--      apps/backend/core/platform/prisma/migrations/20260608_init_platform_baseline/migration.sql
--   4. Shared incremental SQL:
--      apps/backend/orchestration/control-plane/prisma/migrations/20260515143000_add_execution_phases/migration.sql
--      apps/backend/orchestration/control-plane/prisma/migrations/20260516140000_add_execution_phase_steps/migration.sql

DO $$
BEGIN
  RAISE EXCEPTION USING
    MESSAGE = 'docker/sql/migrations/001_init.sql is deprecated and must not be executed.',
    HINT = 'Use bash ./docker/scripts/ops-menu.sh or bash ./docker/scripts/apply-latest-db-schema.sh instead.';
END $$;
