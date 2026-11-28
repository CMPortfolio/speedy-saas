import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { createNodeResolver, flatConfigs as importX } from 'eslint-plugin-import-x';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * House ESLint config for packages (no React). Apps extend ./eslint.next.config.js.
 * Limits are the house limits: small files, small functions, shallow nesting.
 *
 * @type {import('eslint').Linter.RulesRecord}
 */
export const houseLimits = {
  complexity: ['error', 12],
  'max-depth': ['error', 3],
  'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
  'max-lines-per-function': ['error', { max: 80, skipBlankLines: true, skipComments: true }],
  'max-params': ['error', 4],
  'no-console': ['error', { allow: ['warn', 'error'] }],
  eqeqeq: ['error', 'always', { null: 'ignore' }],
  'prefer-const': 'error',
  'no-restricted-imports': [
    'error',
    {
      patterns: [
        {
          group: ['@speedy/*/src/*', '../../packages/*', '../../../packages/*'],
          message: "Import shared code only through the package's exports (CLAUDE.md rule 4).",
        },
        {
          group: ['@speedy/auth/server', '@speedy/db/server'],
          importNames: ['createServiceClient', 'serviceRoleKey'],
          message: 'Service-role access is server-only. Import it from a server file.',
        },
      ],
    },
  ],
};

/** @type {import('eslint').Linter.Config} */
export const ignores = {
  ignores: [
    '**/node_modules/**',
    '**/.next/**',
    '**/dist/**',
    '**/coverage/**',
    '**/playwright-report/**',
    '**/test-results/**',
    '**/*.d.ts',
    '**/database.types.ts',
    'next-env.d.ts',
  ],
};

/** @type {import('eslint').Linter.Config} */
export const testOverrides = {
  files: ['**/*.test.{ts,tsx}', '**/tests/**/*.{ts,tsx}', '**/*.spec.{ts,tsx}'],
  rules: {
    'max-lines-per-function': 'off',
    'max-lines': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
  },
};

export default tseslint.config(
  ignores,
  js.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  importX.recommended,
  importX.typescript,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.es2022 },
    },
    settings: {
      'import-x/resolver-next': [
        createNodeResolver({ extensions: ['.ts', '.tsx', '.mts', '.js', '.mjs', '.jsx', '.json'] }),
      ],
    },
    rules: {
      ...houseLimits,
      'import-x/no-relative-packages': 'error',
      'import-x/no-cycle': 'error',
      'import-x/no-unresolved': 'off',
      'import-x/named': 'off',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/consistent-type-definitions': 'off',
    },
  },
  testOverrides,
  prettier,
);
