// M-05: frontend lint gate (ESLint 9 flat config).
// Run: npm run lint  (wired into the CI workflow)
import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  {
    ignores: ['node_modules/', 'dist/', 'coverage/', '*.config.js'],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.js', 'src/**/*.jsx'],
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
      },
    },
    settings: {
      react: { version: '18.2' },
    },
    rules: {
      // Full react recommended set (incl. react/jsx-uses-vars — the core
      // no-unused-vars rule never counts JSX tag usages, so this rule marks
      // JSX components as used).
      ...react.configs.flat.recommended.rules,
      // React 17+ JSX transform — no React import required.
      'react/react-in-jsx-scope': 'off',
      // Function components without displayName are fine in this codebase.
      'react/display-name': 'off',
      // No PropTypes in this codebase; keep the rule off to avoid noise.
      'react/prop-types': 'off',
      // Hook correctness is a hard error; deps warnings are advisory.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
]
