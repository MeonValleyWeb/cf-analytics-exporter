import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['dist/', '.astro/', '.netlify/', 'node_modules/', 'supabase/.temp/']
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs['flat/recommended'],
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        // Cloudflare Workers runtime for server code
        ...globals.serviceworker
      }
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', caughtErrors: 'none' }
      ],
      // The analytics payload passed between charts via CustomEvents is
      // untyped legacy code; tighten to 'error' once it gets a shared type.
      '@typescript-eslint/no-explicit-any': 'warn'
    }
  }
);
