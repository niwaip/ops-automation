CREATE TABLE IF NOT EXISTS "builtin_skill_runtime_configs" (
    "id" UUID NOT NULL,
    "builtin_skill_id" UUID NOT NULL,
    "config_key" VARCHAR(128) NOT NULL,
    "encrypted_value" TEXT NOT NULL,
    "updated_by" VARCHAR(255),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "builtin_skill_runtime_configs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "builtin_skill_runtime_configs_builtin_skill_id_fkey"
      FOREIGN KEY ("builtin_skill_id") REFERENCES "builtin_skills"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "builtin_skill_runtime_configs_builtin_skill_id_config_key_key"
ON "builtin_skill_runtime_configs"("builtin_skill_id", "config_key");
