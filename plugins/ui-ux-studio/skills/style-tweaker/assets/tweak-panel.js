/* style-tweaker dev panel — self-contained, framework-agnostic, dev-only.
 *
 * HOW THIS FILE IS USED: the style-tweaker skill copies it into the target project
 * (e.g. src/dev/tweak-panel.js), rewrites the CONFIG block below to match that app's
 * design tokens and components, and loads it in development builds only. Everything
 * below CONFIG is the engine — it normally needs no edits.
 *
 * Every control binds to a CSS custom property on :root, so the page restyles the
 * instant a value changes. Disable at runtime with ?tweak=off. Hide/show: Ctrl+.
 */
(() => {
  'use strict';
  if (window.__styleTweaker) return;
  if (new URLSearchParams(location.search).get('tweak') === 'off') return;
  window.__styleTweaker = true;

  /* ── CONFIG — the ONLY part to customize per app ─────────────────────────
   * fontRoster : families every `type:'font'` control offers. `google` is the
   *              css2 API family spec (loaded on first selection); omit it for
   *              local/system fonts. `stack` is the full font-family value.
   * sections   : first the GENERAL tokens (typography/color/shape/space), then
   *              one section per app-specific component worth tweaking.
   * Control types:
   *   font   {label, var}                      — dropdown over fontRoster
   *   range  {label, var, min, max, step, unit}— slider, unit appended ('' = none)
   *   color  {label, var}                      — color picker (initial must be hex)
   *   select {label, var, options:{Label:val}} — named presets (shadows, borders…)
   *   text   {label, var}                      — free CSS value
   */
  const CONFIG = {
    project: 'my-app', // namespaces localStorage
    fontRoster: [
      { name: 'System UI', stack: "system-ui, -apple-system, sans-serif" },
      { name: 'Inter', google: 'Inter:wght@400;500;600;700', stack: "'Inter', system-ui, sans-serif" },
      { name: 'Fraunces', google: 'Fraunces:opsz,wght@9..144,400..700', stack: "'Fraunces', Georgia, serif" },
      { name: 'Space Grotesk', google: 'Space+Grotesk:wght@400;500;700', stack: "'Space Grotesk', system-ui, sans-serif" },
      { name: 'IBM Plex Mono', google: 'IBM+Plex+Mono:wght@400;500', stack: "'IBM Plex Mono', monospace" },
    ],
    sections: [
      { title: 'Typography', controls: [
        { label: 'Heading font', var: '--font-heading', type: 'font' },
        { label: 'Body font', var: '--font-body', type: 'font' },
        { label: 'Base size', var: '--text-base', type: 'range', min: 14, max: 20, step: 0.5, unit: 'px' },
        { label: 'Line height', var: '--leading', type: 'range', min: 1.2, max: 1.9, step: 0.05, unit: '' },
      ]},
      { title: 'Color', controls: [
        { label: 'Background', var: '--color-bg', type: 'color' },
        { label: 'Text', var: '--color-text', type: 'color' },
        { label: 'Accent', var: '--color-accent', type: 'color' },
      ]},
      { title: 'Shape & space', controls: [
        { label: 'Radius', var: '--radius', type: 'range', min: 0, max: 32, step: 1, unit: 'px' },
        { label: 'Section gap', var: '--section-gap', type: 'range', min: 32, max: 160, step: 4, unit: 'px' },
        { label: 'Card shadow', var: '--shadow-card', type: 'select', options: {
          'None': 'none',
          'Hairline': '0 0 0 1px rgb(0 0 0 / .08)',
          'Soft': '0 2px 8px rgb(0 0 0 / .08)',
          'Floating': '0 8px 30px rgb(0 0 0 / .12)',
        }},
      ]},
      // App-specific sections go here, e.g.:
      // { title: 'Navbar', controls: [
      //   { label: 'Height', var: '--nav-height', type: 'range', min: 48, max: 96, step: 2, unit: 'px' },
      // ]},
    ],
  };
  /* ── engine (no edits needed below) ─────────────────────────────────── */

  const LS_KEY = 'style-tweaker:' + CONFIG.project;
  const rootStyle = document.documentElement.style;
  const controls = CONFIG.sections.flatMap(s => s.controls);
  const initial = {}; // computed values before any tweak, for reset/export diff
  let state = { values: {}, snaps: { A: null, B: null }, active: null, open: true };
  try { Object.assign(state, JSON.parse(localStorage.getItem(LS_KEY)) || {}); } catch {}

  const cs = getComputedStyle(document.documentElement);
  controls.forEach(c => { initial[c.var] = cs.getPropertyValue(c.var).trim(); });

  function ensureFont(f) {
    if (!f.google) return;
    const id = 'st-font-' + f.name.replace(/\W+/g, '-');
    if (document.getElementById(id)) return;
    const l = document.createElement('link');
    l.id = id; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=' + f.google + '&display=swap';
    document.head.appendChild(l);
  }

  function apply(vals) {
    controls.forEach(c => {
      const v = vals[c.var];
      if (v == null || v === '') rootStyle.removeProperty(c.var);
      else {
        if (c.type === 'font') { const f = CONFIG.fontRoster.find(x => x.stack === v); if (f) ensureFont(f); }
        rootStyle.setProperty(c.var, v);
      }
    });
  }
  function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch {} }
  function set(cvar, val) { state.values[cvar] = val; state.active = null; apply(state.values); save(); syncBadges(); }

  function exportCSS() {
    const lines = Object.entries(state.values)
      .filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => `  ${k}: ${v};`);
    return lines.length ? `:root {\n${lines.join('\n')}\n}` : '/* no tweaks yet */';
  }

  /* ── UI (shadow DOM so panel styles never bleed into the app) ───────── */
  const host = document.createElement('style-tweaker-panel');
  host.style.cssText = 'position:fixed;top:0;right:0;height:100vh;z-index:2147483647;';
  const sh = host.attachShadow({ mode: 'open' });
  sh.innerHTML = `<style>
    :host{all:initial}
    *{box-sizing:border-box;font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;color:#e6e6e6}
    .panel{width:290px;height:100vh;display:flex;flex-direction:column;background:#141414;
      border-left:1px solid #2a2a2a;box-shadow:-8px 0 30px rgb(0 0 0/.35)}
    .hidden{display:none}
    header{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #2a2a2a}
    header b{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#fff;flex:1}
    .body{flex:1;overflow-y:auto;padding:4px 12px 12px}
    details{border-bottom:1px solid #222;padding:6px 0}
    summary{cursor:pointer;color:#9ad1ff;font-weight:700;padding:4px 0;list-style:none}
    summary::before{content:'▸ '}details[open]>summary::before{content:'▾ '}
    .row{display:flex;align-items:center;gap:8px;margin:7px 0}
    .row label{flex:0 0 46%;color:#a8a8a8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .row .in{flex:1;display:flex;align-items:center;gap:6px;min-width:0}
    select,input[type=text]{width:100%;background:#1f1f1f;border:1px solid #333;border-radius:4px;padding:3px 5px}
    input[type=range]{width:100%;accent-color:#9ad1ff}
    input[type=color]{width:34px;height:22px;border:1px solid #333;border-radius:4px;background:#1f1f1f;padding:1px}
    .val{min-width:44px;text-align:right;color:#9ad1ff}
    footer{border-top:1px solid #2a2a2a;padding:9px 12px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px}
    button{background:#1f1f1f;border:1px solid #383838;border-radius:5px;padding:5px 4px;cursor:pointer;color:#e6e6e6}
    button:hover{border-color:#9ad1ff;color:#9ad1ff}
    button.on{background:#0d2f47;border-color:#9ad1ff;color:#9ad1ff}
    .wide{grid-column:1/-1}
    .fab{position:fixed;top:12px;right:12px;width:38px;height:38px;border-radius:50%;font-size:16px;
      background:#141414;border:1px solid #383838;box-shadow:0 4px 16px rgb(0 0 0/.4)}
    .toast{position:absolute;bottom:64px;left:12px;right:12px;background:#0d2f47;border:1px solid #9ad1ff;
      border-radius:6px;padding:8px;text-align:center;opacity:0;transition:opacity .2s;pointer-events:none}
    .toast.show{opacity:1}
  </style>
  <button class="fab hidden" title="Style tweaker (Ctrl+.)">🎛</button>
  <div class="panel">
    <header><b>Style tweaker</b><button data-act="close" title="Hide (Ctrl+.)">✕</button></header>
    <div class="body"></div>
    <div class="toast"></div>
    <footer>
      <button data-act="snapA" title="Save current values as A">Save A</button>
      <button data-act="snapB" title="Save current values as B">Save B</button>
      <button data-act="reset" title="Clear all tweaks">Reset</button>
      <button data-act="useA" title="Apply snapshot A">Use A</button>
      <button data-act="useB" title="Apply snapshot B">Use B</button>
      <button data-act="copy" title="Copy tweaked values as :root CSS">Copy CSS</button>
    </footer>
  </div>`;

  const $ = sel => sh.querySelector(sel);
  const body = $('.body'), panel = $('.panel'), fab = $('.fab'), toastEl = $('.toast');

  function buildBody() {
  body.innerHTML = '';
  CONFIG.sections.forEach((sec, si) => {
    const d = document.createElement('details');
    d.open = si < 3;
    d.innerHTML = `<summary>${sec.title}</summary>`;
    sec.controls.forEach(c => {
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<label title="${c.var}">${c.label}</label><span class="in"></span>`;
      const slot = row.querySelector('.in');
      const cur = state.values[c.var] ?? initial[c.var] ?? '';
      let el;
      if (c.type === 'font') {
        el = document.createElement('select');
        el.innerHTML = '<option value="">(stylesheet default)</option>' +
          CONFIG.fontRoster.map(f => `<option value="${f.stack.replace(/"/g, '&quot;')}">${f.name}</option>`).join('');
        el.value = [...el.options].some(o => o.value === cur) ? cur : '';
        el.onchange = () => set(c.var, el.value);
      } else if (c.type === 'select') {
        el = document.createElement('select');
        el.innerHTML = '<option value="">(default)</option>' +
          Object.entries(c.options).map(([k, v]) => `<option value="${v.replace(/"/g, '&quot;')}">${k}</option>`).join('');
        el.value = [...el.options].some(o => o.value === cur) ? cur : '';
        el.onchange = () => set(c.var, el.value);
      } else if (c.type === 'range') {
        el = document.createElement('input');
        el.type = 'range'; el.min = c.min; el.max = c.max; el.step = c.step;
        el.value = parseFloat(cur) || (c.min + c.max) / 2;
        const out = document.createElement('span');
        out.className = 'val'; out.textContent = cur || '—';
        el.oninput = () => { const v = el.value + (c.unit ?? ''); out.textContent = v; set(c.var, v); };
        slot.append(el, out); d.appendChild(row); return;
      } else if (c.type === 'color') {
        el = document.createElement('input');
        el.type = 'color';
        if (/^#[0-9a-f]{6}$/i.test(cur)) el.value = cur;
        const out = document.createElement('span');
        out.className = 'val'; out.textContent = cur || '—';
        el.oninput = () => { out.textContent = el.value; set(c.var, el.value); };
        slot.append(el, out); d.appendChild(row); return;
      } else {
        el = document.createElement('input');
        el.type = 'text'; el.value = cur; el.placeholder = initial[c.var] || 'css value';
        el.onchange = () => set(c.var, el.value);
      }
      slot.appendChild(el);
      d.appendChild(row);
    });
    body.appendChild(d);
  });
  }

  function toast(msg) {
    toastEl.textContent = msg; toastEl.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => toastEl.classList.remove('show'), 1400);
  }
  function syncBadges() {
    $('[data-act=useA]').classList.toggle('on', state.active === 'A');
    $('[data-act=useB]').classList.toggle('on', state.active === 'B');
    $('[data-act=useA]').disabled = !state.snaps.A;
    $('[data-act=useB]').disabled = !state.snaps.B;
  }
  function useSnap(k) {
    if (!state.snaps[k]) return toast(`Snapshot ${k} is empty — Save ${k} first`);
    state.values = { ...state.snaps[k] }; state.active = k;
    apply(state.values); save(); rebuildInputs(); syncBadges(); toast(`Snapshot ${k} applied`);
  }
  function rebuildInputs() { buildBody(); }

  sh.addEventListener('click', e => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'close') { panel.classList.add('hidden'); fab.classList.remove('hidden'); state.open = false; save(); }
    if (act === 'snapA') { state.snaps.A = { ...state.values }; state.active = 'A'; save(); syncBadges(); toast('Saved as A'); }
    if (act === 'snapB') { state.snaps.B = { ...state.values }; state.active = 'B'; save(); syncBadges(); toast('Saved as B'); }
    if (act === 'useA') useSnap('A');
    if (act === 'useB') useSnap('B');
    if (act === 'reset') {
      state.values = {}; state.active = null;
      controls.forEach(c => rootStyle.removeProperty(c.var));
      save(); rebuildInputs(); toast('Reset');
    }
    if (act === 'copy') {
      const css = exportCSS();
      (navigator.clipboard?.writeText(css) || Promise.reject()).then(
        () => toast('CSS copied — paste into your stylesheet'),
        () => { console.log('[style-tweaker] export:\n' + css); toast('Clipboard blocked — CSS logged to console'); });
    }
  });
  fab.onclick = () => { panel.classList.remove('hidden'); fab.classList.add('hidden'); state.open = true; save(); };
  addEventListener('keydown', e => {
    if (e.ctrlKey && e.key === '.') (state.open ? $('[data-act=close]') : fab).click();
  });

  apply(state.values); // restore persisted tweaks immediately
  buildBody();
  if (!state.open) { panel.classList.add('hidden'); fab.classList.remove('hidden'); }
  syncBadges();
  document.body ? document.body.appendChild(host)
                : addEventListener('DOMContentLoaded', () => document.body.appendChild(host));
})();
