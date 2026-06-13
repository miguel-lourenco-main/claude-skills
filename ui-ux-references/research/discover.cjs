#!/usr/bin/env node
/**
 * discover.cjs — find candidate live-site URLs for a category.
 *
 * Primary source: OnePageLove genre pages (e.g. /genre/restaurant) which link
 * directly to live sites. Galleries with JS-only filters (Godly, Land-book) are
 * not reliably URL-scrapable, so feed those via `seeds` in sources.json.
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

  // 2) OnePageLove genres
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1366, height: 1000 }, userAgent: UA });
  for (const genre of cfg.onePageLoveGenres || []) {
    const url = `https://onepagelove.com/genre/${genre}`;
    try {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      if (!resp || resp.status() >= 400) {
        console.log(`  skip onepagelove/${genre} [${resp ? resp.status() : 'no-resp'}]`);
        continue;
      }
      await autoScroll(page);
      await page.waitForTimeout(600);
      const ext = await collectExternal(page);
      let added = 0;
      for (const e of ext) {
        const host = registrable(new URL(e).host);
        if (JUNK.test(host)) continue;
        if (host.split('.').length < 2) continue;
        if (!found.has(host)) {
          found.set(host, { url: e, source: `onepagelove/${genre}`, category });
          added++;
        }
      }
      console.log(`  onepagelove/${genre}: +${added} (total ${found.size})`);
    } catch (e) {
      console.log(`  fail onepagelove/${genre}: ${e.message.split('\n')[0]}`);
    }
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
