CREATE TABLE IF NOT EXISTS "planning_decisions" (
  "id" UUID NOT NULL,
  "owner_user_id" UUID NOT NULL,
  "execution_id" UUID,
  "request_fingerprint" VARCHAR(64) NOT NULL,
  "schema_version" VARCHAR(64) NOT NULL,
  "route_class" VARCHAR(32) NOT NULL,
  "route_source" VARCHAR(32) NOT NULL,
  "decision_json" JSONB NOT NULL,
  "shadow" BOOLEAN NOT NULL DEFAULT true,
  "routing_policy_version" VARCHAR(64) NOT NULL,
  "routing_policy_digest" VARCHAR(64) NOT NULL,
  "catalog_snapshot_digest" VARCHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "planning_decisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "planning_decisions_owner_user_id_created_at_idx"
  ON "planning_decisions"("owner_user_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "planning_decisions_execution_id_idx"
  ON "planning_decisions"("execution_id");

CREATE INDEX IF NOT EXISTS "planning_decisions_route_class_created_at_idx"
  ON "planning_decisions"("route_class", "created_at" DESC);
