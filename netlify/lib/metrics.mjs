// Pure calculation helpers — no network access, so they can be unit tested.

// Turn a Yahoo Finance chart result into clean bars, dropping null rows.
export function toBars(result) {
  const ts = result?.timestamp ?? [];
  const q = result?.indicators?.quote?.[0] ?? {};
  const bars = [];
  for (let i = 0; i < ts.length; i++) {
    const close = q.close?.[i];
    const volume = q.volume?.[i];
    if (close == null || volume == null) continue;
    bars.push({ t: ts[i] * 1000, close, volume });
  }
  return bars;
}

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// Volume summary for one timeframe. The last bar is the period in progress,
// so relative volume compares the last *completed* bar to the average of the
// completed bars before it.
export function volumeSummary(bars, lookback) {
  if (bars.length < 2) return null;
  const current = bars[bars.length - 1];
  const lastComplete = bars[bars.length - 2];
  const history = bars.slice(0, -2).slice(-lookback);
  const average = avg(history.map((b) => b.volume));
  return {
    current: current.volume,
    currentStart: current.t,
    lastComplete: lastComplete.volume,
    lastCompleteStart: lastComplete.t,
    average,
    lookback: history.length,
    relativeVolume: average ? lastComplete.volume / average : null,
    series: bars.slice(-lookback - 2).map((b) => ({ t: b.t, v: b.volume })),
  };
}

// 200-week simple moving average of weekly closes, plus the rolling line for charting.
export function wma200(weeklyBars, period = 200) {
  const closes = weeklyBars.map((b) => b.close);
  const line = [];
  let sum = 0;
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i];
    if (i >= period) sum -= closes[i - period];
    line.push({ t: weeklyBars[i].t, close: closes[i], wma: i >= period - 1 ? sum / period : null });
  }
  const value = line.length ? line[line.length - 1].wma : null;
  return { value, weeksAvailable: closes.length, line };
}

// One screener row from a Yahoo spark entry (weekly closes, no volume).
export function screenRow(symbol, name, entry, market = null) {
  const closes = (entry?.close ?? []).filter((c) => c != null);
  const price = entry?.fulldayPrice ?? closes.at(-1) ?? null;
  const wma = wma200(closes.map((close, i) => ({ t: i, close, volume: 0 }))).value;
  // Last week's close: the latest bar at least 4 days before the newest one
  // (Yahoo can repeat the in-progress week as an extra bar).
  const ts = entry?.timestamp ?? [];
  const lastTs = ts.at(-1);
  let prevWeekClose = null;
  for (let i = ts.length - 1; i >= 0; i--) {
    if (entry.close[i] != null && lastTs - ts[i] >= 4 * 86400) { prevWeekClose = entry.close[i]; break; }
  }
  return {
    symbol, name, price,
    changePct: entry?.fulldayChangePercent ?? null,
    wma200: wma,
    turningUp: price != null && prevWeekClose != null && price > prevWeekClose,
    signal: buySignal(price, wma, null, { marketBull: market?.bull ?? null, wmaRising: wmaTrend(closes).rising }),
  };
}

// Sweetspot: within 6% of the 200 WMA, above or below it.
export const SWEETSPOT = { min: -6, max: 6 };

// Split screener rows into the lists the home page shows, capped at `limit`.
// At/below: deepest discount to the 200 WMA first. Extended: furthest above first.
export function screenLists(rows, limit = 20) {
  const ok = rows.filter((r) => r.signal?.distancePct != null);
  const below = ok.filter((r) => r.signal.distancePct <= 0).sort((a, b) => a.signal.distancePct - b.signal.distancePct);
  const extended = ok.filter((r) => r.signal.level === "extended").sort((a, b) => b.signal.distancePct - a.signal.distancePct);
  // Sweetspot: good buy setups first, then stocks turning up this week, then closest to the WMA.
  const good = (r) => r.signal.setup?.key === "good";
  const sweetspot = ok
    .filter((r) => r.signal.distancePct >= SWEETSPOT.min && r.signal.distancePct <= SWEETSPOT.max)
    .sort((a, b) => good(b) - good(a) || (b.turningUp === true) - (a.turningUp === true) || Math.abs(a.signal.distancePct) - Math.abs(b.signal.distancePct));
  return {
    below: below.slice(0, limit),
    sweetspot: sweetspot.slice(0, limit),
    extended: extended.slice(0, limit),
    counts: { below: below.length, sweetspot: sweetspot.length, extended: extended.length, screened: ok.length },
  };
}

