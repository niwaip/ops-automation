CREATE TYPE "ImChannelType" AS ENUM ('wechat');
CREATE TYPE "ImConnectionStatus" AS ENUM (
  'unconfigured',
  'provisioning',
  'disabled',
  'connecting',
  'online',
  'reauth_required',
  'error'
);

CREATE TABLE "im_channel_connections" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "channel" "ImChannelType" NOT NULL DEFAULT 'wechat',
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "status" "ImConnectionStatus" NOT NULL DEFAULT 'unconfigured',
  "provider_account_id" VARCHAR(255),
  "provider_owner_user_id" VARCHAR(255),
  "provider_base_url" VARCHAR(500),
  "encrypted_credential" TEXT,
  "update_cursor" TEXT,
  "last_connected_at" TIMESTAMPTZ,
  "last_message_at" TIMESTAMPTZ,
  "last_error" VARCHAR(1000),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "im_channel_connections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "im_channel_connections_user_id_channel_key"
  ON "im_channel_connections"("user_id", "channel");
CREATE INDEX "im_channel_connections_enabled_status_idx"
  ON "im_channel_connections"("enabled", "status");
ALTER TABLE "im_channel_connections"
  ADD CONSTRAINT "im_channel_connections_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
