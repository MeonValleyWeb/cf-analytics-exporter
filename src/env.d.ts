/// <reference types="astro/client" />

type Env = {
  PUBLIC_CLERK_PUBLISHABLE_KEY?: string;
  CLERK_SECRET_KEY?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  TOKEN_ENCRYPTION_KEY?: string;
};

declare module 'cloudflare:workers' {
  export const env: Env;
}
