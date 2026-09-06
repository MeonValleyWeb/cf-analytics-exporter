import { clerkMiddleware } from '@clerk/astro/server';
import { env } from 'cloudflare:workers';
import { defineMiddleware } from 'astro:middleware';

const authenticate = clerkMiddleware();

export const onRequest = defineMiddleware(async (context, next) => {
  // Machine APIs authenticate independently with the export key in their handlers.
  const machineRoutes = ['/api/cf-export', '/api/capabilities', '/api/billing', '/api/ping',
    '/.netlify/functions/cf-export', '/.netlify/functions/ping'];
  const path = context.url.pathname.replace(/\/+$/, '') || '/';
  if (machineRoutes.includes(path)) return next();
  if (!env.CLERK_SECRET_KEY || !env.PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return new Response('Authentication is not configured.', { status: 503 });
  }
  const response = await authenticate(context, next);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  return response;
});
