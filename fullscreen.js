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
        // { navigationUI: 'hide' } is a hint (Chrome) to hide browser UI
        // on mobile. Standard fullscreen otherwise.
        const p = fn.call(el, { navigationUI: 'hide' });
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

  // Real fullscreen support detection.
  function canRealFullscreen() {
    const el = document.documentElement;
    return !!(
      el.requestFullscreen ||
      el.webkitRequestFullscreen ||
      el.msRequestFullscreen
    ) && (document.fullscreenEnabled !== false);
  }

  function toggle() {
    // Currently in real fullscreen? exit it.
    if (inRealFullscreen()) {
      exitReal().catch((err) => console.warn('[Horridors] exit FS failed:', err));
      return;
    }

    // Prefer real fullscreen when it's supported. Target documentElement so
    // the browser grants fullscreen for the whole page (works more reliably
    // than targeting a transformed / nested element on mobile Chrome).
    if (canRealFullscreen()) {
      const target = document.documentElement;
      requestReal(target).then(() => {
        // Real FS succeeded — drop pseudo if it was on (avoid double-rotation)
        if (pseudoOn) exitPseudo();
      }).catch((err) => {
        console.warn('[Horridors] real fullscreen request failed, falling back to pseudo:', err);
        // If pseudo is already on (mobile portrait auto-rotate), keep it.
        if (!pseudoOn) enterPseudo();
      });
      return;
    }

    // No real FS API (e.g. iOS Safari on non-video). Toggle pseudo instead.
    if (pseudoOn) {
      exitPseudo();
    } else {
      enterPseudo();
    }
    // Hint to user that iOS Safari doesn't support true fullscreen web pages.
    if (/iphone|ipod|ipad/i.test(navigator.userAgent) && !window.navigator.standalone) {
      console.info('[Horridors] iOS Safari does not support real fullscreen for web pages. Add to Home Screen for a fullscreen app-like experience.');
    }
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

  // Touch + portrait = phone held vertically. Always enter pseudo-fullscreen
  // immediately so the game auto-rotates to landscape and fills the screen.
  // No tap required — this avoids the broken squished-portrait view.
  function isMobilePortrait() {
    const touch = document.body.classList.contains('has-touch') ||
                  ('ontouchstart' in window) ||
                  (navigator.maxTouchPoints > 0);
    const portrait = window.innerHeight > window.innerWidth;
    return touch && portrait;
  }

  function enterPseudoIfMobilePortrait() {
    if (!inRealFullscreen() && !pseudoOn && isMobilePortrait()) {
      enterPseudo();
    }
  }

  // Enter immediately on load if the phone is already in portrait.
  // Run on DOMContentLoaded (if not already) and also right now as a safety net.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enterPseudoIfMobilePortrait, { once: true });
  } else {
    enterPseudoIfMobilePortrait();
  }

  // If the user rotates their phone later, keep the game filling the screen:
  // - Rotate TO portrait → auto enter pseudo-fullscreen (rotates game)
  // - Rotate TO landscape → auto exit pseudo-fullscreen (game fits natively)
  function onOrientationChange() {
    // Give the browser a tick to update innerWidth/innerHeight
    setTimeout(() => {
      if (isMobilePortrait()) {
        if (!pseudoOn && !inRealFullscreen()) enterPseudo();
      } else {
        // Landscape on touch device — drop the rotation so the game is upright
        const touch = document.body.classList.contains('has-touch') ||
                      ('ontouchstart' in window) ||
                      (navigator.maxTouchPoints > 0);
        if (touch && pseudoOn && !inRealFullscreen()) exitPseudo();
      }
    }, 50);
  }
  window.addEventListener('orientationchange', onOrientationChange);
  window.addEventListener('resize', onOrientationChange);

  // Also auto-enter on first interaction for tiny embeds (original behavior).
  let autoPromptedFs = false;
  function autoPrompt() {
    if (autoPromptedFs) return;
    autoPromptedFs = true;
    if (!inRealFullscreen() && !pseudoOn && (isEmbeddedSmall() || isMobilePortrait())) {
      enterPseudo();
    }
  }

  // First pointerdown or keydown triggers auto-prompt
  ['pointerdown', 'keydown', 'touchstart'].forEach((evt) => {
    window.addEventListener(evt, autoPrompt, { once: true, passive: true });
  });

  // ---------- Mobile Chrome URL-bar hiding ----------
  // On Samsung/Android Chrome the URL bar stays visible because pseudo-
  // fullscreen disables scrolling (so the auto-hide never triggers). The
  // ONLY way to truly hide it is the Fullscreen API — which requires a
  // user gesture.
  //
  // Strategy: show a "Tap to Play Fullscreen" splash on first mobile visit.
  // The tap IS the user gesture, so we can call requestFullscreen() inside
  // the handler synchronously. This is standard for mobile web games.
  function needsFullscreenSplash() {
    const touch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (!touch) return false;
    if (inRealFullscreen()) return false;
    if (!canRealFullscreen()) return false;
    // Skip on iOS — Fullscreen API is blocked for web pages anyway.
    if (/iphone|ipod|ipad/i.test(navigator.userAgent) && !/crios/i.test(navigator.userAgent)) return false;
    return true;
  }

  function showFullscreenSplash() {
    if (document.getElementById('fs-splash')) return;
    const splash = document.createElement('div');
    splash.id = 'fs-splash';
    splash.setAttribute('role', 'button');
    splash.setAttribute('aria-label', 'Tap to play in fullscreen');
    splash.innerHTML = `
      <div class="fs-splash-inner">
        <div class="fs-splash-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 9V5a1 1 0 0 1 1-1h4"/>
            <path d="M20 9V5a1 1 0 0 0-1-1h-4"/>
            <path d="M4 15v4a1 1 0 0 0 1 1h4"/>
            <path d="M20 15v4a1 1 0 0 1-1 1h-4"/>
          </svg>
        </div>
        <div class="fs-splash-title">HORRIDORS</div>
        <div class="fs-splash-cta">Tap to play fullscreen</div>
        <div class="fs-splash-sub">Hides the browser bar for the best experience</div>
      </div>
    `;
    document.body.appendChild(splash);

    // One-shot handler. The tap itself is the user gesture that
    // satisfies the Fullscreen API requirement.
    function handleTap(e) {
      e.preventDefault();
      e.stopPropagation();
      splash.removeEventListener('pointerdown', handleTap);
      splash.removeEventListener('touchstart', handleTap);
      splash.removeEventListener('click', handleTap);

      // Target documentElement — most compatible on Android Chrome.
      requestReal(document.documentElement).then(() => {
        // Real fullscreen engaged. Drop pseudo if it was on to avoid
        // the double-rotation (real FS handles orientation itself).
        if (pseudoOn) exitPseudo();
        // Try to lock orientation to landscape now that we're in real FS.
        try {
          if (screen.orientation && screen.orientation.lock) {
            screen.orientation.lock('landscape').catch(() => {});
          }
        } catch (_) {}
      }).catch((err) => {
        console.warn('[Horridors] splash fullscreen failed, using pseudo:', err);
        if (!pseudoOn) enterPseudo();
      });
      splash.classList.add('fs-splash-out');
      setTimeout(() => splash.remove(), 400);
    }
    // Listen for both touch and click to be safe.
    splash.addEventListener('touchstart', handleTap, { passive: false });
    splash.addEventListener('pointerdown', handleTap);
    splash.addEventListener('click', handleTap);
  }

  // Show splash after DOM ready so it sits on top of the game.
  function maybeSplash() {
    if (needsFullscreenSplash()) showFullscreenSplash();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', maybeSplash, { once: true });
  } else {
    maybeSplash();
  }

  // If the user exits real fullscreen (swipe down, back button) and we're
  // on mobile portrait, restore pseudo-fullscreen so the game still fits.
  document.addEventListener('fullscreenchange', () => {
    if (!inRealFullscreen() && isMobilePortrait() && !pseudoOn) {
      enterPseudo();
    }
  });
})();
