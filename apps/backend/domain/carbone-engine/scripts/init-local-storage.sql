-- Local-only bootstrap for carbone-engine validation.
-- This creates the Prisma-backed tables without touching _prisma_migrations.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TemplateFormat') THEN
    CREATE TYPE "TemplateFormat" AS ENUM ('docx', 'xlsx', 'pptx', 'html');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TemplateType') THEN
    CREATE TYPE "TemplateType" AS ENUM ('template', 'marked_template');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.carbone_templates (
  id uuid PRIMARY KEY,
  type "TemplateType" NOT NULL DEFAULT 'template',
  original_id uuid NULL,
  file_name varchar(500) NOT NULL,
  file_path varchar(1000) NOT NULL,
  format "TemplateFormat" NOT NULL,
  size integer NULL,
  variables text[] NOT NULL DEFAULT ARRAY[]::text[],
  loops jsonb NOT NULL DEFAULT '[]'::jsonb,
  markings jsonb NULL,
  ignored_elements jsonb NULL,
  element_groups jsonb NULL,
  ignored_groups jsonb NULL,
  markings_saved_at timestamptz NULL,
  template_config jsonb NULL,
  config_saved_at timestamptz NULL,
  suggestions jsonb NULL,
  verify_result jsonb NULL,
  has_valid_file boolean NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT carbone_templates_original_id_fkey
    FOREIGN KEY (original_id) REFERENCES public.carbone_templates(id)
);

CREATE INDEX IF NOT EXISTS carbone_templates_type_idx
  ON public.carbone_templates(type);

CREATE INDEX IF NOT EXISTS carbone_templates_original_id_idx
  ON public.carbone_templates(original_id);

CREATE TABLE IF NOT EXISTS public.carbone_skills (
  id uuid PRIMARY KEY,
  template_id uuid NOT NULL UNIQUE,
  parameters jsonb NOT NULL DEFAULT '[]'::jsonb,
  data_example jsonb NULL,
  raw_skill jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT carbone_skills_template_id_fkey
    FOREIGN KEY (template_id) REFERENCES public.carbone_templates(id)
);

CREATE INDEX IF NOT EXISTS carbone_skills_template_id_idx
  ON public.carbone_skills(template_id);

CREATE TABLE IF NOT EXISTS public.carbone_render_outputs (
  id uuid PRIMARY KEY,
  template_id uuid NULL,
  marked_template_id uuid NULL,
  skill_id uuid NULL,
  file_name varchar(500) NOT NULL,
  file_path varchar(1000) NOT NULL,
  format "TemplateFormat" NOT NULL,
  size integer NULL,
  params jsonb NULL,
  sample_data jsonb NULL,
  simulated_data jsonb NULL,
  debug_logs jsonb NULL,
  rendered_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NULL,
  CONSTRAINT carbone_render_outputs_template_id_fkey
    FOREIGN KEY (template_id) REFERENCES public.carbone_templates(id),
  CONSTRAINT carbone_render_outputs_marked_template_id_fkey
    FOREIGN KEY (marked_template_id) REFERENCES public.carbone_templates(id),
  CONSTRAINT carbone_render_outputs_skill_id_fkey
    FOREIGN KEY (skill_id) REFERENCES public.carbone_skills(id)
);

CREATE INDEX IF NOT EXISTS carbone_render_outputs_template_id_idx
  ON public.carbone_render_outputs(template_id);

CREATE INDEX IF NOT EXISTS carbone_render_outputs_marked_template_id_idx
  ON public.carbone_render_outputs(marked_template_id);

CREATE INDEX IF NOT EXISTS carbone_render_outputs_skill_id_idx
  ON public.carbone_render_outputs(skill_id);

CREATE INDEX IF NOT EXISTS carbone_render_outputs_expires_at_idx
  ON public.carbone_render_outputs(expires_at);
