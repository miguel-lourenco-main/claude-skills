// Real website capture — Playwright over the system Google Chrome (channel:"chrome",
// no Chromium download). Mirrors the proven prime/consent/auto-scroll flow from
// ui-ux-references/research/extract.cjs. The page is captured as CONSECUTIVE, non-overlapping
// tiles — each up to MAX_TILE px tall — so the whole page is covered with no redundant hero
// copies or whitespace slices (the old DOM section-split produced both). Desktop + a mobile pass.
//
// Requires `npm install --prefix <plugin>` (playwright). If absent, capture() throws a
// clear error and the caller records reachable:true but a captureError (no fabrication).

import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

export const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
export const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
export const DESKTOP = { width: 1440, height: 900 };
export const MOBILE = { width: 390, height: 844 };
// Tile height = the render viewport height too (scroll-and-shoot), so keep it screen-realistic
// (~1000) to render the page faithfully; a much taller value inflates vh-based layouts.
export const MAX_TILE = Number(process.env.PROSPECTOR_TILE_HEIGHT ?? 1000);
const MAX_PAGE = Number(process.env.PROSPECTOR_MAX_PAGE ?? 14000);   // cap total captured height

export async function loadChromium() {
  try {
    const pw = await import("playwright");
    return pw.chromium;
  } catch {
    throw new Error("playwright not installed — run: npm install --prefix \"$CLAUDE_PLUGIN_ROOT\"");
  }
}

export async function launch(chromium) {
  // Prefer the system Chrome (already installed); fall back to a downloaded chromium.
  try {
    return await chromium.launch({ channel: "chrome" });
  } catch {
    return await chromium.launch();
  }
}

export async function dismissConsent(page) {
  const selectors = [
    "#onetrust-accept-btn-handler", ".cookie-accept", '[data-testid="uc-accept-all-button"]',
    "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll", "button#didomi-notice-agree-button",
    '.qc-cmp2-summary-buttons button[mode="primary"]',
  ];
  for (const sel of selectors) {
    try { const el = page.locator(sel).first(); if (await el.isVisible({ timeout: 400 })) { await el.click({ timeout: 1000 }).catch(() => {}); await page.waitForTimeout(200); } } catch { /* ignore */ }
  }
  const labels = [/accept all/i, /accept/i, /agree/i, /allow all/i, /got it/i, /\bok\b/i, /aceitar/i, /concordo/i];
  for (const re of labels) {
    try { const b = page.getByRole("button", { name: re }).first(); if (await b.isVisible({ timeout: 250 })) { await b.click({ timeout: 1000 }).catch(() => {}); await page.waitForTimeout(200); break; } } catch { /* ignore */ }
  }
}

export async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let last = 0, stable = 0, y = 0;
      const step = () => {
        window.scrollBy(0, 900); y += 900;
        const h = document.body.scrollHeight;
        if (h === last) { if (++stable >= 3) { window.scrollTo(0, 0); return resolve(); } }
        else { stable = 0; last = h; }
        if (y > 60000) { window.scrollTo(0, 0); return resolve(); }
        setTimeout(step, 220);
      };
      step();
    });
  });
}

