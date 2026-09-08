import { assessCrawlerRisk } from '../../lib/crawler-guard/risk-engine.js';
import { inspectZoneBotManagement, listCloudflareZones } from '../../lib/server/cloudflare-api.js';
import { getTokenForUser } from '../../lib/server/cloudflare-token.js';
import { json } from '../../lib/server/http.js';
import { inspectRobotsTxt } from '../../lib/server/robots-inspector.js';

const ZONE_ID_PATTERN = /^[0-9a-f]{32}$/i;

export const prerender = false;

export async function GET({ locals, url }) {
  const { userId } = locals.auth();
  if (!userId) {
    return json({ error: 'Sign in required.' }, 401);
  }

  const zoneId = url.searchParams.get('zoneId') || '';
  if (!ZONE_ID_PATTERN.test(zoneId)) {
    return json({ error: 'zoneId must be a 32-character hex string.' }, 400);
  }

  try {
    const accessToken = await getTokenForUser(userId);
    const zones = await listCloudflareZones(accessToken);
    const zone = zones.find((candidate) => candidate.id === zoneId);
    if (!zone) {
      return json({ error: 'Zone is not available to the stored Cloudflare token.' }, 404);
    }

    const [botManagement, robots] = await Promise.all([
      inspectZoneBotManagement(accessToken, zone.id),
      inspectRobotsTxt(zone.name)
    ]);
    const assessment = assessCrawlerRisk({
      zone,
      botManagement,
      robots,
      now: new Date()
    });

    return json({
      scan: {
        scannedAt: new Date().toISOString(),
        readOnly: true,
        botManagement: {
          status: botManagement.status,
          message: botManagement.message || null,
          config: botManagement.status === 'available' ? botManagement.config : null
        },
        robots: {
          status: robots.status,
          url: robots.url,
          httpStatus: robots.httpStatus,
          contentType: robots.contentType,
          fetchedAt: robots.fetchedAt,
          location: robots.location || null,
          excerpt: robots.body?.slice(0, 12000) || null
        }
      },
      assessment
    });
  } catch (error) {
    return json({ error: error?.message || 'Crawler Guard scan failed.' }, 500);
  }
}
