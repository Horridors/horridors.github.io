// Horridors — PWA bootstrap
// Registers the service worker (enables offline install) and handles
// pausing audio/input when the tab is backgrounded.
(function () {
  // Register service worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((err) => {
        console.warn('[PWA] SW registration failed', err);
      });
    });
  }

  // Pause on visibility hidden: mute audio + release any held touch keys
  function applyBackground() {
    // Release all touch keys so the player doesn't keep running when app goes background
    if (window.HorridorsTouch) window.HorridorsTouch.releaseAll();
    // Stop music bus gain
    if (window.HorridorsMusic) { try { window.HorridorsMusic.stop(); } catch (e) {} }
    // Suspend the shared audio context if present
    try {
      const ctxs = [
        window.__horridorsL1, window.__horridorsL2, window.__horridorsL3,
        window.__horridorsL4, window.__horridorsL5, window.__horridorsL6,
        window.__horridorsL7, window.__horridorsL8,
      ];
      for (const h of ctxs) {
        if (h && h.audioCtx) {
          const c = h.audioCtx();
          if (c && c.state === 'running') c.suspend();
        }
      }
    } catch (e) {}
  }
  function applyForeground() {
    try {
      const ctxs = [
        window.__horridorsL1, window.__horridorsL2, window.__horridorsL3,
        window.__horridorsL4, window.__horridorsL5, window.__horridorsL6,
        window.__horridorsL7, window.__horridorsL8,
      ];
      for (const h of ctxs) {
        if (h && h.audioCtx) {
          const c = h.audioCtx();
          if (c && c.state === 'suspended') c.resume();
        }
      }
    } catch (e) {}
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) applyBackground();
    else applyForeground();
  });
  window.addEventListener('pagehide', applyBackground);
  window.addEventListener('pageshow', applyForeground);

  // Lock orientation to landscape where supported (best-effort; requires user gesture on some browsers)
  function tryLockLandscape() {
    try {
      if (screen && screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').catch(() => {});
      }
    } catch (e) {}
  }
  document.addEventListener('click', tryLockLandscape, { once: true });
  document.addEventListener('touchstart', tryLockLandscape, { once: true });
})();
