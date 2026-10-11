// dom-inventory — inventory of interactive controls + page outline.
// Returns: {controls[] (cap 400, truncated flag), headings[], landmarks[], title, favicon, counts}.
// When: once per surface/state (after dialog-guard), and again after opening menus/modals.
// Stateless (no install/read pair). Each control has tag, role, type, name, value,
// disabled, visible, locked heuristic, rect, short CSS path and data-* attribute names.
(() => {
  const _probe = 'dom-inventory';
  try {
    const CAP = 400;
    const SEL = 'a[href], button, input, select, textarea, [role=button], [role=slider], [role=switch], ' +
      '[role=tab], [role=menuitem], [contenteditable], [tabindex]:not([tabindex="-1"]), summary, audio, video';
    // 'pro' only as a whole token (avoids 'progress', 'product').
    const LOCK_RE = /lock|(?:^|[^a-z])pro(?:[^a-z]|$)|premium|upgrade|disabled/i;
    const trim = (s) => (s || '').replace(/\s+/g, ' ').trim().slice(0, 60);

    const accName = (el) => {
      const byIds = (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean)
        .map((id) => document.getElementById(id)?.innerText || '').join(' ');
      let labelFor = '';
      if (el.id) { try { labelFor = document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.innerText || ''; } catch (_) {} }
      if (!labelFor && el.closest) labelFor = el.closest('label')?.innerText || '';
      const cands = [el.getAttribute('aria-label'), byIds, labelFor, el.innerText, el.getAttribute('title'),
        el.getAttribute('alt'), el.getAttribute('placeholder')];
      for (const c of cands) { const t = trim(c); if (t) return t; }
      return '';
    };
    const valueOf = (el) => {
      const role = el.getAttribute('role');
      const type = (el.getAttribute('type') || '').toLowerCase();
      if (type === 'range' || role === 'slider') {
        return { value: el.value ?? el.getAttribute('aria-valuenow'), min: el.min || el.getAttribute('aria-valuemin'),
          max: el.max || el.getAttribute('aria-valuemax'), step: el.step || null };
      }
      if (type === 'checkbox' || type === 'radio' || role === 'switch') {
        return { checked: typeof el.checked === 'boolean' ? el.checked : null, ariaChecked: el.getAttribute('aria-checked') };
      }
      if (el.tagName === 'SELECT') return { value: trim(el.value), options: el.options.length };
      if (type === 'password') return { value: '(redacted)' };
      if ('value' in el && typeof el.value === 'string' && el.tagName !== 'BUTTON') return { value: trim(el.value) };
      return null;
    };
    const isVisible = (el) => {
      if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return false;
      return el.getClientRects().length > 0;
    };
    const isLocked = (el) => {
      for (let n = el, d = 0; n && n.nodeType === 1 && d < 6; n = n.parentElement, d++) {
        if (LOCK_RE.test(typeof n.className === 'string' ? n.className : n.getAttribute('class') || '')) return true;
        for (const a of n.attributes) if (a.name.startsWith('data-') || a.name.startsWith('aria-')) {
          if (a.name !== 'aria-disabled' && LOCK_RE.test(a.name + '=' + a.value)) return true;
        }
      }
      return false;
    };
    const seg = (n) => {
      let s = n.tagName.toLowerCase();
      if (n.id) return s + '#' + n.id;
      const c = (typeof n.className === 'string' ? n.className : '').trim().split(/\s+/)[0];
      return c ? s + '.' + c : s;
    };
    const cssPath = (el) => {
      const parts = [];
      for (let n = el; n && n.nodeType === 1 && parts.length < 3; n = n.parentElement) {
        parts.unshift(seg(n));
        if (n.id) break;
      }
      return parts.join(' > ');
    };

    const all = Array.from(document.querySelectorAll(SEL));
    const controls = all.slice(0, CAP).map((el) => {
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role'),
        type: el.getAttribute('type'),
        name: accName(el),
        value: valueOf(el),
        disabled: !!el.disabled || el.getAttribute('aria-disabled') === 'true',
        visible: isVisible(el),
        locked: isLocked(el),
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        path: cssPath(el),
        data: Array.from(el.attributes).map((a) => a.name).filter((n) => n.startsWith('data-')),
        href: el.tagName === 'A' ? el.getAttribute('href') : undefined,
      };
    });

    const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).slice(0, 120)
      .map((h) => ({ level: +h.tagName[1], text: trim(h.innerText) }));
    const landmarks = Array.from(document.querySelectorAll(
      'header, nav, main, aside, footer, [role=banner], [role=navigation], [role=main], [role=complementary], ' +
      '[role=contentinfo], [role=dialog], dialog, form[aria-label], section[aria-label]'))
      .slice(0, 60).map((n) => ({ tag: n.tagName.toLowerCase(), role: n.getAttribute('role'),
        label: trim(n.getAttribute('aria-label') || ''), path: cssPath(n) }));
    const fav = document.querySelector('link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]');

    const byTag = {};
    for (const c of controls) byTag[c.tag] = (byTag[c.tag] || 0) + 1;
    return {
      _probe, ts: Date.now(), innerWidth, innerHeight, href: location.href,
      title: document.title,
      favicon: fav ? fav.href : null,
      counts: {
        total: all.length, returned: controls.length, byTag,
        visible: controls.filter((c) => c.visible).length,
        disabled: controls.filter((c) => c.disabled).length,
        locked: controls.filter((c) => c.locked).length,
        headings: headings.length, landmarks: landmarks.length,
      },
      truncated: all.length > CAP,
      headings, landmarks, controls,
    };
  } catch (e) {
    return { _probe, error: String(e) };
  }
})()
