import { test } from "node:test";
import assert from "node:assert/strict";
import { searchName, parseRss, pickPartnerships, partnershipNews } from "../netlify/lib/news.mjs";

const item = (title, source, date, link = "https://news.google.com/rss/articles/x") =>
  `<item><title>${title} - ${source}</title><link>${link}</link><pubDate>${date}</pubDate><source url="https://x">${source}</source></item>`;

test("searchName strips company suffixes so the news search matches headlines", () => {
  assert.equal(searchName("Apple Inc."), "Apple");
  assert.equal(searchName("SoFi Technologies, Inc."), "SoFi");
  assert.equal(searchName("JPMorgan Chase & Co."), "JPMorgan Chase");
  assert.equal(searchName("Procter & Gamble Company (The)"), "Procter & Gamble");
  assert.equal(searchName("Bitcoin USD"), "Bitcoin");
  assert.equal(searchName(""), "");
});

test("parseRss reads Google News items and drops the appended source name", () => {
  const xml = `<rss><channel>${item("Persona Partners With Chainlink &amp; More", "Business Wire", "Tue, 05 May 2026 13:00:00 GMT")}</channel></rss>`;
  const [n] = parseRss(xml);
  assert.equal(n.title, "Persona Partners With Chainlink & More");
  assert.equal(n.source, "Business Wire");
  assert.equal(n.published, Date.parse("2026-05-05T13:00:00Z"));
  assert.ok(n.link.startsWith("https://"));
});

test("pickPartnerships keeps real deals, skips firm names and duplicates, newest first", () => {
  // Headlines seen in the live check (Oct 2026).
  const items = parseRss([
    item("Fundamental case for bitcoin has never been stronger: Miller Value Partners' Miller", "CNBC", "Thu, 02 Jul 2026 10:00:00 GMT"),
    item("Bank Leumi Partners With Galaxy Digital to Launch Bitcoin, Ethereum, and Solana Trading in 2027", "NewsCord", "Fri, 14 Aug 2026 10:00:00 GMT"),
    item("Bitcoin Well Enters Partnership With Heritage IRA To Offer Tax Advantaged Bitcoin Transactions", "TheNewswire", "Tue, 09 Jun 2026 10:00:00 GMT"),
    item("Bitcoin price slips below $90,000", "CoinDesk", "Sat, 01 Aug 2026 10:00:00 GMT"),
  ].join(""));
  assert.deepEqual(pickPartnerships(items, "Bitcoin USD").map((n) => n.source), ["NewsCord", "TheNewswire"]);

  const sofi = parseRss([
    item("Notre Dame and SoFi Launch Landmark Multi-Year Partnership", "Notre Dame Fighting Irish", "Tue, 28 Jul 2026 10:00:00 GMT"),
    item("SoFi and Notre Dame Athletics Launch Landmark Multi-Year Partnership", "Business Wire", "Tue, 28 Jul 2026 11:00:00 GMT"),
    item("SoFi-Kraken partnership connects banking, digital assets", "American Banker", "Fri, 04 Sep 2026 10:00:00 GMT"),
    item("Citigroup Partners With Coinbase for Stablecoin Payments", "Barrons.com", "Mon, 28 Sep 2026 10:00:00 GMT"), // not about SoFi
  ].join(""));
  const picked = pickPartnerships(sofi, "SoFi Technologies, Inc.");
  assert.deepEqual(picked.map((n) => n.source), ["American Banker", "Business Wire"]); // Notre Dame deal once
  assert.equal(pickPartnerships(sofi, "SoFi", 1).length, 1);
});

test("partnershipNews returns [] instead of failing when Google News is down", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("network down"); };
  try {
    assert.deepEqual(await partnershipNews("Apple Inc."), []);
  } finally {
    globalThis.fetch = orig;
  }
});
