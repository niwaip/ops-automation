ALTER TABLE "reminder_rules" ALTER COLUMN "cron_expression" TYPE VARCHAR(500);
ALTER TABLE "reminder_rules" ADD COLUMN "run_at" TIMESTAMPTZ;
