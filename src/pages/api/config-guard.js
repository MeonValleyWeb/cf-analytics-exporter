import { assessConfigDrift } from '../../lib/config-guard/drift-engine.js';
import {
  ConfigGuardRequestError,
  validateConfigGuardRequest
} from '../../lib/config-guard/request-validation.js';
import {
  groupCloudflareAccounts,
  inspectWorkerSecrets,
  inspectWorkerSettings,
  listCloudflareZones
} from '../../lib/server/cloudflare-api.js';
import { getTokenForUser } from '../../lib/server/cloudflare-token.js';
import { json } from '../../lib/server/http.js';

const MAX_REQUEST_BYTES = 128 * 1024;

export const prerender = false;

export async function POST({ locals, request }) {
  const { userId } = locals.auth();
  if (!userId) {
    return json({ error: 'Sign in required.' }, 401);
  }

  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return json({ error: 'Config Guard request exceeds the 128 KiB safety limit.' }, 413);
  }

  let input;
  try {
    input = validateConfigGuardRequest(await request.json());
  } catch (error) {
    const message =
      error instanceof ConfigGuardRequestError ? error.message : 'Request body must be valid JSON.';
    return json({ error: message }, 400);
  }

  try {
    const accessToken = await getTokenForUser(userId);
    const zones = await listCloudflareZones(accessToken);
    const account = groupCloudflareAccounts(zones).find(
      (candidate) => candidate.id === input.accountId
    );
    if (!account) {
      return json({ error: 'Account is not available to the stored Cloudflare token.' }, 404);
    }

    const [settings, secrets] = await Promise.all([
      inspectWorkerSettings(accessToken, input.accountId, input.scriptName),
      inspectWorkerSecrets(accessToken, input.accountId, input.scriptName)
    ]);
    const assessment = assessConfigDrift({
      declared: input.declared,
      declarationWarnings: input.declarationWarnings,
      deployed: { settings, secrets }
    });

    return json({
      scan: {
        scannedAt: new Date().toISOString(),
        readOnly: true,
        account,
        worker: { name: input.scriptName },
        sources: {
          settings: {
            status: settings.status,
            message: settings.message || null
          },
          secrets: {
            status: secrets.status,
            message: secrets.message || null
          }
        }
      },
      deployed: {
        settings: settings.status === 'available' ? settings.settings : null,
        secrets: secrets.status === 'available' ? secrets.secrets : null
      },
      assessment
    });
  } catch (error) {
    return json({ error: error?.message || 'Config Guard check failed.' }, 500);
  }
}
