#!/usr/bin/env node
/**
 * discover.cjs — find candidate live-site URLs for a category.
 *
 * Sources (per-category, configured in sources.json):
 *   - OnePageLove genres  -> https://onepagelove.com/genre/<g>     (category-specific)
 *   - Awwwards categories -> https://www.awwwards.com/websites/<c>/ (e.g. food-beverage; category-specific)
 *   - Godly home (opt-in `godlyHome:true`) -> broad mix, no URL category filter
 *   - seeds[]             -> any URL you paste (e.g. a Godly/Awwwards find)
 * Each gallery links straight to the showcased live sites; we collect those domains.
 *
 * Usage: node research/discover.cjs [category] [--limit N]
 * Output: research/candidates.<category>.json  -> [{ url, source, category }]
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const sources = JSON.parse(fs.readFileSync(path.join(ROOT, 'sources.json'), 'utf8'));

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// Domains that are never the "showcased site" (galleries, affiliates, socials, infra).
const JUNK = new RegExp(
  [
    'onepagelove', 'land-book', 'godly', 'awwwards', 'behance', 'dribbble', 'siteinspire',
    'pxf\\.io', 'framer\\.link', 'framer\\.com', 'webflow', 'squareup', 'square\\.', 'shopify',
    'gumroad', 'gum\\.co', 'stripe', 'mixpanel', 'notion', 'substack', 'mailchimp', 'typeform',
    'calendly', 'linktr\\.ee', 'patreon', 'ko-fi', 'buymeacoffee',
    'twitter', 'x\\.com', 'instagram', 'facebook', 'fb\\.', 'linkedin', 'youtube', 'youtu\\.be',
    'tiktok', 'pinterest', 'threads\\.net', 'vimeo', 'github', 'gitlab',
    'google', 'gstatic', 'cloudflare', 'cdn', 'fonts\\.', 'wp\\.com', 'wordpress\\.org',
    'apple\\.com', 'play\\.google', 'amazon', 'godaddy', 'namecheap', 'wix\\.com', 'wixsite',
    'medium\\.com', 'figma\\.com', 'producthunt', 'unsplash', 'pexels',
  ].join('|'),
  'i',
);

function registrable(host) {
  return host.replace(/^www\./, '').toLowerCase();
}

async function autoScroll(page, steps = 24, dy = 900, pause = 220) {
  await page.evaluate(
    async ({ steps, dy, pause }) => {
      for (let i = 0; i < steps; i++) {
        window.scrollBy(0, dy);
        await new Promise((r) => setTimeout(r, pause));
      }
      window.scrollTo(0, 0);
    },
    { steps, dy, pause },
  );
}

async function collectExternal(page) {
  const host = registrable(new URL(page.url()).host);
  return page.evaluate((host) => {
    const out = new Set();
    for (const a of Array.from(document.querySelectorAll('a[href]'))) {
      try {
        const u = new URL(a.href);
        if (!/^https?:$/.test(u.protocol)) continue;
        const h = u.host.replace(/^www\./, '').toLowerCase();
        if (!h.includes(host)) out.add(`https://${h}`);
      } catch {}
    }
    return Array.from(out);
  }, host);
}

/**
 * Load a gallery/listing page, scroll it, and add its outbound live-site domains
 * (minus JUNK) to `found`. Works for any gallery whose listing links straight to
 * the showcased sites (OnePageLove genres, Awwwards category pages, Godly home).
 */
async function harvest(page, url, label, found, category) {
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (!resp || resp.status() >= 400) {
      console.log(`  skip ${label} [${resp ? resp.status() : 'no-resp'}]`);
      return;
    }
    await autoScroll(page);
    await page.waitForTimeout(600);
    let added = 0;
    for (const e of await collectExternal(page)) {
      const host = registrable(new URL(e).host);
      if (JUNK.test(host) || host.split('.').length < 2) continue;
      if (!found.has(host)) {
        found.set(host, { url: e, source: label, category });
        added++;
      }
    }
    console.log(`  ${label}: +${added} (total ${found.size})`);
  } catch (e) {
    console.log(`  fail ${label}: ${e.message.split('\n')[0]}`);
  }
}

async function main() {
  const category = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'restaurant';
  const limitArg = process.argv.indexOf('--limit');
  const cfg = sources.categories[category];
  if (!cfg) {
    console.error(`Unknown category "${category}". Known: ${Object.keys(sources.categories).join(', ')}`);
    process.exit(1);
  }
  const limit = limitArg > -1 ? parseInt(process.argv[limitArg + 1], 10) : sources.maxPerCategory || 16;

  const found = new Map(); // domain -> {url, source, category}

  // 1) Seeds (manual — e.g. URLs spotted on Godly / Land-book / anywhere)
  for (const seed of cfg.seeds || []) {
    try {
      const u = new URL(seed);
      found.set(registrable(u.host), { url: `https://${registrable(u.host)}${u.pathname !== '/' ? u.pathname : ''}`, source: 'seed', category });
    } catch {}
  }

  // 2) Galleries (each links straight to the showcased live sites)
  const proxyArg = process.argv.indexOf('--proxy');
  const proxyServer = proxyArg > -1 ? process.argv[proxyArg + 1]
    : (process.env.EXTRACT_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || null);
  if (proxyServer) console.log(`(routing through proxy: ${proxyServer})`);
  const browser = await chromium.launch(proxyServer ? { proxy: { server: proxyServer } } : {});
  const page = await browser.newPage({ viewport: { width: 1366, height: 1000 }, userAgent: UA });

  // OnePageLove genres — /genre/<g>
  for (const genre of cfg.onePageLoveGenres || []) {
    await harvest(page, `https://onepagelove.com/genre/${genre}`, `onepagelove/${genre}`, found, category);
  }
  // Awwwards categories — /websites/<cat>/ (URL-addressable; e.g. food-beverage)
  for (const cat of cfg.awwwardsCategories || []) {
    await harvest(page, `https://www.awwwards.com/websites/${cat}/`, `awwwards/${cat}`, found, category);
  }
  // Godly — home only (no URL-addressable category filter; broad mix, opt-in per category)
  if (cfg.godlyHome) {
    await harvest(page, 'https://godly.website/', 'godly/home', found, category);
  }

  await browser.close();

  const candidates = Array.from(found.values()).slice(0, limit);
  const outPath = path.join(ROOT, 'research', `candidates.${category}.json`);
  fs.writeFileSync(outPath, JSON.stringify(candidates, null, 2));
  console.log(`\nDiscovered ${candidates.length} candidates -> ${path.relative(ROOT, outPath)}`);
  candidates.forEach((c) => console.log(`  - ${c.url}  [${c.source}]`));
}

main().catch((e) => {
  console.error('discover failed:', e.message);
  process.exit(1);
});
