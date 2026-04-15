const tsParser = require('@typescript-eslint/parser')
const tsPlugin = require('@typescript-eslint/eslint-plugin')
const reactPlugin = require('eslint-plugin-react')
const reactHooks = require('eslint-plugin-react-hooks')
const reactNative = require('eslint-plugin-react-native')
const tokensPlugin = { rules: { 'no-raw-tokens': require('./eslint-rules/no-raw-tokens') } }

module.exports = [
  { ignores: ['node_modules/', '.expo/', 'babel.config.js', 'metro.config.js', 'eslint.config.js', 'eslint-rules/**'] },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { '@typescript-eslint': tsPlugin, react: reactPlugin, 'react-hooks': reactHooks, 'react-native': reactNative, tokens: tokensPlugin },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'tokens/no-raw-tokens': 'error',
    },
    settings: { react: { version: 'detect' } },
  },
]
