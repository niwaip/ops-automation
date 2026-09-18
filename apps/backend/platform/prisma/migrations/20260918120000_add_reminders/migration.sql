CREATE TABLE "reminder_rules" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "message" VARCHAR(4096) NOT NULL,
  "cron_expression" VARCHAR(100) NOT NULL,
  "timezone" VARCHAR(50) NOT NULL DEFAULT 'Asia/Shanghai',
  "send_wechat" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "deleted_at" TIMESTAMPTZ,
  "next_run_at" TIMESTAMPTZ NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reminder_rules_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "reminder_rules_is_active_next_run_at_idx" ON "reminder_rules"("is_active", "next_run_at");
CREATE INDEX "reminder_rules_user_id_idx" ON "reminder_rules"("user_id");

CREATE TABLE "reminder_deliveries" (
  "id" UUID NOT NULL,
  "rule_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "scheduled_at" TIMESTAMPTZ NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "message" VARCHAR(4096) NOT NULL,
  "remind_at" TIMESTAMPTZ NOT NULL,
  "read_at" TIMESTAMPTZ,
  "send_wechat" BOOLEAN NOT NULL DEFAULT false,
  "wechat_status" VARCHAR(32) NOT NULL DEFAULT 'skipped',
  "wechat_attempts" INTEGER NOT NULL DEFAULT 0,
  "wechat_next_attempt_at" TIMESTAMPTZ,
  "wechat_lease_until" TIMESTAMPTZ,
  "wechat_last_error" VARCHAR(1000),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reminder_deliveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reminder_deliveries_rule_id_scheduled_at_key" UNIQUE ("rule_id", "scheduled_at"),
  CONSTRAINT "reminder_deliveries_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "reminder_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "reminder_deliveries_user_id_remind_at_idx" ON "reminder_deliveries"("user_id", "remind_at");
CREATE INDEX "reminder_deliveries_wechat_status_wechat_next_attempt_at_idx" ON "reminder_deliveries"("wechat_status", "wechat_next_attempt_at");
