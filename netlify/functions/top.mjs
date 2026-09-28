// GET /api/top
// Snapshot of the 20 largest S&P 500 constituents: price, day change,
// day volume, relative volume, and 200-week moving average signal.
import { toBars, volumeSummary, wma200, buySignal } from "../lib/metrics.mjs";
import { chart, json } from "../lib/yahoo.mjs";
import { TOP_20, TOP_20_AS_OF } from "../lib/top20.mjs";

async function snapshot([symbol, name], rank) {
  try {
    const [daily, weekly] = await Promise.all([chart(symbol, "1d", "3mo"), chart(symbol, "1wk", "5y")]);
    const dailyBars = toBars(daily);
    const day = volumeSummary(dailyBars, 30);
    const wma = wma200(toBars(weekly)).value;
    const price = daily.meta?.regularMarketPrice ?? dailyBars.at(-1)?.close ?? null;
    const prevClose = dailyBars.length >= 2 ? dailyBars.at(-2).close : null;
    return {
      rank, symbol, name, price,
      changePct: price != null && prevClose ? ((price - prevClose) / prevClose) * 100 : null,
      dayVolume: day?.current ?? null,
      relativeVolume: day?.relativeVolume ?? null,
      wma200: wma,
      signal: buySignal(price, wma, day?.relativeVolume ?? null),
    };
  } catch (err) {
    return { rank, symbol, name, error: err.message };
  }
}

export default async () => {
  // Limit concurrency so we don't hammer the data source.
  const results = new Array(TOP_20.length);
  let next = 0;
  const worker = async () => {
    while (next < TOP_20.length) {
      const i = next++;
      results[i] = await snapshot(TOP_20[i], i + 1);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return json(200, { asOf: TOP_20_AS_OF, stocks: results, fetchedAt: Date.now() }, "public, max-age=300");
};

export const config = { path: "/api/top" };
