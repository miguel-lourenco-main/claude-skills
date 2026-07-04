// Real website probe — cheap technical signals with NO browser and NO fabrication.
// Reachability is a hard gate: if a site doesn't resolve / responds with an error,
// the caller must NOT capture or grade it. Whatever we can't measure truthfully is
// returned as null, never invented.

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function withProtocol(url) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

async function fetchText(url, ms, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,*/*", "accept-language": "pt-PT,pt;q=0.9,en;q=0.8" },
      ...opts,
    });
    return res;
  } finally {
    clearTimeout(t);
  }
}

/** Years since domain registration via RDAP (free, no key). Best-effort → null. */
async function domainAge(host) {
  try {
    const res = await fetchText(`https://rdap.org/domain/${host}`, 6000, { headers: { accept: "application/rdap+json" } });
    if (!res.ok) return null;
    const data = await res.json();
    const reg = (data.events ?? []).find((e) => e.eventAction === "registration");
    if (!reg?.eventDate) return null;
    const years = (Date.now() - new Date(reg.eventDate).getTime()) / (365.25 * 864e5);
    return years > 0 ? Math.round(years) : null;
  } catch {
    return null;
  }
}

function detectCms(html, headers) {
  const gen = /<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1];
  if (gen) return gen.trim();
  const powered = headers.get("x-powered-by") || "";
  const sigs = [
    [/wp-content|wp-json|wp-includes/i, "WordPress"],
    [/cdn\.shopify\.com|Shopify\.theme/i, "Shopify"],
    [/static\.parastorage\.com|wix\.com|X-Wix/i, "Wix"],
    [/squarespace\.com|static1\.squarespace/i, "Squarespace"],
    [/\/media\/jui\/|Joomla!/i, "Joomla"],
    [/assets\.webflow\.com|webflow\.io/i, "Webflow"],
    [/Drupal\.settings|\/sites\/default\/files/i, "Drupal"],
  ];
  for (const [re, name] of sigs) if (re.test(html) || re.test(powered)) return name;
  return null;
}

/** Cheap on-page SEO/marketing signals — regex over the fetched HTML, measured not inferred. */
function pageSignals(html) {
  const title = /<title[^>]*>([^<]{1,300})/i.exec(html)?.[1]?.trim() || null;
  return {
    title,
    metaDescription: /<meta[^>]+name=["']description["'][^>]+content=["'][^"']+["']/i.test(html)
      || /<meta[^>]+content=["'][^"']+["'][^>]+name=["']description["']/i.test(html),
    ogTags: /<meta[^>]+property=["']og:/i.test(html),
    structuredData: /<script[^>]+type=["']application\/ld\+json["']/i.test(html),
    analytics: /gtag\(|google-analytics\.com|googletagmanager\.com|fbq\(|connect\.facebook\.net/i.test(html),
  };
}

/** Newest 4-digit year in a footer copyright (e.g. "© 2018"), as a coarse "lastModified". */
function copyrightYear(html) {
  const years = [...html.matchAll(/(?:©|&copy;|copyright)[^0-9]{0,12}(20\d{2})/gi)].map((m) => Number(m[1]));
  if (!years.length) return null;
  return String(Math.max(...years));
}

/**
 * Probe a site. Returns { reachable, ...tech } — taste is decided elsewhere (by the agent),
 * never here. On any failure to reach the site, reachable:false and tech fields stay null.
 */
export async function probe(rawUrl) {
  if (!rawUrl) return { reachable: false, reason: "no website", status: null };
  const url = withProtocol(rawUrl);
  let res;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      res = await fetchText(url, 10000);
      break;
    } catch (e) {
      if (attempt === 1) return { reachable: false, reason: e.name === "AbortError" ? "timeout" : "unreachable", status: null };
    }
  }
  if (!res) return { reachable: false, reason: "unreachable", status: null };
  if (res.status >= 400) return { reachable: false, reason: `http ${res.status}`, status: res.status, finalUrl: res.url };

  let html = "";
  try {
    const buf = await res.arrayBuffer();
    html = Buffer.from(buf).slice(0, 600_000).toString("utf8");
  } catch { /* keep empty */ }

  const finalUrl = res.url || url;
  const host = (() => { try { return new URL(finalUrl).hostname.replace(/^www\./, ""); } catch { return null; } })();
  return {
    reachable: true,
    status: res.status,
    finalUrl,
    tech: {
      https: finalUrl.startsWith("https://"),
      mobileFriendly: /<meta[^>]+name=["']viewport["'][^>]*content=["'][^"']*width\s*=\s*device-width/i.test(html),
      cms: detectCms(html, res.headers),
      lastModified: res.headers.get("last-modified") ?? copyrightYear(html),
      domainAge: host ? await domainAge(host) : null,
      htmlKB: Math.round(html.length / 1024),
      ...pageSignals(html),
      lighthousePerf: null, // not measured here; never faked
    },
  };
}
