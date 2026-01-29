export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Use POST" };
  }

  try {
    const { apiToken, zoneId } = JSON.parse(event.body || "{}");

    if (!apiToken || !zoneId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valid: false, error: "apiToken and zoneId are required" })
      };
    }

    // First, verify the token is valid at all
    const tokenCheckRes = await fetch("https://api.cloudflare.com/client/v4/user/tokens/verify", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Content-Type": "application/json"
      }
    });

    const tokenCheckData = await tokenCheckRes.json();

    if (!tokenCheckRes.ok || !tokenCheckData.success) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          valid: false,
          error: "Invalid API token. Please check that you copied the full token."
        })
      };
    }

    // Now validate access to the specific zone
    const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Content-Type": "application/json"
      }
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      const cfError = data.errors?.[0];
      let errorMsg = "Unable to access this zone.";

      if (cfError?.code === 7003 || res.status === 403) {
        errorMsg = "Token doesn't have permission for this zone. Ensure your token includes Zone:Read and Zone.Analytics:Read permissions for this zone.";
      } else if (cfError?.code === 7000 || res.status === 404) {
        errorMsg = "Zone not found. Please check the Zone ID is correct (32-character hex string from your domain's Overview page).";
      } else if (cfError?.message) {
        errorMsg = cfError.message;
      }

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valid: false, error: errorMsg })
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        valid: true,
        zoneName: data.result.name,
        zoneId: data.result.id
      })
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ valid: false, error: String(e?.message || e) })
    };
  }
}
