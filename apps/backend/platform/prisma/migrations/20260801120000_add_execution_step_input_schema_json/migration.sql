-- AlterTable
ALTER TABLE "execution_steps" ADD COLUMN IF NOT EXISTS "input_schema_json" JSONB;
