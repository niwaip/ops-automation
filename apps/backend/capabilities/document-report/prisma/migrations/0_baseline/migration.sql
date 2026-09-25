-- Baseline migration for document-report
-- Defines report_templates and reports tables corresponding to schema.prisma

-- CreateTable
CREATE TABLE "report_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "format" VARCHAR(20) NOT NULL,
    "template_file" VARCHAR(500),
    "sections" JSONB NOT NULL,
    "global_config" JSONB,
    "ai_config" JSONB,
    "notification_config" JSONB,
    "created_by" VARCHAR(255),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PK_f85e16e6beea41a2b3a3350b84e" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "template_id" UUID NOT NULL,
    "session_id" VARCHAR(255) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "result_file" VARCHAR(500),
    "ai_analysis" JSONB,
    "validation_results" JSONB,
    "notifications" JSONB,
    "error" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(6),

    CONSTRAINT "PK_d9013193989303580053c0b5ef6" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "FK_6f8e618c3d55635fdbbc6cbe01c" FOREIGN KEY ("template_id") REFERENCES "report_templates"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
