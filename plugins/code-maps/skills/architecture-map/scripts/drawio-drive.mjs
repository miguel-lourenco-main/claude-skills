// Open a tier-0 .drawio in draw.io itself (app.diagrams.net, headless Chrome — needs the network) and drive it: fit, zoom,
// centre a box, drag it, undo, count the drawn lines, screenshots. This is how a reviewer checks that the file the generator
// wrote opens, routes as written and edits by hand. draw.io keeps no global handle on its editor, so everything goes through
// the DOM, the keyboard and the mouse.
//   node drawio-drive.mjs <file.drawio | url-file> <out-dir> <step> [<step> ...]
// Steps:
//   fit                 View › Fit (Ctrl+Shift+H)                 shot=<name>        save <name>.png (1920×1080)
//   zoom=<percent>      type it into the toolbar zoom input
//   center=<label>      scroll so the box with that label is centred (first match; a repeat is the same label twice)
//   drag=<label>,<dx>,<dy>   drag that box by dx,dy with the mouse     undo   Ctrl+Z
//   boxes               print every box label with its screen rect   lines  count the drawn arrow paths and labels
//   console             print console errors seen so far          js=<expr>          evaluate in the page and print
//   click=<x>,<y>       click at viewport coordinates              wait=<ms>    scroll=<dx>,<dy>
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { openPage } from '../../java-diagrams/scripts/chrome.mjs';

