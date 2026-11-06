-- Editorial metadata is independent of transport revisions and user credentials.
ALTER TABLE mcp_connections ADD COLUMN capability_summary JSONB;
