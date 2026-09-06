import { requireUser, sessionError } from '../../lib/server/session.js';
import { upsertTokenForUser } from '../../lib/server/cloudflare-token.js';

export const prerender = false;

export async function POST({ request, locals }) {
  try {
    const userId = requireUser(locals, request);
    const { apiToken } = await request.json();

    if (typeof apiToken !== 'string' || !apiToken.trim() || apiToken.length > 1024) {
      return new Response(JSON.stringify({ error: 'Enter a valid API token.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await upsertTokenForUser(userId, apiToken, locals);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return sessionError(error);
  }
}
