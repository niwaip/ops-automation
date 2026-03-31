# Redis Schema Documentation

**Browser Control Plane - Redis Key Structure Reference**
Version: 1.0.0
Date: 2026-03-31

---

## Overview

Redis is used in the Browser Control Plane for:
- **Profile Write Locks**: Ensuring exclusive access to user browser profiles
- **Session State Management**: Tracking active session states and worker endpoints
- **Template Cache**: Caching frequently accessed templates to reduce database load
- **Rate Limiting**: Preventing abuse of session creation and API endpoints
- **Session Token Tracking**: Validating active session tokens

---

## Key Structure Patterns

All keys follow a hierarchical naming convention:
```
{namespace}:{category}:{identifier}
```

### Namespaces
- `lock` - Lock-related keys
- `session` - Session state keys
- `template` - Template cache keys
- `rate` - Rate limiting counters
- `token` - JWT/session token tracking

---

## 1. Profile Write Lock

### Key Pattern
```
lock:profile:{user_id}
```

### Purpose
Ensure only one session can have write access to a user's browser profile at any time. This prevents data corruption when multiple sessions attempt to modify the same profile simultaneously.

### Value
```
{session_id}  // UUID of the session holding the lock
```

### TTL
```
7200 seconds (2 hours)  // Session TTL + buffer
```

### Operations

#### Acquire Lock (Atomic)
```redis
SET lock:profile:{user_id} {session_id} NX EX 7200
```
- Returns `OK` if lock acquired successfully
- Returns `nil` if lock already held by another session

#### Release Lock (Safe)
```redis
# Lua script for safe lock release (only release if owned)
EVAL "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end" 1 lock:profile:{user_id} {session_id}
```
- Returns `1` if lock released
- Returns `0` if lock not owned by this session

#### Check Lock Status
```redis
GET lock:profile:{user_id}
```
- Returns session_id of lock holder, or `nil` if unlocked

#### Extend Lock
```redis
# Lua script for safe lock extension
EVAL "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('EXPIRE', KEYS[1], ARGV[2]) else return 0 end" 1 lock:profile:{user_id} {session_id} 7200
```

### Behavior on Conflict
- **Direct Reject**: When a new session requests a profile lock that is already held, the request is immediately rejected with a clear error message.
- No waiting/queueing - user must wait for existing session to close.

---

## 2. Session State

### Key Pattern
```
session:{session_id}
```

### Purpose
Track the current state of an active browser automation session, including control mode (agent vs human), worker reference, and connection endpoints.

### Structure (Hash)
```redis
HSET session:{session_id}
  state              "RUNNING"           // IDLE | RUNNING | HUMAN_CONTROL | CLOSED | ERROR
  worker_ref         "worker-pod-123"    // Kubernetes pod/container reference
  novnc_url          "http://10.0.0.5:8080/vnc.html"
  cdp_url            "ws://10.0.0.5:9222"
  vnc_url            "vnc://10.0.0.5:5900"
  frozen             "0"                 // 0 = agent active, 1 = agent frozen
  control_mode       "AGENT_RUNNING"     // AGENT_RUNNING | HUMAN_CONTROL
  template_id        "{template_uuid}"
  user_id            "{user_uuid}"
  current_step       "fill_username"     // Current step ID being executed
  step_index         "2"                 // Current step index
  params             "{\"username\":\"...\"}"  // JSON-encoded parameters
  created_at         "1712345678"        // Unix timestamp
  last_activity      "1712345999"        // Unix timestamp
```

### TTL
```
86400 seconds (24 hours)  // Maximum session lifetime
```

### Operations

#### Create Session State
```redis
HSET session:{session_id} state "IDLE" user_id "{user_id}" created_at "{timestamp}" frozen "0" control_mode "AGENT_RUNNING"
EXPIRE session:{session_id} 86400
```

#### Update Session State
```redis
HSET session:{session_id} state "RUNNING" worker_ref "{worker_ref}" novnc_url "{url}" cdp_url "{url}"
```

