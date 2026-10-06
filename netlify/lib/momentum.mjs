// RSI and MACD from daily closes, plus a plain-English rating of each for
// buy timing. Pure functions so they can be unit tested.

const ema = (values, period) => {
  const k = 2 / (period + 1);
  const out = new Array(values.length).fill(null);
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) continue;
    prev = prev == null ? values.slice(0, period).reduce((a, b) => a + b, 0) / period : values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
};

// 14-period RSI with Wilder's smoothing (the standard charting definition).
export function rsiSeries(closes, period = 14) {
  const out = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gain += d; else loss -= d;
  }
  gain /= period; loss /= period;
  const rsi = () => (loss === 0 ? 100 : 100 - 100 / (1 + gain / loss));
  out[period] = rsi();
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = rsi();
  }
  return out;
}

// MACD (12, 26, 9): MACD line = EMA12 - EMA26, signal = EMA9 of MACD, histogram = MACD - signal.
export function macdSeries(closes, fast = 12, slow = 26, signalPeriod = 9) {
  const f = ema(closes, fast), s = ema(closes, slow);
  const macd = closes.map((_, i) => (f[i] == null || s[i] == null ? null : f[i] - s[i]));
  const start = macd.findIndex((v) => v != null);
  const sig = new Array(closes.length).fill(null);
  if (start >= 0) ema(macd.slice(start), signalPeriod).forEach((v, j) => (sig[start + j] = v));
  return macd.map((m, i) => ({ macd: m, signal: sig[i], hist: m == null || sig[i] == null ? null : m - sig[i] }));
}

const r2 = (n) => (n == null ? null : Math.round(n * 100) / 100);

// bars: [{ t, close, volume }] daily, oldest first.
export function momentum(bars) {
  const closes = bars.map((b) => b.close);
  const rs = rsiSeries(closes);
  const md = macdSeries(closes);
  const last = closes.length - 1;
  const asOf = bars[last]?.t ?? null;

  // RSI rating for buy timing.
  let rsi = null;
  if (rs[last] != null) {
    const value = rs[last];
    const prev = rs[last - 5];
    const change = prev == null ? null : value - prev;
    const direction = change == null ? null : change > 2 ? "rising" : change < -2 ? "falling" : "flat";
    let zone, label, stance, detail;
    if (value > 70) { zone = "overbought"; label = "Overbought"; stance = "wait"; detail = "Above 70: price has run hot. Buying now risks chasing; wait for a cool-off."; }
    else if (value >= 50 && change != null && change < -5) { zone = "bullish"; label = "Bullish, fading"; stance = "neutral"; detail = "50–70, but dropping fast: buyers are losing control. Wait for RSI to steady."; }
    else if (value >= 50) { zone = "bullish"; label = "Bullish"; stance = "buy"; detail = "50–70: buyers are in control without being overheated."; }
    else if (value >= 30) { zone = "bearish"; label = "Weak"; stance = "neutral"; detail = "30–50: sellers have the edge. Watch for RSI to turn up through 50."; }
    else { zone = "oversold"; label = "Oversold"; stance = "buy"; detail = "Below 30: heavily sold. Often a bounce zone, especially near the 200 WMA."; }
    rsi = { value: r2(value), change5d: r2(change), direction, zone, label, stance, detail };
  }

  // MACD rating: position vs signal line, last crossover, histogram trend.
  let macd = null;
  const now = md[last];
  if (now?.signal != null) {
    // Last crossover: where the histogram changes sign. Differences smaller than
    // rounding noise count as zero, so a flat stretch can't fake a crossover.
    const eps = Math.abs(closes[last]) * 1e-9;
    const sgn = (h) => (h == null || Math.abs(h) < eps ? 0 : Math.sign(h));
    let cross = null;
    let after = sgn(md[last].hist), afterIdx = last;
    for (let i = last - 1; i >= 0 && md[i].hist != null; i--) {
      const s = sgn(md[i].hist);
      if (s === 0) continue;
      if (after !== 0 && s !== after) {
        cross = { direction: after > 0 ? "bullish" : "bearish", t: bars[afterIdx].t, barsAgo: last - afterIdx, aboveZero: md[afterIdx].macd > 0 };
        break;
      }
      if (after === 0) after = s;
      afterIdx = i;
    }
    const h = md.slice(-5).map((x) => x.hist);
    const histTrend = h.some((x) => x == null) ? null
      : Math.sign(h[0]) !== Math.sign(h[4]) ? "flipped"
      : Math.abs(h[4]) > Math.abs(h[0]) ? "expanding" : "contracting";
    const bullish = now.hist > 0;
    const fresh = cross && cross.direction === (bullish ? "bullish" : "bearish") && cross.barsAgo <= 10;
    const label = bullish ? (fresh ? "Bullish crossover" : "Bullish") : (fresh ? "Bearish crossover" : "Bearish");
    const detail = bullish
      ? `MACD is above its signal line${fresh ? `: it crossed up ${cross.barsAgo === 0 ? "today" : `${cross.barsAgo} day${cross.barsAgo === 1 ? "" : "s"} ago`}${cross.aboveZero ? " above the zero line (stronger)" : " below the zero line (early turn)"}` : ""}. Momentum is ${histTrend === "expanding" ? "building" : histTrend === "flipped" ? "just turning" : "fading"}.`
      : `MACD is below its signal line${fresh ? `: it crossed down ${cross.barsAgo === 0 ? "today" : `${cross.barsAgo} day${cross.barsAgo === 1 ? "" : "s"} ago`}` : ""}. Wait for a bullish crossover before buying.`;
    macd = {
      macd: r2(now.macd), signal: r2(now.signal), histogram: r2(now.hist),
      histTrend, lastCross: cross, label, stance: bullish ? "buy" : "wait", detail,
    };
  }
  return { asOf, rsi, macd };
}
