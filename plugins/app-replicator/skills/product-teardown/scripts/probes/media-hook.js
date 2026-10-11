// media-hook — instruments HTMLMediaElement + Web Audio + Howler/Tone/mediaSession detection.
// Returns: install state {installed, alreadyInstalled, wrapped[]} and the current mediaSnapshot().
// When: BEFORE the first user gesture and again after every navigation (full reloads wipe it);
// idempotent, so re-running is safe. Read side: media-sample.js (events, fades, oscillation).
// Writes window.__pt.media.events (ring buffer 2000: {t, kind, detail}), .elements (Set),
// .volumeSeries ({t, elementIndex, volume}, cap 5000), .paramSeries ({t, param, value}, cap 5000 — gain
// params set via .value or ramps, so Howler/Web Audio volume curves are analysable) and
// window.__pt.mediaSnapshot(). Output keys avoid the words session/token: the Chrome tool redacts them.
(() => {
  const _probe = 'media-hook';
  try {
    const pt = (window.__pt = window.__pt || {});
    const alreadyInstalled = !!pt.media;
    const M = (pt.media = pt.media || {
      events: [], elements: new Set(), volumeSeries: [], paramSeries: [], contexts: [], gainCount: 0,
      elIndex: new WeakMap(), nextIndex: 0, paramLabel: new WeakMap(), osActions: [],
      lastVolLog: new WeakMap(), wrapped: [], installedAt: Date.now(),
    });
    const push = (kind, detail) => {
      M.events.push({ t: Math.round(performance.now()), kind, detail });
      if (M.events.length > 2000) M.events.shift();
    };
    const pushParam = (param, value) => {
      M.paramSeries.push({ t: Math.round(performance.now()), param, value });
      if (M.paramSeries.length > 5000) M.paramSeries.shift();
    };
    const tail = (s) => String(s || '').split(/[?#]/)[0].split('/').slice(-2).join('/').slice(-80);
    const r3 = (n) => (typeof n === 'number' && isFinite(n) ? Math.round(n * 1000) / 1000 : n);
    const idx = (el) => {
      if (!M.elIndex.has(el)) {
        const i = M.nextIndex++;
        M.elIndex.set(el, i); M.elements.add(el);
        try { el.addEventListener('ended', () => push('media.ended', { i, src: tail(el.currentSrc || el.src) })); } catch (_) {}
      }
      return M.elIndex.get(el);
    };
    const elInfo = (el) => ({ i: idx(el), tag: el.tagName?.toLowerCase(), src: tail(el.currentSrc || el.src),
      t: r3(el.currentTime), vol: r3(el.volume), loop: el.loop });
    const wrapFn = (obj, name, label, before) => {
      if (!obj || typeof obj[name] !== 'function' || obj[name].__pt) return;
      const orig = obj[name];
      const w = function (...a) { try { before(this, a); } catch (_) {} return orig.apply(this, a); };
      w.__pt = true; obj[name] = w; M.wrapped.push(label);
    };
    const wrapSetter = (proto, prop, label, after) => {
      const d = proto && Object.getOwnPropertyDescriptor(proto, prop);
      if (!d || !d.set || d.set.__pt) return;
      const set = function (v) { const r = d.set.call(this, v); try { after(this, v); } catch (_) {} return r; };
      set.__pt = true; Object.defineProperty(proto, prop, { ...d, set }); M.wrapped.push(label);
    };

    if (!alreadyInstalled) {
      // --- HTMLMediaElement -------------------------------------------------------
      const HP = window.HTMLMediaElement && HTMLMediaElement.prototype;
      for (const m of ['play', 'pause', 'load']) wrapFn(HP, m, 'media.' + m, (el) => push('media.' + m, elInfo(el)));
      wrapSetter(HP, 'volume', 'media.volume=', (el, v) => {
        const i = idx(el), now = performance.now();
        M.volumeSeries.push({ t: Math.round(now), elementIndex: i, volume: r3(el.volume) });
        if (M.volumeSeries.length > 5000) M.volumeSeries.shift();
        // Throttle the event log (series keeps every sample): log if >=250 ms since last for this element.
        if (now - (M.lastVolLog.get(el) || -1e9) >= 250) { M.lastVolLog.set(el, now); push('media.volume', { i, volume: r3(v) }); }
      });
      wrapSetter(HP, 'loop', 'media.loop=', (el, v) => push('media.loop', { i: idx(el), loop: !!v }));
      wrapSetter(HP, 'currentTime', 'media.currentTime=', (el, v) => push('media.seek', { i: idx(el), to: r3(+v) }));
      wrapSetter(HP, 'src', 'media.src=', (el, v) => push('media.src', { i: idx(el), src: tail(v) }));

      // --- Web Audio ----------------------------------------------------------------
      for (const name of ['AudioContext', 'webkitAudioContext']) {
        const C = window[name];
        if (typeof C !== 'function' || C.__pt) continue;
        try {
          const W = class extends C {
            constructor(...a) {
              super(...a);
              if (M.contexts.length < 50) M.contexts.push(this);
              push('audioctx.new', { name, n: M.contexts.length, sampleRate: this.sampleRate, state: this.state });
              try { this.addEventListener('statechange', () => push('audioctx.state', { state: this.state })); } catch (_) {}
            }
          };
          W.__pt = true; window[name] = W; M.wrapped.push(name);
        } catch (_) {}
      }
      const BP = (window.BaseAudioContext || window.AudioContext || {}).prototype;
      if (BP && typeof BP.decodeAudioData === 'function' && !BP.decodeAudioData.__pt) {
        const orig = BP.decodeAudioData;
        BP.decodeAudioData = function (data, ok, err) {
          const bytes = data && data.byteLength; // read before the buffer is detached
          const log = (b) => { push('audio.decode', { bytes, duration: r3(b?.duration), channels: b?.numberOfChannels, sampleRate: b?.sampleRate }); return b; };
          const okW = typeof ok === 'function' ? (b) => { log(b); return ok(b); } : ok;
          const p = orig.call(this, data, okW, err);
          return p && typeof p.then === 'function' && typeof ok !== 'function' ? p.then(log) : p;
        };
        BP.decodeAudioData.__pt = true; M.wrapped.push('decodeAudioData');
      }
      const SP = window.AudioBufferSourceNode && AudioBufferSourceNode.prototype;
      wrapFn(SP, 'start', 'bufferSource.start', (n, a) => push('source.start', {
        when: r3(a[0]), offset: r3(a[1]), duration: r3(a[2]), loop: n.loop, bufferDuration: r3(n.buffer?.duration) }));
      wrapFn(SP, 'stop', 'bufferSource.stop', (n, a) => push('source.stop', { when: r3(a[0]) }));
      wrapSetter(SP, 'loop', 'bufferSource.loop=', (n, v) => push('source.loop', { loop: !!v }));
      const labelGain = (g) => { M.gainCount++; M.paramLabel.set(g.gain, 'gain#' + M.gainCount); push('gain.new', { n: M.gainCount }); };
      if (BP && typeof BP.createGain === 'function' && !BP.createGain.__pt) {
        const orig = BP.createGain;
        BP.createGain = function (...a) { const g = orig.apply(this, a); try { labelGain(g); } catch (_) {} return g; };
        BP.createGain.__pt = true; M.wrapped.push('createGain');
      }
      if (typeof window.GainNode === 'function' && !GainNode.__pt) {
        try {
          const G = window.GainNode;
          const W = class extends G { constructor(...a) { super(...a); try { labelGain(this); } catch (_) {} } };
          W.__pt = true; window.GainNode = W; M.wrapped.push('GainNode');
        } catch (_) {}
      }
      const AP = window.AudioParam && AudioParam.prototype;
      const label = (p) => M.paramLabel.get(p) || 'other';
      wrapFn(AP, 'setValueAtTime', 'param.setValueAtTime', (p, a) => { push('param.set', { param: label(p), value: r3(a[0]), time: r3(a[1]) }); if (M.paramLabel.has(p)) pushParam(label(p), r3(a[0])); });
      wrapFn(AP, 'linearRampToValueAtTime', 'param.linearRamp', (p, a) => push('param.linearRamp', { param: label(p), value: r3(a[0]), time: r3(a[1]), from: r3(p.value) }));
      wrapFn(AP, 'exponentialRampToValueAtTime', 'param.expRamp', (p, a) => push('param.expRamp', { param: label(p), value: r3(a[0]), time: r3(a[1]), from: r3(p.value) }));
      wrapFn(AP, 'setTargetAtTime', 'param.setTarget', (p, a) => push('param.setTarget', { param: label(p), value: r3(a[0]), time: r3(a[1]), timeConstant: r3(a[2]) }));
      wrapSetter(AP, 'value', 'param.value=', (p, v) => { if (M.paramLabel.has(p)) { push('param.value', { param: label(p), value: r3(+v) }); pushParam(label(p), r3(+v)); } });

      // --- mediaSession action handlers ------------------------------------------
      const ms = navigator.mediaSession;
      if (ms && typeof ms.setActionHandler === 'function' && !ms.setActionHandler.__pt) {
        const orig = ms.setActionHandler.bind(ms);
        ms.setActionHandler = (action, h) => {
          if (!M.osActions.includes(action)) M.osActions.push(action);
          push('mediaSession.action', { action, set: !!h });
          return orig(action, h);
        };
        ms.setActionHandler.__pt = true; M.wrapped.push('mediaSession.setActionHandler');
      }
    }

    // --- snapshot (re-defined on every run so it picks up new libs) ------------------------
    const detect = () => {
      const H = window.Howler, T = window.Tone, ms = navigator.mediaSession, as = navigator.audioSession;
      const md = ms && ms.metadata;
      return {
        howler: H ? { version: H.version, howls: H._howls?.length, masterVolume: r3(H._volume) } : null,
        tone: T ? { version: T.version, contextState: T.context?.state } : null,
        osMediaControls: ms ? { playbackState: ms.playbackState, actionHandlers: M.osActions,
          metadata: md ? { title: md.title, artist: md.artist, album: md.album, artwork: md.artwork?.length || 0 } : null } : null,
        osAudioMode: as ? { type: as.type, state: as.state } : null,
      };
    };
    pt.mediaSnapshot = () => {
      document.querySelectorAll('audio, video').forEach(idx);
      const elements = Array.from(M.elements).map((el) => ({
        i: idx(el), tag: el.tagName?.toLowerCase(), src: tail(el.currentSrc || el.src), inDom: el.isConnected,
        currentTime: r3(el.currentTime), duration: r3(el.duration), volume: r3(el.volume), loop: el.loop,
        paused: el.paused, muted: el.muted, playbackRate: el.playbackRate, readyState: el.readyState,
      }));
      let howls = null;
      try {
        howls = (window.Howler?._howls || []).slice(0, 100).map((h) => {
          const call = (f) => { try { return typeof h[f] === 'function' ? h[f]() : undefined; } catch (_) { return undefined; } };
          return { src: tail([].concat(h._src)[0]), volume: r3(call('volume')), loop: call('loop'),
            playing: call('playing'), duration: r3(call('duration')) };
        });
      } catch (_) {}
      return { elements, howls, contexts: M.contexts.map((c) => ({ state: c.state, sampleRate: c.sampleRate, currentTime: r3(c.currentTime) })),
        gainNodes: M.gainCount, libs: detect() };
    };

    return {
      _probe, ts: Date.now(), innerWidth, innerHeight, href: location.href,
      installed: true, alreadyInstalled, installedAt: M.installedAt, wrapped: M.wrapped,
      eventCount: M.events.length, snapshot: pt.mediaSnapshot(),
    };
  } catch (e) {
    return { _probe, error: String(e) };
  }
})()
