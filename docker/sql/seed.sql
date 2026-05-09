-- Seed Data: Initial roles, permissions, and default users
-- Description: Populate initial data for Browser Control Plane
-- Date: 2026-03-31
-- Version: 1.0.0

-- ============================================================================
-- ROLES
-- ============================================================================

-- System roles (cannot be deleted)
INSERT INTO roles (name, description, permissions, is_system) VALUES
-- Admin role: Full system access
(
    'admin',
    'System administrator with full access to all features',
    jsonb_build_object(
        'users', jsonb_build_array('create', 'read', 'update', 'delete'),
        'roles', jsonb_build_array('create', 'read', 'update', 'delete'),
        'templates', jsonb_build_array('create', 'read', 'update', 'delete', 'publish', 'deprecate'),
        'sessions', jsonb_build_array('create', 'read', 'update', 'delete', 'takeover', 'close_any'),
        'logs', jsonb_build_array('read', 'export', 'delete'),
        'ai_models', jsonb_build_array('create', 'read', 'update', 'delete'),
        'ai_agents', jsonb_build_array('create', 'read', 'update', 'delete'),
        'settings', jsonb_build_array('read', 'update'),
        'audit', jsonb_build_array('read', 'export')
    ),
    TRUE
),

-- Employee role: Standard user operations
(
    'employee',
    'Regular employee with access to sessions and own logs',
    jsonb_build_object(
        'users', jsonb_build_array('read_self', 'update_self'),
        'templates', jsonb_build_array('read', 'use'),
        'sessions', jsonb_build_array('create', 'read_self', 'update_self', 'close_self', 'takeover_self'),
        'logs', jsonb_build_array('read_self'),
        'ai_agents', jsonb_build_array('read')
    ),
    TRUE
),

-- Agent role: Automation engine identity
(
    'agent',
    'Automation agent identity for replay engine operations',
    jsonb_build_object(
        'templates', jsonb_build_array('read', 'execute'),
        'sessions', jsonb_build_array('read_assigned', 'execute', 'report_status', 'request_takeover'),
        'logs', jsonb_build_array('create', 'read_assigned'),
        'ai_agents', jsonb_build_array('read', 'execute')
    ),
    TRUE
),

-- Recorder role: Template creation and management
(
    'recorder',
    'Template recorder with ability to create and submit templates for review',
    jsonb_build_object(
        'templates', jsonb_build_array('create', 'read', 'update_own', 'submit_for_review'),
        'sessions', jsonb_build_array('read', 'create_recording'),
        'logs', jsonb_build_array('read_own', 'create')
    ),
    FALSE
),

-- Reviewer role: Template review and approval
(
    'reviewer',
    'Template reviewer with ability to approve/reject templates',
    jsonb_build_object(
        'templates', jsonb_build_array('read', 'review', 'approve', 'reject'),
        'sessions', jsonb_build_array('read'),
        'logs', jsonb_build_array('read')
    ),
    FALSE
);

-- ============================================================================
-- DEFAULT ADMIN USER
-- ============================================================================

-- Create default admin user
-- Password hash is for 'admin123' using bcrypt (cost 10)
-- IMPORTANT: Change this password immediately after first login!
INSERT INTO users (username, password_hash, email, role, is_active) VALUES
(
    'admin',
    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZRGdjGj/n3.Q5O5I/yX2W8s0wF0OC',  -- bcrypt hash for 'admin123'
    'admin@example.com',
    'admin',
    TRUE
);

-- Assign admin role to admin user
INSERT INTO user_roles (user_id, role_id, assigned_by)
SELECT
    u.id AS user_id,
    r.id AS role_id,
    u.id AS assigned_by  -- Self-assigned as system admin
FROM users u, roles r
WHERE u.username = 'admin' AND r.name = 'admin';

-- ============================================================================
-- DEFAULT AGENT USERS
-- ============================================================================

-- ============================================================================
-- DEFAULT AI MODEL CONFIGURATION
-- ============================================================================

