ALTER TABLE "reminder_rules" ADD COLUMN "source_execution_id" UUID;
CREATE UNIQUE INDEX "reminder_rules_source_execution_id_key" ON "reminder_rules"("source_execution_id");
