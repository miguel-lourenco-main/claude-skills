#!/usr/bin/env node
// Opens the built page in headless Chrome and visits every step in every layer, as a reader would.
// tracekit.validate proves the data is consistent; this proves the page really draws it.
//
//   node check-page.mjs run-trace.html [--chrome /path/to/chrome]
//
// Reports, per view: a diagram or an explicit "nothing to draw" line, the facts pane filled, text
// spilling out of its box, and script errors. The page loads its layout library from cdnjs, so
// this needs the network. Exit 0: clean. Exit 1: problems (listed). Exit 2: no Chrome found.
import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const file = args[0];
if (!file) { console.error('usage: node check-page.mjs run-trace.html [--chrome path]'); process.exit(2); }
const flag = args.indexOf('--chrome');
const candidates = flag >= 0 ? [args[flag + 1]] : ['google-chrome', 'chromium', 'chromium-browser', 'google-chrome-stable',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
const chromeBin = candidates.find(c => spawnSync(c, ['--version'], { stdio: 'ignore' }).status === 0);
if (!chromeBin) { console.error('No Chrome or Chromium found; pass --chrome <path>. The page was not opened: say so when reporting.'); process.exit(2); }

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
  // the page's own script runs only after the layout library has arrived from the CDN
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 250));
    const ready = await send('Runtime.evaluate', { expression: "typeof DATA !== 'undefined' && document.readyState === 'complete'", returnByValue: true });
    if (ready.result?.value) break;
  }

  const probe = `(() => {
    const out = { views: 0, boxes: 0, empty: [], blank: [], noFacts: [], overflow: [], fatal: null };
    if (typeof DATA === 'undefined' || !DATA) { out.fatal = 'no data inlined in the page'; return out; }
    if (typeof dagre === 'undefined') { out.fatal = 'the layout library did not load (no network?)'; return out; }
    const measure = name => {
      out.views++;
      const st = document.getElementById('stage');
      const nodes = st.querySelectorAll('g.node');
      if (!nodes.length) { (st.querySelector('p.note') ? out.empty : out.blank).push(name); }
      if (st.querySelector('.fail')) out.blank.push(name + ' (layout failed)');
      if (document.getElementById('side').textContent.trim().length < 20) out.noFacts.push(name);
      for (const g of nodes) {
        const box = g.querySelector('rect.line').getBBox();
        out.boxes++;
        for (const t of g.querySelectorAll('text')) {
          const b = t.getBBox(), spill = b.x + b.width - (box.x + box.width);
          if (spill > 1) out.overflow.push({ view: name, text: t.textContent.slice(0, 60), by: Math.round(spill * 10) / 10 });
        }
      }
    };
    for (const scope of [null, ...DATA.steps.map(s => s.id)]) for (const l of DATA.lenses) {
      S.allCode = false; go(scope, l.id); measure((scope || 'whole run') + ' · ' + l.id);
      if (l.id === 'code' && scope && (DATA.codeSteps || {})[scope]) { S.allCode = true; render(); measure(scope + ' · code (all classes)'); }
      const first = document.querySelector('#stage g.node');
      if (first) { first.dispatchEvent(new MouseEvent('click', { bubbles: true })); if (document.getElementById('side').textContent.trim().length < 20) out.noFacts.push((scope || 'whole run') + ' · ' + l.id + ' · first box'); }
    }
    out.overflow.sort((a, b) => b.by - a.by);
    out.overflowCount = out.overflow.length;
    out.overflow = out.overflow.slice(0, 25);
    return out;
  })()`;
  const res = await send('Runtime.evaluate', { expression: probe, returnByValue: true });
  const r = res.result?.value;
  if (!r) { console.error('probe failed: ' + JSON.stringify(res).slice(0, 600)); stop(1); }
  if (r.fatal) { console.error('STOPPED: ' + r.fatal); stop(1); }
  console.log(`${r.views} views opened in ${chromeBin}, ${r.boxes} boxes measured`);
  console.log(`views that say "nothing to draw": ${r.empty.length}${r.empty.length ? '  (' + r.empty.join('; ') + ')' : ''}`);
  console.log(`views with neither a diagram nor that line: ${r.blank.length}`);
  for (const b of r.blank) console.log('  ' + b);
  console.log(`selections with an empty facts pane: ${r.noFacts.length}`);
  for (const b of r.noFacts.slice(0, 15)) console.log('  ' + b);
  console.log(`text spilling out of its box: ${r.overflowCount}`);
  for (const o of r.overflow) console.log(`  ${o.by}px  ${o.view}  "${o.text}"`);
  console.log(`script errors: ${errors.length}`);
  for (const e of errors.slice(0, 10)) console.log('  ' + String(e).split('\n')[0]);
  stop(r.blank.length || r.noFacts.length || r.overflowCount || errors.length ? 1 : 0);
} catch (e) {
  console.error(e);
  stop(1);
}
