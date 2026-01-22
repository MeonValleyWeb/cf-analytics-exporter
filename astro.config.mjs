// @ts-check
import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';
import clerk from '@clerk/astro';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  output: 'server',

  // enables Netlify SSR/functions
  adapter: netlify(),
  integrations: [
    clerk({
      signInUrl: '/sign-in',
      signUpUrl: '/sign-up'
    })
  ],

  vite: {
    plugins: [tailwindcss()]
  }
});
