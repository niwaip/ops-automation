// CI-only fixture. It creates the three application login roles required to
// verify database/security/roles.sql against a real migrated PostgreSQL.

import { readFileSync } from 'node:fs';
import process from 'node:process';
import { Client } from 'pg';

const required = ['DATABASE_ADMIN_URL', 'ROLE_POLICY_FIXTURE_CONFIRM'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`Missing required environment variable(s): ${missing.join(', ')}`);
  process.exit(1);
}
if (process.env.ROLE_POLICY_FIXTURE_CONFIRM !== 'ci-only') {
  console.error(
    'Refusing to provision role-policy fixture outside an explicit ci-only invocation.'
  );
  process.exit(1);
}

const client = new Client({ connectionString: process.env.DATABASE_ADMIN_URL });
const applicationRoles = [
  'control_plane_access_policy_fixture',
  'ai_orchestrator_access_policy_fixture',
  'runtime_worker_access_policy_fixture',
];

try {
  await client.connect();

  for (const role of applicationRoles) {
    await client.query(`CREATE ROLE ${role} LOGIN INHERIT PASSWORD 'ci-fixture-not-a-secret'`);
  }

  await client.query(readFileSync(new URL('../security/roles.sql', import.meta.url), 'utf8'));
  await client.query(`
    GRANT ops_application_reader, ops_execution_writer, ops_experience_writer
      TO control_plane_access_policy_fixture;
    GRANT ops_application_reader, ops_intelligence_writer
      TO ai_orchestrator_access_policy_fixture;
    GRANT ops_application_reader, ops_runtime_writer
      TO runtime_worker_access_policy_fixture;
  `);
} finally {
  await client.end();
}

console.log('Database access-policy fixture is provisioned.');
