import { ExportError, json } from '../http.js';

export function requireUser(locals, request) {
  const auth = locals.auth?.();
  if (!auth?.isAuthenticated || !auth.userId) {
    throw new ExportError(401, 'unauthorized', 'Sign in required.');
  }
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    throw new ExportError(403, 'forbidden', 'Cross-origin requests are not allowed.');
  }
  return auth.userId;
}

export function sessionError(error) {
  if (error instanceof ExportError) return json({ error: error.message }, error.status);
  if (error instanceof SyntaxError) return json({ error: 'Invalid JSON body.' }, 400);
  return json({ error: 'Unable to complete this request. Check your account connection and try again.' }, 502);
}
