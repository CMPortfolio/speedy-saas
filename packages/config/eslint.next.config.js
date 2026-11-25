import nextPlugin from '@next/eslint-plugin-next';
import prettier from 'eslint-config-prettier';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import base from './eslint.config.js';

/**
 * House ESLint config for Next.js apps and React packages.
 * Usage in an app: `import config from '@speedy/config/eslint/next'; export default config;`
 */
export default tseslint.config(
  ...base,
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    plugins: { react, 'react-hooks': reactHooks, '@next/next': nextPlugin },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...(react.configs.flat?.recommended?.rules ?? {}),
      ...(react.configs.flat?.['jsx-runtime']?.rules ?? {}),
      ...reactHooks.configs.flat.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      'react/prop-types': 'off',
      'react/no-unknown-property': ['error', { ignore: ['tw'] }],
      // Pages, layouts and route handlers are allowed to be a little longer than helpers.
      'max-lines-per-function': ['error', { max: 120, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    // Client-side code never touches server-only modules. Server components, server actions,
    // route handlers and middleware live outside these folders.
    files: ['**/components/**', '**/hooks/**', '**/*.client.{ts,tsx}', '**/use-*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@speedy/auth/server',
                '@speedy/auth/user',
                '@speedy/sms/server',
                'server-only',
              ],
              message:
                'Server-only module imported from client-side code (CLAUDE.md: service-role key stays on the server).',
            },
            {
              group: ['@speedy/*/src/*'],
              message: "Import shared code only through the package's exports (CLAUDE.md rule 4).",
            },
          ],
        },
      ],
    },
  },
  prettier,
);
