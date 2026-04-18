/* Horridors — Fullscreen / Pseudo-Fullscreen toggle
   ------------------------------------------------------------
   Real Fullscreen API when available. Falls back to a CSS
   "pseudo-fullscreen" that makes the game take over the whole
   viewport even inside iframes that block true fullscreen. */
(function () {
  'use strict';

  const btn = document.getElementById('fullscreen-btn');
  const root = document.getElementById('game-root');
  if (!btn || !root) return;

  let pseudoOn = false;

  function inRealFullscreen() {
    return !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.msFullscreenElement
    );
  }

  function requestReal(el) {
    const fn =
      el.requestFullscreen ||
      el.webkitRequestFullscreen ||
      el.msRequestFullscreen;
    if (fn) {
      try {
        const p = fn.call(el);
        if (p && typeof p.then === 'function') return p;
        return Promise.resolve();
      } catch (e) {
        return Promise.reject(e);
      }
    }
    return Promise.reject(new Error('no fullscreen api'));
  }

  function exitReal() {
    const fn =
      document.exitFullscreen ||
      document.webkitExitFullscreen ||
      document.msExitFullscreen;
    if (fn) {
      try {
        const p = fn.call(document);
        if (p && typeof p.then === 'function') return p;
        return Promise.resolve();
      } catch (e) {
        return Promise.reject(e);
      }
    }
    return Promise.reject(new Error('no exit fullscreen api'));
  }

  function enterPseudo() {
    if (pseudoOn) return;
    pseudoOn = true;
    document.body.classList.add('pseudo-fullscreen');
    // Force a resize event so any canvas-DPR logic re-layouts
    window.dispatchEvent(new Event('resize'));
    // Try to lock landscape on supported devices (rotates phone in-app automatically)
    try {
      if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').catch(() => {});
      }
    } catch (e) {}
  }

  function exitPseudo() {
    if (!pseudoOn) return;
    pseudoOn = false;
    document.body.classList.remove('pseudo-fullscreen');
    window.dispatchEvent(new Event('resize'));
    try {
      if (screen.orientation && screen.orientation.unlock) {
        screen.orientation.unlock();
      }
    } catch (e) {}
  }

  function toggle() {
    // Currently in real fullscreen? exit it.
    if (inRealFullscreen()) {
      exitReal().catch(() => {});
      return;
    }
    // Currently in pseudo? exit it.
    if (pseudoOn) {
      exitPseudo();
      return;
    }
    // Otherwise, try real fullscreen on the game-root.
    // If that fails (iframe sandbox, Safari iOS, etc.), fall back to pseudo.
    requestReal(root).catch(() => {
      enterPseudo();
    });
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    toggle();
  });

  // Keyboard shortcut: F toggles fullscreen (don't swallow input to game)
  window.addEventListener('keydown', (e) => {
    if (e.key === 'f' || e.key === 'F') {
      // Don't toggle if the user is typing in an input
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      toggle();
    }
  });

  // Keep UI in sync when fullscreen changes via browser (Esc key, etc)
  document.addEventListener('fullscreenchange', () => {
    if (!inRealFullscreen() && pseudoOn) {
      // Already in pseudo; leave alone
    }
  });

  // On tiny embeds (iframe < 90% of viewport), auto-offer pseudo-fullscreen on first tap.
  // This ensures the game becomes usable immediately when downloaded/embedded.
  function isEmbeddedSmall() {
    // If window is inside an iframe AND visible viewport is smaller than reasonable
    const embedded = window.self !== window.top;
    const small = window.innerHeight < 500 || window.innerWidth < 700;
    return embedded || small;
  }

  let autoPromptedFs = false;
  function autoPrompt() {
    if (autoPromptedFs) return;
    autoPromptedFs = true;
    if (!inRealFullscreen() && !pseudoOn && isEmbeddedSmall()) {
      // Pseudo-fullscreen is safe to enter without user-gesture restrictions.
      enterPseudo();
    }
  }

  // First pointerdown or keydown triggers auto-prompt
  ['pointerdown', 'keydown', 'touchstart'].forEach((evt) => {
    window.addEventListener(evt, autoPrompt, { once: true, passive: true });
  });
})();
