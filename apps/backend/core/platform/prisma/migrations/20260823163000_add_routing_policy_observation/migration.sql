ALTER TABLE "routing_observations"
  ADD COLUMN IF NOT EXISTS "routing_policy_version" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "routing_policy_digest" VARCHAR(64);
