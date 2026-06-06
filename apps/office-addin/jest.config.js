module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/test/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  moduleNameMapper: {
    '.*/config/runtime$': '<rootDir>/test/mocks/runtime.ts',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: '<rootDir>/../../tsconfig.json',
      diagnostics: {
        ignoreCodes: [151002],
      },
    }],
  },
  testTimeout: 30000,
  verbose: true,
};
