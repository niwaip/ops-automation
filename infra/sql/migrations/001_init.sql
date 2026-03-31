-- Migration: 001_init
-- Description: Initialize database schema for Browser Control Plane
-- Date: 2026-03-31
-- Version: 1.0.0

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable pgcrypto for potential password hashing functions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

-- User role type
CREATE TYPE user_role_type AS ENUM ('employee', 'admin', 'agent');

-- Template status type
CREATE TYPE template_status AS ENUM ('DRAFT', 'REVIEW', 'PUBLISHED', 'DEPRECATED', 'REVOKED');

-- Session state type
CREATE TYPE session_state AS ENUM ('IDLE', 'RUNNING', 'HUMAN_CONTROL', 'CLOSED', 'ERROR');

-- Step log result type
CREATE TYPE step_result AS ENUM ('success', 'failed', 'retry', 'takeover');

-- AI agent status type
CREATE TYPE ai_agent_status AS ENUM ('idle', 'running', 'error');

-- ============================================================================
-- TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Users Table
-- Stores user accounts for employees, admins, and agent identities
-- LDAP/AD extension fields are reserved for future integration
-- ----------------------------------------------------------------------------
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,  -- bcrypt or argon2 hashed
    email VARCHAR(255) UNIQUE,
    role user_role_type NOT NULL DEFAULT 'employee',

    -- LDAP/AD extension fields (reserved for future integration)
    ldap_dn VARCHAR(255),                  -- LDAP Distinguished Name
    ad_sid VARCHAR(255),                   -- Active Directory SID
    external_id VARCHAR(255),              -- External identity provider ID

    -- Account status
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMP WITH TIME ZONE,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT username_length CHECK (LENGTH(username) >= 3 AND LENGTH(username) <= 50),
    CONSTRAINT password_hash_not_empty CHECK (LENGTH(password_hash) > 0)
);

-- Index for frequent queries
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_email ON users(email) WHERE email IS NOT NULL;
CREATE INDEX idx_users_active ON users(is_active) WHERE is_active = TRUE;

-- ----------------------------------------------------------------------------
-- Roles Table
-- Defines roles and their associated permissions
-- ----------------------------------------------------------------------------
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description VARCHAR(500),
    permissions JSONB NOT NULL DEFAULT '{}',
    is_system BOOLEAN NOT NULL DEFAULT FALSE,  -- System roles cannot be deleted
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT name_length CHECK (LENGTH(name) >= 2 AND LENGTH(name) <= 100)
);

-- Index for permission lookups
CREATE INDEX idx_roles_name ON roles(name);
CREATE INDEX idx_roles_permissions ON roles USING GIN(permissions);

-- ----------------------------------------------------------------------------
-- User Roles Junction Table
-- Maps users to their assigned roles (many-to-many)
-- ----------------------------------------------------------------------------
CREATE TABLE user_roles (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    assigned_by UUID REFERENCES users(id),

    PRIMARY KEY (user_id, role_id)
);

-- Index for role membership queries
CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_role ON user_roles(role_id);

-- ----------------------------------------------------------------------------
-- Templates Table
-- Stores automation templates (JSON format, Playwright-like IR)
-- ----------------------------------------------------------------------------
CREATE TABLE templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    version VARCHAR(50) NOT NULL DEFAULT '1.0.0',
    status template_status NOT NULL DEFAULT 'DRAFT',

    -- Template content
    description VARCHAR(1000),
    params_schema JSONB NOT NULL DEFAULT '{}',  -- JSON Schema for parameters
    steps JSONB NOT NULL DEFAULT '[]',           -- Template steps (DSL)

    -- Guards (preconditions)
    guards JSONB NOT NULL DEFAULT '[]',

    -- Idempotency and retry configuration
    config JSONB NOT NULL DEFAULT '{}',

    -- Ownership and audit
    created_by UUID NOT NULL REFERENCES users(id),
    reviewed_by UUID REFERENCES users(id),
    published_at TIMESTAMP WITH TIME ZONE,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deprecated_at TIMESTAMP WITH TIME ZONE,

    -- Constraints
    CONSTRAINT template_name_version_unique UNIQUE (name, version),
    CONSTRAINT template_status_review CHECK (
        (status = 'PUBLISHED' AND reviewed_by IS NOT NULL) OR
        status != 'PUBLISHED'
    )
);

-- Indexes for template queries
CREATE INDEX idx_templates_name ON templates(name);
CREATE INDEX idx_templates_status ON templates(status);
CREATE INDEX idx_templates_created_by ON templates(created_by);
CREATE INDEX idx_templates_published ON templates(status) WHERE status = 'PUBLISHED';
CREATE INDEX idx_templates_steps ON templates USING GIN(steps);

