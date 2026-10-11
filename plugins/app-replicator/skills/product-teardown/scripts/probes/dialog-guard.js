// dialog-guard — neutralises blocking/escaping dialogs so the teardown never stalls.
// Returns: install state {installed, alreadyInstalled, wrapped[], dialogs[] (last 20)}.
// When: FIRST probe on every page load / navigation (installs are lost on reload).
// Idempotent via window.__pt.dialogGuard; calling again just returns the log.
// Overrides alert/confirm/prompt (logged, never shown), window.open (logged, returns null),
// Notification.requestPermission (logged, resolves 'default' — never grants).
(() => {
  const _probe = 'dialog-guard';
  try {
    const pt = (window.__pt = window.__pt || {});
    pt.dialogs = pt.dialogs || [];
    const log = (type, message) => {
      pt.dialogs.push({ type, message: String(message ?? '').slice(0, 300), ts: Date.now() });
      if (pt.dialogs.length > 500) pt.dialogs.shift();
    };
    const alreadyInstalled = !!pt.dialogGuard;
    const wrapped = [];
    if (!alreadyInstalled) {
      // Blocking dialogs: log and return the "dismissed" value without opening anything.
      const fake = { alert: undefined, confirm: false, prompt: null };
      for (const name of Object.keys(fake)) {
        if (typeof window[name] !== 'function') continue;
        try {
          window[name] = function (message) { log(name, message); return fake[name]; };
          wrapped.push(name);
        } catch (_) { /* non-writable in some sandboxes */ }
      }
      // Popups / new tabs.
      if (typeof window.open === 'function') {
        try {
          window.open = function (url, target, features) {
            log('window.open', `${url ?? ''} target=${target ?? ''} features=${features ?? ''}`);
            return null;
          };
          wrapped.push('window.open');
        } catch (_) {}
      }
      // Notification permission: never grant, never prompt.
      if (typeof window.Notification === 'function' && typeof Notification.requestPermission === 'function') {
        try {
          Notification.requestPermission = function (cb) {
            log('Notification.requestPermission', '');
            if (typeof cb === 'function') { try { cb('default'); } catch (_) {} }
            return Promise.resolve('default');
          };
          wrapped.push('Notification.requestPermission');
        } catch (_) {}
      }
      pt.dialogGuard = { installedAt: Date.now(), wrapped };
    }
    return {
      _probe, ts: Date.now(), innerWidth, innerHeight, href: location.href,
      installed: true, alreadyInstalled,
      wrapped: pt.dialogGuard.wrapped,
      dialogCount: pt.dialogs.length,
      dialogs: pt.dialogs.slice(-20),
    };
  } catch (e) {
    return { _probe, error: String(e) };
  }
})()
