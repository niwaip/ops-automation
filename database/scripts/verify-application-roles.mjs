import process from 'node:process';
import { Client } from 'pg';

const required = [
  'DATABASE_ADMIN_URL',
  'CONTROL_PLANE_DB_LOGIN',
  'AI_ORCHESTRATOR_DB_LOGIN',
  'RUNTIME_WORKER_DB_LOGIN',
];

const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`Missing required environment variable(s): ${missing.join(', ')}`);
  process.exit(1);
}

const client = new Client({ connectionString: process.env.DATABASE_ADMIN_URL });

const expectedRoles = [
  'ops_application_reader',
  'ops_execution_writer',
  'ops_experience_writer',
  'ops_intelligence_writer',
  'ops_registry_writer',
  'ops_runtime_writer',
];

const memberships = [
  ['CONTROL_PLANE_DB_LOGIN', 'ops_application_reader', true],
  ['CONTROL_PLANE_DB_LOGIN', 'ops_execution_writer', true],
  ['CONTROL_PLANE_DB_LOGIN', 'ops_experience_writer', true],
  ['CONTROL_PLANE_DB_LOGIN', 'ops_registry_writer', false],
  ['AI_ORCHESTRATOR_DB_LOGIN', 'ops_application_reader', true],
  ['AI_ORCHESTRATOR_DB_LOGIN', 'ops_intelligence_writer', true],
  ['AI_ORCHESTRATOR_DB_LOGIN', 'ops_execution_writer', false],
  ['AI_ORCHESTRATOR_DB_LOGIN', 'ops_registry_writer', false],
  ['RUNTIME_WORKER_DB_LOGIN', 'ops_application_reader', true],
  ['RUNTIME_WORKER_DB_LOGIN', 'ops_runtime_writer', true],
];

async function roleExists(name) {
  const result = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [name]);
  return result.rowCount === 1;
}

async function hasMembership(login, role) {
  const result = await client.query(
    `SELECT 1
       FROM pg_auth_members membership
       JOIN pg_roles parent ON parent.oid = membership.roleid
       JOIN pg_roles member ON member.oid = membership.member
      WHERE parent.rolname = $1 AND member.rolname = $2`,
    [role, login],
  );
  return result.rowCount === 1;
}

async function hasPublicCreate() {
  const result = await client.query(
    `SELECT EXISTS (
       SELECT 1
         FROM pg_namespace namespace
         CROSS JOIN LATERAL aclexplode(
           COALESCE(namespace.nspacl, acldefault('n', namespace.nspowner))
         ) AS permission
        WHERE namespace.nspname = 'public'
          AND permission.grantee = 0
          AND permission.privilege_type = 'CREATE'
     ) AS granted`,
  );
  return result.rows[0].granted;
}

async function hasTableWrite(login, table) {
  const result = await client.query(
    "SELECT has_table_privilege($1, $2, 'INSERT, UPDATE, DELETE') AS granted",
    [login, table],
  );
  return result.rows[0].granted;
}

const failures = [];

try {
  await client.connect();

  for (const role of expectedRoles) {
    if (!(await roleExists(role))) failures.push(`Required group role is missing: ${role}`);
  }

  for (const [loginEnv, role, shouldExist] of memberships) {
    const login = process.env[loginEnv];
    if (!(await roleExists(login))) {
      failures.push(`Application login is missing: ${login}`);
      continue;
    }
    const actual = await hasMembership(login, role);
    if (actual !== shouldExist) {
      failures.push(
        shouldExist
          ? `${login} must inherit ${role}`
          : `${login} must not inherit ${role}`,
      );
    }
  }

  if (await hasPublicCreate()) {
    failures.push('PUBLIC still has CREATE on schema public');
  }

  const aiLogin = process.env.AI_ORCHESTRATOR_DB_LOGIN;
  const controlLogin = process.env.CONTROL_PLANE_DB_LOGIN;
  if ((await roleExists(aiLogin)) && (await hasTableWrite(aiLogin, 'public.executions'))) {
    failures.push(`${aiLogin} must not write public.executions`);
  }
  if (
    (await roleExists(controlLogin)) &&
    (await hasTableWrite(controlLogin, 'public.builtin_skills'))
  ) {
    failures.push(`${controlLogin} must not write public.builtin_skills`);
  }
} finally {
  await client.end();
}

if (failures.length > 0) {
  console.error('Database role verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Database application roles and negative write permissions are valid.');
