-- 20260802000000_fix_uuid_id_defaults
-- Single authoritative fix for UUID defaults drift: tables created by
-- hand-written baseline SQL (20260608_init_platform_baseline) declare
-- "id" UUID with no DEFAULT, while schema.prisma declares @default(uuid()).
-- This migration aligns every public uuid id column with the schema default,
-- exactly like the former manual-sql/20260704_repair_uuid_id_defaults.sql.
--
-- Idempotent by construction: only columns whose default is NULL are touched,
-- so re-running (e.g. on an already-repaired database) is a no-op.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT cols.table_schema, cols.table_name
    FROM information_schema.columns cols
    JOIN information_schema.table_constraints tc
      ON tc.table_schema = cols.table_schema
     AND tc.table_name = cols.table_name
     AND tc.constraint_type = 'PRIMARY KEY'
    JOIN information_schema.key_column_usage kcu
      ON kcu.table_schema = tc.table_schema
     AND kcu.table_name = tc.table_name
     AND kcu.constraint_name = tc.constraint_name
     AND kcu.column_name = cols.column_name
    WHERE cols.table_schema = 'public'
      AND cols.column_name = 'id'
      AND cols.data_type = 'uuid'
      AND cols.column_default IS NULL
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ALTER COLUMN %I SET DEFAULT gen_random_uuid()',
      target.table_schema,
      target.table_name,
      'id'
    );
  END LOOP;
END $$;
