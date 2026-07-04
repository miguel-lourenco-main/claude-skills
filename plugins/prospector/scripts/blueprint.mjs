// Deep redesign capture — the mechanical half of the prospect-blueprint skill. Where audit.mjs
// snapshots the HOMEPAGE for a taste grade, this crawls the site's key pages and records
// everything measurable about how it looks AND works: per-page desktop+mobile tiles, rendered
// DOM, design tokens (fonts/colors), forms, headings/landmarks, a11y + SEO counters, runtime
// console errors / failed requests / page weight, a mobile-menu interaction probe, and a broken-
// internal-link sweep. All of it is MEASURED — nothing inferred, nothing fabricated. The agent
// then studies the artifacts and writes blueprints/<id>/blueprint.md (the improvement plan).
//
//   node scripts/blueprint.mjs '{"companyId":"pt-x"}'                     # url from audit/company
//   node scripts/blueprint.mjs '{"companyId":"pt-x","url":"https://…"}'   # explicit url
//   node scripts/blueprint.mjs '{"url":"https://example.pt"}'             # store-less (id = domain)
//
// Env: PROSPECTOR_BP_PAGES (max pages crawled, default 8) · PROSPECTOR_BP_LINKCHECK (default 40).
//
// Output under <store>/blueprints/<id>/:
//   capture.json                 site + per-page findings (the machine-readable summary)
//   pages/<slug>/desktop-N.png   full-page desktop tiles          pages/<slug>/mobile-N.png
//   pages/<slug>/mobile-menu.png the opened mobile nav (when found)
//   pages/<slug>/dom.html        the RENDERED DOM (post-JS), for code-level review

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { paths, readAudit, readCompany, storeRoot } from "../lib/store.mjs";
import { probe, techFromHtml } from "../lib/probe.mjs";
import { DESKTOP_CH, detectJsLibs, launch, loadChromium, MAX_TILE, MOBILE, MOBILE_CH, MOBILE_UA, observeRuntime, prime, tilePage, DESKTOP, UA } from "../lib/capture.mjs";
import { emit, progress, readRequest } from "./_cli.mjs";

const MAX_PAGES = Number(process.env.PROSPECTOR_BP_PAGES ?? 8);
const MAX_LINKCHECK = Number(process.env.PROSPECTOR_BP_LINKCHECK ?? 40);
const MAX_DOM_BYTES = 1_500_000;

const root = storeRoot();
const req = readRequest();

// ---- resolve target: company in the store, or a bare url ------------------------------------
const company = req.companyId ? readCompany(req.companyId, root) : null;
if (req.companyId && !company) { emit({ action: "blueprint", ok: false, error: `no company ${req.companyId}` }); process.exit(0); }
const audit = req.companyId ? readAudit(req.companyId, root) : null;
const url = req.url ?? audit?.url ?? company?.contacts?.website;
if (!url) { emit({ action: "blueprint", ok: false, error: "no url — company has no website (and none was given)" }); process.exit(0); }
const id = req.companyId ?? (() => { try { return new URL(/^https?:/i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, ""); } catch { return "site"; } })();

// ---- cooperative cancel (same contract as audit.mjs) -----------------------------------------
const ac = new AbortController();
let stopping = false;
const stop = () => { stopping = true; ac.abort(); };
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

// ---- helpers ----------------------------------------------------------------------------------
const slugOf = (u, taken) => {
  let s = "home";
  try {
    const p = new URL(u).pathname.replace(/\/+$/, "");
    if (p && p !== "/") s = p.split("/").filter(Boolean).join("-").replace(/[^a-z0-9-]+/gi, "-").replace(/-+/g, "-").slice(0, 40).toLowerCase() || "page";
  } catch { s = "page"; }
  let out = s, n = 2;
  while (taken.has(out)) out = `${s}-${n++}`;
  taken.add(out);
  return out;
};
const normalize = (href, base) => {
  try {
    const u = new URL(href, base);
    if (!/^https?:$/.test(u.protocol)) return null;
    u.hash = "";
    u.pathname = u.pathname.replace(/\/index\.(html?|php)$/i, "/"); // /index.html ≡ /
    return u.href.replace(/\/$/, "");
  } catch { return null; }
};
const sameHost = (a, b) => { try { return new URL(a).hostname.replace(/^www\./, "") === new URL(b).hostname.replace(/^www\./, ""); } catch { return false; } };
const isAsset = (u) => /\.(pdf|jpe?g|png|gif|webp|svg|mp4|zip|docx?|xlsx?|ics)(\?|$)/i.test(u);

