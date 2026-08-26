import process from 'node:process';

const required = ['CONTROL_PLANE_MIGRATION_DATABASE_URL', 'AI_ORCHESTRATOR_MIGRATION_DATABASE_URL'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`Missing required environment variable(s): ${missing.join(', ')}`);
  process.exit(1);
}

function databaseTarget(value) {
  const url = new URL(value);
  const schema = url.searchParams.get('schema') || 'public';
  return `${url.protocol}//${url.hostname}:${url.port || '5432'}${url.pathname}?schema=${schema}`;
}

let controlTarget;
let aiTarget;
try {
  controlTarget = databaseTarget(process.env.CONTROL_PLANE_MIGRATION_DATABASE_URL);
  aiTarget = databaseTarget(process.env.AI_ORCHESTRATOR_MIGRATION_DATABASE_URL);
} catch {
  console.error('Migration database URL is invalid.');
  process.exit(1);
}

if (controlTarget !== aiTarget) {
  console.error(
    'Control Plane and AI Orchestrator migration URLs must target the same database/schema in the current shared-database architecture.'
  );
  process.exit(1);
}

console.log('Migration database targets are compatible with the shared canonical schema.');
