-- AlterTable: change granted_by from UUID to TEXT to accept non-UUID values like 'system'
ALTER TABLE "skill_permissions" ALTER COLUMN "granted_by" SET DATA TYPE TEXT;
