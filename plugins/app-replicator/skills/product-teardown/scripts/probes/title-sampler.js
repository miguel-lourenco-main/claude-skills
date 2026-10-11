// title-sampler — records document.title (+ visibilityState, favicon changes) once per second.
// Install/read pair in ONE file: the first call installs a 1 s setInterval and returns
// {installed:true}; later calls return {series, format, tickMs, changes, faviconChanges}.
// When: install before starting a timer/countdown; read after it has run for a while.
// To stop: run `window.__pt.titleStop = true` (then call this once more to clear the interval).
(() => {
  const _probe = 'title-sampler';
  const base = () => ({ _probe, ts: Date.now(), innerWidth, innerHeight, href: location.href });
  try {
    const pt = (window.__pt = window.__pt || {});
    const favHref = () => document.querySelector('link[rel~="icon"]')?.href || null;

    if (!pt.titleSampler) {
      pt.titles = [];
      pt.faviconChanges = [];
      let lastFav = favHref();
      const sample = () => {
        if (pt.titleStop) { clearInterval(pt.titleSampler.id); pt.titleSampler.stopped = true; return; }
        const title = document.title;
        const last = pt.titles[pt.titles.length - 1];
        if (!last || last.title !== title) {
          pt.titles.push({ t: Date.now(), title, visibility: document.visibilityState });
          if (pt.titles.length > 3000) pt.titles.shift();
        } else last.seen = Date.now(); // dedupe: extend the last entry instead
        const fav = favHref();
        if (fav !== lastFav) { pt.faviconChanges.push({ t: Date.now(), href: String(fav).slice(-120) }); lastFav = fav; }
      };
      pt.titleSampler = { id: setInterval(sample, 1000), installedAt: Date.now(), stopped: false };
      sample();
      return { ...base(), installed: true, first: pt.titles[0] };
    }
    if (pt.titleStop && !pt.titleSampler.stopped) { clearInterval(pt.titleSampler.id); pt.titleSampler.stopped = true; }

    const series = pt.titles || [];
    // Format detection: replace digit runs with \d{n} and keep the most common pattern.
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = (t) => '^' + esc(t).replace(/\d+/g, (m) => `\\d{${m.length}}`) + '$';
    const freq = {};
    for (const s of series) { const p = pattern(s.title); freq[p] = (freq[p] || 0) + 1; }
    const formats = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([regex, n]) => ({ regex, n }));
    // Leading clock prefix, e.g. "12:34 Focus" -> /^\d{2}:\d{2} /
    const clock = series.map((s) => (s.title.match(/^\d{1,2}(:\d{2}){1,2}\s*/) || [''])[0]).find(Boolean);
    const prefix = clock ? '^' + clock.replace(/\d+/g, (m) => `\\d{${m.length}}`).replace(/\s+$/, ' ') : null;

    // Tick interval: median gap between consecutive changes.
    const gaps = series.slice(1).map((s, i) => s.t - series[i].t).sort((a, b) => a - b);
    const tickMs = gaps.length ? gaps[Math.floor(gaps.length / 2)] : null;

    return {
      ...base(), installed: true, stopped: !!pt.titleSampler.stopped,
      changes: Math.max(0, series.length - 1),
      tickMs, format: formats[0]?.regex || null, clockPrefix: prefix, formats,
      visibilityStates: [...new Set(series.map((s) => s.visibility))],
      faviconChanges: (pt.faviconChanges || []).slice(-20),
      series: series.slice(-120), truncated: series.length > 120,
    };
  } catch (e) {
    return { _probe, error: String(e) };
  }
})()
