ALTER TABLE user_credentials ADD COLUMN purpose VARCHAR(32), ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
CREATE TABLE mcp_connections (
 id UUID PRIMARY KEY, scope VARCHAR(24) NOT NULL CHECK (scope IN ('personal','organization')),
 owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
 name VARCHAR(128) NOT NULL, status VARCHAR(24) NOT NULL DEFAULT 'active', active_revision_id UUID,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK (scope <> 'organization' OR org_id IS NOT NULL)
);
CREATE INDEX mcp_connections_owner_user_id_scope_idx ON mcp_connections(owner_user_id,scope);
CREATE INDEX mcp_connections_org_id_scope_idx ON mcp_connections(org_id,scope);
CREATE TABLE mcp_connection_revisions (
 id UUID PRIMARY KEY, connection_id UUID NOT NULL REFERENCES mcp_connections(id) ON DELETE CASCADE,
 revision INTEGER NOT NULL, config JSONB NOT NULL, digest VARCHAR(64) NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(connection_id,revision)
);
CREATE TABLE user_mcp_authorizations (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 connection_id UUID NOT NULL REFERENCES mcp_connections(id) ON DELETE CASCADE,
 revision_id UUID NOT NULL REFERENCES mcp_connection_revisions(id), credential_id UUID NOT NULL REFERENCES user_credentials(id) ON DELETE CASCADE,
 status VARCHAR(24) NOT NULL DEFAULT 'active', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(user_id,connection_id)
);
CREATE TABLE mcp_tool_bindings (
 id UUID PRIMARY KEY, connection_id UUID NOT NULL REFERENCES mcp_connections(id) ON DELETE CASCADE,
 revision_id UUID NOT NULL REFERENCES mcp_connection_revisions(id), remote_name VARCHAR(255) NOT NULL,
 description TEXT NOT NULL, input_schema JSONB NOT NULL, output_schema JSONB, schema_digest VARCHAR(64) NOT NULL,
 effect VARCHAR(24) NOT NULL DEFAULT 'unknown', allowed_roles JSONB NOT NULL DEFAULT '[]', status VARCHAR(24) NOT NULL DEFAULT 'published',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(revision_id,remote_name)
);
CREATE INDEX mcp_tool_bindings_connection_id_status_idx ON mcp_tool_bindings(connection_id,status);
CREATE TABLE mcp_invocations (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 connection_id UUID NOT NULL REFERENCES mcp_connections(id), binding_id UUID NOT NULL REFERENCES mcp_tool_bindings(id),
 request_key VARCHAR(128) NOT NULL, input_hash VARCHAR(64) NOT NULL, status VARCHAR(32) NOT NULL DEFAULT 'dispatched', result JSONB,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(user_id,request_key)
);
CREATE INDEX mcp_invocations_connection_id_created_at_idx ON mcp_invocations(connection_id,created_at);
