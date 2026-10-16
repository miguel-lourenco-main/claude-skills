// Headless Chrome over the DevTools protocol, for the page checks of this plugin: finds a binary,
// opens one page, and hands back `send(method, params)` plus the page's script errors.
// No dependency: Node's own fetch and WebSocket (Node 22+).
import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const CANDIDATES = ['google-chrome', 'chromium', 'chromium-browser', 'google-chrome-stable',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];

/** The first Chrome that answers --version, or null. `flagPath` wins when given. */
export function findChrome(flagPath) {
  return (flagPath ? [flagPath] : CANDIDATES).find(c => spawnSync(c, ['--version'], { stdio: 'ignore' }).status === 0) || null;
}

/**
 * Opens `file` in a fresh headless Chrome. Resolves to { send, errors, stop, chromeBin } or
 * rejects if Chrome does not start. `errors` fills with Runtime.exceptionThrown descriptions.
 * `stop(code)` kills Chrome and exits the process with `code`.
 */
export async function openPage(file, { chrome, width = 1500, height = 950, settleMs = 1500 } = {}) {
  const chromeBin = findChrome(chrome);
  if (!chromeBin) throw Object.assign(new Error('no Chrome or Chromium found'), { code: 2 });
  const port = 9300 + Math.floor(Math.random() * 400);
  const proc = spawn(chromeBin, ['--headless=new', '--no-sandbox', `--remote-debugging-port=${port}`, `--window-size=${width},${height}`, 'about:blank'], { stdio: 'ignore' });
  const stop = code => { proc.kill(); process.exit(code); };
  let tabs;
  for (let i = 0; i < 40 && !tabs; i++) {
    await new Promise(r => setTimeout(r, 250));
    try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { /* not up yet */ }
  }
  if (!tabs) { proc.kill(); throw Object.assign(new Error('Chrome did not start'), { code: 2 }); }
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
  await new Promise(r => setTimeout(r, settleMs));
  /** Evaluates an expression (awaiting a promise) and returns its JSON value, or throws with the raw result. */
  const evaluate = async expression => {
    const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (!res || res.exceptionDetails || res.result?.value === undefined) throw new Error('probe failed: ' + JSON.stringify(res).slice(0, 400));
    return res.result.value;
  };
  return { send, evaluate, errors, stop, chromeBin, port };
}
