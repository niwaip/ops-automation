CREATE TABLE "skill_access_requests" (
    "id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "requester_user_id" UUID NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'pending',
    "reason" VARCHAR(500),
    "response_note" VARCHAR(500),
    "processed_at" TIMESTAMPTZ,
    "processed_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skill_access_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "skill_access_requests_skill_id_status_idx"
    ON "skill_access_requests"("skill_id", "status");

CREATE INDEX "skill_access_requests_requester_user_id_status_idx"
    ON "skill_access_requests"("requester_user_id", "status");

CREATE INDEX "skill_access_requests_processed_by_idx"
    ON "skill_access_requests"("processed_by");

ALTER TABLE "skill_access_requests"
    ADD CONSTRAINT "skill_access_requests_skill_id_fkey"
    FOREIGN KEY ("skill_id") REFERENCES "skill_configs"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "skill_access_requests"
    ADD CONSTRAINT "skill_access_requests_requester_user_id_fkey"
    FOREIGN KEY ("requester_user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "skill_access_requests"
    ADD CONSTRAINT "skill_access_requests_processed_by_fkey"
    FOREIGN KEY ("processed_by") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
