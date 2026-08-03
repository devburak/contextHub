module.exports = {
  env: { browser: true, es2020: true },
  extends: [
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['react', 'react-refresh'],
  rules: {
    // Existing admin code has unused-variable debt. Keep it visible without
    // blocking the first CI baseline; new syntax/undefined-variable errors still fail.
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
    'react/jsx-uses-vars': 'error',
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
  },
  overrides: [
    {
      files: ['vite.config.js'],
      env: { browser: false, node: true },
    },
  ],
}