export async function prime(page, url) {
  await page.goto(url, { waitUntil: "commit", timeout: 40000 }).catch(() => {});
  await page.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => {});
  await page.waitForLoadState("load", { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  if (!page.url() || page.url() === "about:blank") throw new Error("navigation did not commit");
  await dismissConsent(page);
  await autoScroll(page);
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(600);
}

/** Capture a primed page as top→bottom tiles, each one viewport (= MAX_TILE) tall, by
 *  scrolling and shooting the viewport (clip below the fold doesn't work in Playwright).
 *  Covers the whole page up to MAX_PAGE; the final tile may slightly overlap the previous
 *  when the page height isn't a multiple of the viewport (browser clamps the last scroll). */
export async function tilePage(page, prefix, outDir, signal, onProgress) {
  const docH = Math.min(await page.evaluate(() => document.body.scrollHeight), MAX_PAGE);
  const vh = page.viewportSize().height;
  const tiles = Math.max(1, Math.ceil(docH / vh));
  const files = [];
  let i = 0;
  for (let y = 0; y < docH; y += vh) {
    if (signal?.aborted) throw new Error("aborted");
    await page.evaluate((t) => window.scrollTo(0, t), y);
    await page.waitForTimeout(180); // let scroll settle / lazy content paint
    const name = `${prefix}-${++i}.png`;
    try { await page.screenshot({ path: join(outDir, name) }); files.push(name); onProgress?.(`${prefix} tile ${i}/${tiles}`); }
    catch { i--; break; }
  }
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  return { files, docH };
}

/** Attach honest runtime observers to a page BEFORE navigation. Returns a collector whose
 *  snapshot() yields { consoleErrors, failedRequests, requestCount, pageBytes } — all measured,
 *  never inferred. pageBytes is best-effort (content-length headers), so it under-counts. */
export function observeRuntime(page) {
  const consoleErrors = [];
  const failedRequests = [];
  let requestCount = 0;
  let pageBytes = 0;
  page.on("console", (m) => { if (m.type() === "error" && consoleErrors.length < 10) consoleErrors.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => { if (consoleErrors.length < 10) consoleErrors.push(String(e.message ?? e).slice(0, 200)); });
  page.on("request", () => { requestCount++; });
  page.on("requestfailed", (r) => { if (failedRequests.length < 10) failedRequests.push(`${r.url().slice(0, 160)} (${r.failure()?.errorText ?? "failed"})`); });
  page.on("response", (r) => {
    const len = Number(r.headers()["content-length"] ?? 0);
    if (len > 0) pageBytes += len;
    if (r.status() >= 400 && failedRequests.length < 10) failedRequests.push(`${r.url().slice(0, 160)} (http ${r.status()})`);
  });
  return { snapshot: () => ({ consoleErrors, failedRequests, requestCount, pageBytes }) };
}

/** In-page JS framework/library sniff (window globals + DOM markers). Measured, best-effort. */
export async function detectJsLibs(page) {
  return await page.evaluate(() => {
    const libs = [];
    const w = window;
    if (w.jQuery?.fn?.jquery) libs.push(`jQuery ${w.jQuery.fn.jquery}`);
    if (w.React || document.querySelector("[data-reactroot],#__next")) libs.push("React");
    if (w.Vue || document.querySelector("[data-v-app],#__nuxt")) libs.push("Vue");
    if (w.angular || document.querySelector("[ng-version]")) libs.push("Angular");
    if (w.Shopify) libs.push("Shopify runtime");
    if (w.wp || document.querySelector('link[href*="wp-content"]')) libs.push("WordPress assets");
    if (document.querySelector('script[src*="bootstrap"],link[href*="bootstrap"]')) libs.push("Bootstrap");
    if (w.Swiper || document.querySelector(".swiper")) libs.push("Swiper");
    if (w.gtag || w.ga || w.dataLayer) libs.push("Google Analytics/Tag Manager");
    if (w.fbq) libs.push("Meta Pixel");
    return libs;
  }).catch(() => []);
}

/**
 * Capture a site to <outDir>. Returns { desktop:[files], mobile:[files], thumbnail, meta }.
 * Throws only if Playwright is missing; per-page failures degrade to fewer frames.
 */
export async function capture(url, outDir, { signal, onProgress } = {}) {
  rmSync(outDir, { recursive: true, force: true }); // drop any stale frames from a prior capture
  mkdirSync(outDir, { recursive: true });
  const chromium = await loadChromium();
  const browser = await launch(chromium);
  // Cooperative cancel: closing the browser rejects any in-flight screenshot → capture throws.
  if (signal) signal.addEventListener("abort", () => { browser.close().catch(() => {}); }, { once: true });
  const out = { desktop: [], mobile: [], thumbnail: null, meta: {} };
  try {
    if (signal?.aborted) throw new Error("aborted");
    // ---- desktop: top→bottom tiles ----
    const ctx = await browser.newContext({ viewport: { width: DESKTOP.width, height: MAX_TILE }, userAgent: UA, locale: "pt-PT", timezoneId: "Europe/Lisbon", ignoreHTTPSErrors: true, serviceWorkers: "block" });
    const page = await ctx.newPage();
    const runtime = observeRuntime(page); // console errors / failed requests / weight — real measurements
    const t0 = Date.now();
    onProgress?.("loading page");
    await prime(page, url);
    out.meta.loadMs = Date.now() - t0;
    out.meta.title = (await page.title().catch(() => "")).slice(0, 160);
    out.meta.jsLibs = await detectJsLibs(page);
    Object.assign(out.meta, runtime.snapshot());
    const d = await tilePage(page, "desktop", outDir, signal, onProgress);
    out.desktop = d.files;
    out.meta.docHeight = d.docH;
    out.thumbnail = out.desktop[0] ?? null; // first tile = above-the-fold
    await ctx.close();
    if (signal?.aborted) throw new Error("aborted");

    // ---- mobile pass (responsiveness is the biggest "dated" tell), same tiling ----
    try {
      const mctx = await browser.newContext({ viewport: { width: MOBILE.width, height: MAX_TILE }, userAgent: MOBILE_UA, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: "pt-PT", ignoreHTTPSErrors: true });
      const mpage = await mctx.newPage();
      onProgress?.("mobile pass");
      await prime(mpage, url);
      const m = await tilePage(mpage, "mobile", outDir, signal, onProgress);
      out.mobile = m.files;
      await mctx.close();
    } catch { /* mobile pass best-effort */ }
  } finally {
    await browser.close().catch(() => {});
  }
  return out;
}
