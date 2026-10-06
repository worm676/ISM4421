import { test } from "node:test";
import assert from "node:assert/strict";
import { analystConsensus, companyProfile } from "../netlify/lib/metrics.mjs";
import { _resetYahooSession } from "../netlify/lib/yahoo.mjs";
import handler from "../netlify/functions/profile.mjs";

const trend = (c) => ({ trend: [{ period: "0m", ...c }, { period: "-1m", strongBuy: 99, buy: 0, hold: 0, sell: 0, strongSell: 0 }] });

test("analystConsensus matches live Yahoo counts (checked Oct 2026)", () => {
  // AAPL: 6 strong buy, 19 buy, 13 hold, 3 sell, 3 strong sell
  const a = analystConsensus(trend({ strongBuy: 6, buy: 19, hold: 13, sell: 3, strongSell: 3 }), { targetMeanPrice: { raw: 328.09 } });
  assert.deepEqual([a.buy, a.hold, a.sell, a.analysts, a.verdict], [57, 29, 14, 44, "Buy"]);
  assert.equal(a.targetMean, 328.09);
  // SOFI: 4 + 5 buy, 12 hold, 2 + 2 sell
  const s = analystConsensus(trend({ strongBuy: 4, buy: 5, hold: 12, sell: 2, strongSell: 2 }));
  assert.deepEqual([s.buy, s.hold, s.sell, s.verdict], [36, 48, 16, "Hold"]);
});

test("analystConsensus always totals 100 and ties lean to Hold", () => {
  const t = analystConsensus(trend({ strongBuy: 0, buy: 1, hold: 1, sell: 1, strongSell: 0 }));
  assert.equal(t.buy + t.hold + t.sell, 100);
  assert.equal(analystConsensus(trend({ buy: 2, hold: 2 })).verdict, "Hold"); // BRK-B 50/50
  assert.equal(analystConsensus(trend({ sell: 3, hold: 1 })).verdict, "Sell");
  assert.equal(analystConsensus(trend({})), null);
  assert.equal(analystConsensus(undefined), null);
});

test("companyProfile pulls the description and key facts", () => {
  const p = companyProfile({ longBusinessSummary: "Makes phones.", sector: "Technology", industry: "Consumer Electronics", city: "Cupertino", state: "CA", country: "United States", fullTimeEmployees: 150000, website: "https://www.apple.com" });
  assert.equal(p.summary, "Makes phones.");
  assert.equal(p.headquarters, "Cupertino, CA, United States");
  assert.equal(companyProfile({ sector: "x" }), null);
  assert.equal(companyProfile(undefined), null);
});

test("profile handler gets a Yahoo session, then retries once on a stale crumb", async () => {
  const orig = globalThis.fetch;
  _resetYahooSession();
  const calls = [];
  let summaryCalls = 0;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    calls.push(u.split("?")[0]);
    if (u.startsWith("https://fc.yahoo.com")) return new Response("", { status: 404, headers: { "set-cookie": "A3=abc; Domain=.yahoo.com; Path=/" } });
    if (u.includes("getcrumb")) return new Response("crumb123");
    assert.equal(opts.headers.Cookie, "A3=abc");
    assert.ok(u.includes("crumb=crumb123"));
    if (++summaryCalls === 1) return new Response(JSON.stringify({ finance: { error: { description: "Invalid Crumb" } } }), { status: 401 });
    return new Response(JSON.stringify({ quoteSummary: { result: [{
      price: { longName: "Apple Inc." },
      assetProfile: { longBusinessSummary: "Apple designs phones.", sector: "Technology" },
      recommendationTrend: trend({ strongBuy: 6, buy: 19, hold: 13, sell: 3, strongSell: 3 }),
      financialData: { targetMeanPrice: { raw: 328 } },
    }] } }));
  };
  try {
    const res = await handler(new Request("https://x/api/profile?symbol=aapl"));
    assert.equal(res.status, 200);
    const d = await res.json();
    assert.equal(d.name, "Apple Inc.");
    assert.equal(d.profile.summary, "Apple designs phones.");
    assert.equal(d.consensus.buy, 57);
    assert.equal(calls.filter((c) => c.includes("getcrumb")).length, 2); // refreshed once after the 401
    assert.equal((await handler(new Request("https://x/api/profile?symbol=<x>"))).status, 400);
  } finally {
    globalThis.fetch = orig;
    _resetYahooSession();
  }
});

test("companyProfile reads crypto descriptions too", () => {
  assert.equal(companyProfile({ description: "Bitcoin (BTC) is a cryptocurrency launched in 2010." }).summary, "Bitcoin (BTC) is a cryptocurrency launched in 2010.");
});
