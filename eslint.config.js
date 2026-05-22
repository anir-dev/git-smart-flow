import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'downloads/**', 'installers/**', 'scripts/**'] },

  // Base recommended rules (no type info needed)
  ...tseslint.configs.recommended,
  prettierConfig,

  // Typed rules — require parserOptions.project
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Unhandled promise rejections crash the Node process in a CLI.
      '@typescript-eslint/no-floating-promises': 'error',

      // Explicit any weakens the type system.
      '@typescript-eslint/no-explicit-any': 'warn',

      // Unused vars are always bugs.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],

      // Allow empty interfaces (common in extension patterns).
      '@typescript-eslint/no-empty-object-type': 'off',

      // Non-null assertions should be explicit, not silently ignored.
      '@typescript-eslint/no-non-null-assertion': 'warn',

      // Consistent type imports (readiness for verbatimModuleSyntax).
      '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],

      // These fire too often on legitimate patterns in a CLI context.
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',

      // Console is intentional in a CLI.
      'no-console': 'off',
    },
  },

  // Relaxed rules for test files (no typed linting overhead).
  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
    },
  }
);
