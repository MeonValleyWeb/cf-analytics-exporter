export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Use POST" };
    }

    const token = process.env.CF_API_TOKEN;
    if (!token) return { statusCode: 500, body: "Missing CF_API_TOKEN" };

    const {
      zoneId,     // required
      from,       // ISO: "2025-09-01T00:00:00Z"
      to,         // ISO: "2025-10-01T00:00:00Z"
      hostname,   // optional
      format      // "json" | "csv"
    } = JSON.parse(event.body || "{}");

    if (!zoneId || !from || !to) {
      return { statusCode: 400, body: "zoneId, from, to are required" };
    }

    const hostFilter = hostname ? `, clientRequestHTTPHost: "${hostname}"` : "";

    // Inline values to avoid schema type mismatch
    const query = `
    {
      viewer {
        zones(filter: { zoneTag: "${zoneId}" }) {
          httpRequestsAdaptiveGroups(
            limit: 1000,
            filter: {
              datetime_geq: "${from}",
              datetime_lt:  "${to}",
              requestSource: "eyeball"${hostFilter}
            }
          ) {
            dimensions { datetimeHour }
            sum { visits edgeResponseBytes }
          }
        }
      }
    }`;

    const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ query }),
    });

    if (!res.ok) {
      const text = await res.text();
      return { statusCode: res.status, body: text };
    }

    const data = await res.json();
    const groups = data?.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups || [];

    if (format === "csv") {
      const header = "datetimeHour,visits,edgeResponseBytes";
      const rows = groups.map(g =>
        [g.dimensions.datetimeHour, g.sum?.visits ?? 0, g.sum?.edgeResponseBytes ?? 0].join(",")
      );
      const csv = [header, ...rows].join("\n");
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="cf_${zoneId}.csv"`
        },
        body: csv
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(groups)
    };
  } catch (e) {
    return { statusCode: 500, body: String(e?.message || e) };
  }
}