-- ----------------------------------------------------------------------------
-- Sessions Table
-- Tracks browser automation sessions
-- ----------------------------------------------------------------------------
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    template_id UUID REFERENCES templates(id),

    -- Session state
    state session_state NOT NULL DEFAULT 'IDLE',

    -- Worker reference (K8s pod name or container ID)
    worker_ref VARCHAR(255),

    -- Connection endpoints
    endpoints JSONB NOT NULL DEFAULT '{}',  -- { novnc_url, cdp_url, vnc_url }

    -- Profile information
    profile_path VARCHAR(500),              -- PVC/NFS profile path

    -- Current step tracking
    current_step_id VARCHAR(255),
    step_index INTEGER DEFAULT 0,

    -- Execution parameters
    params JSONB NOT NULL DEFAULT '{}',      -- Runtime parameters from template

    -- Takeover tracking
    takeover_count INTEGER NOT NULL DEFAULT 0,
    takeover_triggered_by UUID REFERENCES users(id),
    takeover_reason VARCHAR(500),

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    closed_at TIMESTAMP WITH TIME ZONE,
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Error tracking
    error_message VARCHAR(1000),
    error_class VARCHAR(255),

    -- Constraints
    CONSTRAINT session_worker_ref_format CHECK (
        worker_ref IS NULL OR LENGTH(worker_ref) >= 1
    )
);

-- Indexes for session queries
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_template ON sessions(template_id);
CREATE INDEX idx_sessions_state ON sessions(state);
CREATE INDEX idx_sessions_worker ON sessions(worker_ref) WHERE worker_ref IS NOT NULL;
CREATE INDEX idx_sessions_active ON sessions(state) WHERE state IN ('IDLE', 'RUNNING', 'HUMAN_CONTROL');
CREATE INDEX idx_sessions_created_at ON sessions(created_at DESC);

-- ----------------------------------------------------------------------------
-- Step Logs Table
-- Detailed logs for each step execution
-- ----------------------------------------------------------------------------
CREATE TABLE step_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,

    -- Step identification
    step_id VARCHAR(255) NOT NULL,
    step_index INTEGER NOT NULL,
    action VARCHAR(255) NOT NULL,          -- click, fill, wait, navigate, etc.

    -- Locator information (for audit and debugging)
    locator_type VARCHAR(50),              -- role, label, text, css, xpath
    locator_value VARCHAR(500),
    locator_summary VARCHAR(500),          -- Human-readable locator description

    -- Timing
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,

    -- Result
    result step_result NOT NULL,

    -- Error information
    error_class VARCHAR(255),
    error_message VARCHAR(1000),

    -- Retry tracking
    retry_count INTEGER NOT NULL DEFAULT 0,
    retry_reason VARCHAR(500),

    -- Takeover tracking
    takeover_triggered BOOLEAN NOT NULL DEFAULT FALSE,
    takeover_reason VARCHAR(500),

    -- Evidence
    screenshot_ref VARCHAR(500),           -- Screenshot storage path/URL
    trace_ref VARCHAR(500),                -- Playwright trace file reference

    -- Additional context
    context JSONB NOT NULL DEFAULT '{}',   -- Step-specific context data

    -- Constraints
    CONSTRAINT step_logs_duration_positive CHECK (
        duration_ms IS NULL OR duration_ms >= 0
    )
);

-- Indexes for step log queries
CREATE INDEX idx_step_logs_session ON step_logs(session_id);
CREATE INDEX idx_step_logs_step_id ON step_logs(step_id);
CREATE INDEX idx_step_logs_result ON step_logs(result);
CREATE INDEX idx_step_logs_session_time ON step_logs(session_id, started_at DESC);
CREATE INDEX idx_step_logs_takeover ON step_logs(takeover_triggered) WHERE takeover_triggered = TRUE;

-- ----------------------------------------------------------------------------
-- AI Models Table
-- Configured AI models for orchestration
-- ----------------------------------------------------------------------------
CREATE TABLE ai_models (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    provider VARCHAR(255) NOT NULL,        -- openai, anthropic, local, etc.
    api_endpoint VARCHAR(500) NOT NULL,
    api_key_ref VARCHAR(255),              -- Reference to secret/vault (NOT the actual key)

    -- Model configuration
    config JSONB NOT NULL DEFAULT '{}',    -- { max_tokens, temperature, model_version }

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT ai_models_provider_check CHECK (LENGTH(provider) >= 1)
);

