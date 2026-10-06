// Recent partnership news from Google News search (RSS, no API key).
// Pure parsing/filtering lives here too so it can be unit tested.
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

// "Apple Inc." -> "Apple", "SoFi Technologies, Inc." -> "SoFi", "Bitcoin USD" -> "Bitcoin".
export function searchName(name) {
  return String(name || "")
    .replace(/\s+USD$/i, "")
    .replace(/,?\s+(Inc\.?|Incorporated|Corporation|Corp\.?|Company|Co\.?|Ltd\.?|Limited|plc|PLC|N\.V\.|S\.A\.|AG|SE|Holdings?|Group|Technologies|Platforms|\(The\))\b\.?/g, "")
    .replace(/\s*\(The\)/i, "")
    .replace(/^The\s+/i, "")
    .replace(/[,.&\s]+$/, "")
    .trim();
}

const decode = (s) => String(s || "")
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));

export function parseRss(xml) {
  return [...String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, it]) => {
    const tag = (t) => decode((it.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)) || [])[1]).trim();
    const source = tag("source");
    let title = tag("title");
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3)); // Google appends " - Source"
    return { title, link: tag("link"), source, published: Date.parse(tag("pubDate")) || null };
  });
}

// Words that signal a partnership. "Partners" alone is skipped because many
// firm names contain it ("Miller Value Partners"); "partners with" is kept.
const DEAL = /\bpartnership|\bpartner(s|ed|ing)? with\b|\bpartnering\b|\bteam(s|ed)? up\b|\bcollaborat\w*|\balliance\b|\bjoint venture\b|\btie-up\b/i;
// Company names that contain deal words ("Western Alliance Bancorporation").
const NAMED = /\b(Western|Star|Pacific) Alliance\b|\bAlliance (Bancorp\w*|Bernstein|Resource|Data|Laundry|Entertainment)\b|\bAllianceBernstein\b/i;

const words = (t) => new Set(t.toLowerCase().match(/[a-z0-9]+/g) || []);
function similar(a, b) {
  const A = words(a), B = words(b);
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return shared / Math.max(1, Math.min(A.size, B.size)) >= 0.6;
}

// Keep headlines that name the company and describe a deal; drop near-duplicates
// (the same deal reported by several outlets); newest first.
export function pickPartnerships(items, name, limit = 5) {
  const key = searchName(name).split(/\s+/)[0];
  if (!key) return [];
  // Names with inner capitals (SoFi, JPMorgan) must match exactly, so "Sofi Tukker" doesn't count.
  const exactCase = /[a-z]/.test(key) && /^.+[A-Z]/.test(key);
  const mentions = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, exactCase ? "" : "i");
  const kept = [];
  for (const it of [...items].sort((a, b) => (b.published ?? 0) - (a.published ?? 0))) {
    if (!it.title || !DEAL.test(it.title.replace(NAMED, "")) || !mentions.test(it.title)) continue;
    if (kept.some((k) => similar(k.title, it.title))) continue;
    kept.push(it);
    if (kept.length >= limit) break;
  }
  return kept;
}

export async function partnershipNews(name, { timeoutMs = 4000 } = {}) {
  const q = searchName(name);
  if (!q) return [];
  const query = `"${q}" (partnership OR "partners with" OR "teams up" OR collaboration OR alliance OR "joint venture") when:180d`;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return [];
    return pickPartnerships(parseRss(await res.text()), q);
  } catch {
    return []; // news is a nice-to-have; never fail the profile over it
  }
}
