# Database Bootstrap Notes

The legacy SQL files in this directory are deprecated and are no longer valid
schema entrypoints for this repository.

## Supported entrypoints

### Initialization menu

```bash
bash ./docker/scripts/ops-menu.sh
```

Use this for:

- initial deployment
- local rebuilds
- dropping and recreating all tables
- importing current seed data
- exporting the current initial-data snapshot

### Apply the latest schema

```bash
bash ./docker/scripts/apply-latest-db-schema.sh
```

This script:

- ensures `pgcrypto` and `uuid-ossp` extensions exist
- applies the platform baseline migration
- applies the shared incremental SQL files

### Import current seed data

```bash
cd apps/backend/core/platform
npm run seed
```

Supported seed environment variables:

- `ADMIN_USERNAME`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `TEST_USERNAME`
- `TEST_EMAIL`
- `TEST_PASSWORD`
- `SKIP_TEST_USER`

### Export current initial data

```bash
bash ./docker/scripts/export-initial-data.sh
```

Default output:

```text
docker/sql/exports/platform-initial-data-<timestamp>.sql
```

## Current migration sources

### Platform baseline

- `apps/backend/core/platform/prisma/migrations/20260608_init_platform_baseline/migration.sql`

### Shared incremental SQL

- `apps/backend/execution-control/control-plane/prisma/migrations/20260515143000_add_execution_phases/migration.sql`
- `apps/backend/execution-control/control-plane/prisma/migrations/20260516140000_add_execution_phase_steps/migration.sql`

### Placeholder migrations

These files are placeholders only and are not part of automatic bootstrap:

- `apps/backend/domain/browser-template/prisma/migrations/0_baseline/migration.sql`
- `apps/backend/domain/report/prisma/migrations/0_baseline/migration.sql`
- `apps/backend/runtimes/replay-worker/prisma/migrations/0_baseline/migration.sql`

## Deprecated files

These files are kept only as guarded stubs and must not be executed:

- `docker/sql/migrations/001_init.sql`
- `docker/sql/seed.sql`

They now fail fast and point users to the supported initialization flow.

## Why the old SQL was retired

The old SQL no longer matches the current shared schema. In particular it still
references legacy objects such as:

- `templates`
- `sessions`
- `step_logs`
- `ai_models`
- `ai_agents`

It also does not represent current objects such as:

- `organizations`
- `execution_phases`
- `execution_takeovers`

## Development flow

`docker/scripts/start-dev.sh` now calls the latest schema script and no longer
auto-applies `docker/sql/migrations/*.sql`.
