import js from '@eslint/js';
import a11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * One ESLint config for the whole workspace.
 *
 * Type-aware rules are on everywhere (projectService picks up each package's
 * tsconfig), so lint and tsc see the same types and cannot disagree. This is
 * why the workspace pins a single TypeScript version at the root.
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      /* An unused parameter is often deliberate — an Express error handler
         must take four arguments to be recognised as one. Underscore opts out. */
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      /* Booleans in JSX conditionals (`{error && <p/>}`) are the idiom, and
         the strict version of this rule rejects them. Keep the check for the
         genuinely dangerous cases: nullable strings and numbers, where '' and
         0 silently render nothing. */
      '@typescript-eslint/strict-boolean-expressions': 'off',
      /* `onClick={() => setOpen(true)}` is the React idiom, not a mistake.
         The rule still catches a void expression used as a real value. */
      '@typescript-eslint/no-confusing-void-expression': [
        'error',
        {
          ignoreArrowShorthand: true,
        },
      ],
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        {
          allowNumber: true,
        },
      ],
    },
  },

  /* ── Web app ─────────────────────────────────────────────────────────── */
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': a11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      /* §10 is non-negotiable, so accessibility problems are errors, not
         warnings. Automated rules catch maybe 40% of real issues — this is a
         floor, not a pass. */
      ...a11y.flatConfigs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        {
          allowConstantExport: true,
        },
      ],
    },
  },

  /* ── API ─────────────────────────────────────────────────────────────── */
  {
    files: ['apps/api/**/*.ts'],
    languageOptions: { globals: globals.node },
    rules: {
      /* The server logs deliberately. The browser should not. */
      'no-console': 'off',
    },
  },

  /* ── Shared packages: no environment globals at all ──────────────────── */
  {
    files: ['packages/**/*.ts'],
    rules: {
      /* Shared code runs in both a browser and Node, so it may not reach for
         either one's globals. */
      'no-restricted-globals': ['error', 'window', 'document', 'process'],
    },
  },

  /* ── Config files ────────────────────────────────────────────────────── */
  {
    files: ['**/*.config.{js,ts}', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
    ...tseslint.configs.disableTypeChecked,
  },

  /* Must stay last: switches off every rule Prettier owns, so the two never
     fight over formatting. */
  prettier,
);
