DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CredentialCategory') THEN
        CREATE TYPE "CredentialCategory" AS ENUM ('api_key', 'device_key', 'basic_auth', 'bearer_token', 'custom');
    END IF;
END$$;

CREATE TABLE IF NOT EXISTS "user_credentials" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "org_id" UUID,
    "name" VARCHAR(128) NOT NULL,
    "category" "CredentialCategory" NOT NULL,
    "description" VARCHAR(255),
    "encrypted_data" TEXT NOT NULL,
    "masked_preview" JSONB NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'active',
    "expires_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_credentials_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "user_credentials_user_id_category_idx" ON "user_credentials"("user_id", "category");
CREATE INDEX IF NOT EXISTS "user_credentials_org_id_idx" ON "user_credentials"("org_id");

CREATE TABLE IF NOT EXISTS "user_skill_credential_bindings" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "param_name" VARCHAR(64) NOT NULL,
    "credential_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_skill_credential_bindings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_skill_credential_bindings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "user_skill_credential_bindings_credential_id_fkey" FOREIGN KEY ("credential_id") REFERENCES "user_credentials"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_skill_credential_bindings_user_id_skill_id_param_name_key" ON "user_skill_credential_bindings"("user_id", "skill_id", "param_name");
CREATE INDEX IF NOT EXISTS "user_skill_credential_bindings_user_id_skill_id_idx" ON "user_skill_credential_bindings"("user_id", "skill_id");
