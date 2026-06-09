-- DEPRECATED
-- This legacy seed SQL no longer matches the current Prisma-managed schema.
-- Do not execute this file.
--
-- Current supported entrypoints:
--   1. bash ./docker/scripts/ops-menu.sh
--   2. cd apps/backend/core/platform && npm run seed
--   3. bash ./docker/scripts/export-initial-data.sh

DO $$
BEGIN
  RAISE EXCEPTION USING
    MESSAGE = 'docker/sql/seed.sql is deprecated and must not be executed.',
    HINT = 'Use ops-menu.sh seed flow or apps/backend/core/platform/prisma/seed.ts instead.';
END $$;
