// Polite networking for discovery adapters: a descriptive UA, per-host rate limiting,
// and best-effort robots.txt respect. Public APIs (Overpass/Wikidata/Nominatim) and the
// scrapers all go through this so we stay a good citizen and don't hammer anyone.

export const UA = "ProspectorBot/0.1 (local lead-gen; +mailto:migasoulou@gmail.com)";

const lastHit = new Map();
const robots = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function rateLimit(host, ms) {
  const wait = (lastHit.get(host) ?? 0) + ms - Date.now();
  if (wait > 0) await sleep(wait);
  lastHit.set(host, Date.now());
}

function parseRobots(txt) {
  const dis = [];
  let active = false;
  for (let line of txt.split("\n")) {
    line = line.replace(/#.*/, "").trim();
    const ua = /^user-agent:\s*(.*)$/i.exec(line);
    if (ua) { active = ua[1] === "*"; continue; }
    if (active) { const d = /^disallow:\s*(.*)$/i.exec(line); if (d && d[1]) dis.push(d[1]); }
  }
  return dis;
}

async function allowed(url) {
  let u;
  try { u = new URL(url); } catch { return true; }
  if (!robots.has(u.host)) {
    let txt = "";
    try {
      const r = await fetch(`${u.protocol}//${u.host}/robots.txt`, { headers: { "user-agent": UA } });
      if (r.ok) txt = await r.text();
    } catch { /* allow on failure */ }
    robots.set(u.host, parseRobots(txt));
  }
  return !robots.get(u.host).some((d) => u.pathname.startsWith(d));
}

/** Rate-limited, robots-respecting fetch with the bot UA and a timeout. */
export async function politeFetch(url, opts = {}, { rateMs = 1100, robots: checkRobots = true } = {}) {
  if (checkRobots && !(await allowed(url))) throw new Error(`blocked by robots.txt: ${url}`);
  const host = (() => { try { return new URL(url).host; } catch { return "?"; } })();
  await rateLimit(host, rateMs);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeout ?? 15000);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal, headers: { "user-agent": UA, ...(opts.headers ?? {}) } });
  } finally {
    clearTimeout(t);
  }
}
