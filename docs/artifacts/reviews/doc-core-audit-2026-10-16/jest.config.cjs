const path = require('node:path');
const repo = path.resolve(__dirname, '../../../..');
const root = path.join(repo, 'apps/backend/platform');
const base = require(path.join(root, 'jest.config.js'));
module.exports = {
  ...base,
  rootDir: root,
  // Source mapping avoids accidentally testing stale dist. Match workbench's noImplicitAny setting.
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: { noImplicitAny: false } }] },
  modulePathIgnorePatterns: [path.join(root, 'dist')],
  moduleNameMapper: {
    ...base.moduleNameMapper,
    '^@ops/workbench$': '<rootDir>/../governance/workbench/src',
    '^@ops/workbench/(.*)$': '<rootDir>/../governance/workbench/src/$1',
  },
  roots: [root, __dirname],
  testMatch: [
    path.join(root, 'test/workspace-core-values.test.ts'),
    path.join(root, 'test/workspace-search-relevance.test.ts'),
    path.join(__dirname, 'core-audit.test.ts'),
  ],
};
