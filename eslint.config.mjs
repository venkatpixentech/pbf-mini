import js from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'build/**', 'src/games/lastmanstanding/api/mockData.ts'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      react.configs.flat.recommended,
      react.configs.flat['jsx-runtime'],
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      eslintPluginPrettierRecommended,
    ],
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      'no-undef': 'off',
      // React Compiler-oriented rules bundled into react-hooks' "recommended" flat config.
      // Downgraded to warn: this codebase predates them and isn't targeting the compiler.
      'react-hooks/static-components': 'warn',
      'react-hooks/use-memo': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/globals': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/error-boundaries': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/set-state-in-render': 'warn',
      'react-hooks/config': 'warn',
      'react-hooks/gating': 'warn',
      // Redundant with TypeScript's own prop type-checking.
      'react/prop-types': 'off',
      // Pre-existing legacy patterns now surfaced by js/react recommended configs.
      // Downgraded to warn (visible, non-blocking) rather than fixed wholesale.
      'react/display-name': 'warn',
      'react-refresh/only-export-components': 'warn',
      'no-empty': 'warn',
      'no-case-declarations': 'warn',
      'no-unsafe-optional-chaining': 'warn',
      'no-prototype-builtins': 'warn',
      'no-constant-binary-expression': 'warn',
      'no-self-assign': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/explicit-member-accessibility': 0,
      '@typescript-eslint/explicit-function-return-type': 0,
      '@typescript-eslint/no-parameter-properties': 0,
      '@typescript-eslint/interface-name-prefix': 0,
      '@typescript-eslint/no-var-requires': 0,
      '@typescript-eslint/indent': 0,
      '@typescript-eslint/no-explicit-any': 0,
      '@typescript-eslint/no-unused-vars': 0,
      '@typescript-eslint/explicit-module-boundary-types': 'off',
    },
  },
);
