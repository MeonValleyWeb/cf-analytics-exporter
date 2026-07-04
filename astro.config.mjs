// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import clerk from '@clerk/astro';
import react from '@astrojs/react';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: cloudflare(),
  integrations: [
    react(),
    clerk({
      signInUrl: '/sign-in',
      signUpUrl: '/sign-up'
    })
  ],

  vite: {
    plugins: [tailwindcss()]
  }
});
