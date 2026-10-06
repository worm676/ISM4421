import { test } from "node:test";
import assert from "node:assert/strict";
import { screenRow, screenLists } from "../netlify/lib/metrics.mjs";
import handler from "../netlify/functions/screen.mjs";
import { SP500 } from "../netlify/lib/sp500.mjs";

// 200 weekly closes of 100 then a final price, so the 200 WMA sits near 100.
const entry = (price) => ({ close: [...Array(199).fill(100), price], fulldayPrice: price, fulldayChangePercent: 1.2 });

test("screenRow computes distance to the 200 WMA from weekly closes", () => {
  const r = screenRow("ABC", "Abc Co", entry(80));
  assert.equal(r.price, 80);
  assert.equal(r.changePct, 1.2);
  assert.equal(r.wma200, (199 * 100 + 80) / 200);
  assert.equal(r.signal.level, "weak");
  assert.equal(screenRow("X", "X", { close: [1, 2] }).signal.level, "na");
});

test("screenLists caps at 20 and sorts each list", () => {
  const rows = [
    ...Array.from({ length: 25 }, (_, i) => screenRow(`B${i}`, "b", entry(99 - i))),
    ...Array.from({ length: 22 }, (_, i) => screenRow(`E${i}`, "e", entry(150 + i * 5))),
    screenRow("W", "w", entry(115)),
    screenRow("N", "n", { close: [] }),
  ];
  const l = screenLists(rows, 20);
  assert.equal(l.below.length, 20);
  assert.equal(l.extended.length, 20);
  assert.deepEqual(l.counts, { below: 25, sweetspot: 6, extended: 22, screened: 48 });
  assert.equal(l.below[0].symbol, "B24"); // deepest below first
  assert.equal(l.extended[0].symbol, "E21"); // most extended first
  assert.ok(l.below.every((r) => r.signal.distancePct <= 0));
  assert.ok(l.extended.every((r) => r.signal.level === "extended"));
});

test("screen handler batches every S&P 500 symbol", async () => {
  const orig = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url) => {
    const syms = new URL(url).searchParams.get("symbols").split(",");
    assert.ok(syms.length <= 20);
    seen.push(...syms);
    return new Response(JSON.stringify(Object.fromEntries(syms.map((s, i) => [s, entry(i % 2 ? 90 : 140)]))));
  };
  try {
    const res = await handler();
    assert.equal(res.status, 200);
    const d = await res.json();
    assert.equal(new Set(seen).size, SP500.length);
    assert.equal(d.counts.screened, SP500.length);
    assert.equal(d.below.length, 20);
    assert.equal(d.extended.length, 20);
  } finally {
    globalThis.fetch = orig;
  }
});

test("screen handler returns 502 when the data source is down", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => new Response("{}", { status: 500 });
  try {
    assert.equal((await handler()).status, 502);
  } finally {
    globalThis.fetch = orig;
  }
});

test("screenLists builds the sweetspot list: turning up first, then closest to the WMA", () => {
  const rows = [
    screenRow("A", "a", entry(99.4)), // ~-0.5%
    screenRow("B", "b", entry(95)), // ~-4.9%
    screenRow("C", "c", entry(100.9)), // ~+1.0%, at the WMA
    screenRow("D", "d", entry(92)), // ~-7.9%, too far below
    screenRow("E", "e", entry(102)), // ~+2.1%
    screenRow("F", "f", entry(114)), // ~+14%, too far above
  ];
  rows[1].turningUp = true;
  const l = screenLists(rows, 20);
  assert.deepEqual(l.sweetspot.map((r) => r.symbol), ["B", "A", "C", "E"]);
  assert.equal(l.counts.sweetspot, 4);
});

test("screenRow flags turningUp against last week's close, ignoring a repeated current bar", () => {
  const day = 86400, t0 = 1_700_000_000;
  const mk = (closes) => ({
    close: closes,
    timestamp: closes.map((_, i) => (i === closes.length - 1 ? t0 + (i - 1) * 7 * day + 2 * day : t0 + i * 7 * day)),
    fulldayPrice: closes.at(-1),
  });
  // Last two bars are the same in-progress week; last week's close is 100.
  assert.equal(screenRow("U", "u", mk([...Array(198).fill(100), 100, 103, 103])).turningUp, true);
  assert.equal(screenRow("D", "d", mk([...Array(198).fill(100), 100, 97, 97])).turningUp, false);
});
