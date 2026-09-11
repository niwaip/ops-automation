DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WorkspaceType') THEN
        CREATE TYPE "WorkspaceType" AS ENUM ('personal', 'department', 'company');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WorkspaceNodeType') THEN
        CREATE TYPE "WorkspaceNodeType" AS ENUM ('file', 'folder');
    END IF;
END$$;

CREATE TABLE IF NOT EXISTS "workspaces" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "type" "WorkspaceType" NOT NULL,
    "owner_user_id" VARCHAR(64),
    "department_id" VARCHAR(64),
    "quota_bytes" BIGINT NOT NULL DEFAULT 5368709120,
    "used_bytes" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "workspaces_type_owner_user_id_key" ON "workspaces"("type", "owner_user_id");
CREATE INDEX IF NOT EXISTS "workspaces_type_department_id_idx" ON "workspaces"("type", "department_id");

CREATE TABLE IF NOT EXISTS "workspace_nodes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "parent_id" UUID,
    "name" VARCHAR(255) NOT NULL,
    "type" "WorkspaceNodeType" NOT NULL,
    "file_size" BIGINT NOT NULL DEFAULT 0,
    "mime_type" VARCHAR(128),
    "storage_path" TEXT,
    "digest_json" JSONB,
    "created_by" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_nodes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workspace_nodes_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "workspace_nodes_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "workspace_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "workspace_nodes_workspace_id_parent_id_idx" ON "workspace_nodes"("workspace_id", "parent_id");
CREATE INDEX IF NOT EXISTS "workspace_nodes_workspace_id_name_idx" ON "workspace_nodes"("workspace_id", "name");
