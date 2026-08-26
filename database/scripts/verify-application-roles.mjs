import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '../..');
const ownership = JSON.parse(
  readFileSync(path.join(repositoryRoot, 'database/schema-ownership.json'), 'utf8')
);
const accessPolicy = JSON.parse(
  readFileSync(path.join(repositoryRoot, 'database/security/access-policy.json'), 'utf8')
);

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

const writerGroupByOwner = accessPolicy.writerGroupByOwner;
const applicationLogins = accessPolicy.applicationLogins;
const expectedRoles = ['ops_application_reader', ...Object.values(writerGroupByOwner)];
const ownershipByTable = new Map(
  Object.entries(ownership.owners).flatMap(([owner, tables]) =>
    tables.map((table) => [table, owner])
  )
);
const knownRoles = new Set();

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
    [role, login]
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
     ) AS granted`
  );
  return result.rows[0].granted;
}

async function hasTableWrite(login, table) {
  const result = await client.query(
    `SELECT has_table_privilege($1, $2, 'INSERT')
        AND has_table_privilege($1, $2, 'UPDATE')
        AND has_table_privilege($1, $2, 'DELETE') AS granted`,
    [login, table]
  );
  return result.rows[0].granted;
}

async function verifyWriterGroups() {
  for (const [table, owner] of ownershipByTable) {
    for (const [candidateOwner, groupRole] of Object.entries(writerGroupByOwner)) {
      if (!knownRoles.has(groupRole)) continue;
      const shouldWrite = owner === candidateOwner;
      const canWrite = await hasTableWrite(groupRole, `public.${table}`);
      if (canWrite !== shouldWrite) {
        failures.push(
          shouldWrite
            ? `${groupRole} must write public.${table} (owner: ${owner})`
            : `${groupRole} must not write public.${table} (owner: ${owner})`
        );
      }
    }
  }
}

async function verifyApplicationLogins() {
  for (const [loginEnv, allowedOwners] of Object.entries(applicationLogins)) {
    const login = process.env[loginEnv];
    if (!knownRoles.has(login)) continue;

    const allowedGroups = new Set(allowedOwners.map((owner) => writerGroupByOwner[owner]));
    for (const groupRole of Object.values(writerGroupByOwner)) {
      if (!knownRoles.has(groupRole)) continue;
      const shouldInherit = allowedGroups.has(groupRole);
      const inherits = await hasMembership(login, groupRole);
      if (inherits !== shouldInherit) {
        failures.push(
          shouldInherit
            ? `${login} must inherit ${groupRole}`
            : `${login} must not inherit ${groupRole}`
        );
      }
    }

    if (!(await hasMembership(login, 'ops_application_reader'))) {
      failures.push(`${login} must inherit ops_application_reader`);
    }

    const allowedOwnerSet = new Set(allowedOwners);
    for (const [table, owner] of ownershipByTable) {
      const shouldWrite = allowedOwnerSet.has(owner);
      const canWrite = await hasTableWrite(login, `public.${table}`);
      if (canWrite !== shouldWrite) {
        failures.push(
          shouldWrite
            ? `${login} must write public.${table} (allowed owner: ${owner})`
            : `${login} must not write public.${table} (owner: ${owner})`
        );
      }
    }
  }
}

const failures = [];

try {
  await client.connect();

  for (const role of [...new Set(expectedRoles)]) {
    if (await roleExists(role)) {
      knownRoles.add(role);
    } else {
      failures.push(`Required group role is missing: ${role}`);
    }
  }

  for (const loginEnv of Object.keys(applicationLogins)) {
    const login = process.env[loginEnv];
    if (await roleExists(login)) {
      knownRoles.add(login);
    } else {
      failures.push(`Application login is missing: ${login}`);
    }
  }

  if (await hasPublicCreate()) {
    failures.push('PUBLIC still has CREATE on schema public');
  }

  await verifyWriterGroups();
  await verifyApplicationLogins();
} finally {
  await client.end();
}

if (failures.length > 0) {
  console.error('Database role verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Database application roles and negative write permissions are valid.');
