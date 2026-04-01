/** @type {import('jest').Config} */
module.exports = {
  rootDir: '..',
  testMatch: ['<rootDir>/test/integration/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
    }],
  },
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/test/integration/setup.ts'],
  globalSetup: '<rootDir>/test/integration/helpers/global-setup.ts',
  globalTeardown: '<rootDir>/test/integration/helpers/global-teardown.ts',
  testTimeout: 60000,
  coverageDirectory: '<rootDir>/coverage/integration',
  collectCoverageFrom: [
    '<rootDir>/test/integration/**/*.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  verbose: true,
  detectOpenHandles: true,
  forceExit: true,
};