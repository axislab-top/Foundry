import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      // React 17+ JSX transform: no need to require React in scope
      'no-unused-vars': 'off',
      ...reactHooks.configs.recommended.rules,

      // Existing codebase uses `any` in admin tools; keep lint actionable.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
);

