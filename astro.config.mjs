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
  session: {
    driver: 'memory'
  },
  integrations: [
    react(),
    clerk({
      signInUrl: '/sign-in',
      signUpUrl: '/sign-up'
    })
  ],

  vite: {
    // @ts-expect-error tailwind's vite plugin is typed against a different vite major
    plugins: [tailwindcss()]
  }
});
