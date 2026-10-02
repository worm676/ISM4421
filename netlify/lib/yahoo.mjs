// Yahoo Finance public chart API client + shared JSON response helper.

const HOSTS = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];

export async function chart(symbol, interval, range) {
  let lastErr;
  for (const host of HOSTS) {
    const url = `${host}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&includePrePost=false`;
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (FAU Owl Volume Tracker)" } });
      const body = await res.json().catch(() => null);
      const result = body?.chart?.result?.[0];
      if (result) return result;
      lastErr = new Error(body?.chart?.error?.description || `Yahoo returned HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

// Batch weekly closes for up to 20 symbols in one call. Returns { SYMBOL: { close: [...], fulldayPrice, fulldayChangePercent } }.
export async function spark(symbols, range = "5y", interval = "1wk") {
  let lastErr;
  for (const host of HOSTS) {
    const url = `${host}/v8/finance/spark?symbols=${symbols.map(encodeURIComponent).join(",")}&range=${range}&interval=${interval}`;
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (FAU Owl Volume Tracker)" } });
      const body = await res.json().catch(() => null);
      if (res.ok && body && typeof body === "object" && !body.spark?.error) return body;
      lastErr = new Error(body?.spark?.error?.description || `Yahoo returned HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

export const json =(status, data, cache = "no-store") =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": cache,
      "Netlify-CDN-Cache-Control": cache,
    },
  });
