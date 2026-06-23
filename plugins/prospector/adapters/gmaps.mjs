// Google Maps discovery via Playwright — free, no key, but SCRAPED: ToS-gray and brittle
// to Google's layout changes. Best-effort by design: any failure returns [] rather than
// breaking the pipeline. Yields name + (when shown in the feed) website + the 'no website'
// signal. Needs the same `npm install` as capture.

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export async function discover(scope) {
  let chromium;
  try { ({ chromium } = await import("playwright")); } catch { return []; }
  const area = scope.area || scope.cities?.[0] || "Portugal";
  const verticals = scope.vertical ? [scope.vertical] : scope.verticals ?? ["hospitality"];
  const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch().catch(() => null));
  if (!browser) return [];

  const out = [];
  try {
    const ctx = await browser.newContext({ userAgent: UA, locale: "pt-PT", viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    for (const v of verticals) {
      const q = encodeURIComponent(`${v} ${area} Portugal`);
      try {
        await page.goto(`https://www.google.com/maps/search/${q}`, { waitUntil: "domcontentloaded", timeout: 30000 });
        // consent interstitial
        for (const re of [/aceitar tudo/i, /accept all/i, /concordo/i, /i agree/i]) {
          try { const b = page.getByRole("button", { name: re }).first(); if (await b.isVisible({ timeout: 1500 })) { await b.click().catch(() => {}); break; } } catch { /* ignore */ }
        }
        await page.waitForSelector('[role="feed"]', { timeout: 8000 }).catch(() => {});
        // scroll the results feed to load more
        for (let i = 0; i < 6; i++) {
          await page.evaluate(() => { const f = document.querySelector('[role="feed"]'); if (f) f.scrollBy(0, 1200); }).catch(() => {});
          await page.waitForTimeout(700);
        }
        const rows = await page.evaluate(() => {
          const cards = Array.from(document.querySelectorAll('[role="feed"] > div'));
          return cards.map((c) => {
            const name = c.querySelector("a.hfpxzc")?.getAttribute("aria-label") || c.querySelector(".qBF1Pd")?.textContent || null;
            let site = c.querySelector('a[data-value="Website"]')?.getAttribute("href") || null;
            // drop Google ad redirects + relative hrefs — keep only real external sites
            if (site && (!/^https?:\/\//i.test(site) || /\/aclk\?|googleadservices|google\.com\/aclk/i.test(site))) site = null;
            return name ? { name, site } : null;
          }).filter(Boolean);
        }).catch(() => []);
        for (const r of rows) {
          out.push({
            name: r.name,
            vertical: v,
            location: { city: area },
            contacts: { website: r.site, phone: null },
            hasWebsite: !!r.site,
            source: "gmaps",
            sourceConfidence: 0.5,
          });
        }
      } catch { /* skip this vertical */ }
    }
  } catch { /* ignore */ } finally {
    await browser.close().catch(() => {});
  }
  return out;
}
