#!/usr/bin/env node
/**
 * extract.cjs — general-purpose UI reference extractor (supersedes capture.cjs).
 *
 * For ANY url it captures, into vault/References/<category>/<slug>/assets/:
 *   above-fold.jpg, full.jpg        screenshots
 *   rendered.html                   post-JS DOM (page.content())
 *   raw.html                        raw served document (network response body)
 *   images/ + images.manifest.json  page images (DOM enumeration + network bytes, deduped)
 *   css/    + css.manifest.json      stylesheets + inline <style>
 *   js/     + js.manifest.json       scripts + inline <script> (JSON-LD saved separately)
 *   capture-manifest.json           summary of everything
 * ...and creates/updates the Obsidian note <slug>.md (idempotent: preserves teardown prose).
 *
 * Usage:
 *   node research/extract.cjs [category] [--url <url>] [--limit N] [--source <label>]
 * Reads research/candidates.<category>.json unless --url is given.
 */
'use strict';

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const fm = require('../scripts/lib/frontmatter.cjs');

const ROOT = path.resolve(__dirname, '..');
const VAULT = path.join(ROOT, 'vault');
const sources = JSON.parse(fs.readFileSync(path.join(ROOT, 'sources.json'), 'utf8'));

const DEFAULT_CAPTURE = {
  viewport: { width: 1440, height: 900 },
  maxFullHeight: 6000,
  htmlTruncateBytes: 3_000_000,
  images: { maxCount: 60, maxBytesEach: 5_000_000, maxTotalBytes: 60_000_000, minBytes: 1024, minDim: 32 },
  css: { maxBytesEach: 2_000_000, maxCount: 40 },
  js: { maxBytesEach: 8_000_000, maxCount: 80, captureThirdParty: true },
  perSiteSafetyCapBytes: 250_000_000,
  trackerDenylist: ['google-analytics', 'googletagmanager', 'doubleclick', 'facebook.net', 'hotjar', 'segment'],
};
const CFG = deepMerge(DEFAULT_CAPTURE, sources.capture || {});

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function deepMerge(a, b) {
  const out = Array.isArray(a) ? a.slice() : { ...a };
  for (const k of Object.keys(b || {})) {
    out[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) ? deepMerge(a[k] || {}, b[k]) : b[k];
  }
  return out;
}
const sha1 = (buf) => crypto.createHash('sha1').update(buf).digest('hex');
function registrable(host) { return host.replace(/^www\./, '').toLowerCase(); }
function slugify(url) {
  const host = new URL(url).host.replace(/^www\./, '');
  return host.replace(/[^a-z0-9]+/gi, '-').replace(/(^-|-$)/g, '').toLowerCase();
}
function sanitize(s) { return s.replace(/[^a-z0-9._-]+/gi, '-').replace(/-+/g, '-').slice(0, 60).replace(/(^-|-$)/g, ''); }

function extFromContentType(ct, url) {
  ct = (ct || '').split(';')[0].trim().toLowerCase();
  const map = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/gif': 'gif',
    'image/webp': 'webp', 'image/avif': 'avif', 'image/svg+xml': 'svg', 'image/x-icon': 'ico',
    'image/vnd.microsoft.icon': 'ico', 'text/css': 'css',
    'application/javascript': 'js', 'text/javascript': 'js', 'application/x-javascript': 'js',
    'application/json': 'json', 'application/ld+json': 'json',
  };
  if (map[ct]) return map[ct];
  try { const p = new URL(url).pathname; const m = /\.([a-z0-9]{2,5})$/i.exec(p); if (m) return m[1].toLowerCase(); } catch {}
  return 'bin';
}

/** Sniff image dimensions from buffer headers. Returns {w,h} or null. */
function imageDims(buf) {
  try {
    if (buf.length < 24) return null;
    // PNG
    if (buf[0] === 0x89 && buf[1] === 0x50) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    // GIF
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
    // WEBP (RIFF....WEBP)
    if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
      const f = buf.toString('ascii', 12, 16);
      if (f === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
      if (f === 'VP8L') { const b = buf.readUInt32LE(21); return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 }; }
      if (f === 'VP8X') return { w: (buf.readUIntLE(24, 3) & 0xffffff) + 1, h: (buf.readUIntLE(27, 3) & 0xffffff) + 1 };
    }
    // JPEG: scan SOF markers
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let o = 2;
      while (o < buf.length - 9) {
        if (buf[o] !== 0xff) { o++; continue; }
        const marker = buf[o + 1];
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return { h: buf.readUInt16BE(o + 5), w: buf.readUInt16BE(o + 7) };
        }
        o += 2 + buf.readUInt16BE(o + 2);
      }
    }
  } catch {}
  return null;
}

