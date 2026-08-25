import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, 'database/schema-ownership.json'), 'utf8')
);
const sourcePath = path.join(root, manifest.schemaSource);
const source = fs.readFileSync(sourcePath, 'utf8');
const tableNames = (schema) =>
  [...schema.matchAll(/@@map\("([^"]+)"\)/gu)].map((match) => match[1]);
const sourceTables = tableNames(source);
const supplementalTables = [];

for (const supplemental of manifest.supplementalSources || []) {
  const supplementalPath = path.join(root, supplemental.schema);
  const declared = new Set(supplemental.includeTables || []);
  const available = new Set(tableNames(fs.readFileSync(supplementalPath, 'utf8')));
  const missingDeclared = [...declared].filter((table) => !available.has(table));
  if (missingDeclared.length > 0) {
    throw new Error(
      `Supplemental schema ownership source has missing table(s): ${supplemental.schema} [${missingDeclared}]`
    );
  }
  supplementalTables.push(...declared);
}

const tables = [...new Set([...sourceTables, ...supplementalTables])].sort();
const declarations = new Map();

for (const [owner, ownedTables] of Object.entries(manifest.owners)) {
  for (const table of ownedTables) {
    if (declarations.has(table)) {
      throw new Error(`Table ${table} has multiple owners: ${declarations.get(table)}, ${owner}`);
    }
    declarations.set(table, owner);
  }
}

const missing = tables.filter((table) => !declarations.has(table));
const stale = [...declarations.keys()].filter((table) => !tables.includes(table));
if (missing.length || stale.length) {
  throw new Error(`Schema ownership mismatch. missing=[${missing}] stale=[${stale}]`);
}

for (const mirror of manifest.generatedMirrors) {
  const mirrorContent = fs.readFileSync(path.join(root, mirror), 'utf8');
  if (mirrorContent !== source) {
    throw new Error(
      `Generated Prisma mirror drifted: ${mirror}. Run database/scripts/sync-prisma-schema.sh`
    );
  }
}

process.stdout.write(
  `Schema ownership valid: ${tables.length} tables, ${declarations.size} owners assigned.\n`
);
