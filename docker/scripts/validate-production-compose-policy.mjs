import { readFileSync } from 'node:fs';

const [renderedPath, dockerfilePath] = process.argv.slice(2);
if (!renderedPath || !dockerfilePath) {
  console.error(
    'Usage: node validate-production-compose-policy.mjs <rendered-compose-output> <dockerfile>'
  );
  process.exit(2);
}

const renderedOutput = readFileSync(renderedPath, 'utf8');
const compose = parseRenderedCompose(renderedOutput);
const dockerfile = readFileSync(dockerfilePath, 'utf8');
const failures = [];

const requiredServices = {
  'control-plane-api': ['control', 'data'],
  'execution-dispatcher': ['control', 'runtime', 'data'],
  'schedule-trigger': ['control', 'data'],
  'ai-orchestrator': ['control', 'data'],
  'runtime-worker': ['control', 'runtime'],
};

const releaseServices = {
  'schema-migrator': {
    command: 'bash ./docker/scripts/run-production-schema-migrations.sh',
    requiredEnvironment: [
      'CONTROL_PLANE_MIGRATION_DATABASE_URL',
      'AI_ORCHESTRATOR_MIGRATION_DATABASE_URL',
    ],
  },
  'database-role-verifier': {
    command: 'node database/scripts/verify-application-roles.mjs',
    requiredEnvironment: [
      'DATABASE_ADMIN_URL',
      'CONTROL_PLANE_DB_LOGIN',
      'AI_ORCHESTRATOR_DB_LOGIN',
      'RUNTIME_WORKER_DB_LOGIN',
    ],
  },
};

for (const [serviceName, expectedNetworks] of Object.entries(requiredServices)) {
  const service = compose.services?.[serviceName];
  if (!service) {
    failures.push(`Required production service is missing: ${serviceName}`);
    continue;
  }

  if (typeof service.image !== 'string' || !/@sha256:[a-f0-9]{64}$/i.test(service.image)) {
    failures.push(`${serviceName} must use an immutable image digest`);
  }
  if (service.build) failures.push(`${serviceName} must not define build`);
  if (service.container_name) failures.push(`${serviceName} must not define container_name`);
  if (service.privileged === true) failures.push(`${serviceName} must not be privileged`);
  if (Array.isArray(service.ports) && service.ports.length > 0) {
    failures.push(`${serviceName} must not publish host ports`);
  }
  if (Array.isArray(service.volumes) && service.volumes.length > 0) {
    failures.push(`${serviceName} must not mount volumes in production`);
  }

  const command = Array.isArray(service.command)
    ? service.command.join(' ')
    : String(service.command || '');
  if (/\b(?:prisma\s+(?:migrate|db)|db\s+push|migrate\s+deploy)\b/i.test(command)) {
    failures.push(`${serviceName} must not run migrations at application startup`);
  }

  const actualNetworks = Object.keys(service.networks || {}).sort();
  const expected = [...expectedNetworks].sort();
  if (actualNetworks.join(',') !== expected.join(',')) {
    failures.push(
      `${serviceName} networks must be ${expected.join(', ')}; received ${actualNetworks.join(', ') || 'none'}`
    );
  }
}

for (const [serviceName, expected] of Object.entries(releaseServices)) {
  const service = compose.services?.[serviceName];
  if (!service) {
    failures.push(`Required release service is missing: ${serviceName}`);
    continue;
  }

  validateHardenedService(serviceName, service, ['data']);

  if (!Array.isArray(service.profiles) || !service.profiles.includes('release')) {
    failures.push(`${serviceName} must be gated by the explicit release profile`);
  }
  if (commandText(service) !== expected.command) {
    failures.push(`${serviceName} must use the audited release command`);
  }
  if (service.restart !== 'no') {
    failures.push(`${serviceName} must use restart: 'no'`);
  }
  if (service.depends_on && Object.keys(service.depends_on).length > 0) {
    failures.push(`${serviceName} must not depend on application services`);
  }
  if (String(service.user || '').toLowerCase() === 'root' || String(service.user) === '0') {
    failures.push(`${serviceName} must not override the image non-root user`);
  }

  const environment = service.environment || {};
  for (const variable of expected.requiredEnvironment) {
    if (!(variable in environment)) {
      failures.push(`${serviceName} must declare ${variable}`);
    }
  }
  if ('DATABASE_URL' in environment) {
    failures.push(`${serviceName} must not receive an application DATABASE_URL`);
  }
}

for (const networkName of ['control', 'runtime', 'data']) {
  if (compose.networks?.[networkName]?.internal !== true) {
    failures.push(`Network ${networkName} must be internal`);
  }
}

const serviceText = JSON.stringify(compose.services || {});
if (/docker\.sock/i.test(serviceText)) {
  failures.push('Production services must not mount or reference the Docker socket');
}

const runtimeStage = dockerfile.match(/FROM\s+[^\n]+\s+AS\s+runtime\b([\s\S]*)$/i)?.[1] || '';
if (!/^\s*USER\s+ops\s*$/im.test(runtimeStage)) {
  failures.push('Runtime Dockerfile stage must switch to the non-root ops user');
}
if (/^\s*VOLUME\b/im.test(runtimeStage)) {
  failures.push('Runtime Dockerfile stage must not declare writable host-mounted volumes');
}
for (const requiredCopy of ['docker/scripts', 'docker/sql', 'database/scripts']) {
  const copyPattern = new RegExp(`^\\s*COPY\\s+${escapeRegExp(requiredCopy)}\\s+`, 'im');
  if (!copyPattern.test(dockerfile)) {
    failures.push(`Runtime release image build must include ${requiredCopy}`);
  }
}

if (failures.length > 0) {
  console.error('Production Compose policy validation failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  'Production Compose policy is valid: immutable images, isolated networks, no mounts, no startup migrations, and non-root runtime/release jobs.'
);

function validateHardenedService(serviceName, service, expectedNetworks) {
  if (typeof service.image !== 'string' || !/@sha256:[a-f0-9]{64}$/i.test(service.image)) {
    failures.push(`${serviceName} must use an immutable image digest`);
  }
  if (service.build) failures.push(`${serviceName} must not define build`);
  if (service.container_name) failures.push(`${serviceName} must not define container_name`);
  if (service.privileged === true) failures.push(`${serviceName} must not be privileged`);
  if (Array.isArray(service.ports) && service.ports.length > 0) {
    failures.push(`${serviceName} must not publish host ports`);
  }
  if (Array.isArray(service.volumes) && service.volumes.length > 0) {
    failures.push(`${serviceName} must not mount volumes in production`);
  }

  const actualNetworks = Object.keys(service.networks || {}).sort();
  const requiredNetworks = [...expectedNetworks].sort();
  if (actualNetworks.join(',') !== requiredNetworks.join(',')) {
    failures.push(
      `${serviceName} networks must be ${requiredNetworks.join(', ')}; received ${actualNetworks.join(', ') || 'none'}`
    );
  }
}

function commandText(service) {
  return Array.isArray(service.command) ? service.command.join(' ') : String(service.command || '');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseRenderedCompose(value) {
  const trimmed = value.trimStart();
  const jsonStart = trimmed.startsWith('{') ? value.indexOf('{') : value.indexOf('\n{');
  if (jsonStart < 0) {
    throw new Error('Docker Compose did not produce JSON output');
  }
  try {
    return JSON.parse(value.slice(jsonStart));
  } catch (error) {
    throw new Error(`Unable to parse rendered Docker Compose JSON: ${error.message}`);
  }
}
