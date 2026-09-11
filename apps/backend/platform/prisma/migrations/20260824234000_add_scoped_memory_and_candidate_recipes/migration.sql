CREATE TABLE IF NOT EXISTS "scoped_memories" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "scope_type" VARCHAR(32) NOT NULL,
  "scope_id" UUID NOT NULL, "organization_id" UUID, "kind" VARCHAR(64) NOT NULL,
  "memory_key" VARCHAR(255) NOT NULL, "value_json" JSONB NOT NULL,
  "source" VARCHAR(64) NOT NULL, "version" INTEGER NOT NULL DEFAULT 1,
  "status" VARCHAR(32) NOT NULL DEFAULT 'active', "expires_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "scoped_memories_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "scoped_memories_scope_type_check" CHECK ("scope_type" IN ('organization','team','user')),
  CONSTRAINT "scoped_memories_scope_key" UNIQUE ("scope_type", "scope_id", "kind", "memory_key")
);
CREATE INDEX IF NOT EXISTS "scoped_memories_org_kind_status_idx"
  ON "scoped_memories"("organization_id", "kind", "status");
CREATE INDEX IF NOT EXISTS "scoped_memories_scope_status_idx"
  ON "scoped_memories"("scope_type", "scope_id", "status");

CREATE TABLE IF NOT EXISTS "candidate_recipes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "scope_type" VARCHAR(32) NOT NULL,
  "scope_id" UUID NOT NULL, "intent_fingerprint" VARCHAR(64) NOT NULL,
  "topology_digest" VARCHAR(64) NOT NULL, "recipe_json" JSONB NOT NULL,
  "risk_level" VARCHAR(10) NOT NULL DEFAULT 'L0', "status" VARCHAR(32) NOT NULL DEFAULT 'candidate',
  "version" INTEGER NOT NULL DEFAULT 1, "shadow_runs" INTEGER NOT NULL DEFAULT 0,
  "shadow_passes" INTEGER NOT NULL DEFAULT 0, "approved_by" UUID, "rollback_version" INTEGER,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "candidate_recipes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "candidate_recipes_scope_check" CHECK ("scope_type" IN ('organization','team','user')),
  CONSTRAINT "candidate_recipes_status_check" CHECK ("status" IN ('candidate','shadow','approved','canary','active','rejected','rolled_back')),
  CONSTRAINT "candidate_recipes_version_key" UNIQUE ("scope_type", "scope_id", "intent_fingerprint", "version")
);
CREATE INDEX IF NOT EXISTS "candidate_recipes_status_updated_idx"
  ON "candidate_recipes"("status", "updated_at" DESC);

CREATE TABLE IF NOT EXISTS "candidate_recipe_evaluations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "candidate_recipe_id" UUID NOT NULL,
  "fixture_id" VARCHAR(255) NOT NULL, "passed" BOOLEAN NOT NULL,
  "comparison_json" JSONB NOT NULL, "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "candidate_recipe_evaluations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "candidate_recipe_evaluations_recipe_fkey" FOREIGN KEY ("candidate_recipe_id")
    REFERENCES "candidate_recipes"("id") ON DELETE CASCADE,
  CONSTRAINT "candidate_recipe_evaluations_fixture_key" UNIQUE ("candidate_recipe_id", "fixture_id")
);
CREATE INDEX IF NOT EXISTS "candidate_recipe_evaluations_recipe_created_idx"
  ON "candidate_recipe_evaluations"("candidate_recipe_id", "created_at" DESC);
