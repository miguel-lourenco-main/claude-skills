#!/usr/bin/env node
// Opens the built page in headless Chrome and measures every view as the browser really draws it:
// text that spills out of its box, and page-level script errors. build.mjs proves the drawing is
// complete; this proves it is legible with the fonts on this machine.
//
//   node check-render.mjs diagrams.html [--chrome /path/to/chrome]
//
// Exit 0: clean. Exit 1: overflow or errors (listed). Exit 2: no Chrome found.
import { openPage } from './chrome.mjs';

const args = process.argv.slice(2);
const file = args[0];
if (!file) { console.error('usage: node check-render.mjs diagrams.html [--chrome path]'); process.exit(2); }
const flag = args.indexOf('--chrome');
let page;
try {
  page = await openPage(file, { chrome: flag >= 0 ? args[flag + 1] : undefined });
} catch (e) {
  console.error(e.code === 2 ? 'No Chrome or Chromium found; pass --chrome <path>. The page is still verified for completeness by build.mjs.' : String(e));
  process.exit(2);
}
const { send, errors, stop, chromeBin } = page;
try {
  const probe = `(async () => {
    const out = { views: 0, boxes: 0, overflow: [] };
    for (const vid of Object.keys(D.views)) {
      await show(vid);
      out.views++;
      for (const g of document.querySelectorAll('#stage g.node')) {
        const shapes = [...g.querySelectorAll('polygon, path, ellipse')];
        if (!shapes.length) continue;
        let x0 = Infinity, x1 = -Infinity;
        for (const s of shapes) { const b = s.getBBox(); x0 = Math.min(x0, b.x); x1 = Math.max(x1, b.x + b.width); }
        out.boxes++;
        for (const t of g.querySelectorAll('text')) {
          const b = t.getBBox();
          const spill = Math.max(x0 - b.x, b.x + b.width - x1);
          if (spill > 1) out.overflow.push({ view: vid, text: t.textContent.slice(0, 60), by: Math.round(spill * 10) / 10 });
        }
      }
    }
    out.overflow.sort((a, b) => b.by - a.by);
    out.count = out.overflow.length;
    out.overflow = out.overflow.slice(0, 25);
    return out;
  })()`;
  const res = await send('Runtime.evaluate', { expression: probe, awaitPromise: true, returnByValue: true });
  const r = res.result?.value;
  if (!r) { console.error('probe failed: ' + JSON.stringify(res).slice(0, 400)); stop(1); }
  console.log(`${r.views} views opened in ${chromeBin}, ${r.boxes} boxes measured`);
  console.log(`text spilling out of its box: ${r.count}`);
  for (const o of r.overflow) console.log(`  ${o.by}px  ${o.view}  "${o.text}"`);
  console.log(`script errors: ${errors.length}`);
  for (const e of errors.slice(0, 10)) console.log('  ' + String(e).split('\n')[0]);
  stop(r.count || errors.length ? 1 : 0);
} catch (e) {
  console.error(e);
  stop(1);
}
