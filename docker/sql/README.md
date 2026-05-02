# Database Infrastructure

**Browser Control Plane - Database Schema & Configuration Guide**
Version: 1.0.0
Date: 2026-03-31

---

## Overview

This directory contains the database infrastructure for the Browser Control Plane project:

- **PostgreSQL**: Primary relational database for user management, templates, sessions, and logs
- **Redis**: In-memory store for locks, session state, caching, and rate limiting

---

## Directory Structure

```
docker/sql/
├── README.md              # This file
├── redis-schema.md        # Redis key structure documentation
├── migrations/
│   └── 001_init.sql       # Initial PostgreSQL schema
├── seed.sql               # Initial data (roles, permissions, default users)
└── scripts/               # (future) Utility scripts
```

---

## PostgreSQL Schema

### Tables

| Table | Purpose |
|-------|---------|
| `users` | User accounts (employees, admins, agents) |
| `roles` | Role definitions with permissions |
| `user_roles` | User-role assignments |
| `templates` | Automation templates (JSON DSL) |
| `sessions` | Browser automation session tracking |
| `step_logs` | Step-level execution logs |
| `ai_models` | AI model configurations |
| `ai_agents` | AI agent runtime instances |
| `audit_logs` | System-wide audit trail |

### Entity Relationships

```
users ─┬──< user_roles >─── roles
       │
       ├──< sessions >──── templates
       │         │
       │         ├──< step_logs
       │         └──< ai_agents >── ai_models
       │
       └──< templates (as creator)
       └──< audit_logs

sessions ────< step_logs
       └───< ai_agents

ai_models ────< ai_agents
```

### Key Fields

#### Users Table
- `id`: UUID primary key
- `username`: Unique identifier (3-50 chars)
- `password_hash`: bcrypt/argon2 hashed password
- `role`: Enum ('employee', 'admin', 'agent')
- `ldap_dn`, `ad_sid`, `external_id`: Reserved for LDAP/AD integration

#### Templates Table
- `params_schema`: JSON Schema for parameter validation
- `steps`: Template DSL (Playwright-like format)
- `status`: DRAFT → REVIEW → PUBLISHED → DEPRECATED

#### Sessions Table
- `state`: IDLE | RUNNING | HUMAN_CONTROL | CLOSED | ERROR
- `worker_ref`: Kubernetes pod/container reference
- `endpoints`: JSONB with noVNC, CDP, VNC URLs

#### Step Logs Table
- `result`: success | failed | retry | takeover
- `screenshot_ref`: Path to screenshot evidence
- `takeover_triggered`: Boolean flag for human takeover events

---

## Redis Data Structures

See `redis-schema.md` for detailed documentation.

### Key Categories

| Category | Pattern | Purpose |
|----------|---------|---------|
| Profile Lock | `lock:profile:{user_id}` | Exclusive profile access |
| Session State | `session:{session_id}` | Active session tracking |
| Template Cache | `template:cache:{id}:{ver}` | Cached templates |
| Rate Limit | `rate:{action}:{id}` | API throttling |
| Worker Pool | `worker:pool:*` | Worker availability |

---

## Running Migrations

### Prerequisites
- PostgreSQL 15+ with UUID extension
- Redis 7+

### Manual Execution

```bash
# Connect to PostgreSQL (using docker-compose environment)
docker exec -i ops-postgres psql -U ops -d ops < docker/sql/migrations/001_init.sql

# Run seed data
docker exec -i ops-postgres psql -U ops -d ops < docker/sql/seed.sql
```

### Using init-db.sh (Docker)

The `docker/init-db.sh` script automatically runs migrations on first container startup.

```bash
# Start services
./docker/start-smart.sh docker-compose.yml up -d

# Verify tables
docker exec ops-postgres psql -U ops -d ops -c "\dt"
```

### Verification Queries

```sql
-- Check all tables exist
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';

-- Check enum types
SELECT typname FROM pg_type WHERE typcategory = 'E';

-- Verify seed data
SELECT name FROM roles;
SELECT username FROM users;

-- Check views
SELECT * FROM active_sessions_view LIMIT 1;
```

---

## Environment Configuration

### PostgreSQL
```env
POSTGRES_USER=ops
POSTGRES_PASSWORD=ops_secret
POSTGRES_DB=ops
POSTGRES_PORT=5432
```

