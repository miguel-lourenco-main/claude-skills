// notification-hook — captures end-of-timer signals: Notifications, short sound clips, vibration.
// Returns: install state {installed, alreadyInstalled, wrapped[]} and the log (last 50).
// When: before starting a timer/alarm; call again afterwards to read window.__pt.notifications.
// Idempotent. Notifications are NEVER shown (a stub is returned); permission is never granted.
// document.title changes are not hookable here — use title-sampler.js for those.
(() => {
  const _probe = 'notification-hook';
  try {
    const pt = (window.__pt = window.__pt || {});
    const alreadyInstalled = !!pt.notificationHook;
    pt.notifications = pt.notifications || [];
    const log = (kind, detail) => {
      pt.notifications.push({ t: Date.now(), kind, detail });
      if (pt.notifications.length > 500) pt.notifications.shift();
    };
    const tail = (s) => String(s || '').split(/[?#]/)[0].split('/').slice(-2).join('/').slice(-80);
    const wrapped = [];

    if (!alreadyInstalled) {
      // Notification constructor -> logged stub (keeps static .permission untouched).
      const N = window.Notification;
      if (typeof N === 'function') {
        try {
          const Stub = function (title, opts = {}) {
            log('notification', { title: String(title), body: opts.body, icon: tail(opts.icon), tag: opts.tag,
              silent: opts.silent, requireInteraction: opts.requireInteraction });
            const stub = { title: String(title), body: opts.body, tag: opts.tag, close() { log('notification.close', { title: String(title) }); },
              addEventListener() {}, removeEventListener() {}, onclick: null, onclose: null, onshow: null, onerror: null };
            return stub; // returning an object from a constructor replaces `this`
          };
          Object.defineProperty(Stub, 'permission', { get: () => N.permission, configurable: true });
          Stub.requestPermission = function (cb) {
            log('notification.requestPermission', {});
            if (typeof cb === 'function') { try { cb('default'); } catch (_) {} }
            return Promise.resolve('default');
          };
          Stub.prototype = N.prototype;
          Stub.maxActions = N.maxActions;
          window.Notification = Stub;
          wrapped.push('Notification', 'Notification.requestPermission');
        } catch (_) {}
      }
      // ServiceWorker notifications (registration.showNotification) — log and swallow.
      const RP = window.ServiceWorkerRegistration && ServiceWorkerRegistration.prototype;
      if (RP && typeof RP.showNotification === 'function') {
        RP.showNotification = function (title, opts = {}) {
          log('sw.notification', { title: String(title), body: opts.body, tag: opts.tag, silent: opts.silent });
          return Promise.resolve();
        };
        wrapped.push('ServiceWorkerRegistration.showNotification');
      }
      // Audio(): log construction; play() of short, non-looping clips (likely chimes).
      const A = window.Audio;
      if (typeof A === 'function') {
        try {
          const W = function (src) { const a = arguments.length ? new A(src) : new A(); log('audio.new', { src: tail(src) }); return a; };
          W.prototype = A.prototype;
          window.Audio = W;
          wrapped.push('Audio');
        } catch (_) {}
      }
      const AP = window.HTMLAudioElement && HTMLAudioElement.prototype;
      const MP = window.HTMLMediaElement && HTMLMediaElement.prototype;
      if (AP && MP && typeof MP.play === 'function') {
        // Define on HTMLAudioElement.prototype so media-hook's wrapper (on HTMLMediaElement) still runs.
        const basePlay = Object.prototype.hasOwnProperty.call(AP, 'play') ? AP.play : null;
        AP.play = function (...a) {
          const d = this.duration;
          if (!this.loop && (!isFinite(d) || d <= 15)) {
            log('audio.play', { src: tail(this.currentSrc || this.src), duration: isFinite(d) ? Math.round(d * 100) / 100 : null,
              volume: this.volume, known: isFinite(d) });
            if (!isFinite(d)) { // fill in the duration once metadata arrives
              const entry = pt.notifications[pt.notifications.length - 1].detail;
              this.addEventListener('loadedmetadata', () => { entry.duration = Math.round(this.duration * 100) / 100; entry.known = true; }, { once: true });
            }
          }
          return (basePlay || MP.play).apply(this, a);
        };
        wrapped.push('HTMLAudioElement.play');
      }
      if (typeof navigator.vibrate === 'function') {
        try {
          navigator.vibrate = function (pattern) { log('vibrate', { pattern }); return true; };
          wrapped.push('navigator.vibrate');
        } catch (_) {}
      }
      pt.notificationHook = { installedAt: Date.now(), wrapped };
    }

    return {
      _probe, ts: Date.now(), innerWidth, innerHeight, href: location.href,
      installed: true, alreadyInstalled, wrapped: pt.notificationHook.wrapped,
      permission: window.Notification ? Notification.permission : 'unsupported',
      count: pt.notifications.length, log: pt.notifications.slice(-50),
    };
  } catch (e) {
    return { _probe, error: String(e) };
  }
})()
