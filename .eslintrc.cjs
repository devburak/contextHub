module.exports = {
  root: true,
  env: {
    es2021: true,
    node: true,
  },
  extends: ['eslint:recommended'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'script',
  },
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'build/',
    '.turbo/',
    'coverage/',
  ],
  overrides: [
    {
      files: ['**/*.mjs'],
      parserOptions: {
        sourceType: 'module',
      },
    },
    {
      files: ['apps/admin/**/*.{js,jsx}'],
      env: {
        browser: true,
        node: false,
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
        sourceType: 'module',
      },
    },
    {
      files: ['**/*.test.{js,jsx,mjs,cjs}'],
      env: {
        node: true,
      },
      globals: {
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
      },
    },
  ],
};