### Redis
```env
REDIS_PASSWORD=redis_secret
REDIS_PORT=6379
```

### Connection Strings

```typescript
// PostgreSQL connection string
const pgConnectionString = `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:${POSTGRES_PORT}/${POSTGRES_DB}`;

// Redis connection
const redisClient = createClient({
  url: `redis://:${REDIS_PASSWORD}@localhost:${REDIS_PORT}`
});
```

---

## Security Considerations

### Password Storage
- Use bcrypt (cost factor 10+) or argon2id for password hashing
- Never store plaintext passwords
- Seed script includes placeholder passwords - change immediately!

### API Key References
- `ai_models.api_key_ref` should reference Kubernetes secrets or external vault
- Never store actual API keys in PostgreSQL

### Redis Authentication
- Redis password required (`requirepass` in redis.conf)
- TLS encryption recommended for production

### Permission Model
- Role-based access control (RBAC)
- System roles (admin, employee, agent) cannot be deleted
- Fine-grained permissions stored as JSONB

---

## Backup & Recovery

### PostgreSQL Backup
```bash
# Full backup
docker exec ops-postgres pg_dump -U ops ops > backup_$(date +%Y%m%d).sql

# Restore
docker exec -i ops-postgres psql -U ops ops < backup_20260331.sql
```

### Redis Backup
```bash
# Redis AOF is enabled by default
# Manual RDB backup
docker exec ops-redis redis-cli BGSAVE

# Copy RDB file
docker cp ops-redis:/data/dump.rdb ./redis_backup/
```

---

## Monitoring

### PostgreSQL Metrics
```sql
-- Active connections
SELECT count(*) FROM pg_stat_activity;

-- Table sizes
SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
FROM pg_catalog.pg_statio_user_tables;

-- Session statistics
SELECT * FROM session_stats_view;
```

### Redis Metrics
```bash
# Memory usage
redis-cli INFO memory

# Key count
redis-cli DBSIZE

# Connection info
redis-cli INFO clients
```

---

## Schema Evolution

### Adding New Migrations
1. Create new file: `migrations/002_xxx.sql`
2. Include both upgrade and rollback sections
3. Test on development environment first
4. Document changes in this README

### Migration Naming Convention
```
{sequence_number}_{description}.sql
```

Examples:
- `001_init.sql` - Initial schema
- `002_add_template_tags.sql` - Add tagging feature
- `003_session_permissions.sql` - Permission model updates

---

## Troubleshooting

### Common Issues

**1. UUID extension missing**
```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

**2. Lock conflict**
```
Error: Profile lock already held by session {session_id}
Solution: Close existing session or wait for lock expiration
```

**3. Redis connection refused**
```
Check: Redis container status, password configuration
Verify: REDIS_PASSWORD matches docker-compose settings
```

**4. Permission denied**
```
Check: user_roles assignments
Query: SELECT r.permissions FROM user_roles ur JOIN roles r ON ur.role_id = r.id JOIN users u ON ur.user_id = u.id WHERE u.username = 'target_user';
```

---

## Test Cases

| ID | Test | Command | Expected |
|----|------|---------|----------|
| TC01 | Tables created | `\dt` | All 9+ tables listed |
| TC02 | Enum types | `SELECT typname FROM pg_type WHERE typcategory = 'E'` | 5 enum types |
| TC03 | Seed roles | `SELECT name FROM roles` | admin, employee, agent, recorder, reviewer |
| TC04 | Default admin | `SELECT username FROM users WHERE role = 'admin'` | admin |
| TC05 | Redis lock | `SET lock:profile:test NX EX 7200` | OK |
| TC06 | Lock conflict | `SET lock:profile:test NX EX 7200` (second time) | nil |
| TC07 | Session state | `HSET session:test state RUNNING` | 1 |
| TC08 | Template cache | `SET template:cache:x:1 '{}' EX 300` | OK |

---

## References

- [PostgreSQL Documentation](https://www.postgresql.org/docs/15/index.html)
- [Redis Documentation](https://redis.io/docs/)
- [bcrypt Password Hashing](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [JSON Schema Specification](https://json-schema.org/)

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-03-31 | Initial schema with all core tables |
