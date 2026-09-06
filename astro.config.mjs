// @ts-check
import { defineConfig } from 'astro/config';
import clerk from '@clerk/astro';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  integrations: [react(), clerk({ signInUrl: '/sign-in', signUpUrl: '/sign-up' })],
  vite: { plugins: [tailwindcss()] },
  adapter: cloudflare({ imageService: 'passthrough' }),
  session: false,
  redirects: {
    '/.netlify/functions/cf-export': { destination: '/api/cf-export', status: 307 },
    '/.netlify/functions/ping': { destination: '/api/ping', status: 307 },
  },
});
