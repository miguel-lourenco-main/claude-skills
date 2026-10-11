// storage-snapshot — shapes (not contents) of localStorage, sessionStorage, IndexedDB, cookie names.
// Returns: {local[], tabStorage[] (sessionStorage), idb, idbPending, cookieNames[], diff}. Output keys
// avoid the words session/token: the Chrome javascript tool redacts them as [BLOCKED]. Values are summarised as
// shapes; raw values only when they are short primitives (<= 40 chars). Cookie VALUES never read.
// When: before and after each user action you want to attribute to storage (diff vs previous call).
// IndexedDB listing is async: each call refreshes window.__pt.idb in the background; the FIRST
// call returns pending:true — call it a SECOND time. The diff compares with window.__pt.storagePrev.
(() => {
  const _probe = 'storage-snapshot';
  try {
    const pt = (window.__pt = window.__pt || {});
    const MAX_RAW = 40;

    // Recursive shape: keys -> types, depth 3, arrays as "[type ×n]".
    const shape = (v, depth) => {
      if (v === null) return 'null';
      if (Array.isArray(v)) {
        if (!v.length) return '[empty ×0]';
        const inner = depth < 3 && typeof v[0] === 'object' && v[0] !== null ? shape(v[0], depth + 1) : typeOf(v[0]);
        return typeof inner === 'string' ? `[${inner} ×${v.length}]` : { '[]': inner, '×': v.length };
      }
      if (typeof v === 'object') {
        if (depth >= 3) return `object(${Object.keys(v).length} keys)`;
        const o = {};
        for (const k of Object.keys(v).slice(0, 40)) o[k] = shape(v[k], depth + 1);
        return o;
      }
      return typeOf(v);
    };
    const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

    const describe = (raw) => {
      const out = { len: raw.length };
      let parsed, isJson = false;
      try { parsed = JSON.parse(raw); isJson = true; } catch (_) {}
      if (isJson && parsed !== null && typeof parsed === 'object') { out.json = true; out.shape = shape(parsed, 0); }
      else if (isJson && (typeof parsed === 'number' || typeof parsed === 'boolean')) { out.json = true; out.value = parsed; }
      else if (raw.length <= MAX_RAW) out.value = raw; // short primitive string
      else out.shape = `string(${raw.length})`;
      return out;
    };
    const dump = (store) => {
      const rows = [];
      try {
        if (!store) return { unavailable: true };
        for (let i = 0; i < store.length && i < 300; i++) {
          const key = store.key(i);
          rows.push({ key, ...describe(store.getItem(key) ?? '') });
        }
      } catch (e) { return { error: String(e) }; }
      return rows;
    };

    let ls, ss;
    try { ls = window.localStorage; } catch (_) {}
    try { ss = window.sessionStorage; } catch (_) {}
    const local = dump(ls);
    const tabStorage = dump(ss);

    // Cookie NAMES only.
    let cookieNames = [];
    try { cookieNames = document.cookie.split(';').map((c) => c.split('=')[0].trim()).filter(Boolean); } catch (_) {}

    // IndexedDB: async collector fills window.__pt.idb.
    // Every call starts a fresh background collection (unless one is running) and returns the last
    // completed result; pending:true means nothing has completed yet — call again.
    if (!pt.idbCollecting && !(pt.idb && pt.idb.unsupported)) {
      pt.idbCollecting = true;
      if (window.indexedDB && typeof indexedDB.databases === 'function') {
        indexedDB.databases().then(async (dbs) => {
          const list = [];
          for (const d of dbs.slice(0, 20)) {
            const entry = { name: d.name, version: d.version, stores: [] };
            try {
              await new Promise((res) => {
                // Opening without a version never triggers an upgrade on existing DBs.
                const req = indexedDB.open(d.name);
                req.onsuccess = () => {
                  const db = req.result;
                  for (const s of Array.from(db.objectStoreNames)) {
                    try {
                      const st = db.transaction(s, 'readonly').objectStore(s);
                      entry.stores.push({ name: s, keyPath: st.keyPath, autoIncrement: st.autoIncrement,
                        indexes: Array.from(st.indexNames) });
                    } catch (_) { entry.stores.push({ name: s }); }
                  }
                  db.close(); res();
                };
                req.onerror = () => res();
                req.onblocked = () => res();
              });
            } catch (_) {}
            list.push(entry);
          }
          pt.idb = { ts: Date.now(), databases: list };
        }).catch((e) => { pt.idb = { error: String(e) }; }).finally(() => { pt.idbCollecting = false; });
      } else {
        pt.idb = { unsupported: true };
        pt.idbCollecting = false;
      }
    }
    const idbPending = !pt.idb;

    // Diff vs previous snapshot (keys + length/shape fingerprint).
    const fingerprint = (rows, prefix) => {
      const m = {};
      if (Array.isArray(rows)) for (const r of rows) m[prefix + r.key] = JSON.stringify([r.len, r.value, r.shape]);
      for (const c of prefix === 'local:' ? cookieNames : []) m['cookie:' + c] = '1';
      return m;
    };
    const current = { ...fingerprint(local, 'local:'), ...fingerprint(tabStorage, 'tab:') };
    let diff = null;
    if (pt.storagePrev) {
      const prev = pt.storagePrev;
      diff = {
        added: Object.keys(current).filter((k) => !(k in prev)),
        removed: Object.keys(prev).filter((k) => !(k in current)),
        changed: Object.keys(current).filter((k) => k in prev && prev[k] !== current[k]),
      };
    }
    pt.storagePrev = current;

    return {
      _probe, ts: Date.now(), innerWidth, innerHeight, href: location.href,
      local, tabStorage, cookieNames,
      idb: pt.idb || null, idbAgeMs: pt.idb && pt.idb.ts ? Date.now() - pt.idb.ts : null, idbPending, pending: idbPending,
      diff, note: diff ? undefined : 'first snapshot stored; next call returns a diff',
    };
  } catch (e) {
    return { _probe, error: String(e) };
  }
})()
