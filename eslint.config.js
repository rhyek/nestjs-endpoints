// @ts-check
import eslint from '@eslint/js';
import importPlugin from 'eslint-plugin-import';
import pluginJest from 'eslint-plugin-jest';
import eslintConfigPrettier from 'eslint-plugin-prettier/recommended';
import unusedImports from 'eslint-plugin-unused-imports';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules',
      '**/dist',
      'packages/test-endpoints-module/*',
      '!packages/test-endpoints-module/test-app-express-cjs/',
      'packages/test-endpoints-router-module/*',
      '!packages/test-endpoints-router-module/test-app-express-cjs/',
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
        projectService: true,
        sourceType: 'module',
      },
    },
  },
  {
    plugins: {
      import: importPlugin,
      'unused-imports': unusedImports,
    },
  },
  eslintConfigPrettier,
  {
    rules: {
      'import/order': [
        'error',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
          ],
          pathGroupsExcludedImportTypes: ['builtin', 'object'],
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
          'newlines-between': 'never',
        },
      ],
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-redundant-type-constituents': 'off',
    },
  },
  {
    files: ['packages/nestjs-endpoints/**'],
    rules: {
      'no-console': 'error',
    },
  },
  {
    files: ['packages/**/*.e2e-spec.ts'],
    ...pluginJest.configs['flat/recommended'],
    rules: {
      ...pluginJest.configs['flat/recommended'].rules,
      'jest/expect-expect': 'off',
      'jest/no-disabled-tests': 'error',
      'jest/no-focused-tests': 'error',
    },
  },
  {
    files: ['packages/test/test-react-query-client/**'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
    },
  },
  {
    files: ['packages/test/*/generated/**'],
    rules: {
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      'import/order': 'off',
    },
  },
);
