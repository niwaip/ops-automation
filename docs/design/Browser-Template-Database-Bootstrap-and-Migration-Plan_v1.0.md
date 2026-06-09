# Browser Template Database Bootstrap and Migration Plan v1.0

## 1. Background

During environment troubleshooting, `browser-template` returned a 500 error on `POST /api/templates` because Prisma queried `public.templates`, but that table did not exist in the target database.

Static code review shows that the current database bootstrap path is split across multiple places:

- `docker/scripts/ops-menu.sh` only runs Prisma migrations for `platform`.
- `apps/backend/domain/browser-template` has a Prisma schema for `templates`, but its migration is still a placeholder.
- `docker/sql/migrations/001_init.sql` also creates `templates`, related enums, triggers, and views.

This creates a mixed ownership model and makes environment bootstrap non-deterministic.

## 2. Current Problems

### 2.1 Ownership is ambiguous

`templates` is currently described by two different schema sources:

- Prisma schema in `apps/backend/domain/browser-template/prisma/schema.prisma`
- Shared SQL in `docker/sql/migrations/001_init.sql`

There is no single source of truth.

### 2.2 Bootstrap is incomplete

`ops-menu.sh` currently defines:

- infrastructure startup
- platform migration execution
- admin password reset

But it does not:

- run `browser-template` migrations
- validate required tables after bootstrap
- provide a repair workflow for partially initialized databases

### 2.3 Shared SQL is not safe for repeated execution

`001_init.sql` is not fully idempotent:

- several tables are created without `IF NOT EXISTS`
- repeated execution produces `relation already exists`
- `session_stats_view` uses `MAX(boolean)`, which fails in PostgreSQL

This means "rerun bootstrap" is not a safe recovery path.

### 2.4 Schema drift risk already exists

The Prisma schema and shared SQL definition of `templates` are not aligned:

- Prisma maps enum to `templates_status_enum`
- shared SQL defines enum `template_status`
- Prisma models `createdBy` and `reviewedBy` as string-backed fields
- shared SQL defines `created_by` and `reviewed_by` as UUID foreign keys to `users(id)`

Even if `templates` is created by SQL, runtime writes may still fail later due to type or enum mismatch.

## 3. Design Goals

The redesign must satisfy the following goals:

1. Make database ownership explicit.
2. Make bootstrap deterministic and repeatable.
3. Separate shared bootstrap from service-owned schema migrations.
4. Make repair operations safe for partially initialized environments.
5. Provide a simple operator workflow through `docker/scripts/ops-menu.sh`.

## 4. Ownership Decision

### 4.1 Recommended owner

`browser-template` should become the sole owner of the `templates` table and all objects required by that service schema.

This includes:

- `templates`
- the enum used by `templates.status`
- indexes required by the service
- any future service-specific constraints

### 4.2 Why this is the recommended model

This is the better choice because:

- application code for template creation and update already depends on Prisma in `browser-template`
- DTOs and Prisma client already reflect the service's expected data model
- Prisma migrations provide better long-term schema evolution than hand-edited shared SQL
- service ownership becomes testable and easier to reason about

### 4.3 What shared SQL should still own

Shared SQL should be reduced to only truly shared and cross-service objects, such as:

- extensions
- common utility functions
- carefully selected shared views
- legacy compatibility objects that do not have a Prisma owner

`templates` should not remain in shared bootstrap SQL after ownership is moved.

## 5. Target Bootstrap Architecture

The target bootstrap process should be split into five layers.

### Layer 1: Infrastructure

Bring up foundational services only:

- `postgres`
- `redis`

### Layer 2: Shared bootstrap

Apply shared, cross-service SQL only.

Rules:

- must be idempotent
- must avoid service-owned business tables
- must support rerun in partially initialized environments

### Layer 3: Service-owned migrations

Run migrations per service, explicitly and independently.

Examples:

- `platform -> prisma migrate deploy`
- `browser-template -> prisma migrate deploy`
- other Prisma-backed services as they are formalized

### Layer 4: Seed and admin bootstrap

Run non-schema initialization:

- default admin bootstrap
- optional seed data
- optional local development fixtures

### Layer 5: Doctor and verification

Run post-bootstrap verification:

- required table existence
- critical enum existence
- column type verification
- service log health

## 6. Required Refactors

### 6.1 Refactor `browser-template` migrations

The placeholder migration in `apps/backend/domain/browser-template/prisma/migrations/0_baseline/migration.sql` must be replaced with real migrations.

The migration should:

- create the service-owned enum and `templates` table
- create indexes required by query patterns
- align exactly with the Prisma schema

If the current Prisma schema is the intended contract, then SQL definitions must be changed to match Prisma, not the other way around.

### 6.2 Refactor shared SQL

`docker/sql/migrations/001_init.sql` should be split.

Recommended split:

- `001_shared_extensions.sql`
- `002_shared_functions.sql`
- `003_shared_views.sql`
- optional legacy compatibility scripts

It should no longer create:

- `templates`
- service-specific enums used only by `browser-template`
- service-specific indexes owned by Prisma services

### 6.3 Fix SQL compatibility issues

The current view definition using `MAX(sl.takeover_triggered)` must be rewritten.

Recommended replacements:

- `BOOL_OR(sl.takeover_triggered)` if the intent is logical aggregation
- `COALESCE(BOOL_OR(sl.takeover_triggered), FALSE)` if a strict boolean result is desired

All shared SQL should be revalidated for rerun safety.

### 6.4 Add explicit service migration entrypoints

Each service that owns schema must provide a stable migration command.

Recommended command form:

```bash
npx prisma migrate deploy --schema ./prisma/schema.prisma
```

This should be wired into compose-safe operator helpers.

## 7. `ops-menu.sh` Redesign