const [urlFile, out, ...steps] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const raw = readFileSync(urlFile, 'utf8');
const url = urlFile.endsWith('.drawio') ? 'https://app.diagrams.net/#R' + encodeURIComponent(raw) : raw.trim();
const p = await openPage('/dev/null', { width: 1920, height: 1080, settleMs: 300 });
await p.send('Page.navigate', { url });
const wait = ms => new Promise(r => setTimeout(r, ms));
for (let i = 0; i < 80; i++) { const n = await p.evaluate('document.querySelectorAll(".geDiagramContainer svg g").length').catch(() => 0); if (n > 50) break; await wait(250); }
await wait(2500);
const mods = { ctrl: 2, shift: 8 };
const key = async (code, keyText, m = 0) => { await p.send('Input.dispatchKeyEvent', { type: 'keyDown', modifiers: m, windowsVirtualKeyCode: code, key: keyText, code: keyText }); await p.send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: m, windowsVirtualKeyCode: code, key: keyText, code: keyText }); };
const mouse = async (type, x, y, extra = {}) => p.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra });
const click = async (x, y) => { await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y); await mouse('mouseReleased', x, y); };
// a box, found by its label: draw.io draws labels as <div> inside foreignObject (html=1)
const BOX = label => `(() => { const c = document.querySelector('.geDiagramContainer'); const els = [...c.querySelectorAll('foreignObject div, text')].filter(e => e.textContent.trim() === ${JSON.stringify(label)}).sort((a, b) => a.getBoundingClientRect().height - b.getBoundingClientRect().height); if (!els.length) return 'null'; const r = els[0].getBoundingClientRect(); return JSON.stringify({ x: r.left, y: r.top, w: r.width, h: r.height, n: els.length }); })()`;
const box = async label => JSON.parse(await p.evaluate(BOX(label)));
const canvasClick = async () => { const r = JSON.parse(await p.evaluate(`JSON.stringify(document.querySelector('.geDiagramContainer').getBoundingClientRect())`)); await click(r.left + 30, r.top + r.height - 40); await wait(150); };
for (const step of steps) {
  const [k, v] = step.split(/=(.*)/s);
  if (k === 'fit') { await canvasClick(); await key(72, 'h', mods.ctrl | mods.shift); await wait(500); }
  else if (k === 'zoom') { // type the percentage into the toolbar's zoom input (input.geZoomInput) and press Enter
    const r = JSON.parse(await p.evaluate(`(() => { const el = document.querySelector('input.geZoomInput'); if (!el) return 'null'; const r = el.getBoundingClientRect(); return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 }); })()`));
    if (!r) { console.log('zoom input not found'); continue; }
    await click(r.x, r.y); await wait(200); await key(65, 'a', mods.ctrl); await p.send('Input.insertText', { text: v + '%' }); await key(13, 'Enter'); await wait(500);
    console.log('zoom ' + v + ': ' + await p.evaluate(`document.querySelector('input.geZoomInput').value`));
  }
  else if (k === 'center') { const ok = await p.evaluate(`(() => { const c = document.querySelector('.geDiagramContainer'); const el = [...c.querySelectorAll('foreignObject div, text')].filter(e => e.textContent.trim() === ${JSON.stringify(v)}).sort((a, b) => a.getBoundingClientRect().height - b.getBoundingClientRect().height)[0]; if (!el) return false; const r = el.getBoundingClientRect(), b = c.getBoundingClientRect(); c.scrollLeft += r.left + r.width / 2 - (b.left + b.width / 2); c.scrollTop += r.top + r.height / 2 - (b.top + b.height / 2); return true; })()`); console.log(`center ${v}: ${ok}`); await wait(400); }
  else if (k === 'drag') { const [label, dx, dy] = v.split(','); const r = await box(label); if (!r) { console.log('no box ' + label); continue; } const x = r.x + r.w / 2, y = r.y + r.h / 2; await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y); await wait(120); for (let s = 1; s <= 8; s++) { await mouse('mouseMoved', x + Number(dx) * s / 8, y + Number(dy) * s / 8, { buttons: 1 }); await wait(40); } await mouse('mouseReleased', x + Number(dx), y + Number(dy)); await wait(500); const r2 = await box(label); console.log(`drag ${label}: ${Math.round(r.x)},${Math.round(r.y)} → ${Math.round(r2.x)},${Math.round(r2.y)}`); }
  else if (k === 'undo') { await key(90, 'z', mods.ctrl); await wait(400); }
  else if (k === 'click') { const [x, y] = v.split(',').map(Number); await click(x, y); await wait(300); }
  else if (k === 'wait') await wait(Number(v));
  else if (k === 'scroll') { const [dx, dy] = v.split(',').map(Number); await p.evaluate(`(() => { const c = document.querySelector('.geDiagramContainer'); c.scrollLeft += ${dx}; c.scrollTop += ${dy}; return c.scrollTop; })()`); await wait(300); }
  else if (k === 'boxes') console.log(await p.evaluate(`(() => { const c = document.querySelector('.geDiagramContainer'); return JSON.stringify([...c.querySelectorAll('foreignObject div')].filter(e => e.children.length === 0 && e.textContent.trim()).map(e => { const r = e.getBoundingClientRect(); return [e.textContent.trim(), Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; })); })()`));
  else if (k === 'lines') console.log(await p.evaluate(`(() => { const c = document.querySelector('.geDiagramContainer'); const paths = [...c.querySelectorAll('svg path')].filter(p => p.getAttribute('fill') === 'none' && p.getAttribute('stroke') && p.getAttribute('stroke') !== 'none'); const bends = paths.map(p => (p.getAttribute('d').match(/L/g) || []).length); return JSON.stringify({ paths: paths.length, withBends: bends.filter(b => b > 1).length, straight: bends.filter(b => b <= 1).length, labels: [...c.querySelectorAll('foreignObject div')].filter(e => e.children.length === 0 && /live|replay|por |uma vez/.test(e.textContent)).map(e => e.textContent.trim()) }); })()`));
  else if (k === 'console') console.log(JSON.stringify(p.errors.slice(0, 10)));
  else if (k === 'js') console.log(JSON.stringify(await p.evaluate(`(() => { const r = (${v}); return r === undefined ? null : r; })()`)));
  else if (k === 'shot') { const r = await p.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(out, v + '.png'), Buffer.from(r.data, 'base64')); console.log('shot ' + v); }
  else console.error('unknown step ' + step);
}
console.log('console errors:', p.errors.length);
p.stop(0);
