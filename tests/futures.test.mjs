import { test } from "node:test";
import assert from "node:assert/strict";
import { stochasticSeries } from "../netlify/lib/momentum.mjs";
import { futuresSignal, FUTURES } from "../netlify/lib/futures.mjs";
import handler from "../netlify/functions/futures.mjs";

const near = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test("Stochastic %K/%D: hand-checked steady channel", () => {
  // Each bar: low i, close i+1, high i+2. 14-bar range = (i+2) - (i-13) = 15; close sits 14 above the low.
  const bars = Array.from({ length: 20 }, (_, i) => ({ low: i, close: i + 1, high: i + 2 }));
  const s = stochasticSeries(bars);
  assert.equal(s[14].k, null); // needs 14 + 3 - 1 bars for %K
  near(s[15].k, (14 / 15) * 100);
  near(s.at(-1).d, (14 / 15) * 100);
  // Close at the very top of the range -> 100; at the bottom -> 0.
  const top = Array.from({ length: 20 }, (_, i) => ({ low: i, close: i + 2, high: i + 2 }));
  near(stochasticSeries(top).at(-1).k, 100);
  const bottom = Array.from({ length: 20 }, (_, i) => ({ low: 50 - i, close: 50 - i, high: 52 - i }));
  near(stochasticSeries(bottom).at(-1).k, 0);
});

// 15-minute bars from a close series, with a small high/low band around each close.
const bars = (closes, band = 0.2) => closes.map((close, i) => ({ t: i * 900000, close, high: close + band, low: close - band, volume: 1 }));

test("futuresSignal: steady climb in a range is BUY, steady slide is SELL", () => {
  const wave = (i) => Math.sin(i / 5) * 2;
  const up = Array.from({ length: 120 }, (_, i) => 100 + i * 0.05 + wave(i));
  const down = Array.from({ length: 120 }, (_, i) => 100 - i * 0.05 - wave(i));
  for (const [cs, want] of [[up, "BUY"], [down, "SELL"]]) {
    const s = futuresSignal(bars(cs));
    if (s.stochZone === "normal") assert.equal(s.signal, want, s.reason);
    else assert.equal(s.signal, "NEUTRAL");
  }
});

test("futuresSignal: Stochastic overbought/oversold forces NEUTRAL with a lean", () => {
  const rip = Array.from({ length: 80 }, (_, i) => 100 + i * 0.5);
  const o = futuresSignal(bars(rip));
  assert.equal(o.stochZone, "overbought");
  assert.equal(o.signal, "NEUTRAL");
  assert.equal(o.lean, "down");
  const dump = Array.from({ length: 80 }, (_, i) => 200 - i * 0.5);
  const u = futuresSignal(bars(dump));
  assert.equal(u.stochZone, "oversold");
  assert.equal(u.signal, "NEUTRAL");
  assert.equal(u.lean, "up");
  assert.match(u.reason, /Oversold \(Stoch \d+\)/);
});

test("futuresSignal with too few bars says so instead of guessing", () => {
  const s = futuresSignal(bars([1, 2, 3]));
  assert.equal(s.signal, "NEUTRAL");
  assert.equal(s.reason, "Not enough recent bars.");
});

test("futures endpoint returns every contract, and a per-row error for bad data", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const sym = decodeURIComponent(new URL(url).pathname.split("/").pop());
    if (sym === "NG=F") return new Response(JSON.stringify({ chart: { result: null, error: { description: "No data found" } } }), { status: 404 });
    const n = 200, closes = Array.from({ length: n }, (_, i) => 100 + Math.sin(i / 7) * 3 + i * 0.02);
    return new Response(JSON.stringify({ chart: { result: [{
      meta: { regularMarketPrice: closes.at(-1), regularMarketTime: 1_792_000_000 },
      timestamp: closes.map((_, i) => 1_791_820_000 + i * 900),
      indicators: { quote: [{ close: closes, high: closes.map((c) => c + 0.3), low: closes.map((c) => c - 0.3), volume: closes.map(() => null) }] },
    }] } }));
  };
  try {
    const res = await handler();
    assert.equal(res.status, 200);
    const d = await res.json();
    assert.equal(d.futures.length, FUTURES.length);
    const ng = d.futures.find((f) => f.symbol === "NG=F");
    assert.ok(ng.error);
    const es = d.futures.find((f) => f.symbol === "ES=F");
    assert.ok(["BUY", "SELL", "NEUTRAL"].includes(es.signal));
    assert.ok(es.stochK >= 0 && es.stochK <= 100);
    assert.equal(es.spark.length, 26);
  } finally {
    globalThis.fetch = orig;
  }
});
