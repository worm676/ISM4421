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
export function screenRow(symbol, name, entry) {
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
    signal: buySignal(price, wma, null),
  };
}

// Sweetspot: at the 200 WMA (within 1% above) down to 7% below it.
export const SWEETSPOT = { min: -7, max: 1 };

// Split screener rows into the lists the home page shows, capped at `limit`.
// At/below: deepest discount to the 200 WMA first. Extended: furthest above first.
export function screenLists(rows, limit = 20) {
  const ok = rows.filter((r) => r.signal?.distancePct != null);
  const below = ok.filter((r) => r.signal.distancePct <= 0).sort((a, b) => a.signal.distancePct - b.signal.distancePct);
  const extended = ok.filter((r) => r.signal.level === "extended").sort((a, b) => b.signal.distancePct - a.signal.distancePct);
  // Sweetspot: stocks turning up this week first, then closest to the WMA.
  const sweetspot = ok
    .filter((r) => r.signal.distancePct >= SWEETSPOT.min && r.signal.distancePct <= SWEETSPOT.max)
    .sort((a, b) => (b.turningUp === true) - (a.turningUp === true) || Math.abs(a.signal.distancePct) - Math.abs(b.signal.distancePct));
  return {
    below: below.slice(0, limit),
    sweetspot: sweetspot.slice(0, limit),
    extended: extended.slice(0, limit),
    counts: { below: below.length, sweetspot: sweetspot.length, extended: extended.length, screened: ok.length },
  };
}

// Buy signal from price distance to the 200 WMA, confirmed by daily volume.
export function buySignal(price, wma, dailyRvol) {
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
  return { level, label, detail, distancePct, volumeConfirmed };
}