CREATE INDEX idx_ai_models_active ON ai_models(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_ai_models_provider ON ai_models(provider);

-- ----------------------------------------------------------------------------
-- AI Agents Table
-- Runtime AI agent instances
-- ----------------------------------------------------------------------------
CREATE TABLE ai_agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_id UUID NOT NULL REFERENCES ai_models(id),
    session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,

    -- Agent status
    status ai_agent_status NOT NULL DEFAULT 'idle',

    -- Current task
    current_task VARCHAR(500),
    task_started_at TIMESTAMP WITH TIME ZONE,

    -- Agent configuration (session-specific overrides)
    config JSONB NOT NULL DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_ai_agents_session ON ai_agents(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX idx_ai_agents_status ON ai_agents(status);
CREATE INDEX idx_ai_agents_model ON ai_agents(model_id);

-- ============================================================================
-- FUNCTIONS AND TRIGGERS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to all relevant tables
CREATE TRIGGER trigger_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_roles_updated_at
    BEFORE UPDATE ON roles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_templates_updated_at
    BEFORE UPDATE ON templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_ai_models_updated_at
    BEFORE UPDATE ON ai_models
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_ai_agents_updated_at
    BEFORE UPDATE ON ai_agents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- VIEWS
-- ============================================================================

-- View for active sessions with user and template info
CREATE VIEW active_sessions_view AS
SELECT
    s.id AS session_id,
    s.state,
    s.worker_ref,
    s.endpoints,
    s.current_step_id,
    s.step_index,
    s.takeover_count,
    s.created_at,
    s.started_at,
    u.id AS user_id,
    u.username,
    u.role AS user_role,
    t.id AS template_id,
    t.name AS template_name,
    t.version AS template_version
FROM sessions s
JOIN users u ON s.user_id = u.id
LEFT JOIN templates t ON s.template_id = t.id
WHERE s.state IN ('IDLE', 'RUNNING', 'HUMAN_CONTROL');

-- View for session statistics
CREATE VIEW session_stats_view AS
SELECT
    s.id AS session_id,
    s.state,
    COUNT(sl.id) AS total_steps,
    SUM(CASE WHEN sl.result = 'success' THEN 1 ELSE 0 END) AS successful_steps,
    SUM(CASE WHEN sl.result = 'failed' THEN 1 ELSE 0 END) AS failed_steps,
    SUM(CASE WHEN sl.result = 'retry' THEN 1 ELSE 0 END) AS retry_steps,
    SUM(CASE WHEN sl.result = 'takeover' THEN 1 ELSE 0 END) AS takeover_steps,
    SUM(sl.duration_ms) AS total_duration_ms,
    AVG(sl.duration_ms) AS avg_step_duration_ms,
    MAX(sl.takeover_triggered) AS had_takeover
FROM sessions s
LEFT JOIN step_logs sl ON s.id = sl.session_id
GROUP BY s.id, s.state;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE users IS 'User accounts for employees, admins, and automation agents';
COMMENT ON TABLE roles IS 'Role definitions with permission sets';
COMMENT ON TABLE user_roles IS 'User-role assignments (many-to-many)';
COMMENT ON TABLE templates IS 'Automation templates in JSON DSL format';
COMMENT ON TABLE sessions IS 'Browser automation session tracking';
COMMENT ON TABLE step_logs IS 'Detailed execution logs for each template step';
COMMENT ON TABLE ai_models IS 'Configured AI models for orchestration';
COMMENT ON TABLE ai_agents IS 'Runtime AI agent instances';

COMMENT ON COLUMN users.ldap_dn IS 'Reserved for LDAP integration - Distinguished Name';
COMMENT ON COLUMN users.ad_sid IS 'Reserved for Active Directory integration - Security ID';
COMMENT ON COLUMN users.external_id IS 'Reserved for external identity provider mapping';

COMMENT ON COLUMN templates.params_schema IS 'JSON Schema defining valid template parameters';
COMMENT ON COLUMN templates.steps IS 'Template DSL steps in Playwright-like format';
COMMENT ON COLUMN templates.guards IS 'Preconditions that must be satisfied before execution';

COMMENT ON COLUMN sessions.endpoints IS 'JSON object: { novnc_url, cdp_url, vnc_url }';
COMMENT ON COLUMN sessions.worker_ref IS 'Kubernetes pod name or container identifier';

COMMENT ON COLUMN step_logs.screenshot_ref IS 'Path/URL to screenshot evidence file';
COMMENT ON COLUMN step_logs.trace_ref IS 'Path/URL to Playwright trace file';

COMMENT ON COLUMN ai_models.api_key_ref IS 'Reference to Kubernetes secret or vault, NOT the actual API key';