// Direction of the 200 WMA itself: compare it now with `lookback` weeks ago.
// Rising means a pullback to it is a pullback in an uptrend; falling means a breakdown.
export function wmaTrend(closes, lookback = 13) {
  const line = wma200(closes.map((close, i) => ({ t: i, close, volume: 0 }))).line;
  const now = line.at(-1)?.wma ?? null;
  const then = line.at(-1 - lookback)?.wma ?? null;
  if (now == null || then == null) return { rising: null, slopePct: null };
  const slopePct = ((now - then) / then) * 100;
  return { rising: slopePct > 0, slopePct };
}

// Typical weekly move: average absolute weekly % change over the last `n` weeks.
export function weeklyVolatility(closes, n = 52) {
  const c = closes.slice(-(n + 1));
  const moves = [];
  for (let i = 1; i < c.length; i++) if (c[i - 1]) moves.push(Math.abs(c[i] / c[i - 1] - 1) * 100);
  return avg(moves);
}

// Long-term phase of the overall market from the S&P 500's own 200 WMA.
export function marketRegime(closes, price = closes.at(-1)) {
  const wma = wma200(closes.map((close, i) => ({ t: i, close, volume: 0 }))).value;
  if (wma == null || price == null) return null;
  const distancePct = ((price - wma) / wma) * 100;
  return { symbol: "^GSPC", name: "S&P 500", price, wma200: wma, distancePct, bull: price >= wma, trend: wmaTrend(closes) };
}

// Staged entry plan around the 200 WMA: thirds at +5%, at the WMA and at -5%,
// with a stop below the last tranche set by the stock's typical weekly move.
export function entryPlan(wma, weeklyVolPct) {
  if (wma == null || weeklyVolPct == null) return null;
  const tranches = [1.05, 1, 0.95].map((k) => wma * k);
  const cushion = Math.min(Math.max(2 * weeklyVolPct, 3), 15); // 3%..15% below the last tranche
  const stop = tranches[2] * (1 - cushion / 100);
  return { tranches, stop, weeklyVolPct, cushionPct: cushion };
}

// How the signal fits the bigger picture (market phase + the stock's own WMA trend).
// ctx: { marketBull: true|false|null, wmaRising: true|false|null }
export function setupFor(distancePct, { marketBull = null, wmaRising = null } = {}) {
  if (distancePct == null) return null;
  const near = distancePct >= -10 && distancePct <= 5;
  if (near && wmaRising === false) {
    return { key: "breakdown", label: "Breakdown risk", detail: "The 200 WMA itself is falling, so this is a breakdown in a downtrend rather than a pullback in an uptrend. Wait for the trend to turn." };
  }
  if (near && marketBull === false) {
    return { key: "selective", label: "Be selective", detail: "The S&P 500 is below its own 200 WMA, a long-term bear phase. Be selective and defensive: only the strongest businesses, smaller and slower entries." };
  }
  if (near && marketBull && wmaRising) {
    return { key: "good", label: "Good buy setup", detail: "A pullback to the 200 WMA in an uptrend, while the S&P 500 is above its own 200 WMA. Review the fundamentals and valuation before entering." };
  }
  if (distancePct > 5 && distancePct <= 10) {
    return { key: "wait", label: "Wait for pullback", detail: "Close, but avoid chasing. Wait for price to come within 5% of the 200 WMA." };
  }
  return null;
}

