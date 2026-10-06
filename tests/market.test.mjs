import { test } from "node:test";
import assert from "node:assert/strict";
import { wmaTrend, weeklyVolatility, marketRegime, entryPlan, setupFor, buySignal } from "../netlify/lib/metrics.mjs";
import { getMarket, _resetMarketCache } from "../netlify/lib/market.mjs";
import handler from "../netlify/functions/market.mjs";

const rising = Array.from({ length: 260 }, (_, i) => 100 + i);
const falling = Array.from({ length: 260 }, (_, i) => 400 - i);

test("wmaTrend tells a rising 200 WMA from a falling one", () => {
  assert.equal(wmaTrend(rising).rising, true);
  assert.equal(wmaTrend(falling).rising, false);
  assert.equal(wmaTrend(rising.slice(0, 205)).rising, null); // needs 213 weeks
});

test("weeklyVolatility is the average absolute weekly move", () => {
  assert.equal(+weeklyVolatility([100, 110, 99]).toFixed(6), 10); // +10%, -10%
  assert.equal(weeklyVolatility([100]), null);
});

test("marketRegime: S&P 500 above its 200 WMA is a bull phase", () => {
  const up = marketRegime(rising);
  assert.equal(up.bull, true);
  assert.ok(up.distancePct > 0);
  assert.equal(marketRegime(falling).bull, false);
  assert.equal(marketRegime([1, 2, 3]), null);
});

test("setupFor follows the market and the stock's own trend", () => {
  const bullUp = { marketBull: true, wmaRising: true };
  // Article example: AAPL 8% above its 200 WMA in a bull market -> wait for a pullback to within 5%.
  assert.equal(setupFor(8, bullUp).key, "wait");
  assert.equal(setupFor(4, bullUp).key, "good");
  assert.equal(setupFor(-9, bullUp).key, "good");
  assert.equal(setupFor(-4, { marketBull: false, wmaRising: true }).key, "selective");
  assert.equal(setupFor(-4, { marketBull: true, wmaRising: false }).key, "breakdown");
  assert.equal(setupFor(-15, bullUp), null); // too far below for a pullback setup
  assert.equal(setupFor(20, bullUp), null);
  assert.equal(setupFor(-4, {}), null); // no context, no setup claim
});

test("buySignal carries the setup alongside the existing label", () => {
  const s = buySignal(97, 100, 1, { marketBull: true, wmaRising: true });
  assert.equal(s.label, "STRONG BUY");
  assert.equal(s.setup.key, "good");
  assert.equal(buySignal(97, 100, 1).setup, null);
});

test("entryPlan stages thirds around the WMA with a volatility-based stop", () => {
  const p = entryPlan(100, 3);
  assert.deepEqual(p.tranches.map((x) => +x.toFixed(2)), [105, 100, 95]);
  assert.equal(p.cushionPct, 6);
  assert.equal(+p.stop.toFixed(2), 89.3);
  assert.equal(entryPlan(100, 0.5).cushionPct, 3); // floor
  assert.equal(entryPlan(100, 20).cushionPct, 15); // cap
  assert.equal(entryPlan(null, 3), null);
});

const chartBody = (closes) => ({
  chart: { result: [{
    meta: { regularMarketPrice: closes.at(-1) },
    timestamp: closes.map((_, i) => 1_500_000_000 + i * 604800),
    indicators: { quote: [{ close: closes, volume: closes.map(() => 1e6) }] },
  }] },
});

test("getMarket reads ^GSPC and falls back to null when Yahoo fails", async () => {
  const orig = globalThis.fetch;
  try {
    _resetMarketCache();
    globalThis.fetch = async () => new Response("{}", { status: 500 });
    assert.equal(await getMarket(), null);
    globalThis.fetch = async (url) => {
      assert.ok(String(url).includes("%5EGSPC"));
      return new Response(JSON.stringify(chartBody(rising)));
    };
    assert.equal((await getMarket()).bull, true);
  } finally {
    globalThis.fetch = orig;
    _resetMarketCache();
  }
});

test("market handler returns market phase, trend, setup and entry plan", async () => {
  const orig = globalThis.fetch;
  _resetMarketCache();
  globalThis.fetch = async (url) => {
    const u = new URL(url);
    if (u.pathname.includes("%5EGSPC") || u.pathname.includes("^GSPC")) return new Response(JSON.stringify(chartBody(rising)));
    // Stock: rising for years, then pulls back to just above its 200 WMA.
    const closes = [...rising.slice(0, 255), 290, 285, 280, 275, 272];
    return new Response(JSON.stringify(chartBody(closes)));
  };
  try {
    const d = await (await handler(new Request("https://x/api/market?symbol=msft"))).json();
    assert.equal(d.market.bull, true);
    assert.equal(d.trend.rising, true);
    assert.equal(d.plan.tranches.length, 3);
    assert.ok(d.plan.stop < d.plan.tranches[2]);
    assert.ok(["good", "wait", null].includes(d.signal.setup?.key ?? null));
  } finally {
    globalThis.fetch = orig;
    _resetMarketCache();
  }
});
