// GET /api/market?symbol=AAPL
// Fetches public trading data from Yahoo Finance and returns hourly, daily,
// weekly, and monthly volume plus the 200-week moving average.
import { toBars, volumeSummary, wma200, buySignal, wmaTrend, weeklyVolatility, entryPlan } from "../lib/metrics.mjs";
import { chart, json } from "../lib/yahoo.mjs";
import { getMarket, isCrypto } from "../lib/market.mjs";
import { momentum } from "../lib/momentum.mjs";

export default async (req) => {
  const symbol = (new URL(req.url).searchParams.get("symbol") || "").trim().toUpperCase();
  if (!/^[A-Z0-9.^=-]{1,15}$/.test(symbol)) {
    return json(400, { error: "Provide a valid ticker, e.g. ?symbol=AAPL" });
  }

  try {
    const [hourly, daily, weekly, monthly, market] = await Promise.all([
      chart(symbol, "60m", "1mo"),
      chart(symbol, "1d", "1y"),
      chart(symbol, "1wk", "10y"),
      chart(symbol, "1mo", "5y"),
      getMarket(isCrypto(symbol) ? "crypto" : "stocks"),
    ]);

    const weeklyBars = toBars(weekly);
    const dailyBars = toBars(daily);
    const dailyVol = volumeSummary(dailyBars, 30);
    const wma = wma200(weeklyBars);
    const meta = daily.meta ?? {};
    const price = meta.regularMarketPrice ?? weeklyBars.at(-1)?.close ?? null;
    const closes = weeklyBars.map((b) => b.close);
    const trend = wmaTrend(closes);

    return json(
      200,
      {
        symbol,
        name: meta.longName || meta.shortName || symbol,
        currency: meta.currency || "USD",
        exchange: meta.fullExchangeName || meta.exchangeName || "",
        price,
        previousClose: meta.chartPreviousClose ?? null,
        marketTime: meta.regularMarketTime ? meta.regularMarketTime * 1000 : null,
        volume: {
          hour: volumeSummary(toBars(hourly), 35),
          day: dailyVol,
          week: volumeSummary(weeklyBars, 26),
          month: volumeSummary(toBars(monthly), 12),
        },
        wma200: {
          value: wma.value,
          weeksAvailable: wma.weeksAvailable,
          line: wma.line.slice(-260),
        },
        signal: buySignal(price, wma.value, dailyVol?.relativeVolume ?? null, { marketBull: market?.bull ?? null, wmaRising: trend.rising }),
        trend,
        market,
        momentum: momentum(dailyBars),
        plan: entryPlan(wma.value, weeklyVolatility(closes)),
        source: "Yahoo Finance public chart data (may be delayed)",
        fetchedAt: Date.now(),
      },
      "public, max-age=120"
    );
  } catch (err) {
    return json(502, { error: `Could not load ${symbol}: ${err.message}` });
  }
};

export const config = { path: "/api/market" };
