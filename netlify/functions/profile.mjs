// GET /api/profile?symbol=AAPL
// Company description, market cap, recent partnership news and analyst
// buy / hold / sell consensus.
import { analystConsensus, companyProfile } from "../lib/metrics.mjs";
import { quoteSummary, json } from "../lib/yahoo.mjs";
import { partnershipNews } from "../lib/news.mjs";

export default async (req) => {
  const symbol = (new URL(req.url).searchParams.get("symbol") || "").trim().toUpperCase();
  if (!/^[A-Z0-9.^=-]{1,15}$/.test(symbol)) {
    return json(400, { error: "Provide a valid ticker, e.g. ?symbol=AAPL" });
  }
  try {
    const r = await quoteSummary(symbol, ["assetProfile", "recommendationTrend", "financialData", "price"]);
    const name = r.price?.longName || r.price?.shortName || symbol;
    const partnerships = await partnershipNews(name);
    return json(
      200,
      {
        symbol,
        name,
        marketCap: r.price?.marketCap?.raw ?? null,
        partnerships,
        profile: companyProfile(r.assetProfile),
        consensus: analystConsensus(r.recommendationTrend, r.financialData),
        fetchedAt: Date.now(),
      },
      "public, max-age=21600" // descriptions and ratings change slowly: cache 6 hours
    );
  } catch (err) {
    return json(502, { error: err.message });
  }
};

export const config = { path: "/api/profile" };
