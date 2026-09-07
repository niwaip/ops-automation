-- CreateEnum
CREATE TYPE "InboxItemStatus" AS ENUM ('unprocessed', 'clarified', 'converted', 'archived', 'discarded');

-- CreateTable
CREATE TABLE "workbench_inbox_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" VARCHAR(64) NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "raw_content" TEXT NOT NULL,
    "source_type" "TodoSourceType" NOT NULL DEFAULT 'manual',
    "source_ref_id" VARCHAR(255),
    "source_title" VARCHAR(255),
    "source_sender" VARCHAR(255),
    "unified_payload" JSONB NOT NULL DEFAULT '{}',
    "status" "InboxItemStatus" NOT NULL DEFAULT 'unprocessed',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "ai_clarification" JSONB,
    "converted_todo_id" UUID,
    "clarified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workbench_inbox_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workbench_inbox_items_user_id_status_idx" ON "workbench_inbox_items"("user_id", "status");

-- CreateIndex
CREATE INDEX "workbench_inbox_items_user_id_created_at_idx" ON "workbench_inbox_items"("user_id", "created_at" DESC);
