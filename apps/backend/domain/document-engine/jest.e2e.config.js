module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js', 'json'],
  rootDir: './src/test/e2e',
  testMatch: ['**/*.e2e-spec.ts'],
  testTimeout: 60000,
  setupFilesAfterEnv: ['<rootDir>/jest.e2e.setup.ts'],
};
