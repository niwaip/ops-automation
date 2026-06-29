#!/usr/bin/env node

const { spawnSync } = require('child_process');

const forwardedArgs = process.argv.slice(2).filter((arg) => arg !== '--');
const result = spawnSync(
  'jest',
  ['--config', 'jest.e2e.config.js', '--runInBand', ...forwardedArgs],
  {
    stdio: 'inherit',
    shell: true,
  }
);

if (typeof result.status === 'number') {
  process.exit(result.status);
}

process.exit(1);
