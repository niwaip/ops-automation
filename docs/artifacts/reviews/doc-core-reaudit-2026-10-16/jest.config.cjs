const base = require('../doc-core-audit-2026-10-16/jest.config.cjs');
module.exports = {
  ...base,
  roots: [base.rootDir, __dirname],
  testMatch: [__dirname + '/window-boundary.test.ts'],
};
