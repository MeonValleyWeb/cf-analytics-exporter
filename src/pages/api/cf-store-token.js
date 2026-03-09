import { upsertTokenForUser } from '../../lib/server/cloudflare-token.js';

export const prerender = false;

export async function POST({ request, locals }) {
  try {
    const { userId, apiToken } = await request.json();

    if (!userId || !apiToken) {
      return new Response(JSON.stringify({ error: 'Missing userId or apiToken.' }), {
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
    return new Response(JSON.stringify({ error: error?.message || 'Failed to save token.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
