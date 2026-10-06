const DEFAULT_WATCHLIST = ["SPY", "QQQ", "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "JPM"];
const WATCH_KEY = "owl-watchlist";
const TF_LABELS = {
  hour: { title: "Hourly", unit: "hour", avgLabel: "35-hr avg" },
  day: { title: "Daily", unit: "day", avgLabel: "30-day avg" },
  week: { title: "Weekly", unit: "week", avgLabel: "26-wk avg" },
  month: { title: "Monthly", unit: "month", avgLabel: "12-mo avg" },
};

const $ = (id) => document.getElementById(id);
const state = { data: null, tf: "day", volChart: null, wmaChart: null };

// ---------- formatting ----------
const fmtVol = (n) => {
  if (n == null) return "—";
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (a >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(Math.round(n));
};
const fmtMoney = (n, cur = "USD") =>
  n == null ? "—" : new Intl.NumberFormat("en-US", {
    style: "currency", currency: cur,
    // Coins under $1 (DOGE, SHIB) need significant digits, not cents.
    ...(Math.abs(n) > 0 && Math.abs(n) < 1 ? { maximumSignificantDigits: 4 } : { maximumFractionDigits: 2 }),
  }).format(n);
const isCrypto = (symbol) => /-USD$/.test(symbol);
// Market cap as $4.87T / $20.36B.
const fmtCap = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 }).format(n);
// Show coins as BTC or UNI rather than Yahoo's BTC-USD / UNI7083-USD.
const tickerLabel = (symbol) => (isCrypto(symbol) ? symbol.replace(/\d*-USD$/, "") : symbol);
// Share/coin counts: 1,250 or 0.0412, and 70.6M for cheap coins like SHIB.
const fmtUnits = (n) =>
  new Intl.NumberFormat("en-US", n >= 1e6 ? { notation: "compact", maximumFractionDigits: 2 } : { maximumFractionDigits: n >= 100 ? 0 : 4 }).format(n);
const fmtPct = (n) => (n == null ? "—" : (n > 0 ? "+" : "") + n.toFixed(1) + "%");
const fmtDate = (t, tf) => {
  const d = new Date(t);
  if (tf === "hour") return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric" });
  if (tf === "month") return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: tf === "week" ? "2-digit" : undefined });
};

// ---------- data ----------
const cache = new Map();
async function fetchMarket(symbol) {
  const hit = cache.get(symbol);
  if (hit && Date.now() - hit.at < 120000) return hit.data;
  const res = await fetch(`/api/market?symbol=${encodeURIComponent(symbol)}`);
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
  cache.set(symbol, { at: Date.now(), data });
  return data;
}

// ---------- watchlist ----------
function getWatchlist() {
  try {
    const saved = JSON.parse(localStorage.getItem(WATCH_KEY));
    if (Array.isArray(saved) && saved.length) return saved;
  } catch {}
  return [...DEFAULT_WATCHLIST];
}
function setWatchlist(list) {
  try { localStorage.setItem(WATCH_KEY, JSON.stringify(list)); } catch {}
  // auth.js listens for this to save the watchlist to a signed-in user's profile.
  document.dispatchEvent(new CustomEvent("owl:watchlist", { detail: list }));
}

// ---------- render: main symbol ----------
async function load(symbol) {
  symbol = symbol.trim().toUpperCase();
  if (!symbol) return;
  $("error").hidden = true;
  document.querySelector("main").classList.add("loading");
  try {
    state.data = await fetchMarket(symbol);
    renderHero();
    loadProfile(symbol);
    renderTiles();
    renderVolChart();
    renderWmaChart();
    renderChips();
    history.replaceState(null, "", `?symbol=${symbol}`);
  } catch (err) {
    $("error").textContent = err.message;
    $("error").hidden = false;
  } finally {
    document.querySelector("main").classList.remove("loading");
  }
}

