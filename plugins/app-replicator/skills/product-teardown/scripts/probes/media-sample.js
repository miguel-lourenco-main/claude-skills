// media-sample — read side of media-hook.js (run media-hook first, then interact, then this).
// Returns: {countsByKind, lastEvents (50), snapshot, playingCount, maxSimultaneous, fades[],
// loops[], oscillation[] (per media element AND per Web Audio gain param: period, floor, amplitude)}
// — or {error:'media-hook not installed'}.
// When: after each audio interaction, and after letting audio play for a while (oscillation needs
// >= 2 periods). Optional: set window.__pt.sampleWindowMs = N first to analyse only the last N ms.
(() => {
  const _probe = 'media-sample';
  const base = () => ({ _probe, ts: Date.now(), innerWidth, innerHeight, href: location.href });
  try {
    const pt = window.__pt || {};
    const M = pt.media;
    if (!M) return { ...base(), error: 'media-hook not installed' };
    const r3 = (n) => (typeof n === 'number' && isFinite(n) ? Math.round(n * 1000) / 1000 : n);
    const winMs = +pt.sampleWindowMs || 0;
    const since = winMs ? performance.now() - winMs : -Infinity;
    const events = M.events.filter((e) => e.t >= since);
    const series = (M.volumeSeries || []).filter((s) => s.t >= since);

    const countsByKind = {};
    for (const e of events) countsByKind[e.kind] = (countsByKind[e.kind] || 0) + 1;

    const snapshot = typeof pt.mediaSnapshot === 'function' ? pt.mediaSnapshot() : null;
    const playingEls = (snapshot?.elements || []).filter((e) => !e.paused).length;
    const playingHowls = (snapshot?.howls || []).filter((h) => h.playing).length;
    const playingCount = playingEls + playingHowls;

    // Max simultaneous HTMLMediaElements: replay play / pause / ended over the whole log.
    const live = new Set();
    let maxSim = 0;
    for (const e of M.events) {
      if (e.kind === 'media.play') live.add(e.detail.i);
      else if (e.kind === 'media.pause' || e.kind === 'media.ended') live.delete(e.detail.i);
      maxSim = Math.max(maxSim, live.size);
    }
    M.maxSimultaneous = Math.max(M.maxSimultaneous || 0, maxSim, playingCount);

    // Fades (Web Audio): a set/known value followed by a ramp on the same param.
    const fades = [];
    const lastSet = {};
    for (const e of events) {
      const d = e.detail || {};
      if (e.kind === 'param.set') lastSet[d.param] = { value: d.value, time: d.time };
      else if (e.kind === 'param.linearRamp' || e.kind === 'param.expRamp') {
        const s = lastSet[d.param];
        fades.push({ source: 'webaudio', param: d.param, curve: e.kind.split('.')[1],
          from: s ? s.value : d.from, to: d.value,
          durationS: s && typeof d.time === 'number' ? r3(d.time - s.time) : null });
        lastSet[d.param] = { value: d.value, time: d.time };
      } else if (e.kind === 'param.setTarget') {
        // setTargetAtTime reaches ~95% after 3 time constants.
        fades.push({ source: 'webaudio', param: d.param, curve: 'target', to: d.value, durationS: r3(3 * d.timeConstant) });
      }
    }

    // Oscillation / fade analysis, shared by media-element volume series and Web Audio gain params.
    const analyse = (pts, who) => {
      // Fades: monotonic runs >= 300 ms with >= 5 samples and a change >= 0.05.
      let start = 0, runDir = 0;
      for (let k = 1; k <= pts.length; k++) {
        const d = k < pts.length ? Math.sign(pts[k].v - pts[k - 1].v) : 0;
        if (k < pts.length && !(d !== 0 && runDir !== 0 && d !== runDir)) { if (d !== 0) runDir = d; continue; }
        const a = pts[start], b = pts[k - 1];
        if (k - start >= 5 && b.t - a.t >= 300 && Math.abs(b.v - a.v) >= 0.05) {
          fades.push({ ...who, from: a.v, to: b.v, durationMs: b.t - a.t, samples: k - start });
        }
        start = k - 1; runDir = d;
      }
      if (pts.length < 4) return;
      const vols = pts.map((p) => p.v);
      const min = Math.min(...vols), max = Math.max(...vols);
      const mean = vols.reduce((a, b) => a + b, 0) / vols.length;
      // Zero-crossings of (value - mean) with a hysteresis band of 10% of the range.
      const band = (max - min) * 0.1;
      const crossings = [];
      let sign = 0;
      for (const p of pts) {
        const d = p.v - mean;
        const sgn = d > band ? 1 : d < -band ? -1 : 0;
        if (sgn !== 0 && sgn !== sign) { if (sign !== 0) crossings.push(p.t); sign = sgn; }
      }
      let periodMs = null;
      if (crossings.length >= 2) {
        const gaps = crossings.slice(1).map((t, k) => t - crossings[k]);
        periodMs = Math.round((2 * gaps.reduce((a, b) => a + b, 0)) / gaps.length);
      }
      const spanMs = pts[pts.length - 1].t - pts[0].t;
      const periods = periodMs ? spanMs / periodMs : 0;
      oscillation.push({
        ...who, samples: pts.length, spanMs, min: r3(min), max: r3(max), mean: r3(mean),
        amplitude: r3((max - min) / 2), floorRatio: max ? r3(min / max) : null, periodMs, periodsCaptured: r3(periods),
        confidence: periods >= 2 && max - min >= 0.02 ? 'medium' : 'low',
      });
    };
    const oscillation = [];
    const byEl = {};
    for (const s of series) (byEl[s.elementIndex] = byEl[s.elementIndex] || []).push({ t: s.t, v: s.volume });
    for (const [i, pts] of Object.entries(byEl)) analyse(pts, { source: 'element', elementIndex: +i });
    const byParam = {};
    for (const s of (M.paramSeries || []).filter((p) => p.t >= since)) (byParam[s.param] = byParam[s.param] || []).push({ t: s.t, v: s.value });
    for (const [param, pts] of Object.entries(byParam)) analyse(pts, { source: 'param', param });

    // Loop info per element (+ loop toggles seen in the log).
    const loops = (snapshot?.elements || []).map((e) => ({ i: e.i, src: e.src, loop: e.loop, duration: e.duration,
      toggles: events.filter((x) => x.kind === 'media.loop' && x.detail.i === e.i).length }));
    const sourceLoops = events.filter((e) => e.kind === 'source.start' && e.detail.loop)
      .map((e) => ({ bufferDuration: e.detail.bufferDuration, t: e.t }));

    return {
      ...base(), windowMs: winMs || null, totalEvents: M.events.length, countsByKind,
      lastEvents: events.slice(-50), snapshot, playingCount, maxSimultaneous: M.maxSimultaneous,
      fades: fades.slice(-40), loops, sourceLoops: sourceLoops.slice(-20), oscillation,
    };
  } catch (e) {
    return { _probe, error: String(e) };
  }
})()
