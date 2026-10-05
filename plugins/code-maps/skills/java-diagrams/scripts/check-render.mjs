#!/usr/bin/env node
// Opens the built page in headless Chrome and measures every view as the browser really draws it:
// text that spills out of its box, and page-level script errors. build.mjs proves the drawing is
// complete; this proves it is legible with the fonts on this machine.
//
//   node check-render.mjs diagrams.html [--chrome /path/to/chrome]
//
// Exit 0: clean. Exit 1: overflow or errors (listed). Exit 2: no Chrome found.
import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const file = args[0];
if (!file) { console.error('usage: node check-render.mjs diagrams.html [--chrome path]'); process.exit(2); }
const flag = args.indexOf('--chrome');
const candidates = flag >= 0 ? [args[flag + 1]] : ['google-chrome', 'chromium', 'chromium-browser', 'google-chrome-stable',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
const chromeBin = candidates.find(c => spawnSync(c, ['--version'], { stdio: 'ignore' }).status === 0);
if (!chromeBin) { console.error('No Chrome or Chromium found; pass --chrome <path>. The page is still verified for completeness by build.mjs.'); process.exit(2); }

const port = 9300 + Math.floor(Math.random() * 400);
const chrome = spawn(chromeBin, ['--headless=new', '--no-sandbox', `--remote-debugging-port=${port}`, '--window-size=1500,950', 'about:blank'], { stdio: 'ignore' });
const stop = code => { chrome.kill(); process.exit(code); };
try {
  let tabs;
  for (let i = 0; i < 40 && !tabs; i++) {
    await new Promise(r => setTimeout(r, 250));
    try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { /* not up yet */ }
  }
  if (!tabs) { console.error('Chrome did not start'); stop(2); }
  const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => { ws.onopen = r; });
  let id = 0;
  const pending = new Map(), errors = [];
  ws.onmessage = m => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result); pending.delete(d.id); }
    if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
  };
  const send = (method, params = {}) => new Promise(r => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: 'file://' + resolve(file) });
  await new Promise(r => setTimeout(r, 1500));

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
