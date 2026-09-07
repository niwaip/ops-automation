module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@ops/identity-access$': '<rootDir>/../../governance/identity-access/dist',
    '^@ops/identity-access/(.*)$': '<rootDir>/../../governance/identity-access/dist/$1',
    '^@ops/organization$': '<rootDir>/../../governance/organization/dist',
    '^@ops/organization/(.*)$': '<rootDir>/../../governance/organization/dist/$1',
    '^@ops/workbench$': '<rootDir>/../../governance/workbench/dist',
    '^@ops/workbench/(.*)$': '<rootDir>/../../governance/workbench/dist/$1',
    '^@ops/workflow-registry/(.*)$': '<rootDir>/../../registry-release/workflow-registry/dist/$1',
    '^@ops/skill-registry/(.*)$': '<rootDir>/../../registry-release/skill-registry/dist/$1',
    '^@ops/release-manager/(.*)$': '<rootDir>/../../registry-release/release-manager/dist/$1',
  },
  testMatch: ['<rootDir>/test/**/*.test.ts'],
  collectCoverageFrom: [
    '<rootDir>/src/**/*.ts',
    '!<rootDir>/src/**/*.module.ts',
    '!<rootDir>/src/**/*.dto.ts',
    '!<rootDir>/src/**/index.ts',
    '!<rootDir>/src/main.ts',
  ],
  coverageDirectory: '<rootDir>/coverage',
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50,
    },
  },
};