// ---------- company profile + analyst consensus ----------
const profileCache = new Map();
async function loadProfile(symbol) {
  state.profile = null;
  $("about-name").textContent = symbol;
  $("about-facts").textContent = "";
  $("about-text").textContent = "Loading company profile…";
  $("about-more").hidden = true;
  $("ratings").hidden = true;
  $("partners").hidden = true;
  $("about-cap").hidden = true;
  let p = profileCache.get(symbol);
  if (!p) {
    try {
      const res = await fetch(`/api/profile?symbol=${encodeURIComponent(symbol)}`);
      p = await res.json();
      if (!res.ok || p.error) throw new Error(p.error || `HTTP ${res.status}`);
      profileCache.set(symbol, p);
    } catch {
      p = { error: true };
    }
  }
  if (state.data?.symbol !== symbol) return; // user picked another stock meanwhile
  renderProfile(symbol, p);
}

function renderProfile(symbol, p) {
  state.profile = p;
  renderIndicators();
  const pr = p.profile;
  // Total market cap leads the description: $4.87T, with the full dollar figure beside it.
  $("about-cap").hidden = !p.marketCap;
  if (p.marketCap) {
    $("cap-value").textContent = fmtCap(p.marketCap);
    $("cap-full").textContent = `($${Math.round(p.marketCap).toLocaleString("en-US")})`;
  }
  $("about-name").textContent = p.name || state.data?.name || symbol;
  if (!pr) {
    $("about-facts").textContent = "";
    $("about-text").textContent = p.error ? "Company profile is unavailable right now." : "No company description is available for this ticker.";
  } else {
    const facts = [
      [pr.sector, pr.industry].filter(Boolean).join(" · "),
      pr.headquarters,
      pr.employees ? `${pr.employees.toLocaleString()} employees` : "",
    ].filter(Boolean);
    $("about-facts").innerHTML = facts.map((f) => `<span>${f.replace(/</g, "&lt;")}</span>`).join("") +
      (pr.website && /^https?:\/\//.test(pr.website) ? `<a href="${pr.website.replace(/"/g, "")}" target="_blank" rel="noopener">${pr.website.replace(/^https?:\/\/(www\.)?/, "").replace(/</g, "")} ↗</a>` : "");
    $("about-text").textContent = pr.summary;
    $("about-text").classList.add("clamped");
    $("about-more").textContent = "Read more";
    $("about-more").hidden = pr.summary.length < 320;
  }
  renderPartnerships(p);
  const c = p.consensus;
  $("ratings").hidden = !c;
  if (!c) return;
  for (const k of ["buy", "hold", "sell"]) {
    $(`r-${k}`).textContent = `${c[k]}%`;
    $(`r-${k}-bar`).style.width = `${c[k]}%`;
  }
  $("r-verdict").textContent = `Consensus: ${c.verdict}`;
  $("r-verdict").dataset.verdict = c.verdict.toLowerCase();
  const target = c.targetMean != null && state.data?.price
    ? ` Average 12-month price target ${fmtMoney(c.targetMean, state.data.currency)} (${fmtPct(((c.targetMean - state.data.price) / state.data.price) * 100)} from today${c.targetLow != null && c.targetHigh != null ? `; range ${fmtMoney(c.targetLow, state.data.currency)}–${fmtMoney(c.targetHigh, state.data.currency)}` : ""}).`
    : "";
  $("r-note").textContent = `Based on ${c.analysts} Wall Street analyst rating${c.analysts === 1 ? "" : "s"} this month.${target} Analyst views are opinions, not guarantees.`;
}
function renderPartnerships(p) {
  const list = p.partnerships ?? [];
  $("partners").hidden = !!p.error;
  $("partner-list").innerHTML = list.length
    ? list.map((n) => {
        const date = n.published ? new Date(n.published).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
        const safe = (t) => String(t).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
        const href = /^https:\/\//.test(n.link) ? safe(n.link) : "#";
        return `<li><a href="${href}" target="_blank" rel="noopener">${safe(n.title)}</a><span class="small muted">${safe([n.source, date].filter(Boolean).join(" · "))}</span></li>`;
      }).join("")
    : `<li class="muted small">No partnership news in the last 6 months.</li>`;
}
// ---------- RSI + MACD, and how the 3 main indicators line up ----------
const NA = "data unavailable";
function renderIndicators() {
  const d = state.data;
  const m = d?.momentum;
  $("momo").hidden = !d;
  if (!d) return;
  $("m-asof").textContent = m?.asOf ? `Daily close ${new Date(m.asOf).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : "";

  const r = m?.rsi;
  $("rsi-val").textContent = r ? r.value.toFixed(1) : NA;
  $("rsi-chip").textContent = r ? r.label : "";
  $("rsi-chip").dataset.stance = r?.stance ?? "";
  $("rsi-dot").style.left = r ? `${Math.min(100, Math.max(0, r.value))}%` : "0";
  $("rsi-dot").hidden = !r;
  $("rsi-detail").textContent = r
    ? `${r.detail} ${r.direction ? `Over the last 5 days RSI is ${r.direction} (${r.change5d > 0 ? "+" : ""}${r.change5d.toFixed(1)}).` : ""}`
    : "RSI needs at least 15 days of prices.";

  const c = m?.macd;
  $("macd-chip").textContent = c ? c.label : "";
  $("macd-chip").dataset.stance = c?.stance ?? "";
  const num = (v) => (v == null ? NA : Math.abs(v) < 0.01 && v !== 0 ? v.toExponential(2) : v.toFixed(2));
  $("macd-vals").innerHTML = c
    ? `<span>MACD <b>${num(c.macd)}</b></span><span>Signal <b>${num(c.signal)}</b></span><span>Histogram <b>${num(c.histogram)}</b></span>`
    : `<span>${NA}</span>`;
  $("macd-detail").textContent = c ? c.detail : "MACD needs at least 35 days of prices.";

  // Three main indicators: analyst consensus, RSI, MACD. Coins have no analyst ratings.
  const p = state.profile;
  const rows = [];
  if (!isCrypto(d.symbol)) {
    const v = p?.consensus?.verdict;
    rows.push({ name: "Analyst consensus", value: v ?? (p ? NA : "loading…"), favors: v === "Buy", pending: !p });
  }
  rows.push({ name: "RSI", value: r ? `${r.label} (${r.value.toFixed(0)})` : NA, favors: r?.stance === "buy" });
  rows.push({ name: "MACD", value: c ? c.label : NA, favors: c?.stance === "buy" });
  const yes = rows.filter((x) => x.favors).length;
  const n = rows.length;
  const tone = yes === n ? "strong" : yes > n / 2 ? "lean" : yes === 0 ? "none" : "mixed";
  const verdict = {
    strong: "All indicators line up: a favorable time to consider buying. Confirm with the 200 WMA setup above.",
    lean: "Leaning favorable, but not unanimous. Consider a smaller first entry.",
    mixed: "Mixed signals. Wait for more confirmation.",
    none: "No indicator favors buying right now. Be patient.",
  }[tone];
  $("ind-summary").dataset.tone = tone;
  $("ind-summary").innerHTML = `
    <div class="ind-count"><strong>${yes} of ${n}</strong> indicators favor buying now</div>
    <ul>${rows.map((x) => `<li><span class="mark ${x.favors ? "yes" : "no"}">${x.favors ? "✓" : x.pending ? "…" : "✗"}</span>${x.name}: <b>${x.value}</b></li>`).join("")}</ul>
    <p class="small">${verdict}</p>`;
}

$("about-more").addEventListener("click", () => {
  const clamped = $("about-text").classList.toggle("clamped");
  $("about-more").textContent = clamped ? "Read more" : "Show less";
});

function renderHero() {
  const d = state.data;
  $("h-symbol").textContent = d.symbol;
  $("h-name").textContent = [d.name, d.exchange].filter(Boolean).join(" · ");
  $("h-price").textContent = fmtMoney(d.price, d.currency);
  const chg = d.previousClose ? d.price - d.previousClose : null;
  const el = $("h-change");
  if (chg != null) {
    el.textContent = `${chg >= 0 ? "▲" : "▼"} ${fmtMoney(Math.abs(chg), d.currency)} (${fmtPct((chg / d.previousClose) * 100)})`;
    el.className = "change " + (chg >= 0 ? "up" : "down");
  } else el.textContent = "";
  $("h-time").textContent = d.marketTime ? `As of ${new Date(d.marketTime).toLocaleString()} · ${d.source}` : d.source;

  const s = d.signal;
  $("h-signal").dataset.level = s.level;
  $("h-signal-label").textContent = s.label;
  $("h-signal-dist").textContent =
    s.distancePct != null ? `${fmtPct(s.distancePct)} vs 200-week moving average` : "";
  $("h-signal-detail").textContent = s.detail;
  $("h-wma").textContent = fmtMoney(d.wma200.value, d.currency);
  $("h-zone").textContent = d.wma200.value ? fmtMoney(d.wma200.value * 1.1, d.currency) : "—";
  $("h-trend").textContent = d.trend?.rising == null ? "—" : `${d.trend.rising ? "Rising" : "Falling"} (${fmtPct(d.trend.slopePct)} / 13 wk)`;
  $("h-setup").hidden = !s.setup;
  if (s.setup) {
    $("h-setup").dataset.setup = s.setup.key;
    $("h-setup-label").textContent = s.setup.label;
    $("h-setup-detail").textContent = s.setup.detail;
  }
  renderMarket(d.market);
  renderPlan();
  renderIndicators();
}

// ---------- market phase (S&P 500 vs its own 200 WMA) ----------
function renderMarket(m) {
  if (!m || m.symbol !== "^GSPC") return; // the banner is the stock market; crypto uses Bitcoin per coin
  const el = $("marketBanner");
  el.hidden = false;
  el.dataset.phase = m.bull ? "bull" : "bear";
  el.innerHTML = m.bull
    ? `<strong>Market: long-term bull phase.</strong> The S&amp;P 500 is ${fmtPct(m.distancePct)} vs its 200 WMA (${fmtMoney(m.wma200).replace("$", "")}). Pullbacks to the 200 WMA in quality stocks are more attractive.`
    : `<strong>Market: below its 200 WMA.</strong> The S&amp;P 500 is ${fmtPct(m.distancePct)} vs its 200 WMA (${fmtMoney(m.wma200).replace("$", "")}). Be more selective and defensive: only the strongest businesses, smaller and slower entries.`;
}

// ---------- review checklist + staged entry plan ----------
const RISK_KEY = "owl-risk";
function getRisk() {
  try {
    const r = JSON.parse(localStorage.getItem(RISK_KEY));
    if (r && r.acct > 0 && r.risk > 0) return r;
  } catch {}
  return { acct: 10000, risk: 1 };
}
function renderPlan() {
  const d = state.data;
  if (!d) return;
  const s = d.signal;
  const sym = encodeURIComponent(d.symbol);
  $("link-fin").href = `https://finance.yahoo.com/quote/${sym}/financials`;
  $("link-stats").href = `https://finance.yahoo.com/quote/${sym}/key-statistics`;
  for (const cb of document.querySelectorAll("#plan .checklist input")) cb.checked = false;

  const near = s.distancePct != null && s.distancePct <= 5;
  $("plan-trigger").textContent = s.distancePct == null ? "" : near
    ? `Review triggered: ${d.symbol} is within 5% of its 200 WMA`
    : `No review yet: ${d.symbol} is ${fmtPct(s.distancePct)} from its 200 WMA. Wait for it to come within 5%.`;
  $("plan-trigger").className = "small " + (near ? "trigger-on" : "muted");

  const up = d.trend?.rising;
  $("tech-icon").textContent = up == null ? "•" : up ? "✓" : "✗";
  $("tech-icon").className = "check " + (up == null ? "" : up ? "ok" : "bad");
  $("tech-text").textContent = up == null ? "Not enough history to judge the trend."
    : up ? "The 200 WMA is rising, so a drop to it is a pullback in an uptrend."
    : "The 200 WMA is falling, so a drop to it is a breakdown in a downtrend. Be careful.";
  const m = d.market;
  $("mkt-icon").textContent = !m ? "•" : m.bull ? "✓" : "!";
  $("mkt-icon").className = "check " + (!m ? "" : m.bull ? "ok" : "warn");
  const mName = m?.name ?? (isCrypto(d.symbol) ? "Bitcoin" : "S&P 500");
  $("mkt-text").textContent = !m ? `${mName} data unavailable.`
    : m.bull ? `${mName} is above its 200 WMA (bull phase), a favorable environment.`
    : `${mName} is below its 200 WMA. Be selective and defensive.`;

  const p = d.plan;
  const { acct, risk } = getRisk();
  $("acct").value = acct;
  $("risk").value = risk;
  if (!p) {
    $("planBody").innerHTML = `<tr><td colspan="3" class="muted">Needs 200 weeks of history.</td></tr>`;
    $("planNote").textContent = "";
    return;
  }
  const avgEntry = p.tranches.reduce((a, b) => a + b, 0) / 3;
  const perShareRisk = avgEntry - p.stop;
  const riskDollars = acct * (risk / 100);
  // Coins can be bought in fractions; stocks in whole shares.
  const crypto = isCrypto(d.symbol);
  const rawEach = riskDollars / perShareRisk / 3;
  const each = crypto ? Math.floor(rawEach * 1e4) / 1e4 : Math.floor(rawEach);
  $("plan-unit").textContent = crypto ? "Units" : "Shares";
  const names = ["1/3 at +5% above WMA", "1/3 at the 200 WMA", "1/3 at 5% below WMA"];
  $("planBody").innerHTML =
    p.tranches.map((px, i) => `<tr><td>${names[i]}</td><td>${fmtMoney(px, d.currency)}</td><td>${fmtUnits(each)}</td></tr>`).join("") +
    `<tr class="stop"><td>Stop-loss (below all entries)</td><td>${fmtMoney(p.stop, d.currency)}</td><td>—</td></tr>`;
  const cost = each * p.tranches.reduce((a, b) => a + b, 0);
  const loss = each * p.tranches.reduce((a, px) => a + (px - p.stop), 0);
  const why = 2 * p.weeklyVolPct < p.cushionPct
    ? `the 3% minimum (this stock's typical weekly move is only ${p.weeklyVolPct.toFixed(1)}%)`
    : 2 * p.weeklyVolPct > p.cushionPct
      ? `the 15% maximum (this stock's typical weekly move is ${p.weeklyVolPct.toFixed(1)}%)`
      : `about 2× this stock's typical weekly move of ${p.weeklyVolPct.toFixed(1)}%`;
  $("planNote").textContent = each > 0
    ? `Full position ≈ ${fmtMoney(cost, d.currency)} (${((cost / acct) * 100).toFixed(0)}% of account). If every stage fills and the stop is hit, you lose about ${fmtMoney(loss, d.currency)} (${((loss / acct) * 100).toFixed(2)}%, within your ${risk}% limit). The stop sits ${p.cushionPct.toFixed(1)}% under the last entry: ${why}.`
    : `Your risk budget of ${fmtMoney(riskDollars, d.currency)} is too small for one share per stage at this price. Raise the account size or risk %.`;
}
for (const id of ["acct", "risk"]) {
  $(id).addEventListener("change", () => {
    const acct = Number($("acct").value), risk = Number($("risk").value);
    if (acct > 0 && risk > 0) {
      try { localStorage.setItem(RISK_KEY, JSON.stringify({ acct, risk })); } catch {}
    }
    renderPlan();
  });
}

function rvolBadge(r) {
  if (r == null) return `<span class="rvol cold">RVOL —</span>`;
  const cls = r >= 1.5 ? "hot" : r < 0.75 ? "cold" : "";
  return `<span class="rvol ${cls}">RVOL ${r.toFixed(2)}×</span>`;
}

function renderTiles() {
  const v = state.data.volume;
  $("tiles").innerHTML = Object.keys(TF_LABELS)
    .map((tf) => {
      const s = v[tf];
      const L = TF_LABELS[tf];
      if (!s) return `<div class="tile"><h4>${L.title}</h4><div class="big">—</div><div class="muted small">No data</div></div>`;
      return `<div class="tile">
        <h4>${L.title} volume</h4>
        <div class="big">${fmtVol(s.lastComplete)}</div>
        <div class="muted small">Last full ${L.unit} · ${fmtDate(s.lastCompleteStart, tf)}</div>
        <div class="row" style="margin-top:8px"><span>This ${L.unit} so far</span><strong>${fmtVol(s.current)}</strong></div>
        <div class="row"><span>${L.avgLabel}</span><strong>${fmtVol(s.average)}</strong></div>
        ${rvolBadge(s.relativeVolume)}
      </div>`;
    })
    .join("");
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function renderVolChart() {
  const s = state.data.volume[state.tf];
  const ctx = $("volChart");
  if (state.volChart) state.volChart.destroy();
  if (!s || !window.Chart) return;
  const labels = s.series.map((p) => fmtDate(p.t, state.tf));
  const vals = s.series.map((p) => p.v);
  const colors = vals.map((_, i) => (i === vals.length - 1 ? "#cc0000" : "#0b4a86"));
  const grid = cssVar("--border");
  const text = cssVar("--muted");
  state.volChart = new Chart(ctx, {
    data: {
      labels,
      datasets: [
        { type: "bar", label: "Volume", data: vals, backgroundColor: colors, borderRadius: 3 },
        {
          type: "line", label: "Average", data: vals.map(() => s.average),
          borderColor: "#999", borderDash: [6, 4], borderWidth: 2, pointRadius: 0,
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmtVol(c.parsed.y)}` } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: text, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
        y: { grid: { color: grid }, ticks: { color: text, callback: fmtVol } },
      },
    },
  });
}

function renderWmaChart() {
  const d = state.data;
  const ctx = $("wmaChart");
  if (state.wmaChart) state.wmaChart.destroy();
  if (!window.Chart) return;
  const line = d.wma200.line;
  const grid = cssVar("--border");
  const text = cssVar("--muted");
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  state.wmaChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: line.map((p) => fmtDate(p.t, "week")),
      datasets: [
        {
          label: "Weekly close", data: line.map((p) => p.close),
          borderColor: dark ? "#9cc3f0" : "#003366", backgroundColor: "rgba(0,51,102,.08)",
          fill: true, borderWidth: 2, pointRadius: 0, tension: 0.15,
        },
        {
          label: "200 WMA", data: line.map((p) => p.wma),
          borderColor: "#cc0000", borderWidth: 2.5, pointRadius: 0, tension: 0.2, spanGaps: false,
        },
        {
          label: "Buy zone (+10%)", data: line.map((p) => (p.wma ? p.wma * 1.1 : null)),
          borderColor: "rgba(10,125,59,.7)", borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0,
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: text, boxWidth: 14 } },
        tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmtMoney(c.parsed.y, d.currency)}` } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: text, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
        y: { grid: { color: grid }, ticks: { color: text } },
      },
    },
  });
}

function renderChips() {
  const current = state.data?.symbol;
  $("chips").innerHTML = getWatchlist()
    .map((s) => `<button class="chip" data-s="${s}" aria-pressed="${s === current}">${s}</button>`)
    .join("");
}

// ---------- scanner ----------
async function scan() {
  const list = getWatchlist();
  const body = $("scanBody");
  body.innerHTML = list
    .map((s) => `<tr data-s="${s}"><td class="tk">${s}</td><td colspan="5" class="muted">Scanning…</td></tr>`)
    .join("");
  // Small concurrency so we stay friendly to the data source.
  const queue = [...list];
  const worker = async () => {
    while (queue.length) {
      const sym = queue.shift();
      const row = body.querySelector(`tr[data-s="${CSS.escape(sym)}"]`);
      try {
        const d = await fetchMarket(sym);
        const s = d.signal;
        row.innerHTML = `
          <td class="tk">${sym}</td>
          <td>${fmtMoney(d.price, d.currency)}</td>
          <td>${fmtMoney(d.wma200.value, d.currency)}</td>
          <td class="${s.distancePct != null && s.distancePct <= 0 ? "up" : ""}">${fmtPct(s.distancePct)}</td>
          <td>${d.volume.day?.relativeVolume != null ? d.volume.day.relativeVolume.toFixed(2) + "×" : "—"}</td>
          <td><span class="pill" data-level="${s.level}">${s.label}</span>${s.volumeConfirmed && (s.level === "strong" || s.level === "buy") ? " 🔥" : ""}
              ${s.setup ? `<span class="setup-tag" data-setup="${s.setup.key}" title="${s.setup.detail}">${s.setup.label}</span>` : ""}
              <button class="rm" data-rm="${sym}" title="Remove ${sym}" aria-label="Remove ${sym}">×</button></td>`;
        row.dataset.dist = s.distancePct ?? 9999;
      } catch (err) {
        row.innerHTML = `<td class="tk">${sym}</td><td colspan="4" class="muted">${err.message}</td>
          <td><button class="rm" data-rm="${sym}" aria-label="Remove ${sym}">×</button></td>`;
        row.dataset.dist = 99999;
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  // Sort: best buy opportunities (closest to / below the 200 WMA) first.
  [...body.rows].sort((a, b) => a.dataset.dist - b.dataset.dist).forEach((r) => body.appendChild(r));
}

// ---------- top section: crypto sweetspot, sweetspot, S&P top 20, or extended ----------
const VIEW_KEY = "owl-top-view";
const VIEWS = {
  crypto: { title: "Crypto Sweetspot: within 6% of the 200 WMA", url: "/api/crypto", empty: "No major cryptocurrency is in the sweetspot right now." },
  sweetspot: { title: "Sweetspot: within 6% of the 200 WMA", url: "/api/screen", empty: "No S&P 500 stock is in the sweetspot right now." },
  top: { title: "S&P 500 Top 20", url: "/api/top" },
  extended: { title: "Extended: more than 30% above the 200 WMA", url: "/api/screen", empty: "No S&P 500 stock is extended right now." },
};
const topData = {};
let topView = "crypto";
try { if (VIEWS[localStorage.getItem(VIEW_KEY)]) topView = localStorage.getItem(VIEW_KEY); } catch {}

function topCard(s, rank, sub) {
  if (s.error) {
    return `<button class="top-card" data-s="${s.symbol}"><div class="top-row"><span class="rank">${rank}</span><span class="tk">${s.symbol}</span></div><div class="muted small">Unavailable</div></button>`;
  }
  const chg = s.changePct;
  return `<button class="top-card" data-s="${s.symbol}" title="${s.name}">
    <div class="top-row"><span class="rank">${rank}</span><span class="tk">${tickerLabel(s.symbol)}</span>
      <span class="chg ${chg >= 0 ? "up" : "down"}">${fmtPct(chg)}</span></div>
    <div class="nm">${s.name}</div>
    ${s.turningUp && (topView === "sweetspot" || topView === "crypto") ? `<div class="bounce">↑ Turning up this week</div>` : ""}
    ${s.signal.setup ? `<div class="setup-tag" data-setup="${s.signal.setup.key}" title="${s.signal.setup.detail}">${s.signal.setup.label}</div>` : ""}
    <div class="top-row price-line"><span class="px">${fmtMoney(s.price)}</span><span class="muted small">${sub}</span></div>
    <div class="top-row"><span class="pill" data-level="${s.signal.level}">${s.signal.label}</span>
      <span class="muted small nowrap">${fmtPct(s.signal.distancePct)}<span class="wl"> WMA</span></span></div>
  </button>`;
}

function renderTop() {
  const grid = $("topGrid");
  const v = VIEWS[topView];
  $("top-title").textContent = v.title;
  for (const b of $("viewTabs").children) b.setAttribute("aria-selected", b.dataset.view === topView);
  const data = topData[v.url];
  if (!data) {
    grid.innerHTML = Array.from({ length: 20 }, () => `<div class="top-card skeleton"></div>`).join("");
    $("top-meta").textContent = topView === "top" ? "Loading…" : topView === "crypto" ? "Screening major cryptocurrencies…" : "Screening all S&P 500 stocks…";
    return;
  }
  if (data.error) {
    grid.innerHTML = `<div class="muted top-empty">Could not load this list: ${data.error}</div>`;
    $("top-meta").textContent = "";
    return;
  }
  const time = new Date(data.fetchedAt).toLocaleTimeString();
  if (topView === "top") {
    grid.innerHTML = data.stocks.map((s) => topCard(s, s.rank, `Vol ${fmtVol(s.dayVolume)}`)).join("");
    $("top-meta").textContent = `Ranked by index weight (${data.asOf}) · updated ${time}`;
    return;
  }
  const list = data[topView];
  const total = data.counts[topView];
  grid.innerHTML = list.length
    ? list.map((s, i) => topCard(s, i + 1, `WMA ${fmtMoney(s.wma200)}`)).join("")
    : `<div class="muted top-empty">${v.empty}</div>`;
  const order = { crypto: "good setups first, then turning up, then closest to the WMA", sweetspot: "good setups first, then turning up, then closest to the WMA", extended: "most extended first" }[topView];
  const universe = topView === "crypto" ? "major cryptocurrencies" : "S&P 500 stocks";
  const btc = topView === "crypto" && data.market
    ? ` · Bitcoin ${fmtPct(data.market.distancePct)} vs its 200 WMA (${data.market.bull ? "crypto bull phase" : "crypto bear phase: be selective"})`
    : "";
  $("top-meta").textContent = `${total > list.length ? `Showing ${list.length} of ${total}` : `${total} found`} out of ${data.counts.screened} ${universe} · ${order}${btc} · updated ${time}`;
}

async function loadTop(force = false) {
  const url = VIEWS[topView].url;
  if (!topData[url] || force) {
    if (!topData[url]) renderTop();
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      topData[url] = data;
      renderMarket(data.market);
    } catch (err) {
      if (!topData[url] || topData[url].error) topData[url] = { error: err.message };
    }
  }
  if (VIEWS[topView].url === url) renderTop();
}

// ---------- events ----------
function setTopView(v) {
  if (!VIEWS[v] || v === topView) return;
  topView = v;
  try { localStorage.setItem(VIEW_KEY, v); } catch {}
  loadTop();
}
$("viewTabs").addEventListener("click", (e) => setTopView(e.target.closest("[data-view]")?.dataset.view));

// Hooks for auth.js to apply a signed-in user's saved profile.
window.owl = {
  getWatchlist,
  getView: () => topView,
  applyProfile({ watchlist, view }) {
    if (Array.isArray(watchlist) && watchlist.length) {
      try { localStorage.setItem(WATCH_KEY, JSON.stringify(watchlist)); } catch {}
      renderChips();
      scan();
    }
    setTopView(view);
  },
};
$("topGrid").addEventListener("click", (e) => {
  const s = e.target.closest("[data-s]")?.dataset.s;
  if (s) load(s).then(() => $("hero").scrollIntoView({ behavior: "smooth", block: "start" }));
});
$("search").addEventListener("submit", (e) => {
  e.preventDefault();
  load($("symbol").value);
});
$("chips").addEventListener("click", (e) => {
  const s = e.target.closest("[data-s]")?.dataset.s;
  if (s) load(s);
});
$("tabs").addEventListener("click", (e) => {
  const tf = e.target.dataset.tf;
  if (!tf) return;
  state.tf = tf;
  for (const b of $("tabs").children) b.setAttribute("aria-selected", b.dataset.tf === tf);
  renderVolChart();
});
$("scanBody").addEventListener("click", (e) => {
  const rm = e.target.dataset.rm;
  if (rm) {
    e.stopPropagation();
    setWatchlist(getWatchlist().filter((s) => s !== rm));
    e.target.closest("tr").remove();
    renderChips();
    return;
  }
  const s = e.target.closest("tr")?.dataset.s;
  if (s) {
    load(s);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
});
$("addForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const s = $("addSymbol").value.trim().toUpperCase();
  if (!s) return;
  const list = getWatchlist();
  if (!list.includes(s)) setWatchlist([...list, s]);
  $("addSymbol").value = "";
  renderChips();
  scan();
});
$("rescan").addEventListener("click", () => {
  cache.clear();
  scan();
});

// ---------- boot ----------
const initial = new URLSearchParams(location.search).get("symbol") || "SPY";
renderChips();
loadTop();
load(initial).then(scan);
setInterval(() => {
  if (document.hidden) return;
  loadTop(true);
  if (state.data) {
    cache.delete(state.data.symbol);
    load(state.data.symbol);
  }
}, 5 * 60 * 1000);
