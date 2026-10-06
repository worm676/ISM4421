// GET /api/screen
// Screens every S&P 500 stock against its 200-week moving average and returns
// up to 20 at or below it and up to 20 "extended" (more than 30% above it).
import { screenRow, screenLists } from "../lib/metrics.mjs";
import { spark, json } from "../lib/yahoo.mjs";
import { SP500, SP500_AS_OF } from "../lib/sp500.mjs";
import { getMarket } from "../lib/market.mjs";

const BATCH = 20; // Yahoo's spark endpoint caps symbols per call

export default async () => {
  const market = await getMarket();
  const batches = [];
  for (let i = 0; i < SP500.length; i += BATCH) batches.push(SP500.slice(i, i + BATCH));

  const rows = [];
  let failed = 0, next = 0;
  const worker = async () => {
    while (next < batches.length) {
      const batch = batches[next++];
      try {
        const data = await spark(batch.map(([s]) => s));
        for (const [symbol, name] of batch) {
          if (data[symbol]) rows.push(screenRow(symbol, name, data[symbol], market));
          else failed++;
        }
      } catch {
        failed += batch.length;
      }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));

  if (!rows.length) return json(502, { error: "Could not reach the market data source." });
  const lists = screenLists(rows, 20);
  return json(200, { asOf: SP500_AS_OF, market, ...lists, counts: { ...lists.counts, failed }, fetchedAt: Date.now() }, "public, max-age=900");
};

export const config = { path: "/api/screen" };