async function dismissConsent(page) {
  const selectors = [
    '#onetrust-accept-btn-handler', '#onetrust-reject-all-handler',
    '.cookie-accept', '[data-testid="uc-accept-all-button"]', '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
    'button#didomi-notice-agree-button', '.qc-cmp2-summary-buttons button[mode="primary"]',
  ];
  for (const sel of selectors) {
    try { const el = page.locator(sel).first(); if (await el.isVisible({ timeout: 400 })) { await el.click({ timeout: 1000 }).catch(() => {}); await page.waitForTimeout(250); } } catch {}
  }
  const labels = [/accept all/i, /accept/i, /agree/i, /allow all/i, /got it/i, /\bok\b/i, /aceitar/i, /accepter/i, /akzeptieren/i, /aceptar/i, /同意/];
  for (let pass = 0; pass < 2; pass++) {
    for (const re of labels) {
      try { const b = page.getByRole('button', { name: re }).first(); if (await b.isVisible({ timeout: 300 })) { await b.click({ timeout: 1000 }).catch(() => {}); await page.waitForTimeout(250); break; } } catch {}
    }
  }
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let last = 0, stable = 0, y = 0;
      const step = () => {
        window.scrollBy(0, 900); y += 900;
        const h = document.body.scrollHeight;
        if (h === last) { if (++stable >= 3) { window.scrollTo(0, 0); return resolve(); } }
        else { stable = 0; last = h; }
        if (y > 60000) { window.scrollTo(0, 0); return resolve(); } // hard cap (infinite scroll guard)
        setTimeout(step, 220);
      };
      step();
    });
  });
}

