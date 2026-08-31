import js from '@eslint/js';

export default [
  { ignores: ['node_modules/**', 'data/**', '.cache/**', 'qa-shots/**'] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        fetch: 'readonly',
        document: 'readonly',
        window: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-undef': 'off'
    }
  }
];
