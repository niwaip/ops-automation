CREATE TYPE "ImInteractionMode" AS ENUM ('auto', 'chat', 'task');

ALTER TABLE "im_channel_connections"
  ADD COLUMN "interaction_mode" "ImInteractionMode" NOT NULL DEFAULT 'auto';
