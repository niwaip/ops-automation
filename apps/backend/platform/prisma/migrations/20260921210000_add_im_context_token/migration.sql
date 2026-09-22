-- AlterTable
ALTER TABLE "im_channel_connections"
  ADD COLUMN IF NOT EXISTS "context_token" TEXT,
  ADD COLUMN IF NOT EXISTS "context_token_updated_at" TIMESTAMPTZ;
