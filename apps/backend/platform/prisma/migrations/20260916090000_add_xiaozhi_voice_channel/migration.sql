ALTER TYPE "ImChannelType" ADD VALUE IF NOT EXISTS 'xiaozhi';

ALTER TABLE "im_channel_connections"
  ADD COLUMN "credential_fingerprint" VARCHAR(64),
  ADD COLUMN "xiaozhi_alias" VARCHAR(100);

CREATE UNIQUE INDEX "im_channel_connections_credential_fingerprint_key"
  ON "im_channel_connections"("credential_fingerprint");

CREATE TABLE "voice_task_requests" (
  "id" UUID NOT NULL,
  "channel_connection_id" UUID NOT NULL,
  "owner_user_id" UUID NOT NULL,
  "organization_id" UUID,
  "idempotency_key" VARCHAR(128) NOT NULL,
  "instruction" VARCHAR(1000) NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'accepted',
  "execution_id" UUID,
  "speech_summary" VARCHAR(500) NOT NULL DEFAULT '任务已受理，可以稍后查询进度。',
  "last_error_code" VARCHAR(100),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "voice_task_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "voice_task_requests_channel_connection_id_idempotency_key_key"
  ON "voice_task_requests"("channel_connection_id", "idempotency_key");
CREATE INDEX "voice_task_requests_channel_connection_id_created_at_idx"
  ON "voice_task_requests"("channel_connection_id", "created_at" DESC);
CREATE INDEX "voice_task_requests_owner_user_id_created_at_idx"
  ON "voice_task_requests"("owner_user_id", "created_at" DESC);

CREATE TABLE "xiaozhi_connector_leases" (
  "connection_id" UUID NOT NULL,
  "worker_id" VARCHAR(100) NOT NULL,
  "lease_until" TIMESTAMPTZ NOT NULL,
  "heartbeat_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "xiaozhi_connector_leases_pkey" PRIMARY KEY ("connection_id")
);
CREATE INDEX "xiaozhi_connector_leases_lease_until_idx"
  ON "xiaozhi_connector_leases"("lease_until");
