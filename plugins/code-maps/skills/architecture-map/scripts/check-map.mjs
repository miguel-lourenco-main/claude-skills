#!/usr/bin/env node
// Opens a packed page in headless Chrome and checks it as the browser really runs it: no script
// errors, the drawing matches the projection, no text spills out of its box, every opened state
// still accounts for every relation, and the document comes back out unchanged.
//
//   node check-map.mjs page.html [--shots dir] [--chrome path] [--quick]
//
// Exit 0: clean. Exit 1: problems (listed). Exit 2: no Chrome, or the page never became ready.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openPage } from '../../java-diagrams/scripts/chrome.mjs';

const args = process.argv.slice(2);
const file = args[0];
if (!file || file.startsWith('--')) { console.error('usage: node check-map.mjs page.html [--shots dir] [--chrome path] [--quick]'); process.exit(2); }
const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
let page;
try { page = await openPage(file, { chrome: opt('--chrome'), width: 1600, height: 1000, settleMs: 800 }); }
catch (e) { console.error(e.code === 2 ? 'No Chrome or Chromium found; pass --chrome <path>.' : String(e)); process.exit(2); }
const { send, evaluate, errors, stop } = page;
const problems = [];
const bad = m => { problems.push(m); console.log('  ✗ ' + m); };
try {
  let ready;
  for (let i = 0; i < 120 && ready === undefined; i++) { await new Promise(r => setTimeout(r, 250)); ready = await evaluate('window.__mapReady === undefined ? null : window.__mapReady').catch(() => null); if (ready === null) ready = undefined; }
  if (ready !== true) { console.error('the page did not become ready: ' + (errors[0] || 'no error reported')); stop(2); }
  const state = await evaluate('JSON.stringify(window.__map.state())').then(JSON.parse);
  console.log(`tier ${state.tier}, layout ${state.layoutMs} ms, ${state.expanded.length} groups open by default`);
  if (state.refused.length) bad('document refused: ' + state.refused.join('; '));
  const shots = opt('--shots');
  if (shots) mkdirSync(shots, { recursive: true });
  let shotN = 0;
  const shot = async name => { if (!shots) return; for (const theme of ['light', 'dark']) { await evaluate(`document.documentElement.dataset.theme = '${theme}'; 1`); await new Promise(r => setTimeout(r, 120)); const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(shots, `${String(++shotN).padStart(2, '0')}-${name}-${theme}.png`), Buffer.from(r.data, 'base64')); } await evaluate(`delete document.documentElement.dataset.theme; 1`); };
  const checkState = async name => {
    const r = await evaluate(`(() => { const m = window.__map; const nodes = m.nodes(), edges = m.edges(); const st = document.getElementById('stage');
      const gNodes = st.querySelectorAll('g.node').length, gGroups = st.querySelectorAll('g.grp:not(.hd)').length, gEdges = st.querySelectorAll('g.edge').length;
      const overflow = [];
      for (const g of st.querySelectorAll('g.node')) { const rect = g.querySelector('rect.line, rect.sys, rect.person, path.store'); if (!rect) continue; const b = rect.getBBox();
        for (const t of g.querySelectorAll('text')) { const tb = t.getBBox(); const spill = Math.max(b.x - tb.x, tb.x + tb.width - (b.x + b.width)); if (spill > 1.5) overflow.push({ id: g.dataset.id, text: t.textContent.slice(0, 50), by: Math.round(spill * 10) / 10 }); } }
      return JSON.stringify({ failed: st.querySelector('.fail')?.textContent.slice(0, 160) || null, n: nodes.length, open: nodes.filter(x => x.open).length, drawn: edges.filter(e => e.drawn !== false).length, gNodes, gGroups, gEdges, fails: m.account(), overflow: overflow.sort((a, b) => b.by - a.by).slice(0, 10), nOverflow: overflow.length, ms: m.state().layoutMs }); })()`).then(JSON.parse);
    const line = `${name.padEnd(22)} ${String(r.n).padStart(4)} boxes (${r.open} open) · ${String(r.drawn).padStart(4)} arrows · ${r.ms} ms`;
    console.log(line + (r.fails.length ? ' · NOT ACCOUNTED' : '') + (r.nOverflow ? ` · ${r.nOverflow} text spills` : ''));
    if (r.failed) bad(`${name}: the page shows a failure instead of the drawing: ${r.failed}`);
    if (r.fails.length) bad(`${name}: ${r.fails.slice(0, 3).join('; ')}`);
    if (r.gNodes + r.gGroups !== r.n) bad(`${name}: the drawing has ${r.gNodes + r.gGroups} boxes, the projection ${r.n}`);
    if (r.gEdges !== r.drawn) bad(`${name}: the drawing has ${r.gEdges} arrows, the projection ${r.drawn}`);
    for (const o of r.overflow.slice(0, 3)) bad(`${name}: text spills ${o.by}px out of ${o.id}: "${o.text}"`);
    await shot(name);
    return r;
  };
  await checkState('default');
  if (!args.includes('--quick')) {
    // every root group, one at a time, from the all-closed state (what the page lists there is exactly the top level)
    await evaluate(`window.__map.setExpanded([])`);
    const tops = await evaluate(`JSON.stringify(window.__map.nodes().filter(v => (v.kind === 'component' || v.kind === 'package') && v.count > 0).map(v => v.id))`).then(JSON.parse);
    const exportable = await evaluate(`JSON.stringify(window.__map.exportDoc().nodes.filter(n => n.parent === undefined).map(n => n.id))`).then(JSON.parse);
    const list = tops.filter(id => state.tier !== 3 || exportable.includes(id) || tops.indexOf(id) < 12).slice(0, state.tier === 3 ? 12 : 40);
    for (const id of list) { await evaluate(`window.__map.setExpanded(${JSON.stringify([id])})`); await checkState('open:' + id); }
    if (state.tier !== 3) { await evaluate(`window.__map.setExpanded(${JSON.stringify(list)})`); await checkState('all'); }
    await evaluate(`window.__map.setExpanded([])`); await checkState('top');
  }
  // the document comes back out as it went in, and an edit followed by undo leaves no trace
  const rt = await evaluate(`(async () => { const m = window.__map; const before = JSON.stringify(m.exportDoc()); const same = EMBED ? JSON.stringify(__mod.core.stripComputed(EMBED.doc)) === before : true;
    const some = m.exportDoc().nodes.find(n => n.kind !== 'actor'); let undone = true; if (some) { m.edit(true); await m.apply('setProp', some.id, 'phrase', 'check-map was here'); const changed = JSON.stringify(m.exportDoc()) !== before; await m.undo(); undone = changed && JSON.stringify(m.exportDoc()) === before; m.edit(false); }
    return JSON.stringify({ same, undone, refused: m.state().refused.length }); })()`).then(JSON.parse);
  if (!rt.same) bad('the exported document differs from the embedded one');
  if (!rt.undone) bad('an edit followed by undo did not restore the document');
  if (rt.refused) bad('the document is refused after the edit round trip');
  console.log(`export round trip: ${rt.same && rt.undone ? 'ok' : 'FAILED'}`);
  console.log(`script errors: ${errors.length}`);
  for (const e of errors.slice(0, 10)) { console.log('  ' + String(e).split('\n')[0]); }
  if (errors.length) problems.push('script errors');
  stop(problems.length ? 1 : 0);
} catch (e) { console.error(e); stop(1); }