// Buy signal from price distance to the 200 WMA, confirmed by daily volume.
// ctx (optional) adds the market phase and WMA trend as `setup`.
export function buySignal(price, wma, dailyRvol, ctx) {
  if (wma == null || price == null) {
    return { level: "na", label: "Not enough history", detail: "Fewer than 200 weeks of data." };
  }
  const distancePct = ((price - wma) / wma) * 100;
  const volumeConfirmed = dailyRvol != null && dailyRvol >= 1.5;
  let level, label, detail;
  if (distancePct < -30) {
    level = "pressure";
    label = "DOWN PRESSURE";
    detail = "Price is more than 30% below the 200-week moving average. Selling pressure is heavy, so wait for it to stabilize.";
  } else if (distancePct < -10) {
    level = "weak";
    label = "WEAK BUY";
    detail = "Price is 10–30% below the 200-week moving average. Cheap, but the trend is weak.";
  } else if (distancePct <= 0) {
    level = "strong";
    label = "STRONG BUY";
    detail = "Price is at or up to 10% below the 200-week moving average, a historically deep-value zone.";
  } else if (distancePct <= 10) {
    level = "buy";
    label = "BUY ZONE";
    detail = "Price is within 10% of the 200-week moving average.";
  } else if (distancePct <= 30) {
    level = "watch";
    label = "WATCH";
    detail = "Price is above the 200 WMA. Wait for a pullback toward it.";
  } else {
    level = "extended";
    label = "EXTENDED";
    detail = "Price is more than 30% above the 200 WMA, so a new entry carries more risk.";
  }
  if (volumeConfirmed && (level === "strong" || level === "buy")) {
    detail += " Volume confirms it: the last session traded at least 1.5× its average volume.";
  }
  return { level, label, detail, distancePct, volumeConfirmed, setup: setupFor(distancePct, ctx) };
}

// Analyst consensus from Yahoo's recommendationTrend (current month), as
// buy / hold / sell shares of 100% like a brokerage app shows.
export function analystConsensus(trend, financialData = {}) {
  const now = (trend?.trend ?? []).find((t) => t.period === "0m") ?? trend?.trend?.[0];
  if (!now) return null;
  const buy = (now.strongBuy ?? 0) + (now.buy ?? 0);
  const hold = now.hold ?? 0;
  const sell = (now.sell ?? 0) + (now.strongSell ?? 0);
  const total = buy + hold + sell;
  if (!total) return null;
  // Round so the three always add up to exactly 100.
  const raw = [buy, hold, sell].map((n) => (n / total) * 100);
  const pct = raw.map(Math.floor);
  let left = 100 - pct.reduce((a, b) => a + b, 0);
  raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left-- > 0) pct[i]++; });
  const [buyPct, holdPct, sellPct] = pct;
  // Ties lean to Hold, the cautious reading.
  const verdict = buyPct > holdPct && buyPct > sellPct ? "Buy" : sellPct > holdPct && sellPct > buyPct ? "Sell" : "Hold";
  const num = (v) => (typeof v === "object" && v !== null ? v.raw : v) ?? null;
  return {
    analysts: total,
    buy: buyPct, hold: holdPct, sell: sellPct,
    counts: { strongBuy: now.strongBuy ?? 0, buy: now.buy ?? 0, hold, sell: now.sell ?? 0, strongSell: now.strongSell ?? 0 },
    verdict,
    targetMean: num(financialData?.targetMeanPrice),
    targetLow: num(financialData?.targetLowPrice),
    targetHigh: num(financialData?.targetHighPrice),
  };
}

// Company profile fields from Yahoo's assetProfile module.
export function companyProfile(asset) {
  if (!asset?.longBusinessSummary) return null;
  return {
    summary: asset.longBusinessSummary,
    sector: asset.sector ?? null,
    industry: asset.industry ?? null,
    website: asset.website ?? null,
    employees: asset.fullTimeEmployees ?? null,
    headquarters: [asset.city, asset.state, asset.country].filter(Boolean).join(", ") || null,
  };
}
