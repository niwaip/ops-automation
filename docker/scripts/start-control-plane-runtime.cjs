const fs = require('fs');
const path = require('path');

const appRoot = path.resolve(
  process.env.PROJECT_ROOT || '/workspace',
  'apps/backend/execution-control/control-plane',
);
const entryName = process.argv[2] === 'worker' ? 'worker-main.js' : 'main.js';
const candidates = [
  `dist/${entryName}`,
  `dist/src/${entryName}`,
  `dist/apps/backend/execution-control/control-plane/src/${entryName}`,
  `dist/app/src/${entryName}`,
];
const entry = candidates.map((candidate) => path.join(appRoot, candidate)).find(fs.existsSync);

if (!entry) {
  console.error(`No ${entryName} found in the frozen Control Plane runtime snapshot`);
  process.exit(1);
}

require(entry);
