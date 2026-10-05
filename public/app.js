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
  n == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: cur, maximumFractionDigits: 2 }).format(n);
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

// ---------- top section: at/below WMA, S&P top 20, or extended ----------
const VIEW_KEY = "owl-top-view";
const VIEWS = {
  below: { title: "At or below the 200 WMA", url: "/api/screen", empty: "No S&P 500 stock is at or below its 200-week moving average right now." },
  sweetspot: { title: "Sweetspot: at the 200 WMA to 7% below", url: "/api/screen", empty: "No S&P 500 stock is in the sweetspot right now." },
  top: { title: "S&P 500 Top 20", url: "/api/top" },
  extended: { title: "Extended: more than 30% above the 200 WMA", url: "/api/screen", empty: "No S&P 500 stock is extended right now." },
};
const topData = {};
let topView = "below";
try { if (VIEWS[localStorage.getItem(VIEW_KEY)]) topView = localStorage.getItem(VIEW_KEY); } catch {}

function topCard(s, rank, sub) {
  if (s.error) {
    return `<button class="top-card" data-s="${s.symbol}"><div class="top-row"><span class="rank">${rank}</span><span class="tk">${s.symbol}</span></div><div class="muted small">Unavailable</div></button>`;
  }
  const chg = s.changePct;
  return `<button class="top-card" data-s="${s.symbol}" title="${s.name}">
    <div class="top-row"><span class="rank">${rank}</span><span class="tk">${s.symbol}</span>
      <span class="chg ${chg >= 0 ? "up" : "down"}">${fmtPct(chg)}</span></div>
    <div class="nm">${s.name}</div>
    ${s.turningUp && topView === "sweetspot" ? `<div class="bounce">↑ Turning up this week</div>` : ""}
    <div class="top-row"><span class="px">${fmtMoney(s.price)}</span><span class="muted small">${sub}</span></div>
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
    $("top-meta").textContent = topView === "top" ? "Loading…" : "Screening all S&P 500 stocks…";
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
  const order = { below: "deepest below first", sweetspot: "turning up first, then closest to the WMA", extended: "most extended first" }[topView];
  $("top-meta").textContent = `${total > list.length ? `Showing ${list.length} of ${total}` : `${total} found`} out of ${data.counts.screened} S&P 500 stocks · ${order} · updated ${time}`;
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
