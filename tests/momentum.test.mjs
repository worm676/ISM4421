import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rsiSeries, macdSeries, momentum } from "../netlify/lib/momentum.mjs";

const { closes } = JSON.parse(readFileSync(new URL("./fixtures/aapl-daily-closes.json", import.meta.url)));
const bars = (cs) => cs.map((close, i) => ({ t: Date.UTC(2026, 0, 1) + i * 86400000, close, volume: 1 }));
const near = (a, b, tol = 0.005) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test("RSI and MACD match Robinhood's values for AAPL (Oct 1, 2, 5 2026)", () => {
  // Robinhood get_equity_technical_indicators, interval=day, same date range.
  const rh = [
    { rsi: 51.433, macd: 4.0834, signal: 5.0733, hist: -0.98997 },
    { rsi: 54.720, macd: 3.8073, signal: 4.8201, hist: -1.01281 },
    { rsi: 53.789, macd: 3.4838, signal: 4.5529, hist: -1.06904 },
  ];
  const r = rsiSeries(closes), m = macdSeries(closes);
  rh.forEach((x, k) => {
    const i = closes.length - 3 + k;
    near(r[i], x.rsi);
    near(m[i].macd, x.macd);
    near(m[i].signal, x.signal);
    near(m[i].hist, x.hist);
  });
});

test("momentum rates AAPL: RSI bullish but fading, MACD below its signal", () => {
  const mo = momentum(bars(closes));
  assert.equal(mo.rsi.zone, "bullish");
  assert.equal(mo.rsi.change5d, -8); // 61.79 -> 53.79 over 5 sessions
  assert.equal(mo.rsi.label, "Bullish, fading");
  assert.equal(mo.rsi.stance, "neutral");
  assert.equal(mo.macd.stance, "wait");
  assert.equal(mo.macd.histogram, -1.07);
  assert.equal(mo.macd.lastCross.direction, "bearish");
});

test("RSI zones and MACD crossovers on simple series", () => {
  const up = Array.from({ length: 60 }, (_, i) => 100 + i);
  assert.equal(momentum(bars(up)).rsi.zone, "overbought");
  assert.equal(momentum(bars(up)).rsi.stance, "wait");
  const down = Array.from({ length: 60 }, (_, i) => 200 - i);
  assert.equal(momentum(bars(down)).rsi.zone, "oversold");
  assert.equal(momentum(bars(down)).rsi.stance, "buy");
  // Accelerating sell-off, then a recovery: MACD crosses back above its signal below zero.
  const fall = Array.from({ length: 50 }, (_, i) => 200 - 0.03 * i * i);
  const vee = [...fall, ...Array.from({ length: 12 }, (_, i) => fall[49] + 3 * (i + 1))];
  const mv = momentum(bars(vee)).macd;
  assert.equal(mv.stance, "buy");
  assert.equal(mv.lastCross.direction, "bullish");
  assert.equal(mv.lastCross.aboveZero, false);
  assert.ok(mv.lastCross.barsAgo <= 10);
  assert.match(mv.label, /crossover/);
  // Accelerating rally, then a drop: a bearish crossover above zero.
  const peak = [...Array.from({ length: 50 }, (_, i) => 100 + 0.03 * i * i), ...Array.from({ length: 8 }, (_, i) => 173.5 - 3 * (i + 1))];
  const mp = momentum(bars(peak)).macd;
  assert.equal(mp.stance, "wait");
  assert.equal(mp.lastCross.direction, "bearish");
  assert.equal(mp.lastCross.aboveZero, true);
});

test("a perfectly flat MACD (rounding noise only) never reports a crossover", () => {
  const line = Array.from({ length: 80 }, (_, i) => 200 - i);
  assert.equal(momentum(bars(line)).macd.lastCross, null);
});

test("too little history returns nulls instead of made-up numbers", () => {
  const mo = momentum(bars([1, 2, 3]));
  assert.equal(mo.rsi, null);
  assert.equal(mo.macd, null);
});