-- Default AI model placeholder (requires actual configuration)
INSERT INTO ai_models (name, provider, api_endpoint, api_key_ref, config, is_active) VALUES
(
    'default-llm',
    'openai',
    'https://api.openai.com/v1',
    'SECRET:openai-api-key',  -- Reference to Kubernetes secret
    jsonb_build_object(
        'model', 'gpt-4',
        'max_tokens', 4096,
        'temperature', 0.1
    ),
    FALSE  -- Disabled by default, requires proper API key configuration
);

-- ============================================================================
-- PERMISSION DEFINITIONS (Reference Data)
-- ============================================================================

-- This table stores permission definitions for documentation purposes
-- (Permissions are actually stored in roles.permissions JSONB)

CREATE TABLE IF NOT EXISTS permission_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    resource VARCHAR(255) NOT NULL,
    action VARCHAR(255) NOT NULL,
    description VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    UNIQUE(resource, action)
);

-- Insert permission definitions
INSERT INTO permission_definitions (resource, action, description) VALUES
-- Users permissions
('users', 'create', 'Create new user accounts'),
('users', 'read', 'Read all user information'),
('users', 'read_self', 'Read own user information'),
('users', 'update', 'Update any user information'),
('users', 'update_self', 'Update own user information'),
('users', 'delete', 'Delete user accounts'),

-- Roles permissions
('roles', 'create', 'Create new roles'),
('roles', 'read', 'Read role information'),
('roles', 'update', 'Update role definitions'),
('roles', 'delete', 'Delete roles'),

-- Templates permissions
('templates', 'create', 'Create new templates'),
('templates', 'read', 'Read template content'),
('templates', 'update', 'Update any template'),
('templates', 'update_own', 'Update own templates'),
('templates', 'delete', 'Delete templates'),
('templates', 'publish', 'Publish templates for production use'),
('templates', 'deprecate', 'Deprecate templates'),
('templates', 'use', 'Use templates in sessions'),
('templates', 'execute', 'Execute templates (agent role)'),
('templates', 'submit_for_review', 'Submit templates for review'),
('templates', 'review', 'Review submitted templates'),
('templates', 'approve', 'Approve templates for publication'),
('templates', 'reject', 'Reject template submissions'),

-- Sessions permissions
('sessions', 'create', 'Create new sessions'),
('sessions', 'create_recording', 'Create recording sessions'),
('sessions', 'read', 'Read all session information'),
('sessions', 'read_self', 'Read own sessions'),
('sessions', 'read_assigned', 'Read assigned sessions (agent)'),
('sessions', 'update', 'Update any session'),
('sessions', 'update_self', 'Update own sessions'),
('sessions', 'delete', 'Delete sessions'),
('sessions', 'close_self', 'Close own sessions'),
('sessions', 'close_any', 'Close any session'),
('sessions', 'takeover', 'Takeover any session'),
('sessions', 'takeover_self', 'Takeover own session'),
('sessions', 'execute', 'Execute session automation'),
('sessions', 'report_status', 'Report session status'),
('sessions', 'request_takeover', 'Request human takeover'),

-- Logs permissions
('logs', 'create', 'Create log entries'),
('logs', 'read', 'Read all logs'),
('logs', 'read_self', 'Read own logs'),
('logs', 'read_own', 'Read own logs'),
('logs', 'read_assigned', 'Read logs for assigned sessions'),
('logs', 'export', 'Export logs'),
('logs', 'delete', 'Delete logs'),

-- AI Models permissions
('ai_models', 'create', 'Create AI model configurations'),
('ai_models', 'read', 'Read AI model configurations'),
('ai_models', 'update', 'Update AI model configurations'),
('ai_models', 'delete', 'Delete AI model configurations'),

-- AI Agents permissions
('ai_agents', 'create', 'Create AI agent instances'),
('ai_agents', 'read', 'Read AI agent information'),
('ai_agents', 'update', 'Update AI agent instances'),
('ai_agents', 'delete', 'Delete AI agents'),
('ai_agents', 'execute', 'Execute AI agent operations'),

