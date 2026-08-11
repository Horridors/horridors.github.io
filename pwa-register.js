// Horridors — PWA bootstrap
// Registers the service worker (enables offline install) and handles
// pausing audio/input when the tab is backgrounded.
(function () {
  // Register service worker. When a NEW version is activated after the page
  // was already controlled by an OLDER version, we used to auto-reload — but
  // that caused a jarring "game loads, then resets, load again" experience on
  // the very first visit (initial takeover of a previously-uncontrolled page
  // is not really a code update, but controllerchange fires anyway). We now:
  //   - Ignore the FIRST controllerchange (initial takeover)
  //   - Never reload during active gameplay (scene !== 'title' and !== 'intro')
  //   - Defer the reload until the game is back on the title screen if user is playing
  if ('serviceWorker' in navigator) {
    // Was the page already controlled BEFORE we registered? If yes, a
    // subsequent controllerchange really is a version update. If no, the
    // first controllerchange is just the fresh-install claim and MUST NOT
    // trigger a reload — that's the "load twice" bug.
    const wasControlledAtStart = !!navigator.serviceWorker.controller;
    let controllerChanges = 0;

    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').then((reg) => {
        if (reg.update) reg.update().catch(() => {});
      }).catch((err) => {
        console.warn('[PWA] SW registration failed', err);
      });

      let reloading = false;
      function safeReload() {
        if (reloading) return;
        reloading = true;
        setTimeout(() => window.location.reload(), 100);
      }
      function isInGameplay() {
        try {
          const scene = window.__game && window.__game.state && window.__game.state.scene;
          // Only reload from safe scenes: title, intro, end. Never mid-play.
          return scene && scene !== 'title' && scene !== 'intro' && scene !== 'end';
        } catch (e) { return false; }
      }

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        controllerChanges++;
        // First controllerchange on an UNCONTROLLED initial page load is just
        // the SW claiming the tab — not a version update. Skip.
        if (!wasControlledAtStart && controllerChanges === 1) {
          console.log('[PWA] SW claimed initial page (no reload).');
          return;
        }
        // Real version update. If mid-play, defer until player returns to title.
        if (isInGameplay()) {
          console.log('[PWA] SW updated mid-play; will reload when back on title.');
          const check = setInterval(() => {
            if (!isInGameplay()) { clearInterval(check); safeReload(); }
          }, 1500);
          return;
        }
        safeReload();
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
