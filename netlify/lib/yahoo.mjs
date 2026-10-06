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

// quoteSummary (company profile, analyst ratings) needs a session cookie and
// a matching "crumb" token. Fetch them once and reuse while the function is warm.
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
let session = null;

async function getSession(force = false) {
  if (session && !force && Date.now() - session.at < 30 * 60 * 1000) return session;
  const res = await fetch("https://fc.yahoo.com/", { headers: { "User-Agent": BROWSER_UA }, redirect: "manual" });
  const setCookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [res.headers.get("set-cookie")].filter(Boolean);
  const cookie = setCookies.map((c) => c.split(";")[0]).join("; ");
  if (!cookie) throw new Error("Yahoo did not return a session cookie");
  const crumbRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", { headers: { "User-Agent": BROWSER_UA, Cookie: cookie } });
  const crumb = (await crumbRes.text()).trim();
  if (!crumbRes.ok || !crumb || crumb.includes("<") || crumb.length > 40) throw new Error(`Yahoo crumb request failed (HTTP ${crumbRes.status})`);
  session = { cookie, crumb, at: Date.now() };
  return session;
}

export async function quoteSummary(symbol, modules) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { cookie, crumb } = await getSession(attempt > 0);
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules.join(",")}&crumb=${encodeURIComponent(crumb)}`;
    const res = await fetch(url, { headers: { "User-Agent": BROWSER_UA, Cookie: cookie } });
    const body = await res.json().catch(() => null);
    const result = body?.quoteSummary?.result?.[0];
    if (result) return result;
    const desc = body?.quoteSummary?.error?.description || body?.finance?.error?.description || `HTTP ${res.status}`;
    // A stale crumb comes back as 401 "Invalid Crumb": refresh the session once and retry.
    if (res.status !== 401 || attempt > 0) throw new Error(`Yahoo profile unavailable: ${desc}`);
  }
}

export function _resetYahooSession() {
  session = null;
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
