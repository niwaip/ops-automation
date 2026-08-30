// CI-only isolated database setup for migration and access-policy verification.

import process from 'node:process';
import { Client } from 'pg';

const targetDatabase = 'task_orchestration_access_policy';
const required = ['DATABASE_ADMIN_URL', 'ROLE_POLICY_FIXTURE_CONFIRM'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`Missing required environment variable(s): ${missing.join(', ')}`);
  process.exit(1);
}
if (process.env.ROLE_POLICY_FIXTURE_CONFIRM !== 'ci-only') {
  console.error(
    'Refusing to create an access-policy database outside an explicit ci-only invocation.'
  );
  process.exit(1);
}

const client = new Client({ connectionString: process.env.DATABASE_ADMIN_URL });

try {
  await client.connect();
  const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
    targetDatabase,
  ]);
  if (existing.rowCount > 0) {
    throw new Error(`Expected fresh CI database is already present: ${targetDatabase}`);
  }
  await client.query(`CREATE DATABASE ${targetDatabase}`);
} finally {
  await client.end();
}

console.log(`Created isolated CI database: ${targetDatabase}`);
