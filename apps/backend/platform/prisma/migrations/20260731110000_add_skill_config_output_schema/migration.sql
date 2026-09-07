-- AlterTable
ALTER TABLE "skill_configs" ADD COLUMN IF NOT EXISTS "output_schema" JSONB NOT NULL DEFAULT '{}';
