module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js', 'json'],
  rootDir: './src',
  testMatch: ['**/*.spec.ts'],
  coverageDirectory: './coverage',
  collectCoverageFrom: ['**/*.ts', '!**/*.spec.ts', '!**/main.ts'],
  coverageThreshold: {
    global: {
      branches: 20,
      functions: 20,
      lines: 20,
      statements: 20,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/test/jest.setup.ts'],
  testTimeout: 30000,
};
