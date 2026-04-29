---
name: "template-workflow-bootstrap"
description: "Creates Activity and Temporal Workflow from a Carbone template ID. Invoke when initializing or repairing template-based document workflows."
---

# Template Workflow Bootstrap

Use this skill to create or reconcile `Activity` + `Temporal Workflow` records from a Carbone template.

## When To Invoke

- User asks to "create activity/workflow from template".
- Admin page is empty and needs bootstrapping.
- Existing environment needs data re-initialization after reset.

## Prerequisites

- Services are running and reachable:
  - Auth: `http://localhost:3001`
  - Carbone Studio: `http://localhost:3009`
- Seed admin account available (default):
  - username: `admin`
  - password: `admin123`

## Command

```bash
TEMPLATE_ID=<template-id> node scripts/create-template-activity-workflow.js
```

Optional environment variables:

```bash
AUTH_BASE=http://localhost:3001 \
CARBONE_BASE=http://localhost:3009 \
AUTH_USER=admin \
AUTH_PASS=admin123 \
TEMPLATE_ID=<template-id> \
node scripts/create-template-activity-workflow.js
```

## Expected Output

Script prints JSON containing:

- `templateId`
- `activity.id` and `activity.name`
- `workflow.id` and `workflow.name`
- `variableCount`

If entities already exist (same names), script is idempotent and returns existing records.
