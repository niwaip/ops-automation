-- AlterTable
ALTER TABLE "execution_steps" ADD COLUMN IF NOT EXISTS "output_schema_json" JSONB;