/** Everything measurable about the CURRENT page, evaluated in-page. */
async function analyzePage(page) {
  return await page.evaluate(() => {
    const $ = (s) => document.querySelectorAll(s);
    const txt = (el) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
    const uniq = (a) => [...new Set(a)].filter(Boolean);
    const style = (el, p) => el && getComputedStyle(el)[p];
    // design tokens: sample fonts + colors from the elements that define the look
    const sampled = ["body", "h1", "h2", "h3", "p", "a", "button", ".btn", "nav", "header"].flatMap((s) => [...$(s)].slice(0, 3));
    const fonts = uniq(sampled.map((el) => style(el, "fontFamily")?.split(",")[0]?.replace(/["']/g, "").trim()));
    const colors = uniq(sampled.flatMap((el) => [style(el, "color"), style(el, "backgroundColor")]))
      .filter((c) => c && c !== "rgba(0, 0, 0, 0)").slice(0, 24);
    const imgs = [...$("img")];
    const inputs = [...$("input,textarea,select")].filter((i) => !["hidden", "submit", "button"].includes(i.type));
    return {
      title: document.title?.slice(0, 200) || null,
      lang: document.documentElement.lang || null,
      metaDescription: !!document.querySelector('meta[name="description"][content]'),
      viewportMeta: !!document.querySelector('meta[name="viewport"]'),
      h1: [...$("h1")].map(txt).filter(Boolean).slice(0, 3),
      headings: { h1: $("h1").length, h2: $("h2").length, h3: $("h3").length },
      landmarks: { header: !!$("header").length, nav: !!$("nav").length, main: !!$("main").length, footer: !!$("footer").length },
      words: txt(document.body).split(/\s+/).length,
      images: { total: imgs.length, missingAlt: imgs.filter((i) => !i.alt?.trim()).length },
      links: {
        internal: [...$("a[href]")].filter((a) => a.host === location.host).length,
        external: [...$("a[href^='http']")].filter((a) => a.host !== location.host).length,
      },
      forms: [...$("form")].slice(0, 6).map((f) => ({
        action: f.getAttribute("action") || null,
        method: (f.method || "get").toLowerCase(),
        fields: [...f.querySelectorAll("input,textarea,select")].filter((i) => i.type !== "hidden").slice(0, 12)
          .map((i) => ({ tag: i.tagName.toLowerCase(), type: i.type || null, name: i.name || i.id || null })),
        hasSubmit: !!f.querySelector('[type="submit"],button:not([type="button"])'),
      })),
      inputsWithoutLabel: inputs.filter((i) => !(i.labels?.length || i.getAttribute("aria-label") || i.placeholder)).length,
      fonts,
      colors,
      hrefs: uniq([...$("a[href]")].map((a) => a.href)).slice(0, 300),
      navHrefs: uniq([...$("header a[href], nav a[href]")].map((a) => a.href)).slice(0, 60),
    };
  }).catch((e) => ({ analyzeError: String(e?.message ?? e).slice(0, 200) }));
}

/** Try to open the mobile nav (hamburger) and screenshot it — the single most telling
 *  interaction on a dated site. Returns { attempted, opened, file } — measured, best-effort. */
async function probeMobileMenu(page, outDir) {
  const sels = [
    '[aria-label*="menu" i]', '[aria-controls*="nav" i]', ".hamburger", ".menu-toggle", ".navbar-toggler",
    ".menu-icon", "#menu-toggle", 'button[class*="burger" i]', 'a[class*="menu" i][href="#"]',
  ];
  for (const sel of sels) {
    try {
      const el = page.locator(sel).first();
      if (!(await el.isVisible({ timeout: 300 }))) continue;
      await el.click({ timeout: 1500 });
      await page.waitForTimeout(700);
      const file = "mobile-menu.png";
      await page.screenshot({ path: join(outDir, file) });
      return { attempted: true, opened: true, file, trigger: sel };
    } catch { /* try the next selector */ }
  }
  return { attempted: true, opened: false, file: null };
}

// ---- main -------------------------------------------------------------------------------------
const outRoot = join(paths(root).blueprints, id);
const pagesDir = join(outRoot, "pages");
rmSync(pagesDir, { recursive: true, force: true }); // clean re-capture; blueprint.md (if any) survives
mkdirSync(pagesDir, { recursive: true });

progress({ phase: "probing", item: url });
const p = await probe(url);
// A bot-walled probe (WAF 403/429 to Node's fetch) is not proof the site is dead — the real
// browser below is the arbiter. Only a plain unreachable (DNS/timeout/4xx-not-waf) bails here.
if (!p.reachable && !p.botBlocked) { emit({ action: "blueprint", ok: false, error: `unreachable: ${p.reason ?? "?"}`, url }); process.exit(0); }
const baseUrl = p.finalUrl ?? (/^https?:/i.test(url) ? url : `https://${url}`);
let tech = p.reachable ? p.tech : null; // botBlocked → derived from the rendered home page below

const chromium = await loadChromium();
const browser = await launch(chromium);
if (ac.signal) ac.signal.addEventListener("abort", () => { browser.close().catch(() => {}); }, { once: true });

const site = { jsLibs: [], fonts: [], colors: [], brokenLinks: [] };
const pages = [];
const taken = new Set();
const homeUrl = normalize(baseUrl, baseUrl) ?? baseUrl;
let queue = [homeUrl];
const seen = new Set([homeUrl]);
const allInternalHrefs = new Set();

try {
  // sitemap candidates (best-effort, appended after nav-discovered links)
  const sitemapUrls = await (async () => {
    try {
      const res = await fetch(new URL("/sitemap.xml", baseUrl), { headers: { "user-agent": UA }, signal: AbortSignal.timeout(6000) });
      if (!res.ok) return [];
      const xml = (await res.text()).slice(0, 400_000);
      return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => normalize(m[1], baseUrl))
        .filter((u) => u && sameHost(u, baseUrl) && !isAsset(u)).slice(0, 30);
    } catch { return []; }
  })();

  for (let i = 0; i < queue.length && pages.length < MAX_PAGES; i++) {
    if (stopping) break;
    const pageUrl = queue[i];
    const slug = slugOf(pageUrl, taken);
    const dir = join(pagesDir, slug);
    mkdirSync(dir, { recursive: true });
    const at = { i: pages.length + 1, n: Math.min(MAX_PAGES, queue.length), item: slug };
    const entry = { slug, url: pageUrl, desktop: [], mobile: [] };

    // ---- desktop: analyze + tiles + rendered DOM ----
    try {
      const ctx = await browser.newContext({ viewport: { width: DESKTOP.width, height: MAX_TILE }, userAgent: UA, extraHTTPHeaders: DESKTOP_CH, locale: "pt-PT", timezoneId: "Europe/Lisbon", ignoreHTTPSErrors: true, serviceWorkers: "block" });
      const page = await ctx.newPage();
      const runtime = observeRuntime(page);
      const t0 = Date.now();
      progress({ ...at, phase: "desktop" });
      await prime(page, pageUrl);
      entry.loadMs = Date.now() - t0;
      entry.analysis = await analyzePage(page);
      if (pages.length === 0) site.jsLibs = await detectJsLibs(page);
      const d = await tilePage(page, "desktop", dir, ac.signal, (m) => progress({ ...at, phase: "desktop", message: m }));
      entry.desktop = d.files;
      entry.docHeight = d.docH;
      try {
        const dom = await page.content();
        writeFileSync(join(dir, "dom.html"), dom.slice(0, MAX_DOM_BYTES), "utf8");
        entry.dom = "dom.html";
        if (!tech) tech = { ...(await techFromHtml(dom.slice(0, 600_000), { finalUrl: page.url() })), fetchBlocked: p.reason };
      } catch { /* dom save best-effort */ }
      entry.runtime = runtime.snapshot();
      // grow the crawl queue: nav links first (they define the IA), then body links
      const a = entry.analysis;
      for (const href of [...(a.navHrefs ?? []), ...(a.hrefs ?? [])]) {
        const u = normalize(href, pageUrl);
        if (!u || !sameHost(u, baseUrl) || isAsset(u)) continue;
        allInternalHrefs.add(u);
        if (!seen.has(u) && queue.length < MAX_PAGES * 4) { seen.add(u); queue.push(u); }
      }
      delete a?.hrefs; delete a?.navHrefs; // captured into the queue/linkcheck — keep capture.json lean
      await ctx.close();
    } catch (e) {
      if (stopping) break;
      entry.error = String(e?.message ?? e).slice(0, 200);
    }

    // ---- mobile: tiles + (home only) menu interaction probe ----
    if (!stopping && !entry.error) {
      try {
        const mctx = await browser.newContext({ viewport: { width: MOBILE.width, height: MAX_TILE }, userAgent: MOBILE_UA, extraHTTPHeaders: MOBILE_CH, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: "pt-PT", ignoreHTTPSErrors: true });
        const mpage = await mctx.newPage();
        progress({ ...at, phase: "mobile" });
        await prime(mpage, pageUrl);
        const m = await tilePage(mpage, "mobile", dir, ac.signal, (msg) => progress({ ...at, phase: "mobile", message: msg }));
        entry.mobile = m.files;
        if (pages.length === 0) entry.mobileMenu = await probeMobileMenu(mpage, dir);
        await mctx.close();
      } catch { /* mobile best-effort, desktop evidence stands */ }
    }

    pages.push(entry);

    // after the homepage, top up the queue with sitemap pages the nav didn't surface
    if (pages.length === 1) for (const u of sitemapUrls) if (!seen.has(u)) { seen.add(u); queue.push(u); }
  }

  // ---- broken internal links, over links we did NOT crawl. Plain fetch normally; when the site
  // bot-walls Node's fetch, every plain check would 429 (all-false-positives) — go through the
  // browser instead (slower, so a lower cap). ----
  if (!stopping) {
    const cap = p.botBlocked ? Math.min(MAX_LINKCHECK, 15) : MAX_LINKCHECK;
    const toCheck = [...allInternalHrefs].filter((u) => !pages.some((pg) => pg.url === u)).slice(0, cap);
    progress({ phase: "link check", message: `${toCheck.length} internal links${p.botBlocked ? " (via browser — fetch is bot-walled)" : ""}` });
    if (p.botBlocked) {
      const lctx = await browser.newContext({ viewport: { width: DESKTOP.width, height: 600 }, userAgent: UA, extraHTTPHeaders: DESKTOP_CH, ignoreHTTPSErrors: true });
      const lpage = await lctx.newPage();
      for (const u of toCheck) {
        if (stopping) break;
        try {
          const res = await lpage.goto(u, { waitUntil: "commit", timeout: 15000 });
          if (res && res.status() >= 400) site.brokenLinks.push({ url: u, status: res.status() });
        } catch { site.brokenLinks.push({ url: u, status: null }); }
      }
      await lctx.close().catch(() => {});
    } else {
      for (const u of toCheck) {
        if (stopping) break;
        try {
          const res = await fetch(u, { method: "GET", redirect: "follow", headers: { "user-agent": UA }, signal: AbortSignal.timeout(8000) });
          if (res.status >= 400) site.brokenLinks.push({ url: u, status: res.status });
        } catch { site.brokenLinks.push({ url: u, status: null }); }
      }
    }
  }
} finally {
  await browser.close().catch(() => {});
}

// ---- site rollup + capture.json ----------------------------------------------------------------
site.fonts = [...new Set(pages.flatMap((pg) => pg.analysis?.fonts ?? []))].slice(0, 12);
site.colors = [...new Set(pages.flatMap((pg) => pg.analysis?.colors ?? []))].slice(0, 32);
const consoleErrors = pages.reduce((n, pg) => n + (pg.runtime?.consoleErrors?.length ?? 0), 0);

// bot-walled AND the browser couldn't load anything either → honestly unreachable
if (!pages.some((pg) => pg.desktop.length)) {
  emit({ action: "blueprint", ok: false, error: `unreachable: ${p.reason ?? "browser could not load the site"}`, url: baseUrl });
  process.exit(0);
}

const captureJson = {
  companyId: req.companyId ?? null,
  id,
  url: baseUrl,
  capturedAt: new Date().toISOString(),
  canceled: stopping || undefined,
  tech,
  site,
  pages: pages.map(({ ...pg }) => pg),
  totals: {
    pages: pages.length,
    discovered: seen.size,
    brokenLinks: site.brokenLinks.length,
    consoleErrors,
    formsFound: pages.reduce((n, pg) => n + (pg.analysis?.forms?.length ?? 0), 0),
  },
};
writeFileSync(join(outRoot, "capture.json"), JSON.stringify(captureJson, null, 2) + "\n", "utf8");

emit({
  action: "blueprint",
  ok: !stopping,
  id,
  url: baseUrl,
  dir: outRoot,
  pages: pages.map((pg) => ({ slug: pg.slug, url: pg.url, desktop: pg.desktop.length, mobile: pg.mobile.length, error: pg.error })),
  totals: captureJson.totals,
  canceled: stopping || undefined,
});