-- Settings permissions
('settings', 'read', 'Read system settings'),
('settings', 'update', 'Update system settings'),

-- Audit permissions
('audit', 'read', 'Read audit logs'),
('audit', 'export', 'Export audit data');

-- ============================================================================
-- SAMPLE TEMPLATE (Draft)
-- ============================================================================

-- Create a sample template for testing
-- This is a DRAFT template, not for production use
INSERT INTO templates (name, version, status, description, params_schema, steps, guards, config, created_by) VALUES
(
    'sample-login-flow',
    '1.0.0',
    'DRAFT',
    'Sample login automation flow for testing purposes',
    jsonb_build_object(
        'type', 'object',
        'properties', jsonb_build_object(
            'username', jsonb_build_object('type', 'string', 'description', 'Login username'),
            'password', jsonb_build_object('type', 'string', 'description', 'Login password')
        ),
        'required', jsonb_build_array('username', 'password')
    ),
    jsonb_build_array(
        jsonb_build_object(
            'id', 'navigate_to_login',
            'action', 'navigate',
            'target', jsonb_build_object('url', '${login_url}'),
            'post', jsonb_build_object('url_contains', '/login')
        ),
        jsonb_build_object(
            'id', 'fill_username',
            'action', 'fill',
            'target', jsonb_build_object('role', 'textbox', 'label_any', jsonb_build_array('Username', '用户名', 'Email')),
            'value', '${username}',
            'post', jsonb_build_object('value_equals', '${username}')
        ),
        jsonb_build_object(
            'id', 'fill_password',
            'action', 'fill',
            'target', jsonb_build_object('role', 'textbox', 'label_any', jsonb_build_array('Password', '密码')),
            'value', '${password}',
            'post', jsonb_build_object('value_contains', '${password}')
        ),
        jsonb_build_object(
            'id', 'click_login',
            'action', 'click',
            'target', jsonb_build_object('role', 'button', 'name_any', jsonb_build_array('Login', '登录', 'Sign In')),
            'post', jsonb_build_object(
                'any', jsonb_build_array(
                    jsonb_build_object('url_contains', '/dashboard'),
                    jsonb_build_object('visible', jsonb_build_object('text_contains', 'Welcome'))
                )
            )
        )
    ),
    jsonb_build_array(
        jsonb_build_object('ensure', 'network_available'),
        jsonb_build_object('ensure', 'logged_out')
    ),
    jsonb_build_object(
        'retry', jsonb_build_object('max_attempts', 3, 'interval_ms', 1000),
        'timeout_ms', 30000,
        'takeover_on', jsonb_build_array('captcha_detected', 'mfa_required')
    ),
    (SELECT id FROM users WHERE username = 'admin')
);

-- ============================================================================
-- AUDIT LOG TABLE
-- ============================================================================

-- Create audit log table for tracking all significant actions
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,

    -- Action details
    action VARCHAR(255) NOT NULL,
    resource_type VARCHAR(255) NOT NULL,
    resource_id UUID,

    -- Change tracking
    old_values JSONB,
    new_values JSONB,

    -- Context
    ip_address VARCHAR(45),
    user_agent VARCHAR(500),
    details JSONB NOT NULL DEFAULT '{}',

    -- Timestamp
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_time ON audit_logs(created_at DESC);

-- ============================================================================
-- FINAL NOTES
-- ============================================================================

-- Update user timestamps
UPDATE users SET updated_at = NOW();

-- Log seed completion
DO $$
DECLARE
    admin_id UUID;
BEGIN
    SELECT id INTO admin_id FROM users WHERE username = 'admin';

    INSERT INTO audit_logs (user_id, action, resource_type, details) VALUES
    (admin_id, 'seed_complete', 'system', jsonb_build_object('message', 'Database seeded successfully', 'timestamp', NOW()));
END $$;
