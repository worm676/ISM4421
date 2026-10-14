// GET /api/futures
// Near-live futures with a short-term BUY / SELL / NEUTRAL signal from
// 15-minute MACD (12, 26, 9), RSI (14) and Stochastic (14, 3, 3). Yahoo futures data is delayed
// by up to ~10-15 minutes. Cached 60 seconds.
import { chart, json } from "../lib/yahoo.mjs";
import { FUTURES, futuresSignal } from "../lib/futures.mjs";

async function row([symbol, name, group]) {
  try {
    const r = await chart(symbol, "15m", "5d");
    // Futures bars can carry a null volume; keep any bar with a close.
    const ts = r.timestamp ?? [], q = r.indicators?.quote?.[0] ?? {};
    const bars = ts.map((t, i) => ({ t: t * 1000, close: q.close?.[i], high: q.high?.[i], low: q.low?.[i], volume: q.volume?.[i] ?? 0 })).filter((b) => b.close != null);
    if (bars.length < 40) throw new Error("not enough intraday data");
    const price = r.meta?.regularMarketPrice ?? bars.at(-1).close;
    const prev = r.meta?.chartPreviousClose ?? r.meta?.previousClose ?? null;
    // Prior settle: last close before the most recent trading day's bars.
    const lastDay = new Date(bars.at(-1).t).toISOString().slice(0, 10);
    const prior = [...bars].reverse().find((b) => new Date(b.t).toISOString().slice(0, 10) < lastDay)?.close ?? prev;
    return {
      symbol, name, group, price,
      changePct: prior ? ((price - prior) / prior) * 100 : null,
      asOf: (r.meta?.regularMarketTime ?? bars.at(-1).t / 1000) * 1000,
      spark: bars.slice(-26).map((b) => b.close), // last ~6.5 hours
      ...futuresSignal(bars),
    };
  } catch (err) {
    return { symbol, name, group, error: err.message };
  }
}

export default async () => {
  const rows = await Promise.all(FUTURES.map(row));
  if (rows.every((r) => r.error)) return json(502, { error: "Could not reach the futures data source." });
  return json(200, { interval: "15m", futures: rows, fetchedAt: Date.now() }, "public, max-age=60");
};

export const config = { path: "/api/futures" };
