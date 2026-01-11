import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Require explicit types in callbacks (matches IDE behavior)
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      
      // Require explicit any to be avoided
      '@typescript-eslint/no-explicit-any': 'error',
      
      // Unused vars
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      
      // Allow async without await - common pattern for interface compliance
      '@typescript-eslint/require-await': 'off',
      
      // Allow floating promises in handlers
      '@typescript-eslint/no-floating-promises': 'off',
      
      // Allow require for dynamic imports
      '@typescript-eslint/no-require-imports': 'off',
      
      // Allow non-null assertions when confident
      '@typescript-eslint/no-non-null-assertion': 'warn',
      
      // Relax unnecessary condition checks (defensive coding)
      '@typescript-eslint/no-unnecessary-condition': 'warn',
      
      // Allow empty catch blocks
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**'],
  }
);
