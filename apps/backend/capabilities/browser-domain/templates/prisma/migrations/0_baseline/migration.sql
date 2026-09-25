-- Baseline migration for browser-domain templates
-- Defines templates enum and templates table corresponding to schema.prisma

-- CreateEnum
CREATE TYPE "templates_status_enum" AS ENUM ('DRAFT', 'REVIEW', 'PUBLISHED', 'DEPRECATED', 'REVOKED');

-- CreateTable
CREATE TABLE "templates" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "version" VARCHAR(50) NOT NULL DEFAULT '1.0.0',
    "status" "templates_status_enum" NOT NULL DEFAULT 'DRAFT',
    "description" VARCHAR(1000),
    "params_schema" JSONB NOT NULL DEFAULT '{}',
    "steps" JSONB NOT NULL DEFAULT '[]',
    "guards" JSONB NOT NULL DEFAULT '[]',
    "config" JSONB NOT NULL DEFAULT '{}',
    "created_by" VARCHAR(255) NOT NULL DEFAULT 'system',
    "reviewed_by" VARCHAR(255),
    "published_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deprecated_at" TIMESTAMP(6),

    CONSTRAINT "PK_515948649ce0bbbe391de702ae5" PRIMARY KEY ("id")
);
