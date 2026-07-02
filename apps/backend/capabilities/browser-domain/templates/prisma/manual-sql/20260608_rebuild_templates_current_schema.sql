-- Rebuild `public.templates` to match the current browser-template Prisma schema.
-- This script is intended as an emergency repair script for environments where
-- old shared SQL created an incompatible table definition.
--
-- Expected current contract:
-- - enum name: public.templates_status_enum
-- - created_by / reviewed_by: VARCHAR(255)
-- - JSON columns: JSONB with Prisma-compatible defaults
--
-- Safety behavior:
-- 1. If `public.templates` exists, create a one-time text-safe backup table.
-- 2. Drop the current `public.templates` table.
-- 3. Drop incompatible enum types if they exist.
-- 4. Recreate the enum and table exactly for the current Prisma schema.
-- 5. Restore rows from the backup table on a best-effort basis.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'templates'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'templates_backup_before_rebuild_20260608'
  ) THEN
    EXECUTE $backup$
      CREATE TABLE public.templates_backup_before_rebuild_20260608 AS
      SELECT
        id,
        name,
        version,
        status::text AS status_text,
        description,
        params_schema,
        steps,
        guards,
        config,
        created_by::text AS created_by_text,
        reviewed_by::text AS reviewed_by_text,
        published_at,
        created_at,
        updated_at,
        deprecated_at
      FROM public.templates
    $backup$;
  END IF;
END $$;

DROP TABLE IF EXISTS public.templates CASCADE;

DROP TYPE IF EXISTS public.templates_status_enum CASCADE;
DROP TYPE IF EXISTS public.template_status CASCADE;

CREATE TYPE public.templates_status_enum AS ENUM (
  'DRAFT',
  'REVIEW',
  'PUBLISHED',
  'DEPRECATED',
  'REVOKED'
);

CREATE TABLE public.templates (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  version VARCHAR(50) NOT NULL DEFAULT '1.0.0',
  status public.templates_status_enum NOT NULL DEFAULT 'DRAFT',
  description VARCHAR(1000),
  params_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  guards JSONB NOT NULL DEFAULT '[]'::jsonb,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by VARCHAR(255) NOT NULL DEFAULT 'system',
  reviewed_by VARCHAR(255),
  published_at TIMESTAMP(6),
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deprecated_at TIMESTAMP(6),
  CONSTRAINT "PK_515948649ce0bbbe391de702ae5" PRIMARY KEY (id),
  CONSTRAINT "UQ_templates_name_version" UNIQUE (name, version)
);

CREATE INDEX "IDX_templates_name" ON public.templates (name);
CREATE INDEX "IDX_templates_status" ON public.templates (status);
CREATE INDEX "IDX_templates_created_at_desc" ON public.templates (created_at DESC);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'templates_backup_before_rebuild_20260608'
  ) THEN
    INSERT INTO public.templates (
      id,
      name,
      version,
      status,
      description,
      params_schema,
      steps,
      guards,
      config,
      created_by,
      reviewed_by,
      published_at,
      created_at,
      updated_at,
      deprecated_at
    )
    SELECT
      id,
      name,
      COALESCE(NULLIF(version, ''), '1.0.0'),
      CASE
        WHEN status_text IN ('DRAFT', 'REVIEW', 'PUBLISHED', 'DEPRECATED', 'REVOKED')
          THEN status_text::public.templates_status_enum
        ELSE 'DRAFT'::public.templates_status_enum
      END,
      description,
      COALESCE(params_schema, '{}'::jsonb),
      COALESCE(steps, '[]'::jsonb),
      COALESCE(guards, '[]'::jsonb),
      COALESCE(config, '{}'::jsonb),
      COALESCE(NULLIF(created_by_text, ''), 'system'),
      NULLIF(reviewed_by_text, ''),
      published_at,
      COALESCE(created_at, CURRENT_TIMESTAMP),
      COALESCE(updated_at, CURRENT_TIMESTAMP),
      deprecated_at
    FROM public.templates_backup_before_rebuild_20260608
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- Verification helpers:
-- \d+ public.templates
-- \dT+ public.templates_status_enum
-- SELECT id, name, version, status, created_by FROM public.templates ORDER BY created_at DESC LIMIT 20;
