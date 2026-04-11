/**
 * Shared ESLint config for Nest/TS packages that do not ship a local .eslintrc.
 * ESLint walks up from linted files to the repo root.
 */
/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  env: { node: true, es2022: true },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  ignorePatterns: [
    '**/dist/**',
    '**/node_modules/**',
    '**/coverage/**',
    '**/.turbo/**',
  ],
  overrides: [
    {
      files: ['apps/worker/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          { paths: ['child_process', 'node:child_process'] },
        ],
      },
    },
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/no-require-imports': 'off',
    '@typescript-eslint/triple-slash-reference': 'off',
    // Spec / Nest patterns that are intentionally loose in this monorepo
    '@typescript-eslint/no-var-requires': 'off',
    '@typescript-eslint/ban-types': 'off',
    'no-useless-catch': 'off',
    'no-useless-escape': 'off',
    'no-constant-condition': 'off',
  },
};
