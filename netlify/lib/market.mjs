// Long-term market phase, shared by every endpoint: the S&P 500 for stocks,
// Bitcoin for crypto. Cached in the warm function instance per symbol.
import { toBars, marketRegime } from "./metrics.mjs";
import { chart } from "./yahoo.mjs";

const TTL = 10 * 60 * 1000;
const cache = new Map();
export const MARKETS = { stocks: ["^GSPC", "S&P 500"], crypto: ["BTC-USD", "Bitcoin"] };

// Crypto pairs on Yahoo end in -USD (BTC-USD, UNI7083-USD).
export const isCrypto = (symbol) => /-USD$/.test(symbol);

export async function getMarket(kind = "stocks") {
  const [symbol, name] = MARKETS[kind];
  const hit = cache.get(symbol);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  try {
    const weekly = await chart(symbol, "1wk", "10y");
    const closes = toBars(weekly).map((b) => b.close);
    const value = marketRegime(closes, weekly.meta?.regularMarketPrice ?? closes.at(-1), symbol, name);
    cache.set(symbol, { at: Date.now(), value });
    return value;
  } catch {
    return hit?.value ?? null; // signals still work without market context
  }
}

export function _resetMarketCache() {
  cache.clear();
}
