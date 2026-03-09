// @ts-check
import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';
import clerk from '@clerk/astro';
import react from '@astrojs/react';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  output: 'server',

  // enables Netlify SSR/functions
  adapter: netlify(),
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
