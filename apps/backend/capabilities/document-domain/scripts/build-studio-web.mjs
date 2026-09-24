#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sources = [
  'studio-core.js',
  'studio-processing.js',
  'studio-interactions.js',
  'studio-structure.js',
  'studio-persistence.js',
];
const outputPath = join(root, 'public/js/app.js');
const output = Buffer.concat(sources.map((name) => readFileSync(join(root, 'studio-web', name))));

if (process.argv.includes('--check')) {
  if (!output.equals(readFileSync(outputPath))) {
    console.error(
      'Studio web bundle is stale. Run pnpm --filter @ops/document-domain build:studio-web.'
    );
    process.exitCode = 1;
  }
} else {
  writeFileSync(outputPath, output);
}