## 7.1 Current gap

`ops-menu.sh` currently exposes:

- initial full bootstrap
- service start and stop
- platform migration execution
- admin password reset

It does not provide a complete database lifecycle workflow.

### 7.2 New commands to add

Add the following operator actions.

#### A. Database status check

Purpose:

- inspect whether critical tables and enums exist
- detect partially initialized databases
- surface schema drift before service startup

Suggested checks:

- `public.users`
- `public.roles`
- `public.templates`
- `public.runtime_sessions`
- `_prisma_migrations`
- template enum existence

#### B. Run shared bootstrap

Purpose:

- apply shared SQL only
- exclude service-owned business tables

Behavior:

- safe to rerun
- stop on first structural error
- print exact file being executed

#### C. Run service migrations

Purpose:

- execute migrations for each schema-owning service in a fixed order

Suggested order:

1. `platform`
2. `browser-template`
3. future Prisma-owned services

#### D. Repair template schema

Purpose:

- diagnose and repair `browser-template` schema specifically

Behavior:

- verify `templates` table exists
- verify enum name matches expected Prisma mapping
- verify `created_by` and `reviewed_by` column types
- if mismatch exists, stop and print guided remediation instead of silently mutating production-like databases

#### E. Full bootstrap with verification

Purpose:

- replace the current "best effort" initialization path

Suggested flow:

1. stop compose and optionally clear volumes
2. start infrastructure
3. run shared bootstrap
4. run service migrations
5. run admin bootstrap
6. start core services
7. start peripheral services
8. run doctor checks

### 7.3 Suggested shell structure

Recommended functions to add in `docker/scripts/ops-menu.sh`:

- `run_shared_bootstrap`
- `run_browser_template_migration`
- `run_service_migrations`
- `db_status_check`
- `db_doctor`
- `repair_template_schema`
- `full_bootstrap_with_verification`

Recommended menu entries:

- `Database status check`
- `Run shared bootstrap`
- `Run service migrations`
- `Repair template schema`
- `Full bootstrap with verification`

## 8. Implementation Sequence

### Phase 1: Freeze ownership

Tasks:

- declare `browser-template` as the owner of `templates`
- document that `001_init.sql` no longer owns this table
- prevent new schema changes from landing in two places

Deliverable:

- ownership agreement documented in repo

### Phase 2: Align schema contract

Tasks:

- decide final type contract for `created_by` and `reviewed_by`
- decide final enum name
- align Prisma schema with actual intended runtime behavior

Important note:

This decision must be made before generating the first real migration for `browser-template`.

### Phase 3: Replace placeholder migration

Tasks:

- create real Prisma migrations for `browser-template`
- validate on a fresh empty database
- validate on a partially initialized database

Deliverable:

- deterministic schema creation for `templates`

### Phase 4: Split and harden shared SQL

Tasks:

- remove service-owned objects from shared SQL
- make shared SQL idempotent
- fix incompatible view logic such as `MAX(boolean)`

Deliverable:

- rerunnable shared bootstrap scripts

### Phase 5: Upgrade `ops-menu.sh`

Tasks:

- add database operator actions
- add doctor output
- add failure guidance

Deliverable:

- one operator-facing menu for bootstrap, migration, repair, and verification

### Phase 6: Acceptance validation

Required scenarios:

1. Fresh database bootstrap succeeds end to end.
2. Re-running bootstrap does not fail on existing objects.
3. `browser-template` can create a template successfully.
4. Partially initialized database is detected and reported clearly.
5. Drift between Prisma schema and database schema is surfaced by doctor checks.

## 9. Recovery Strategy for Existing Environments

For environments already in a mixed state, use the following recovery policy.

### Case A: Empty or disposable environment

Recommended action:

- rebuild database volume
- run the new full bootstrap path

This is the simplest and safest path for local development.

### Case B: Partially initialized shared environment

Recommended action:

- do not blindly rerun the full legacy SQL
- run doctor checks first
- compare actual `templates` definition with Prisma expectation
- decide whether to migrate data, alter columns, or rebuild only service-owned objects

### Case C: Production-like environment

Recommended action:

- do not auto-repair schema from menu actions
- produce a diff report and a reviewed migration script
- require human approval before mutation

## 10. Acceptance Criteria

The redesign is complete only when all of the following are true:

- `browser-template` schema is owned by Prisma migrations, not shared SQL.
- `ops-menu.sh` can bootstrap a fresh environment without manual database commands.
- rerunning bootstrap is safe for local development.
- `Database status check` can identify missing `templates` and enum drift.
- `Repair template schema` does not perform unsafe blind mutations.
- no environment requires manual execution of `psql -f docker/sql/migrations/001_init.sql` just to make `browser-template` work.

## 11. Short-Term Action List

Recommended immediate next actions:

1. Freeze ownership and confirm `browser-template` as the sole owner of `templates`.
2. Decide whether `created_by` remains a string field or becomes a UUID foreign key.
3. Align Prisma schema and SQL expectations for `templates`.
4. Replace the placeholder migration with a real Prisma migration.
5. Remove `templates` creation from shared SQL.
6. Add `db_status_check` and `run_service_migrations` to `ops-menu.sh`.
7. Add a verified bootstrap path that includes doctor checks.

## 12. Recommendation Summary

The core fix is not "rerun one SQL file." The real fix is to make schema ownership explicit and make bootstrap layered.

Recommended final direction:

- `browser-template` owns `templates`
- shared SQL owns only truly shared objects
- `ops-menu.sh` becomes the standard operator entrypoint for database bootstrap, migration, repair, and verification

Without this redesign, the repository will continue to produce:

- partial database initialization
- conflicting schema definitions
- environment-specific failures that are hard to reproduce
