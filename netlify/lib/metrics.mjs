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

// Buy signal from price distance to the 200 WMA, confirmed by daily volume.
export function buySignal(price, wma, dailyRvol) {
  if (wma == null || price == null) {
    return { level: "na", label: "Not enough history", detail: "Fewer than 200 weeks of data." };
  }
  const distancePct = ((price - wma) / wma) * 100;
  const volumeConfirmed = dailyRvol != null && dailyRvol >= 1.5;
  let level, label, detail;
  if (distancePct <= 0) {
    level = "strong";
    label = "STRONG BUY";
    detail = "Price is at or below the 200-week moving average, a historically deep-value zone.";
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
