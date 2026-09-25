-- CreateTable
CREATE TABLE IF NOT EXISTS "outbound_effect_ledgers" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(64) NOT NULL DEFAULT 'default',
    "capability_key" VARCHAR(128) NOT NULL,
    "operation" VARCHAR(64) NOT NULL DEFAULT 'send',
    "idempotency_key" VARCHAR(255) NOT NULL,
    "payload_hash" VARCHAR(128) NOT NULL,
    "canonical_payload_json" JSONB NOT NULL,
    "state" VARCHAR(32) NOT NULL DEFAULT 'PREPARED',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "provider" VARCHAR(64),
    "provider_request_id" VARCHAR(255),
    "provider_message_id" VARCHAR(255),
    "error_classification" VARCHAR(64),
    "resolution_reason" TEXT,
    "resolved_by" VARCHAR(128),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ,

    CONSTRAINT "outbound_effect_ledgers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "outbound_effect_ledgers_tenant_id_capability_key_idempotency_key_key" ON "outbound_effect_ledgers"("tenant_id", "capability_key", "idempotency_key");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "outbound_effect_ledgers_state_created_at_idx" ON "outbound_effect_ledgers"("state", "created_at");
