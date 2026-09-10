import { env as workersEnv } from 'cloudflare:workers';

// Runtime env on Cloudflare Workers and in the Cloudflare Vite dev runtime.
// Do not fall back to import.meta.env: Vite replaces those values at build time.
export function getEnv(key) {
  return workersEnv?.[key];
}