#### Enter Human Control (Takeover)
```redis
HSET session:{session_id} state "HUMAN_CONTROL" frozen "1" control_mode "HUMAN_CONTROL"
```

#### Exit Human Control (Continue)
```redis
HSET session:{session_id} state "RUNNING" frozen "0" control_mode "AGENT_RUNNING"
```

#### Close Session
```redis
HSET session:{session_id} state "CLOSED"
# Lock release is handled separately
```

#### Get Full Session State
```redis
HGETALL session:{session_id}
```

#### Check Frozen Status
```redis
HGET session:{session_id} frozen
```

---

## 3. Template Cache

### Key Pattern
```
template:cache:{template_id}:{version}
```

### Purpose
Cache published template content to reduce database queries and improve performance.

### Value
```json
{
  "id": "{template_uuid}",
  "name": "login-flow",
  "version": "1.0.0",
  "steps": [...],
  "guards": [...],
  "params_schema": {...},
  "config": {...}
}
```

### TTL
```
300 seconds (5 minutes)
```

### Operations

#### Cache Template
```redis
SET template:cache:{template_id}:{version} '{json_content}' EX 300
```

#### Get Cached Template
```redis
GET template:cache:{template_id}:{version}
```

#### Invalidate Cache
```redis
DEL template:cache:{template_id}:{version}
# Or invalidate all versions with pattern matching
SCAN 0 MATCH template:cache:{template_id}:* COUNT 100
# Then DELETE each matching key
```

---

## 4. Rate Limiting

### Key Pattern
```
rate:{action}:{identifier}
```

### Purpose
Prevent abuse of session creation, template execution, and API endpoints.

### Types

#### Session Creation Rate Limit
```
rate:session:create:{user_id}
```
- Count sessions created per user
- Limit: 10 per hour
- TTL: 3600

#### API Rate Limit
```
rate:api:{endpoint}:{user_id}
```
- Count API calls per endpoint per user
- Limit: varies by endpoint
- TTL: 60 (1 minute sliding window)

### Operations

#### Increment Counter
```redis
INCR rate:session:create:{user_id}
EXPIRE rate:session:create:{user_id} 3600
```

#### Check Counter
```redis
GET rate:session:create:{user_id}
```

---

## 5. Session Token Tracking

### Key Pattern
```
token:session:{session_id}
```

### Purpose
Validate that a session is still active when API requests arrive with session tokens.

### Value
```
{user_id}  // UUID of the session owner
```

### TTL
```
7200 seconds (2 hours)  // Synced with profile lock TTL
```

### Operations

#### Create Token Record
```redis
SET token:session:{session_id} {user_id} EX 7200
```

#### Validate Token
```redis
GET token:session:{session_id}
```

#### Invalidate Token
```redis
DEL token:session:{session_id}
```

---

## 6. Worker Pool Registry

### Key Pattern
```
worker:pool:available
worker:pool:busy:{worker_ref}
worker:heartbeat:{worker_ref}
```

### Purpose
Track available and busy browser workers for session assignment.

### Worker Pool (Set)
```redis
SADD worker:pool:available "worker-1" "worker-2" "worker-3"
```

### Busy Worker
```redis
SET worker:pool:busy:{worker_ref} {session_id} EX 86400
```

### Heartbeat
```redis
SET worker:heartbeat:{worker_ref} "{timestamp}" EX 30
```

### Operations

#### Get Available Worker
```redis
SPOP worker:pool:available
```

#### Mark Worker Busy
```redis
SET worker:pool:busy:{worker_ref} {session_id} EX 86400
```

#### Return Worker to Pool
```redis
DEL worker:pool:busy:{worker_ref}
SADD worker:pool:available {worker_ref}
```

#### Check Worker Health
```redis
GET worker:heartbeat:{worker_ref}
```

---

## 7. Temporary Session Data

### Key Pattern
```
session:data:{session_id}:{key}
```

### Purpose
Store temporary session-specific data (screenshots, intermediate state, etc.).