function collectDom(page) {
  return page.evaluate(() => {
    const abs = (u) => { try { return new URL(u, location.href).href; } catch { return null; } };
    const imageMap = new Map(); // url -> hint
    const add = (u, hint) => { const a = abs(u); if (a && /^https?:|^data:/.test(a)) if (!imageMap.has(a)) imageMap.set(a, hint); };
    const largestSrcset = (ss) => {
      let best = null, bw = -1;
      for (const part of (ss || '').split(',')) {
        const [u, d] = part.trim().split(/\s+/);
        const w = d && d.endsWith('w') ? parseInt(d) : (d && d.endsWith('x') ? parseFloat(d) * 1000 : 0);
        if (u && w >= bw) { bw = w; best = u; }
      }
      return best;
    };
    for (const img of document.querySelectorAll('img')) {
      add(img.currentSrc || img.getAttribute('src'), 'img');
      const ls = largestSrcset(img.getAttribute('srcset')); if (ls) add(ls, 'img-srcset');
    }
    for (const s of document.querySelectorAll('picture source[srcset]')) { const ls = largestSrcset(s.getAttribute('srcset')); if (ls) add(ls, 'picture'); }
    const els = Array.from(document.querySelectorAll('*')).slice(0, 4000);
    for (const el of els) {
      const bg = getComputedStyle(el).backgroundImage;
      if (bg && bg !== 'none') { const m = /url\((['"]?)(.*?)\1\)/.exec(bg); if (m && m[2] && !m[2].startsWith('data:image/svg')) add(m[2], 'background'); }
    }
    for (const l of document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')) add(l.getAttribute('href'), 'favicon');
    const og = document.querySelector('meta[property="og:image"]'); if (og) add(og.content, 'og:image');
    const tw = document.querySelector('meta[name="twitter:image"]'); if (tw) add(tw.content, 'twitter:image');

    const inlineStyles = Array.from(document.querySelectorAll('style')).map((s) => s.textContent || '').filter(Boolean);
    const inlineScripts = Array.from(document.querySelectorAll('script:not([src])')).map((s) => ({ type: s.type || 'text/javascript', content: s.textContent || '' })).filter((s) => s.content.trim());
    const inlineSvgs = Array.from(document.querySelectorAll('svg'))
      .map((s) => s.outerHTML).filter((h) => h && h.length > 600).sort((a, b) => b.length - a.length).slice(0, 8);

    return {
      title: document.title || '',
      images: Array.from(imageMap, ([url, hint]) => ({ url, hint })),
      inlineStyles, inlineScripts, inlineSvgs,
    };
  });
}

async function captureOne(browser, cand, category) {
  const slug = slugify(cand.url);
  const dir = path.join(VAULT, 'References', category, slug);
  const assets = path.join(dir, 'assets');
  fs.mkdirSync(path.join(assets, 'images'), { recursive: true });
  fs.mkdirSync(path.join(assets, 'css'), { recursive: true });
  fs.mkdirSync(path.join(assets, 'js'), { recursive: true });

  const context = await browser.newContext({
    viewport: CFG.viewport, deviceScaleFactor: 1, userAgent: UA,
    locale: 'en-US', timezoneId: 'Europe/Lisbon', ignoreHTTPSErrors: true, serviceWorkers: 'block',
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
  });
  const page = await context.newPage();

  const recorded = [];
  const bodyJobs = [];
  let scheduledBytes = 0;
  const capFor = (rt) => rt === 'image' ? CFG.images.maxBytesEach : rt === 'stylesheet' ? CFG.css.maxBytesEach
    : rt === 'script' ? CFG.js.maxBytesEach : rt === 'document' ? CFG.htmlTruncateBytes : 5_000_000;
  const withTimeout = (p, ms) => Promise.race([p, new Promise((res) => setTimeout(() => res({ meta: null, buf: null, err: 'body-timeout' }), ms))]);

  page.on('response', (resp) => {
    let req, rt, url;
    try { req = resp.request(); rt = req.resourceType(); url = resp.url(); } catch { return; }
    let headers = {}; try { headers = resp.headers(); } catch {}
    const status = resp.status();
    const clen = parseInt(headers['content-length'] || '', 10);
    let isMainDoc = false; try { isMainDoc = rt === 'document' && req.frame() === page.mainFrame(); } catch {}
    const meta = { url, rt, status, ct: headers['content-type'] || '', clen: Number.isNaN(clen) ? null : clen, isMainDoc };
    recorded.push(meta);
    const want = isMainDoc || ['image', 'stylesheet', 'script', 'font'].includes(rt);
    if (!want) return;
    if (status >= 300 && status < 400) { meta.skipped = 'redirect'; return; }
    if (!Number.isNaN(clen) && clen > capFor(rt)) { meta.skipped = 'over-cap'; return; }
    if (scheduledBytes > CFG.perSiteSafetyCapBytes) { meta.skipped = 'site-cap'; return; }
    if (!Number.isNaN(clen)) scheduledBytes += clen;
    bodyJobs.push(withTimeout(resp.body().then((buf) => { if (Number.isNaN(clen)) scheduledBytes += buf.length; return { meta, buf }; }).catch((e) => ({ meta, buf: null, err: e.message })), 15000));
  });

  const note = {
    slug, url: cand.url, source: cand.source || 'manual', category,
    title: '', captured: new Date().toISOString().slice(0, 10), status: 'ok',
  };
  let dom = { title: '', images: [], inlineStyles: [], inlineScripts: [], inlineSvgs: [] };
  let bodies = [];

  try {
    // 'commit' resolves once navigation commits — robust against client-side redirects
    // that interrupt 'load'. Then settle progressively.
    await page.goto(cand.url, { waitUntil: 'commit', timeout: 40000 }).catch(() => {});
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => {});
    await page.waitForLoadState('load', { timeout: 15000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    if (!page.url() || page.url() === 'about:blank') throw new Error('navigation did not commit');
    await dismissConsent(page);
    await autoScroll(page);
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(700);

    note.title = (await page.title()).slice(0, 160);
    dom = await collectDom(page);

    await page.screenshot({ path: path.join(assets, 'above-fold.jpg'), type: 'jpeg', quality: 80 });
    const fullH = await page.evaluate(() => document.body.scrollHeight);
    await page.screenshot({ path: path.join(assets, 'full.jpg'), type: 'jpeg', quality: 72, clip: { x: 0, y: 0, width: CFG.viewport.width, height: Math.min(fullH, CFG.maxFullHeight) } });

    let rendered = await page.content();
    if (rendered.length > CFG.htmlTruncateBytes) rendered = rendered.slice(0, CFG.htmlTruncateBytes) + '\n<!-- truncated -->';
    fs.writeFileSync(path.join(assets, 'rendered.html'), rendered);

    bodies = (await Promise.allSettled(bodyJobs)).map((s) => s.value).filter((v) => v && v.meta);

    // ---- raw served HTML (last 2xx main-frame document) ----
    const docs = bodies.filter((b) => b.meta.isMainDoc && b.buf && b.meta.status >= 200 && b.meta.status < 300);
    if (docs.length) { let raw = docs[docs.length - 1].buf.toString('utf8'); if (raw.length > CFG.htmlTruncateBytes) raw = raw.slice(0, CFG.htmlTruncateBytes) + '\n<!-- truncated -->'; fs.writeFileSync(path.join(assets, 'raw.html'), raw); }

    // ---- images: merge DOM urls + network bytes, fetch missing, dedup, filter, cap ----
    const netImg = new Map(); for (const b of bodies) if (b.meta.rt === 'image' && b.buf) netImg.set(b.meta.url, b.buf);
    const hintOf = new Map(dom.images.map((i) => [i.url, i.hint]));
    const allUrls = new Set([...dom.images.map((i) => i.url), ...netImg.keys()]);
    const seenHash = new Set();
    const imgManifest = []; let imgCount = 0, imgBytes = 0, imgN = 0;
    for (const url of allUrls) {
      if (imgCount >= CFG.images.maxCount || imgBytes >= CFG.images.maxTotalBytes) { imgManifest.push({ sourceUrl: url, skipped: 'cap' }); continue; }
      if (CFG.trackerDenylist.some((d) => url.includes(d))) { imgManifest.push({ sourceUrl: url, skipped: 'tracker' }); continue; }
      let buf = netImg.get(url) || null, ct = '';
      try {
        if (!buf && url.startsWith('data:')) { const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(url); if (m) { buf = m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3]), 'utf8'); ct = m[1]; } }
        else if (!buf) { const r = await page.request.get(url, { timeout: 12000 }).catch(() => null); if (r && r.ok()) { buf = await r.body(); ct = (r.headers()['content-type'] || ''); } }
        else { const meta = bodies.find((b) => b.meta.url === url && b.meta.rt === 'image'); ct = meta ? meta.meta.ct : ''; }
      } catch {}
      if (!buf) { imgManifest.push({ sourceUrl: url, skipped: 'fetch-failed' }); continue; }
      if (buf.length < CFG.images.minBytes) { imgManifest.push({ sourceUrl: url, bytes: buf.length, skipped: 'too-small' }); continue; }
      const h = sha1(buf); if (seenHash.has(h)) { const ex = imgManifest.find((e) => e.hash === h); if (ex && !ex.alsoFrom) ex.alsoFrom = []; if (ex) ex.alsoFrom.push(url); continue; }
      const dims = imageDims(buf);
      if (dims && (dims.w < CFG.images.minDim || dims.h < CFG.images.minDim)) { imgManifest.push({ sourceUrl: url, bytes: buf.length, w: dims.w, h: dims.h, skipped: 'too-small-dim' }); continue; }
      const ext = extFromContentType(ct, url);
      const base = sanitize((() => { try { return path.basename(new URL(url).pathname) || 'img'; } catch { return 'img'; } })()).replace(/\.[a-z0-9]+$/i, '') || 'img';
      const fname = `${String(++imgN).padStart(2, '0')}-${base}.${ext}`;
      fs.writeFileSync(path.join(assets, 'images', fname), buf);
      seenHash.add(h); imgCount++; imgBytes += buf.length;
      imgManifest.push({ file: fname, sourceUrl: url, contentType: ct, bytes: buf.length, w: dims ? dims.w : null, h: dims ? dims.h : null, whereUsed: hintOf.get(url) || 'network', hash: h, origin: originOf(url, cand.url) });
    }
    // inline SVGs
    dom.inlineSvgs.forEach((svg, i) => { if (imgCount >= CFG.images.maxCount) return; const fname = `${String(++imgN).padStart(2, '0')}-inline-${i + 1}.svg`; fs.writeFileSync(path.join(assets, 'images', fname), svg); imgCount++; imgManifest.push({ file: fname, sourceUrl: 'inline-svg', bytes: Buffer.byteLength(svg), whereUsed: 'inline-svg', origin: 'first' }); });
    fs.writeFileSync(path.join(assets, 'images', 'images.manifest.json'), JSON.stringify(imgManifest, null, 2));

    // ---- css ----
    const cssManifest = []; let cssN = 0;
    for (const b of bodies) {
      if (b.meta.rt !== 'stylesheet' || !b.buf) continue;
      if (cssN >= CFG.css.maxCount) { cssManifest.push({ sourceUrl: b.meta.url, bytes: b.buf.length, skipped: 'count-cap' }); continue; }
      const fname = `${String(++cssN).padStart(2, '0')}-${sanitize(hostBase(b.meta.url))}.css`; fs.writeFileSync(path.join(assets, 'css', fname), b.buf); cssManifest.push({ file: fname, sourceUrl: b.meta.url, bytes: b.buf.length, origin: originOf(b.meta.url, cand.url) });
    }
    dom.inlineStyles.forEach((css, i) => { const fname = `inline-${i + 1}.css`; fs.writeFileSync(path.join(assets, 'css', fname), css); cssManifest.push({ file: fname, sourceUrl: 'inline', bytes: Buffer.byteLength(css), origin: 'first' }); });
    fs.writeFileSync(path.join(assets, 'css', 'css.manifest.json'), JSON.stringify(cssManifest, null, 2));

    // ---- js ----
    const jsManifest = []; let jsN = 0, ldN = 0;
    for (const b of bodies) {
      if (b.meta.rt !== 'script' || !b.buf) continue;
      if (jsN >= CFG.js.maxCount) { jsManifest.push({ sourceUrl: b.meta.url, bytes: b.buf.length, skipped: 'count-cap' }); continue; }
      const fname = `${String(++jsN).padStart(2, '0')}-${sanitize(hostBase(b.meta.url))}.js`; fs.writeFileSync(path.join(assets, 'js', fname), b.buf); jsManifest.push({ file: fname, sourceUrl: b.meta.url, bytes: b.buf.length, origin: originOf(b.meta.url, cand.url), inline: false });
    }
    for (const s of dom.inlineScripts) {
      if (/ld\+json/i.test(s.type)) { const fname = `jsonld-${++ldN}.json`; fs.writeFileSync(path.join(assets, 'js', fname), s.content); jsManifest.push({ file: fname, sourceUrl: 'inline-ld+json', bytes: Buffer.byteLength(s.content), origin: 'first', inline: true, kind: 'json-ld' }); }
      else { const fname = `inline-${jsManifest.filter((x) => x.inline && x.kind !== 'json-ld').length + 1}.js`; fs.writeFileSync(path.join(assets, 'js', fname), s.content); jsManifest.push({ file: fname, sourceUrl: 'inline', bytes: Buffer.byteLength(s.content), origin: 'first', inline: true }); }
    }
    fs.writeFileSync(path.join(assets, 'js', 'js.manifest.json'), JSON.stringify(jsManifest, null, 2));

    // counts on the note
    note.images_count = imgManifest.filter((e) => e.file).length;
    note.css_count = cssManifest.length;
    note.js_count = jsManifest.length;

    // ---- capture-manifest ----
    fs.writeFileSync(path.join(assets, 'capture-manifest.json'), JSON.stringify({
      url: cand.url, finalUrl: page.url(), title: note.title, captured: note.captured, status: 'ok',
      counts: { images: note.images_count, css: note.css_count, js: note.js_count },
      bytes: { images: imgBytes },
      redirectChain: recorded.filter((r) => r.isMainDoc).map((r) => ({ url: r.url, status: r.status })),
      caps: CFG, skippedImages: imgManifest.filter((e) => e.skipped),
    }, null, 2));
  } catch (e) {
    note.status = 'failed';
    note.error = e.message.split('\n')[0];
    fs.writeFileSync(path.join(assets, 'capture-manifest.json'), JSON.stringify({ url: cand.url, status: 'failed', error: note.error }, null, 2));
  } finally {
    await context.close();
  }

  // Never clobber an existing good note on a transient failure — only write on
  // success, or to create a first record when no note exists yet.
  if (note.status === 'ok' || !fs.existsSync(path.join(dir, `${note.slug}.md`))) writeNote(dir, note);
  else console.log(`    (kept existing note; capture failed — not overwriting)`);
  return note;
}

function hostBase(url) { try { const u = new URL(url); return registrable(u.host) + '-' + (path.basename(u.pathname) || 'asset').replace(/\.[a-z0-9]+$/i, ''); } catch { return 'asset'; } }
function originOf(url, pageUrl) { try { return registrable(new URL(url).host) === registrable(new URL(pageUrl).host) ? 'first' : 'third'; } catch { return 'third'; } }

const FM_ORDER = ['title', 'url', 'category', 'source', 'captured', 'quality', 'status', 'slug', 'tags', 'palette', 'heading_font', 'body_font', 'images_count', 'css_count', 'js_count'];

function captureBlock(note) {
  return [
    '## Raw materials',
    `- Captured ${note.images_count ?? 0} images · ${note.css_count ?? 0} CSS · ${note.js_count ?? 0} JS`,
    '- [Raw served HTML](assets/raw.html) · [Rendered DOM](assets/rendered.html)',
    '- [Stylesheets](assets/css/) · [Scripts](assets/js/) · [Images](assets/images/) ([manifest](assets/images/images.manifest.json))',
    '- [Capture manifest](assets/capture-manifest.json)',
  ].join('\n');
}

function newNoteBody(note) {
  return [
    `# ${note.title || note.slug}`, '',
    `> [${note.url}](${note.url}) · [[${note.category}]] · captured ${note.captured} · quality ${note.quality ?? 0}/100`, '',
    '## Above the fold', '![[assets/above-fold.jpg]]', '',
    '## Full page', '![[assets/full.jpg]]', '',
    '%% TEARDOWN:START — edited by the LLM teardown step %%',
    '## Style', '_(pending teardown)_', '',
    '## Palette', '_(pending teardown)_', '',
    '## Typography', '- **Heading:** _(pending)_', '- **Body:** _(pending)_', '- **Feel:** _(pending)_', '',
    '## Layout sections', '_(pending teardown)_', '',
    '## Strengths', '_(pending teardown)_', '',
    '## Weaknesses', '_(pending teardown)_', '',
    '## Notable patterns', '_(pending teardown)_', '',
    '## When to use', '_(pending teardown)_',
    '%% TEARDOWN:END %%', '',
    '%% CAPTURE:START — regenerated by extract.cjs; do not edit by hand %%',
    captureBlock(note),
    '%% CAPTURE:END %%', '',
  ].join('\n');
}

function writeNote(dir, note) {
  const notePath = path.join(dir, `${note.slug}.md`);
  const captureKeys = { title: note.title, url: note.url, category: note.category, source: note.source, captured: note.captured, status: note.status, slug: note.slug, images_count: note.images_count ?? 0, css_count: note.css_count ?? 0, js_count: note.js_count ?? 0 };
  if (fs.existsSync(notePath)) {
    const md = fs.readFileSync(notePath, 'utf8');
    const { data, body } = fm.parse(md);
    Object.assign(data, captureKeys);
    let newBody = fm.replaceRegion(body, 'CAPTURE', captureBlock(note));
    if (newBody == null) newBody = body.replace(/\n*$/, '\n\n') + '%% CAPTURE:START %%\n' + captureBlock(note) + '\n%% CAPTURE:END %%\n';
    fs.writeFileSync(notePath, fm.stringify(data, FM_ORDER) + newBody);
  } else {
    const data = { ...captureKeys, quality: 0, tags: ['ui-reference', note.category], palette: [], heading_font: '', body_font: '' };
    fs.writeFileSync(notePath, fm.stringify(data, FM_ORDER) + newNoteBody({ ...note, quality: 0 }));
  }
}

async function main() {
  const category = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'restaurant';
  const urlArg = process.argv.indexOf('--url');
  const srcArg = process.argv.indexOf('--source');
  const limitArg = process.argv.indexOf('--limit');

  let candidates;
  if (urlArg > -1) candidates = [{ url: process.argv[urlArg + 1], source: srcArg > -1 ? process.argv[srcArg + 1] : 'manual', category }];
  else {
    const p = path.join(ROOT, 'research', `candidates.${category}.json`);
    if (!fs.existsSync(p)) { console.error(`No candidates: run discover first (${path.relative(ROOT, p)}) or pass --url`); process.exit(1); }
    candidates = JSON.parse(fs.readFileSync(p, 'utf8'));
  }
  if (limitArg > -1) candidates = candidates.slice(0, parseInt(process.argv[limitArg + 1], 10));

  const browser = await chromium.launch();
  let ok = 0, fail = 0;
  for (let i = 0; i < candidates.length; i++) {
    process.stdout.write(`[${i + 1}/${candidates.length}] ${candidates[i].url} ... `);
    const n = await captureOne(browser, candidates[i], category);
    if (n.status === 'ok') { ok++; console.log(`ok (img ${n.images_count}, css ${n.css_count}, js ${n.js_count})`); } else { fail++; console.log(n.error || 'failed'); }
  }
  await browser.close();
  console.log(`\nExtracted ${ok} ok, ${fail} failed -> vault/References/${category}/`);
  console.log('Next: fill teardown sections in each <slug>.md, then `node scripts/build-index.cjs`.');
}

main().catch((e) => { console.error('extract failed:', e.message); process.exit(1); });
