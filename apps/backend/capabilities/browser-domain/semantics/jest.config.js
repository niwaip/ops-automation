/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/test/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  collectCoverageFrom: [
    '<rootDir>/**/*.ts',
    '!<rootDir>/dist/**',
    '!<rootDir>/generated/**',
    '!<rootDir>/coverage/**',
    '!<rootDir>/test/**',
    '!<rootDir>/main.ts',
  ],
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'lcov', 'cobertura'],
  modulePathIgnorePatterns: ['<rootDir>/dist/', '<rootDir>/coverage/'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.json',
        diagnostics: {
          ignoreCodes: [151002],
        },
      },
    ],
  },
};