### Examples
```
session:data:{session_id}:last_screenshot  -> "s3://screenshots/xxx.png"
session:data:{session_id}:last_error       -> "{\"class\":\"TimeoutError\",...}"
session:data:{session_id}:page_state       -> "{\"url\":\"...\",\"title\":\"...\"}"
```

### TTL
```
3600 seconds (1 hour)  // Auto-cleanup
```

---

## Lua Scripts Reference

### Safe Lock Release
```lua
-- KEYS[1]: lock key
-- ARGV[1]: expected session_id
-- Returns: 1 if released, 0 if not owned
if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
else
    return 0
end
```

### Safe Lock Extension
```lua
-- KEYS[1]: lock key
-- ARGV[1]: expected session_id
-- ARGV[2]: new TTL
-- Returns: 1 if extended, 0 if not owned
if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('EXPIRE', KEYS[1], ARGV[2])
else
    return 0
end
```

### Freeze Check and Set
```lua
-- KEYS[1]: session key
-- Returns: 1 if frozen was set, 0 if already frozen or not exists
local frozen = redis.call('HGET', KEYS[1], 'frozen')
if frozen == '0' then
    redis.call('HSET', KEYS[1], 'frozen', '1')
    redis.call('HSET', KEYS[1], 'control_mode', 'HUMAN_CONTROL')
    redis.call('HSET', KEYS[1], 'state', 'HUMAN_CONTROL')
    return 1
else
    return 0
end
```

---

## Key Cleanup Strategy

### Automatic Expiration
All keys have TTL set at creation to prevent stale data accumulation.

### Manual Cleanup (for terminated sessions)
```redis
# Release profile lock
DEL lock:profile:{user_id}

# Remove session state
DEL session:{session_id}

# Remove session token
DEL token:session:{session_id}

# Remove worker busy state
DEL worker:pool:busy:{worker_ref}

# Remove session data keys (use SCAN)
SCAN 0 MATCH session:data:{session_id}:* COUNT 100
# DELETE each matching key
```

---

## Configuration Requirements

### Redis Server Settings
```
# Enable append-only file for persistence
appendonly yes
appendfsync everysec

# Memory limits (adjust based on expected session count)
maxmemory 256mb
maxmemory-policy volatile-ttl  # Preferentially evict keys with TTL
```

### Connection Pool Settings (Application)
```
# Recommended connection pool size: 10-20 connections
# Enable retry on connection failure
# Use pipeline for batch operations
```

---

## Test Cases

| ID | Command | Expected Result |
|----|---------|-----------------|
| TC01 | `SET lock:profile:123 session-uuid NX EX 7200` | Returns `OK` on first call |
| TC02 | `SET lock:profile:123 session-uuid-2 NX EX 7200` (after TC01) | Returns `nil` (conflict) |
| TC03 | `EVAL safe-release 1 lock:profile:123 session-uuid` | Returns `1` (released) |
| TC04 | `EVAL safe-release 1 lock:profile:123 wrong-uuid` | Returns `0` (not owned) |
| TC05 | `HSET session:abc state RUNNING` | Returns count of fields set |
| TC06 | `HGET session:abc frozen` | Returns `0` or `1` |
| TC07 | `SET template:cache:xyz:1.0 '{...}' EX 300` | Returns `OK` |
| TC08 | `GET template:cache:xyz:1.0` (after TC07) | Returns cached JSON |
| TC09 | `INCR rate:session:create:user1` | Returns incremented count |
| TC10 | `SPOP worker:pool:available` | Returns a worker ID |

---

## Implementation Notes

### Security Considerations
- Redis password authentication required (`requirepass` in redis.conf)
- TLS encryption recommended for production
- No sensitive data (passwords, API keys) should be stored in Redis

### Performance Tips
- Use connection pooling in application code
- Use pipelining for batch operations
- Consider Redis Cluster for horizontal scaling (high session count scenarios)
- Monitor memory usage with `INFO memory`

### Error Handling
- Lock conflicts should return clear error messages to users
- Session state inconsistencies should trigger automatic cleanup
- Worker health checks should have fallback assignment logic