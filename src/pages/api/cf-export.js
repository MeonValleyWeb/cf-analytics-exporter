import { getTokenForUser } from '../../lib/server/cloudflare-token.js';

const queryBuilders = {
  traffic: (from, to, hostname) => {
    const hostFilter = hostname ? `, clientRequestHTTPHost: "${hostname}"` : '';
    return `
      traffic: httpRequests1hGroups(
        limit: 1000,
        filter: {
          datetime_geq: "${from}",
          datetime_lt: "${to}"${hostFilter}
        },
        orderBy: [datetime_ASC]
      ) {
        dimensions { datetime }
        sum { requests bytes pageViews threats }
        uniq { uniques }
      }
    `;
  },

  cache: (from, to, hostname) => {
    const hostFilter = hostname ? `, clientRequestHTTPHost: "${hostname}"` : '';
    return `
      cache: httpRequests1hGroups(
        limit: 1000,
        filter: {
          datetime_geq: "${from}",
          datetime_lt: "${to}"${hostFilter}
        }
      ) {
        sum { cachedRequests cachedBytes requests bytes }
      }
    `;
  }
};

async function executeQuery(apiToken, query) {
  const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({ query })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Cloudflare API error: ${res.status} - ${text}`);
  }

  const data = await res.json();

  if (data.errors && data.errors.length > 0) {
    throw new Error(`GraphQL error: ${data.errors[0].message}`);
  }

  return data;
}

function getDateChunks(from, to) {
  const chunks = [];
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const maxChunkMs = 24 * 60 * 60 * 1000;

  let chunkStart = fromDate;
  while (chunkStart < toDate) {
    let chunkEnd = new Date(chunkStart.getTime() + maxChunkMs);
    if (chunkEnd > toDate) {
      chunkEnd = toDate;
    }

    chunks.push({
      from: chunkStart.toISOString(),
      to: chunkEnd.toISOString()
    });

    chunkStart = chunkEnd;
  }

  return chunks;
}

function transformTrafficData(data) {
  return (data || []).map((item) => ({
    dimensions: { datetimeHour: item.dimensions?.datetime },
    sum: {
      visits: item.uniq?.uniques || 0,
      edgeResponseBytes: item.sum?.bytes || 0,
      pageViews: item.sum?.pageViews || 0,
      threats: item.sum?.threats || 0
    },
    count: item.sum?.requests || 0
  }));
}

function transformCacheData(data) {
  let totalCached = 0;
  let totalUncached = 0;
  let cachedBytes = 0;
  let uncachedBytes = 0;

  (data || []).forEach((item) => {
    totalCached += item.sum?.cachedRequests || 0;
    cachedBytes += item.sum?.cachedBytes || 0;
    const uncachedReqs = (item.sum?.requests || 0) - (item.sum?.cachedRequests || 0);
    totalUncached += uncachedReqs;
    uncachedBytes += (item.sum?.bytes || 0) - (item.sum?.cachedBytes || 0);
  });

  const results = [];
  if (totalCached > 0) {
    results.push({
      dimensions: { cacheStatus: 'hit' },
      count: totalCached,
      sum: { edgeResponseBytes: cachedBytes }
    });
  }
  if (totalUncached > 0) {
    results.push({
      dimensions: { cacheStatus: 'miss' },
      count: totalUncached,
      sum: { edgeResponseBytes: uncachedBytes }
    });
  }

  return results;
}

function formatCSV(results, metricType) {
  const data = results[metricType] || [];

  switch (metricType) {
    case 'traffic':
      return {
        header: 'datetime,unique_visitors,requests,bytes,page_views,threats',
        rows: data.map((g) =>
          [
            g.dimensions.datetimeHour,
            g.sum?.visits ?? 0,
            g.count ?? 0,
            g.sum?.edgeResponseBytes ?? 0,
            g.sum?.pageViews ?? 0,
            g.sum?.threats ?? 0
          ].join(',')
        )
      };

    case 'cache':
      return {
        header: 'cacheStatus,count,bytes',
        rows: data.map((g) =>
          [g.dimensions.cacheStatus || 'unknown', g.count, g.sum?.edgeResponseBytes ?? 0].join(',')
        )
      };

    default:
      return { header: '', rows: [] };
  }
}

export const prerender = false;

export async function POST({ request, locals }) {
  try {
    const { apiToken, userId, zoneId, from, to, hostname, format } = await request.json();

    let resolvedToken = apiToken;
    if (!resolvedToken && userId) {
      resolvedToken = await getTokenForUser(userId, locals);
    }

    if (!resolvedToken) {
      return new Response(JSON.stringify({ error: 'apiToken or userId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!zoneId || !from || !to) {
      return new Response(JSON.stringify({ error: 'zoneId, from, and to are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const chunks = getDateChunks(from, to);
    let allTrafficData = [];
    let allCacheData = [];

    for (const chunk of chunks) {
      const queryParts = [
        queryBuilders.traffic(chunk.from, chunk.to, hostname),
        queryBuilders.cache(chunk.from, chunk.to, hostname)
      ];

      const fullQuery = `
      {
        viewer {
          zones(filter: { zoneTag: "${zoneId}" }) {
            ${queryParts.join('\n')}
          }
        }
      }`;

      const data = await executeQuery(resolvedToken, fullQuery);
      const zoneData = data?.data?.viewer?.zones?.[0] || {};

      if (zoneData.traffic) {
        allTrafficData = allTrafficData.concat(zoneData.traffic);
      }
      if (zoneData.cache) {
        allCacheData = allCacheData.concat(zoneData.cache);
      }
    }

    const trafficData = transformTrafficData(allTrafficData);
    const cacheData = transformCacheData(allCacheData);

    let totalThreats = 0;
    let totalRequests = 0;
    trafficData.forEach((item) => {
      totalThreats += item.sum?.threats || 0;
      totalRequests += item.count || 0;
    });

    const statusData = [];
    const successRequests = totalRequests - totalThreats;
    if (successRequests > 0) {
      statusData.push({ dimensions: { edgeResponseStatus: 'Success' }, count: successRequests });
    }
    if (totalThreats > 0) {
      statusData.push({ dimensions: { edgeResponseStatus: 'Threats Blocked' }, count: totalThreats });
    }

    const results = {
      traffic: trafficData,
      status: statusData,
      geo: [],
      cache: cacheData,
      security:
        totalThreats > 0 ? [{ dimensions: { action: 'blocked' }, count: totalThreats }] : []
    };

    if (format === 'csv') {
      const csvParts = [];
      const { header, rows } = formatCSV(results, 'traffic');
      if (rows.length > 0) {
        csvParts.push('# TRAFFIC');
        csvParts.push(header);
        csvParts.push(...rows);
        csvParts.push('');
      }

      const cacheCSV = formatCSV(results, 'cache');
      if (cacheCSV.rows.length > 0) {
        csvParts.push('# CACHE');
        csvParts.push(cacheCSV.header);
        csvParts.push(...cacheCSV.rows);
        csvParts.push('');
      }

      return new Response(csvParts.join('\n'), {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="cf_analytics_${zoneId}.csv"`
        }
      });
    }

    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    const errorMsg = e?.message || String(e);

    if (errorMsg.includes('does not have access')) {
      return new Response(
        JSON.stringify({
          error:
            'Your Cloudflare zone may have limited analytics access. Try selecting the 24h time range.'
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    return new Response(JSON.stringify({ error: errorMsg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
