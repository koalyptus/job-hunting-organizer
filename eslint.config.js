import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', '.lavish/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      curly: ['error', 'all'],
    },
  },
  {
    files: ['src/core/**/*.ts'],
    ignores: ['src/core/tests/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:fs', 'node:fs/promises', 'node:path', 'node:os'],
              message:
                'src/core/ must have no direct I/O imports. Use dependency injection or move to src/workflow/.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportExpression',
          message: 'Dynamic imports bypass static analysis. Use static imports only in src/core/.',
        },
      ],
    },
  },
);
