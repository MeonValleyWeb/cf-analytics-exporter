const publicRouteMatchers = [/^\/$/, /^\/sign-in(.*)$/, /^\/sign-up(.*)$/];

function hasClerkConfig(runtimeEnv) {
  const publishableKey =
    runtimeEnv?.PUBLIC_CLERK_PUBLISHABLE_KEY ?? import.meta.env.PUBLIC_CLERK_PUBLISHABLE_KEY;
  const secretKey = runtimeEnv?.CLERK_SECRET_KEY ?? import.meta.env.CLERK_SECRET_KEY;
  return Boolean(publishableKey && secretKey);
}

function isPublicPath(pathname) {
  return publicRouteMatchers.some((matcher) => matcher.test(pathname));
}

export async function onRequest(context, next) {
  const runtimeEnv = context.locals?.runtime?.env;
  const clerkConfigured = hasClerkConfig(runtimeEnv);

  if (!clerkConfigured) {
    if (isPublicPath(context.url.pathname)) {
      return next();
    }

    return new Response('Authentication is not configured for this environment.', { status: 503 });
  }

  try {
    const { clerkMiddleware } = await import('@clerk/astro/server');
    const handler = clerkMiddleware({
      publicRoutes: ['/', '/sign-in(.*)', '/sign-up(.*)']
    });
    return handler(context, next);
  } catch (error) {
    if (isPublicPath(context.url.pathname)) {
      return next();
    }

    console.error('Clerk middleware failed to initialize.', error);
    return new Response('Authentication service is temporarily unavailable.', { status: 503 });
  }
}
