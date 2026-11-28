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
  prettier,
);
