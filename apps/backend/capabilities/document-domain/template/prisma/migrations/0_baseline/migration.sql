-- Baseline migration for document-domain template (carbone-engine)
-- Defines carbone_templates, carbone_skills, and carbone_render_outputs tables

-- CreateEnum
CREATE TYPE "TemplateFormat" AS ENUM ('docx', 'xlsx', 'pptx', 'html');

-- CreateEnum
CREATE TYPE "TemplateType" AS ENUM ('template', 'marked_template');

-- CreateTable
CREATE TABLE "carbone_templates" (
    "id" UUID NOT NULL,
    "type" "TemplateType" NOT NULL DEFAULT 'template',
    "original_id" UUID,
    "file_name" VARCHAR(500) NOT NULL,
    "file_path" VARCHAR(1000) NOT NULL,
    "format" "TemplateFormat" NOT NULL,
    "size" INTEGER,
    "variables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "loops" JSONB NOT NULL DEFAULT '[]',
    "markings" JSONB,
    "ignored_elements" JSONB,
    "element_groups" JSONB,
    "ignored_groups" JSONB,
    "markings_saved_at" TIMESTAMPTZ,
    "template_config" JSONB,
    "config_saved_at" TIMESTAMPTZ,
    "suggestions" JSONB,
    "verify_result" JSONB,
    "has_valid_file" BOOLEAN,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "carbone_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carbone_skills" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "parameters" JSONB NOT NULL DEFAULT '[]',
    "data_example" JSONB,
    "raw_skill" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "carbone_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carbone_render_outputs" (
    "id" UUID NOT NULL,
    "template_id" UUID,
    "marked_template_id" UUID,
    "skill_id" UUID,
    "file_name" VARCHAR(500) NOT NULL,
    "file_path" VARCHAR(1000) NOT NULL,
    "format" "TemplateFormat" NOT NULL,
    "size" INTEGER,
    "params" JSONB,
    "sample_data" JSONB,
    "simulated_data" JSONB,
    "debug_logs" JSONB,
    "rendered_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ,

    CONSTRAINT "carbone_render_outputs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "carbone_templates_type_idx" ON "carbone_templates"("type");

-- CreateIndex
CREATE INDEX "carbone_templates_original_id_idx" ON "carbone_templates"("original_id");

-- CreateIndex
CREATE UNIQUE INDEX "carbone_skills_template_id_key" ON "carbone_skills"("template_id");

-- CreateIndex
CREATE INDEX "carbone_skills_template_id_idx" ON "carbone_skills"("template_id");

-- CreateIndex
CREATE INDEX "carbone_render_outputs_template_id_idx" ON "carbone_render_outputs"("template_id");

-- CreateIndex
CREATE INDEX "carbone_render_outputs_marked_template_id_idx" ON "carbone_render_outputs"("marked_template_id");

-- CreateIndex
CREATE INDEX "carbone_render_outputs_skill_id_idx" ON "carbone_render_outputs"("skill_id");

-- CreateIndex
CREATE INDEX "carbone_render_outputs_expires_at_idx" ON "carbone_render_outputs"("expires_at");

-- AddForeignKey
ALTER TABLE "carbone_templates" ADD CONSTRAINT "carbone_templates_original_id_fkey" FOREIGN KEY ("original_id") REFERENCES "carbone_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carbone_skills" ADD CONSTRAINT "carbone_skills_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "carbone_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carbone_render_outputs" ADD CONSTRAINT "carbone_render_outputs_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "carbone_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carbone_render_outputs" ADD CONSTRAINT "carbone_render_outputs_marked_template_id_fkey" FOREIGN KEY ("marked_template_id") REFERENCES "carbone_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carbone_render_outputs" ADD CONSTRAINT "carbone_render_outputs_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "carbone_skills"("id") ON DELETE SET NULL ON UPDATE CASCADE;
