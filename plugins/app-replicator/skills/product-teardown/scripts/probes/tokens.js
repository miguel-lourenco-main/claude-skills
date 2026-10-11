// tokens — frequency-ranked design tokens from computed styles of visible elements (cap 1500).
// Returns: {viewport, colors (top 24 + examples), fontFamilies, fontSizes, lineHeights, fontWeights,
// spacing, radii, shadows, zIndex, motion, customProperties (:root), breakpoints, colorScheme, icons}.
// When: once per surface at each studied viewport (e.g. 1440, 390) and once in dark mode if any.
// Stateless. Feeds design-tokens.json (cite the saved probe JSON as `M Pnn`).
(() => {
  const _probe = 'tokens';
  try {
    const CAP = 1500;
    const tally = () => new Map();
    const add = (m, key, sel) => {
      if (key == null || key === '') return;
      const e = m.get(key) || { n: 0, ex: [] };
      e.n++; if (sel && e.ex.length < 2 && !e.ex.includes(sel)) e.ex.push(sel);
      m.set(key, e);
    };
    const top = (m, k, withEx) => [...m.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, k)
      .map(([value, e]) => (withEx ? { value, count: e.n, examples: e.ex } : { value, count: e.n }));
    const sel = (el) => {
      let s = el.tagName.toLowerCase();
      if (el.id) return s + '#' + el.id;
      const c = (typeof el.className === 'string' ? el.className : el.getAttribute('class') || '').trim().split(/\s+/)[0];
      return c ? s + '.' + c.slice(0, 40) : s;
    };
    const hex = (n) => n.toString(16).padStart(2, '0');
    const normColor = (c) => {
      const m = c.match(/^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
      if (!m) return c; // color(), oklch(), etc. kept verbatim
      let a = m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4];
      if (a === 0) return null; // transparent
      const [r, g, b] = [m[1], m[2], m[3]].map((x) => Math.round(+x));
      return a === 1 ? '#' + hex(r) + hex(g) + hex(b) : `rgba(${r},${g},${b},${Math.round(a * 100) / 100})`;
    };

    const T = { colors: tally(), families: tally(), sizes: tally(), lineHeights: tally(), weights: tally(),
      spacing: tally(), radii: tally(), shadows: tally(), z: tally(), motion: tally() };
    const els = [];
    for (const el of document.body ? document.body.querySelectorAll('*') : []) {
      if (els.length >= CAP) break;
      if (!el.getClientRects().length) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') continue;
      els.push([el, cs]);
    }
    for (const [el, cs] of els) {
      const s = sel(el);
      const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (hasText) {
        add(T.colors, normColor(cs.color) && `${normColor(cs.color)}|color`, s);
        add(T.families, cs.fontFamily, s);
        add(T.sizes, cs.fontSize, s);
        add(T.lineHeights, cs.lineHeight, s);
        add(T.weights, cs.fontWeight, s);
      }
      const bg = normColor(cs.backgroundColor);
      if (bg) add(T.colors, `${bg}|background`, s);
      if (parseFloat(cs.borderTopWidth) > 0) { const bc = normColor(cs.borderTopColor); if (bc) add(T.colors, `${bc}|border`, s); }
      for (const p of ['marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'gap']) {
        const v = cs[p]; if (v && v !== '0px' && v !== 'normal' && v !== 'auto') add(T.spacing, v, s);
      }
      if (cs.borderRadius && cs.borderRadius !== '0px') add(T.radii, cs.borderRadius, s);
      if (cs.boxShadow && cs.boxShadow !== 'none') add(T.shadows, cs.boxShadow, s);
      if (cs.position !== 'static' && cs.zIndex !== 'auto') add(T.z, cs.zIndex, s);
      if (cs.transitionDuration && cs.transitionDuration.split(',').some((d) => parseFloat(d) > 0)) {
        add(T.motion, `transition: ${cs.transitionProperty} ${cs.transitionDuration} ${cs.transitionTimingFunction}`, s);
      }
      if (cs.animationName && cs.animationName !== 'none') {
        add(T.motion, `animation: ${cs.animationName} ${cs.animationDuration} ${cs.animationTimingFunction} ${cs.animationIterationCount}`, s);
      }
    }
    // Merge colour roles: value -> {count, roles{}, examples}.
    const colorMap = new Map();
    for (const [k, e] of T.colors) {
      const [value, role] = k.split('|');
      const c = colorMap.get(value) || { value, count: 0, roles: {}, examples: [] };
      c.count += e.n; c.roles[role] = (c.roles[role] || 0) + e.n;
      for (const x of e.ex) if (c.examples.length < 2 && !c.examples.includes(x)) c.examples.push(x);
      colorMap.set(value, c);
    }

    // Stylesheets: :root custom properties, breakpoints, prefers-color-scheme.
    const varNames = new Set();
    const bp = { min: new Map(), max: new Map() };
    let unreadableSheets = 0, colorSchemeRules = 0, sheets = 0;
    const walk = (rules) => {
      for (const r of rules) {
        if (r.selectorText && /(^|,)\s*(:root|html)\s*(,|$)/.test(r.selectorText) && r.style) {
          for (const p of r.style) if (p.startsWith('--')) varNames.add(p);
        }
        const media = r.media && r.media.mediaText;
        if (media) {
          if (/prefers-color-scheme/.test(media)) colorSchemeRules++;
          for (const m of media.matchAll(/(min|max)-width\s*:\s*([\d.]+(?:px|em|rem))/g)) add(bp[m[1]], m[2]);
          for (const m of media.matchAll(/width\s*(>=?|<=?)\s*([\d.]+(?:px|em|rem))/g)) add(bp[m[1][0] === '>' ? 'min' : 'max'], m[2]);
        }
        if (r.styleSheet) { try { walk(r.styleSheet.cssRules); } catch (_) { unreadableSheets++; } }
        if (r.cssRules) walk(r.cssRules);
      }
    };
    for (const sh of document.styleSheets) {
      sheets++;
      try { walk(sh.cssRules); } catch (_) { unreadableSheets++; } // cross-origin -> SecurityError
    }
    for (const p of document.documentElement.style) if (p.startsWith('--')) varNames.add(p);
    const rootCs = getComputedStyle(document.documentElement);
    const customProperties = {};
    for (const n of [...varNames].slice(0, 150)) customProperties[n] = rootCs.getPropertyValue(n).trim();
    const bpList = (m) => [...m.entries()].map(([v, e]) => ({ value: v, rules: e.n })).sort((a, b) => parseFloat(a.value) - parseFloat(b.value));

    // Icon-set heuristics.
    const prefixes = tally();
    const ICON_RE = /^(fa[srlbdk]?|fa-[\w-]+|material-icons[\w-]*|material-symbols[\w-]*|lucide[\w-]*|bi-[\w-]+|ph-[\w-]+|ri-[\w-]+|mdi-[\w-]+|icon-[\w-]+|heroicon[\w-]*|feather[\w-]*)$/;
    for (const el of document.querySelectorAll('i[class], span[class], svg[class]')) {
      for (const c of el.classList) if (ICON_RE.test(c)) add(prefixes, c.replace(/^(fa-|bi-|ph-|ri-|mdi-|icon-|lucide-).*/, '$1').replace(/^(material-\w+).*/, '$1'));
    }
    const useHrefs = [...document.querySelectorAll('svg use')].map((u) => u.getAttribute('href') || u.getAttribute('xlink:href') || '');
    const sprites = [...new Set(useHrefs.map((h) => h.split('#')[0] || '(inline)'))];

    return {
      _probe, ts: Date.now(), innerWidth, innerHeight, href: location.href,
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      sampledElements: els.length, truncated: els.length >= CAP,
      colors: [...colorMap.values()].sort((a, b) => b.count - a.count).slice(0, 24),
      fontFamilies: top(T.families, 8, true), fontSizes: top(T.sizes, 24), lineHeights: top(T.lineHeights, 16),
      fontWeights: top(T.weights, 10), spacing: top(T.spacing, 16), radii: top(T.radii, 12, true),
      shadows: top(T.shadows, 8, true), zIndex: top(T.z, 16, true), motion: top(T.motion, 12, true),
      customProperties, customPropertyCount: varNames.size,
      breakpoints: { min: bpList(bp.min), max: bpList(bp.max), sheets, unreadableSheets },
      colorScheme: { rules: colorSchemeRules, prefersDark: matchMedia('(prefers-color-scheme: dark)').matches,
        metaColorScheme: document.querySelector('meta[name="color-scheme"]')?.content || null, rootColorScheme: rootCs.colorScheme },
      icons: { svg: document.querySelectorAll('svg').length, useRefs: useHrefs.length, sprites: sprites.slice(0, 10),
        classPrefixes: top(prefixes, 10), imgIcons: document.querySelectorAll('img[src*="icon" i]').length },
    };
  } catch (e) {
    return { _probe, error: String(e) };
  }
})()
