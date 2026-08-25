import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, 'database/schema-ownership.json'), 'utf8')
);
const sourcePath = path.join(root, manifest.schemaSource);
const source = fs.readFileSync(sourcePath, 'utf8');
const tables = [...source.matchAll(/@@map\("([^"]+)"\)/gu)].map((match) => match[1]).sort();
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
