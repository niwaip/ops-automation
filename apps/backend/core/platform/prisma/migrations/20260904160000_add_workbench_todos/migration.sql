-- CreateEnum
CREATE TYPE "TodoPriority" AS ENUM ('low', 'medium', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "TodoStatus" AS ENUM ('pending', 'in_progress', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "TodoSourceType" AS ENUM ('manual', 'chat', 'email', 'schedule', 'im_channel');

-- CreateTable
CREATE TABLE "workbench_todos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" VARCHAR(64) NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "priority" "TodoPriority" NOT NULL DEFAULT 'medium',
    "status" "TodoStatus" NOT NULL DEFAULT 'pending',
    "due_date" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "source_type" "TodoSourceType" NOT NULL DEFAULT 'manual',
    "source_ref_id" VARCHAR(255),
    "source_title" VARCHAR(255),
    "context_data" JSONB,
    "bound_workflow_id" VARCHAR(255),
    "execution_id" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workbench_todos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workbench_todos_user_id_status_idx" ON "workbench_todos"("user_id", "status");

-- CreateIndex
CREATE INDEX "workbench_todos_user_id_due_date_idx" ON "workbench_todos"("user_id", "due_date");

-- CreateIndex
CREATE INDEX "workbench_todos_user_id_created_at_idx" ON "workbench_todos"("user_id", "created_at" DESC);
