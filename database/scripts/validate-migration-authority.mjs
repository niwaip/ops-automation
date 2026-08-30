import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const canonicalRoot = path.join(repositoryRoot, 'apps/backend/core/platform/prisma/migrations');
const legacyAiRoot = path.join(
  repositoryRoot,
  'apps/backend/intelligence/ai-orchestrator/prisma/migrations'
);
const migrationNames = [
  '20260803000000_add_llm_operation_registry',
  '20260803010000_add_llm_operation_attestation',
  '20260805000000_add_llm_operation_idempotency',
];

for (const migrationName of migrationNames) {
  const canonicalPath = path.join(canonicalRoot, migrationName, 'migration.sql');
  const legacyPath = path.join(legacyAiRoot, migrationName, 'migration.sql');
  if (!existsSync(canonicalPath) || !existsSync(legacyPath)) {
    throw new Error(`Migration authority copy is missing: ${migrationName}`);
  }
  if (!readFileSync(canonicalPath).equals(readFileSync(legacyPath))) {
    throw new Error(
      `Migration authority copy drifted: ${migrationName}. Historical SQL must remain byte-identical.`
    );
  }
}

process.stdout.write(
  `Migration authority valid: Platform owns ${migrationNames.length} adopted AI Registry migration(s).\n`
);
