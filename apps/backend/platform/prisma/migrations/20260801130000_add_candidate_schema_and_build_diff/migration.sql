-- §17.2 candidate schema storage on skill_configs (backfill pipeline, human-confirmed)
ALTER TABLE "skill_configs" ADD COLUMN IF NOT EXISTS "candidate_schema_json" JSONB;
ALTER TABLE "skill_configs" ADD COLUMN IF NOT EXISTS "candidate_schema_generated_at" TIMESTAMPTZ;

-- P3 §15.4 item 5: structured schema compatibility diff on capability_builds
ALTER TABLE "capability_builds" ADD COLUMN IF NOT EXISTS "build_diff_json" JSONB;
