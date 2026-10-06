// GET /api/crypto
// Crypto Sweetspot: the same 200-week moving average process as the stock
// Sweetspot, run on major cryptocurrencies, with Bitcoin's own 200 WMA
// standing in for the S&P 500 as the "market" check.
import { screenRow, sweetspotList, marketRegime } from "../lib/metrics.mjs";
import { spark, json } from "../lib/yahoo.mjs";
import { CRYPTO, CRYPTO_AS_OF } from "../lib/crypto.mjs";

const BATCH = 20;

export default async () => {
  const batches = [];
  for (let i = 0; i < CRYPTO.length; i += BATCH) batches.push(CRYPTO.slice(i, i + BATCH));
  const results = await Promise.all(batches.map((b) => spark(b.map(([s]) => s)).catch(() => null)));
  const data = Object.assign({}, ...results.filter(Boolean));

  const btc = data["BTC-USD"];
  const btcCloses = (btc?.close ?? []).filter((c) => c != null);
  const market = btc ? marketRegime(btcCloses, btc.fulldayPrice ?? btcCloses.at(-1), "BTC-USD", "Bitcoin") : null;

  const rows = [];
  let failed = 0;
  for (const [symbol, name] of CRYPTO) {
    if (data[symbol]) rows.push(screenRow(symbol, name, data[symbol], market));
    else failed++;
  }
  if (!rows.length) return json(502, { error: "Could not reach the market data source." });
  const ok = rows.filter((r) => r.signal?.distancePct != null);
  const sweetspot = sweetspotList(ok);
  return json(
    200,
    {
      asOf: CRYPTO_AS_OF,
      market,
      crypto: sweetspot.slice(0, 20),
      counts: { crypto: sweetspot.length, screened: ok.length, failed },
      fetchedAt: Date.now(),
    },
    "public, max-age=900"
  );
};

export const config = { path: "/api/crypto" };
