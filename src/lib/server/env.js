import { env as workersEnv } from 'cloudflare:workers';

// Runtime env on Cloudflare Workers (Astro 6 removed locals.runtime.env),
// falling back to import.meta.env for values loaded from .env in local dev.
export function getEnv(key) {
  return workersEnv?.[key] ?? import.meta.env[key];
}
