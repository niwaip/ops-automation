const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

const requiredPaths = [
  'apps/backend/README.md',
  'apps/backend/governance/README.md',
  'apps/backend/governance/audit-policy/README.md',
  'apps/backend/governance/audit-policy/package.json',
  'apps/backend/governance/audit-policy/tsconfig.json',
  'apps/backend/governance/audit-policy/src/index.ts',
  'apps/backend/intelligence/README.md',
  'apps/backend/intelligence/master-planner/README.md',
  'apps/backend/intelligence/master-planner/package.json',
  'apps/backend/intelligence/master-planner/tsconfig.json',
  'apps/backend/intelligence/master-planner/src/index.ts',
  'apps/backend/registry-release/README.md',
  'apps/backend/execution-control/README.md',
  'apps/backend/capabilities/README.md',
  'apps/backend/runtimes/README.md',
  'apps/backend/var/README.md',
  'apps/backend/capabilities/browser-domain/README.md',
  'apps/backend/capabilities/browser-domain/templates/README.md',
  'apps/backend/capabilities/browser-domain/templates/index.ts',
  'apps/backend/capabilities/browser-domain/semantics/README.md',
  'apps/backend/capabilities/browser-domain/semantics/index.ts',
  'apps/backend/capabilities/browser-domain/recorder/README.md',
  'apps/backend/capabilities/browser-domain/runtime-facade/README.md',
  'apps/backend/capabilities/document-domain/README.md',
  'apps/backend/capabilities/document-domain/index.ts',
  'apps/backend/capabilities/document-domain/template/README.md',
  'apps/backend/capabilities/document-domain/render/README.md',
  'apps/backend/capabilities/document-domain/report/README.md',
  'apps/backend/capabilities/document-domain/runtime-facade/README.md',
  'apps/backend/registry-release/skill-registry/README.md',
  'apps/backend/registry-release/skill-registry/package.json',
  'apps/backend/registry-release/skill-registry/tsconfig.json',
  'apps/backend/registry-release/workflow-registry/README.md',
  'apps/backend/registry-release/workflow-registry/package.json',
  'apps/backend/registry-release/workflow-registry/tsconfig.json',
  'apps/backend/registry-release/template-registry/README.md',
  'apps/backend/registry-release/template-registry/package.json',
  'apps/backend/registry-release/template-registry/tsconfig.json',
  'apps/backend/registry-release/agent-catalog/README.md',
  'apps/backend/registry-release/agent-catalog/package.json',
  'apps/backend/registry-release/agent-catalog/tsconfig.json',
  'apps/backend/registry-release/release-manager/README.md',
  'apps/backend/registry-release/release-manager/package.json',
  'apps/backend/registry-release/release-manager/tsconfig.json',
  'packages/backend-contracts/error-codes/README.md',
  'packages/backend-contracts/error-codes/package.json',
  'packages/backend-contracts/error-codes/tsconfig.json',
  'packages/backend-contracts/error-codes/src/index.ts',
  'packages/backend-contracts/execution-core/README.md',
  'packages/backend-contracts/execution-core/package.json',
  'packages/backend-contracts/execution-core/tsconfig.json',
  'packages/backend-contracts/execution-core/src/index.ts',
];

const missingPaths = requiredPaths.filter((relativePath) => {
  return !fs.existsSync(path.join(root, relativePath));
});

if (missingPaths.length > 0) {
  console.error('Missing backend plane shell paths:');
  for (const missingPath of missingPaths) {
    console.error(`- ${missingPath}`);
  }
  process.exit(1);
}

console.log(
  `Backend plane shell check passed for ${requiredPaths.length} required paths.`,
);
