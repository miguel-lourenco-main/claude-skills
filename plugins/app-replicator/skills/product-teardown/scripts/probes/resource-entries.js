// resource-entries — Resource Timing catalogue: what the page loaded, grouped by category.
// Returns: {categories{audio,image,font,script,style,xhr/fetch,other: {count, transfer, decoded}},
// audio[] (URL + size, full list), fonts[] (family hints), thirdParty[], navigation, entries[] (cap 500)}.
// When: after the surface is fully loaded and after audio has been played (lazy loads appear later).
// CATALOGUING ONLY — never download any listed file (audio especially); record URL, type and size.
(() => {
  const _probe = 'resource-entries';
  try {
    const CAP = 500;
    const EXT = {
      audio: /\.(mp3|ogg|oga|wav|m4a|aac|flac|opus|weba)(\?|#|$)/i,
      video: /\.(mp4|webm|mov|m3u8|mpd)(\?|#|$)/i,
      image: /\.(png|jpe?g|gif|webp|avif|svg|ico|bmp)(\?|#|$)/i,
      font: /\.(woff2?|ttf|otf|eot)(\?|#|$)/i,
      script: /\.(m?js)(\?|#|$)/i,
      style: /\.css(\?|#|$)/i,
      json: /\.json(\?|#|$)/i,
    };
    const MIME = { audio: 'audio/*', video: 'video/*', image: 'image/*', font: 'font/*', script: 'text/javascript', style: 'text/css', json: 'application/json' };
    const guessExt = (url) => Object.keys(EXT).find((k) => EXT[k].test(url)) || null;
    const category = (e, ext) => {
      const it = e.initiatorType;
      if (ext === 'audio' || it === 'audio') return 'audio';
      if (ext === 'font') return 'font';
      if (ext === 'image' || it === 'img' || it === 'image') return 'image';
      if (ext === 'script' || it === 'script') return 'script';
      if (ext === 'style' || (it === 'link' && /\.css/i.test(e.name))) return 'style';
      if (it === 'xmlhttprequest' || it === 'fetch' || it === 'beacon') return 'xhr/fetch';
      return 'other';
    };
    const round = (n) => Math.round(n || 0);
    const all = performance.getEntriesByType('resource');
    const categories = {};
    const origins = {};
    const audio = [], fonts = [], entries = [];
    for (const e of all) {
      const ext = guessExt(e.name);
      const cat = category(e, ext);
      const c = (categories[cat] = categories[cat] || { count: 0, transfer: 0, decoded: 0 });
      c.count++; c.transfer += e.transferSize || 0; c.decoded += e.decodedBodySize || 0;
      let origin = '';
      try { origin = new URL(e.name).origin; } catch (_) {}
      if (origin && origin !== location.origin) origins[origin] = (origins[origin] || 0) + 1;
      const row = {
        name: e.name.slice(0, 300), category: cat, initiatorType: e.initiatorType, mime: MIME[ext] || null,
        transferSize: e.transferSize, encodedBodySize: e.encodedBodySize, decodedBodySize: e.decodedBodySize,
        duration: round(e.duration), startTime: round(e.startTime),
      };
      if (entries.length < CAP) entries.push(row);
      if (cat === 'audio') audio.push({ url: e.name, initiatorType: e.initiatorType, transferSize: e.transferSize,
        encodedBodySize: e.encodedBodySize, decodedBodySize: e.decodedBodySize, startTime: round(e.startTime) });
      if (cat === 'font') {
        // Family hint: file name minus hashes/weights, e.g. Inter-SemiBold.a1b2.woff2 -> "Inter".
        const file = decodeURIComponent(e.name.split(/[?#]/)[0].split('/').pop() || '');
        const fam = new URL(e.name, location.href).searchParams.get('family') ||
          file.replace(/\.(woff2?|ttf|otf|eot)$/i, '').replace(/[.-][a-f0-9]{6,}$/i, '').split(/[-_.]/)[0];
        fonts.push({ url: e.name, familyHint: fam, transferSize: e.transferSize });
      }
    }
    for (const c of Object.values(categories)) { c.transfer = round(c.transfer); c.decoded = round(c.decoded); }

    const nav = performance.getEntriesByType('navigation')[0];
    const navigation = nav ? {
      type: nav.type, transferSize: nav.transferSize, ttfb: round(nav.responseStart),
      domContentLoaded: round(nav.domContentLoadedEventEnd), load: round(nav.loadEventEnd),
      duration: round(nav.duration), protocol: nav.nextHopProtocol,
    } : null;

    return {
      _probe, ts: Date.now(), innerWidth, innerHeight, href: location.href,
      note: 'catalogue only — never download these files',
      total: all.length, truncated: all.length > CAP,
      categories, audio, fonts,
      thirdParty: Object.entries(origins).sort((a, b) => b[1] - a[1]).map(([origin, count]) => ({ origin, count })),
      navigation, entries,
    };
  } catch (e) {
    return { _probe, error: String(e) };
  }
})()
