import { upsertTokenForUser } from '../../lib/server/cloudflare-token.js';
import { json } from '../../lib/server/http.js';

export const prerender = false;

export async function POST({ request, locals }) {
  const { userId } = locals.auth();
  if (!userId) {
    return json({ error: 'Sign in required.' }, 401);
  }

  try {
    const { apiToken } = await request.json();

    if (!apiToken || typeof apiToken !== 'string' || !apiToken.trim()) {
      return json({ error: 'Missing apiToken.' }, 400);
    }

    await upsertTokenForUser(userId, apiToken.trim());

    return json({ success: true });
  } catch (error) {
    return json({ error: error?.message || 'Failed to save token.' }, 500);
  }
}
