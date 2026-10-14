// Futures shown in the side panel (Yahoo continuous front-month symbols)
// and the short-term signal used for them.
import { momentum, stochasticSeries } from "./momentum.mjs";

export const FUTURES = [
  ["ES=F", "S&P 500 E-mini", "Index"], ["NQ=F", "Nasdaq 100 E-mini", "Index"],
  ["YM=F", "Dow E-mini", "Index"], ["RTY=F", "Russell 2000 E-mini", "Index"],
  ["CL=F", "Crude Oil", "Energy"], ["NG=F", "Natural Gas", "Energy"],
  ["GC=F", "Gold", "Metal"], ["SI=F", "Silver", "Metal"], ["HG=F", "Copper", "Metal"],
  ["ZN=F", "10-Year T-Note", "Rates"], ["6E=F", "Euro FX", "Currency"], ["BTC=F", "Bitcoin", "Crypto"],
];

// Short-term signal from 15-minute bars:
//   MACD (12, 26, 9) gives the trend, RSI (14) the momentum side (above/below 50),
//   and the Stochastic (14, 3, 3) says whether the move is overbought (>80) or oversold (<20).
//   BUY  - MACD above its signal, RSI 50+ and Stochastic not overbought
//   SELL - MACD below its signal, RSI under 50 and Stochastic not oversold
//   NEUTRAL - anything else; `lean` says which way it is tilting.
// "fresh" marks a MACD crossover within the last 3 bars (45 minutes).
export function futuresSignal(bars) {
  const m = momentum(bars);
  const rsi = m.rsi?.value ?? null;
  const hist = m.macd?.histogram ?? null;
  const st = stochasticSeries(bars);
  const now = st.at(-1), before = st.at(-2);
  const k = now?.k ?? null, d = now?.d ?? null;
  const kCrossUp = before?.k != null && before?.d != null && d != null && before.k <= before.d && k > d;
  const kCrossDown = before?.k != null && before?.d != null && d != null && before.k >= before.d && k < d;
  const zone = k == null ? null : k >= 80 ? "overbought" : k <= 20 ? "oversold" : "normal";
  const sk = k == null ? "" : `Stoch ${k.toFixed(0)}`;
  let signal = "NEUTRAL", lean = null, reason;
  if (rsi == null || hist == null || k == null) reason = "Not enough recent bars.";
  else if (zone === "overbought") {
    lean = "down";
    reason = kCrossDown ? `Overbought (${sk}) and %K just turned down: pullback risk.` : `Overbought (${sk}): stretched, avoid chasing.`;
  } else if (zone === "oversold") {
    lean = "up";
    reason = kCrossUp ? `Oversold (${sk}) and %K just turned up: possible bounce.` : `Oversold (${sk}): washed out, wait for it to turn up.`;
  } else if (hist > 0 && rsi >= 50) { signal = "BUY"; reason = `MACD above signal, RSI ${rsi.toFixed(0)}, ${sk}.`; }
  else if (hist < 0 && rsi < 50) { signal = "SELL"; reason = `MACD below signal, RSI ${rsi.toFixed(0)}, ${sk}.`; }
  else if (hist > 0) { lean = "up"; reason = `MACD turning up, but RSI ${rsi.toFixed(0)} is still under 50.`; }
  else { lean = "down"; reason = `MACD turning down, but RSI ${rsi.toFixed(0)} is still over 50.`; }
  const cross = m.macd?.lastCross;
  const fresh = !!cross && cross.barsAgo <= 2 && ((signal === "BUY" && cross.direction === "bullish") || (signal === "SELL" && cross.direction === "bearish"));
  return { signal, lean, fresh, reason, rsi, macdHist: hist, stochK: k == null ? null : Math.round(k * 10) / 10, stochD: d == null ? null : Math.round(d * 10) / 10, stochZone: zone };
}
