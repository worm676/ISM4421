import { test } from "node:test";
import assert from "node:assert/strict";
import { toBars, volumeSummary, wma200, buySignal } from "../netlify/lib/metrics.mjs";
import handler from "../netlify/functions/market.mjs";

const yahoo = (n, closeFn, volFn, stepSec = 604800) => ({
  meta: { regularMarketPrice: closeFn(n - 1), currency: "USD", shortName: "Test Co", chartPreviousClose: 99 },
  timestamp: Array.from({ length: n }, (_, i) => 1_600_000_000 + i * stepSec),
  indicators: { quote: [{ close: Array.from({ length: n }, (_, i) => closeFn(i)), volume: Array.from({ length: n }, (_, i) => volFn(i)) }] },
});

test("toBars drops null rows", () => {
  const r = yahoo(3, () => 1, () => 10);
  r.indicators.quote[0].close[1] = null;
  assert.equal(toBars(r).length, 2);
});

test("volumeSummary uses last completed bar vs prior average", () => {
  const bars = [100, 100, 100, 300, 50].map((v, i) => ({ t: i, close: 1, volume: v }));
  const s = volumeSummary(bars, 10);
  assert.equal(s.current, 50);
  assert.equal(s.lastComplete, 300);
  assert.equal(s.average, 100);
  assert.equal(s.relativeVolume, 3);
});

test("wma200 averages the last 200 weekly closes", () => {
  const bars = Array.from({ length: 250 }, (_, i) => ({ t: i, close: i + 1, volume: 1 }));
  const w = wma200(bars);
  // closes 51..250 -> mean 150.5
  assert.equal(w.value, 150.5);
  assert.equal(w.line[198].wma, null);
  assert.equal(w.line[199].wma, 100.5);
});

test("wma200 is null with under 200 weeks", () => {
  assert.equal(wma200([{ t: 0, close: 1, volume: 1 }]).value, null);
});

test("buySignal levels", () => {
  assert.equal(buySignal(95, 100, 1).level, "strong");
  assert.equal(buySignal(105, 100, 1).level, "buy");
  assert.equal(buySignal(120, 100, 1).level, "watch");
  assert.equal(buySignal(140, 100, 1).level, "extended");
  assert.equal(buySignal(100, null, 1).level, "na");
  assert.equal(buySignal(95, 100, 2).volumeConfirmed, true);
});

test("handler returns full payload from mocked Yahoo", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const interval = new URL(url).searchParams.get("interval");
    const n = { "60m": 140, "1d": 125, "1wk": 520, "1mo": 60 }[interval];
    return new Response(JSON.stringify({ chart: { result: [yahoo(n, (i) => 100 + i * 0.1, (i) => 1e6 + i)] } }));
  };
  try {
    const res = await handler(new Request("https://x/api/market?symbol=aapl"));
    assert.equal(res.status, 200);
    const d = await res.json();
    assert.equal(d.symbol, "AAPL");
    for (const tf of ["hour", "day", "week", "month"]) assert.ok(d.volume[tf].average > 0, tf);
    assert.ok(d.wma200.value > 0);
    assert.equal(d.wma200.line.length, 260);
    assert.ok(["strong", "buy", "watch", "extended"].includes(d.signal.level));
  } finally {
    globalThis.fetch = orig;
  }
});

test("handler rejects bad symbols", async () => {
  const res = await handler(new Request("https://x/api/market?symbol=<script>"));
  assert.equal(res.status, 400);
});
