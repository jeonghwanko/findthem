import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

// ─── Shared base rules (all packages) ───
const baseRules = {
  // TypeScript strict
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-unused-vars': [
    'error',
    { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
  ],
  '@typescript-eslint/consistent-type-imports': [
    'warn',
    { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
  ],
  '@typescript-eslint/no-non-null-assertion': 'warn',
  '@typescript-eslint/no-floating-promises': 'error',
  '@typescript-eslint/no-misused-promises': [
    'error',
    { checksVoidReturn: { arguments: false } },
  ],
  '@typescript-eslint/await-thenable': 'error',
  '@typescript-eslint/require-await': 'warn',
  '@typescript-eslint/no-unnecessary-type-assertion': 'warn',

  // General
  'no-console': 'error',
  'no-debugger': 'error',
  'no-duplicate-imports': 'error',
  'no-template-curly-in-string': 'warn',
  eqeqeq: ['error', 'always'],
  'no-var': 'error',
  'prefer-const': 'error',
  'prefer-template': 'warn',
  'no-throw-literal': 'error',
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-new-func': 'error',
  'no-return-assign': 'error',
  'no-self-compare': 'error',
  'no-useless-concat': 'warn',
  curly: ['warn', 'multi-line'],
};

// ─── Backend (apps/api) ───
const apiConfig = {
  files: ['apps/api/src/**/*.ts'],
  languageOptions: {
    parser: tsparser,
    parserOptions: {
      project: './apps/api/tsconfig.json',
      tsconfigRootDir: import.meta.dirname,
    },
  },
  plugins: {
    '@typescript-eslint': tseslint,
  },
  rules: {
    ...baseRules,

    // ── Import boundary: API must not import from web ──
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['@findthem/web', '@findthem/web/*', '../../web/*', '../../../web/*'],
            message: 'API must not import from web package.',
          },
        ],
      },
    ],

    // ── No direct process.env → use config object ──
    'no-restricted-syntax': [
      'error',
      {
        selector: 'MemberExpression[object.object.name="process"][object.property.name="env"]',
        message:
          'Direct process.env access is forbidden. Use config from src/config.ts instead.',
      },
      {
        selector:
          'NewExpression[callee.name="PrismaClient"]',
        message:
          'Do not instantiate PrismaClient directly. Use the singleton from db/client.ts.',
      },
    ],
  },
};

// ─── Frontend (apps/web) ───
const webConfig = {
  files: ['apps/web/src/**/*.{ts,tsx}'],
  languageOptions: {
    parser: tsparser,
    parserOptions: {
      project: './apps/web/tsconfig.json',
      tsconfigRootDir: import.meta.dirname,
      ecmaFeatures: { jsx: true },
    },
  },
  plugins: {
    '@typescript-eslint': tseslint,
    'react-hooks': reactHooks,
    'react-refresh': reactRefresh,
  },
  rules: {
    ...baseRules,

    // Frontend: allow console.warn/error (browser environment)
    'no-console': ['warn', { allow: ['warn', 'error'] }],

    // React
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

    // ── Import boundary: web must not import from api ──
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['@findthem/api', '@findthem/api/*'],
            message: 'Web must not import from API package.',
          },
        ],
        paths: [
          {
            name: '@prisma/client',
            message: 'Frontend must not import Prisma. Use shared types instead.',
          },
        ],
      },
    ],

    // ── No direct process.env in frontend ──
    'no-restricted-syntax': [
      'error',
      {
        selector: 'MemberExpression[object.object.name="process"][object.property.name="env"]',
        message:
          'Use import.meta.env instead of process.env in frontend code.',
      },
    ],
  },
};

// ─── Shared package ───
const sharedConfig = {
  files: ['packages/shared/src/**/*.ts'],
  languageOptions: {
    parser: tsparser,
    parserOptions: {
      project: './packages/shared/tsconfig.json',
      tsconfigRootDir: import.meta.dirname,
    },
  },
  plugins: {
    '@typescript-eslint': tseslint,
  },
  rules: {
    ...baseRules,

    // ── Shared must not import from apps ──
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: [
              '@findthem/api',
              '@findthem/web',
              '../../apps/*',
              '../../../apps/*',
            ],
            message:
              'Shared package must not import from apps (no reverse dependency).',
          },
        ],
      },
    ],
  },
};

// ─── Test files (relaxed rules) ───
const testConfig = {
  files: ['**/*.test.ts', '**/*.test.tsx', '**/tests/**/*.ts'],
  rules: {
    'no-console': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/no-floating-promises': 'off',
  },
};

// ─── Config files (relaxed) ───
const configFilesConfig = {
  files: [
    '*.config.{js,cjs,mjs,ts}',
    'apps/*/vite.config.ts',
    'apps/*/vitest.config.ts',
  ],
  rules: {
    'no-console': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
  },
};

// ─── Allow process.env in config.ts (it IS the config source) ───
const configTsOverride = {
  files: ['apps/api/src/config.ts'],
  rules: {
    'no-restricted-syntax': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
  },
};

// ─── Allow PrismaClient in db/client.ts (it IS the singleton source) ───
const dbClientOverride = {
  files: ['apps/api/src/db/client.ts'],
  rules: {
    'no-restricted-syntax': 'off',
  },
};

// ─── Allow console in logger.ts (it IS the logging source) ───
const loggerOverride = {
  files: ['apps/api/src/logger.ts'],
  rules: {
    'no-console': 'off',
  },
};

// ─── Global ignores ───
const ignoresConfig = {
  ignores: [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/coverage/**',
    '**/.prisma/**',
    'apps/api/prisma/migrations/**',
    'apps/api/uploads/**',
  ],
};

export default [
  ignoresConfig,
  apiConfig,
  webConfig,
  sharedConfig,
  testConfig,
  configFilesConfig,
  configTsOverride,
  dbClientOverride,
  loggerOverride,
];
