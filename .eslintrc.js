module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  env: {
    node: true,
    es2022: true,
    jest: true,
  },
  rules: {
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-non-null-assertion': 'off',
    'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    'prefer-const': 'error',
    'no-var': 'error',
  },
  overrides: [
    {
      files: ['packages/user-core/**/*.{ts,tsx}'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: ['react', 'antd', 'react-router-dom'],
            patterns: ['**/*.tsx'],
          },
        ],
        'no-restricted-globals': [
          'error',
          'window',
          'document',
          'localStorage',
          'sessionStorage',
          'XMLHttpRequest',
        ],
      },
    },
    {
      files: [
        'apps/backend/intelligence/ai-orchestrator/src/modules/planner/**/*.{ts,tsx}',
      ],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: [
                  '../browser/execute/*',
                  '../browser/observe/*',
                  '../browser/observation/*',
                  '../browser/session/*',
                  '../browser/loop/*',
                  '../browser/recovery/*',
                  '../browser/export/*',
                  '../browser/runtime-facade/*',
                  '../browser/gateway/*',
                  '../browser/api/*',
                ],
                message:
                  'planner/* must not depend on browser/* internal implementations; import only stable browser entrypoints or delegated contracts.',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['packages/backend-contracts/**/*.{ts,tsx}'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: [
              {
                name: '@ops/contracts',
                message:
                  'New shared backend contracts must live independently of @ops/contracts during migration.',
              },
            ],
          },
        ],
      },
    },
    {
      files: [
        'apps/backend/governance/**/*.{ts,tsx}',
        'apps/backend/intelligence/**/*.{ts,tsx}',
        'apps/backend/registry-release/**/*.{ts,tsx}',
        'apps/backend/capabilities/**/*.{ts,tsx}',
        'apps/backend/runtimes/**/*.{ts,tsx}',
      ],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: [
              {
                name: '@ops/contracts',
                message:
                  'This target backend plane must not add new dependencies on @ops/contracts; use packages/backend-contracts/* instead.',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['apps/backend/registry-release/skill-registry/src/**/*.{ts,tsx}'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['**/core/platform/src/modules/skill/*'],
                message:
                  'skill-registry should depend on core/platform/src/skill-registry/* compatibility layers instead of reaching into modules/skill/* directly.',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['apps/backend/registry-release/**/*.{ts,tsx}'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: [
                  '**/apps/backend/domain/**',
                  '**/intelligence/ai-orchestrator/src/modules/browser/**',
                ],
                message:
                  'registry-release/* should own design-time registries and release gates without importing legacy capability-domain or browser-module implementations directly.',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['apps/backend/capabilities/**/*.{ts,tsx}'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: [
                  '**/domain/browser-template/**',
                  '**/domain/browser-semantics/**',
                  '**/domain/document-engine/**',
                  '**/domain/report/**',
                  '**/intelligence/ai-orchestrator/src/modules/browser/**',
                  '**/core/platform/src/modules/**',
                ],
                message:
                  'capabilities/* should grow behind their own target-plane entrypoints instead of importing legacy domain/core-platform/browser-module implementations directly.',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['apps/backend/governance/**/*.{ts,tsx}'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: [
                  '**/apps/backend/domain/**',
                  '**/core/platform/src/modules/**',
                  '**/intelligence/ai-orchestrator/src/modules/browser/**',
                ],
                message:
                  'governance/* should own IAM and organization boundaries through its own target-plane modules, not import legacy domain/core-platform/browser-module implementations directly.',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['apps/backend/intelligence/**/*.{ts,tsx}'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: [
                  '**/apps/backend/domain/**',
                  '**/core/platform/src/modules/**',
                  '**/core/platform/src/skill-registry/**',
                  '**/core/platform/src/workflow-registry/**',
                  '**/core/platform/src/release-manager/**',
                ],
                message:
                  'intelligence/* should collaborate through target-plane contracts and facades instead of importing legacy domain/core-platform registry implementations directly.',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['apps/backend/execution-control/**/*.{ts,tsx}'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: [
                  '**/apps/backend/domain/**',
                  '**/core/platform/src/modules/**',
                  '**/intelligence/ai-orchestrator/src/modules/browser/**',
                ],
                message:
                  'execution-control/* should coordinate execution and sessions through contracts and target-plane facades, not import legacy domain/core-platform/browser-module implementations directly.',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['apps/backend/runtimes/**/*.{ts,tsx}'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: [
                  '**/apps/backend/domain/**',
                  '**/core/platform/src/modules/**',
                  '**/intelligence/ai-orchestrator/src/modules/browser/**',
                ],
                message:
                  'runtimes/* should stay focused on atomic execution and must not import legacy domain/core-platform/browser orchestration implementations directly.',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['apps/backend/**/prisma/seed.ts', 'scripts/**'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        'no-console': 'off',
      },
    },
    {
      files: [
        '**/*.spec.ts',
        '**/*.spec.tsx',
        '**/*.test.ts',
        '**/*.test.tsx',
        'tests/**',
        '**/test/**',
      ],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        'no-console': 'off',
      },
    },
  ],
  ignorePatterns: [
    'dist',
    'build',
    'coverage',
    'node_modules',
    '**/generated/**',
    '**/*.d.ts',
    '.turbo',
    '*.js',
    '!.eslintrc.js',
  ],
};
