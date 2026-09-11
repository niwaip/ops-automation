-- P3 §15.4: Gate 5 attestation + §10.3 fixture infrastructure
ALTER TABLE "builtin_skill_versions" ADD COLUMN IF NOT EXISTS "attestation_id" VARCHAR(36);

CREATE TABLE IF NOT EXISTS "capability_fixtures" (
    "id" UUID NOT NULL,
    "release_id" UUID NOT NULL,
    "build_id" UUID,
    "name" VARCHAR(255),
    "fixture_type" VARCHAR(32) NOT NULL,
    "input_json" JSONB NOT NULL,
    "expected_output_json" JSONB,
    "is_negative" BOOLEAN NOT NULL DEFAULT false,
    "error_contains" VARCHAR(255),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "capability_fixtures_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "capability_fixtures_release_id_fixture_type_idx" ON "capability_fixtures"("release_id", "fixture_type");

CREATE TABLE IF NOT EXISTS "capability_attestations" (
    "id" UUID NOT NULL,
    "release_id" UUID NOT NULL,
    "build_id" UUID NOT NULL,
    "source_digest" VARCHAR(128) NOT NULL,
    "contract_digest" VARCHAR(128) NOT NULL,
    "generated_code_digest" VARCHAR(128) NOT NULL,
    "fixture_digest" VARCHAR(128),
    "validator_version" VARCHAR(32) NOT NULL,
    "gate_results_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "capability_attestations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "capability_attestations_release_id_created_at_idx" ON "capability_attestations"("release_id", "created_at" DESC);
