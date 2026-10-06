// S&P 500 long-term market phase, shared by every endpoint.
// Cached in the warm function instance so each request doesn't refetch it.
import { toBars, marketRegime } from "./metrics.mjs";
import { chart } from "./yahoo.mjs";

const TTL = 10 * 60 * 1000;
let cached = null;

export async function getMarket() {
  if (cached && Date.now() - cached.at < TTL) return cached.value;
  try {
    const weekly = await chart("^GSPC", "1wk", "10y");
    const closes = toBars(weekly).map((b) => b.close);
    const value = marketRegime(closes, weekly.meta?.regularMarketPrice ?? closes.at(-1));
    cached = { at: Date.now(), value };
    return value;
  } catch {
    return cached?.value ?? null; // signals still work without market context
  }
}

export function _resetMarketCache() {
  cached = null;
}
