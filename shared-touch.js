// Horridors — Shared Touch Controls (v4: low-latency touch path)
// Left side: analog thumbstick -> arrow key keydown/keyup events (8-direction).
// Right side: big A (Action/E), B (Space), and a smaller X (Escape).
//
// v4 changes for mobile responsiveness:
//  - Native touch events preferred on touch devices (lower latency on iOS
//    than PointerEvents, which sometimes drop moves when parent is rotated).
//  - Multi-touch: each control tracks its own touch identifier so pressing
//    B with the right thumb does not interrupt thumbstick with the left.
//  - Buttons no longer release on pointerleave / touchleave — only on
//    real lift (touchend / touchcancel) so a sliding thumb keeps jumping.
//  - No CSS transition on the knob — every finger sample shows instantly.
//
// Exposed as window.HorridorsTouch.
(function () {
  if (window.HorridorsTouch) return;

  // Detect touch: must have touch event support OR coarse pointer.
  const isTouch = (
    ('ontouchstart' in window) ||
    (navigator.maxTouchPoints > 0) ||
    (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
  );

  const heldKeys = new Set();

  function fire(type, key) {
    const code = keyCodeFor(key);
    const ev = new KeyboardEvent(type, {
      key, code, bubbles: true, cancelable: true,
    });
    window.dispatchEvent(ev);
  }
  function keyCodeFor(k) {
    switch (k) {
      case 'ArrowUp': return 'ArrowUp';
      case 'ArrowDown': return 'ArrowDown';
      case 'ArrowLeft': return 'ArrowLeft';
      case 'ArrowRight': return 'ArrowRight';
      case 'e': case 'E': return 'KeyE';
      case ' ': return 'Space';
      case 'Escape': return 'Escape';
      case 'Enter': return 'Enter';
      default: return 'Key' + k.toUpperCase();
    }
  }

  function pressKey(key) {
    if (heldKeys.has(key)) return;
    heldKeys.add(key);
    fire('keydown', key);
  }
  function releaseKey(key) {
    if (!heldKeys.has(key)) return;
    heldKeys.delete(key);
    fire('keyup', key);
  }
  function tapKey(key) {
    fire('keydown', key);
    setTimeout(() => fire('keyup', key), 50);
  }
  function releaseAll() {
    for (const k of Array.from(heldKeys)) releaseKey(k);
  }

  // Find the Touch in a TouchList by identifier (returns null if not in list).
  function findTouch(list, id) {
    for (let i = 0; i < list.length; i++) {
      if (list[i].identifier === id) return list[i];
    }
    return null;
  }

  // ---------- Analog Thumbstick ----------
  // Translates a 2D stick offset into held arrow keys. 8-direction dead zone.
  function buildThumbstick() {
    const wrap = document.createElement('div');
    wrap.className = 'touch-stick';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', 'Movement thumbstick');
    wrap.innerHTML = `
      <div class="stick-base" aria-hidden="true">
        <div class="stick-ring"></div>
        <div class="stick-cross">
          <span class="ind up">▲</span>
          <span class="ind right">▶</span>
          <span class="ind down">▼</span>
          <span class="ind left">◀</span>
        </div>
        <div class="stick-knob"></div>
      </div>
    `;
    const base = wrap.querySelector('.stick-base');
    const knob = wrap.querySelector('.stick-knob');
    const indUp = wrap.querySelector('.ind.up');
    const indDown = wrap.querySelector('.ind.down');
    const indLeft = wrap.querySelector('.ind.left');
    const indRight = wrap.querySelector('.ind.right');

    let activeId = null; // pointerId (for Pointer events) or touch.identifier
    let usingTouchEvents = false;
    let baseRect = null;
    let maxRadius = 0;
    let currentDirs = { up: false, down: false, left: false, right: false };

    function applyDirs(dirs) {
      const map = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
      for (const name of Object.keys(map)) {
        const key = map[name];
        if (dirs[name] && !currentDirs[name]) pressKey(key);
        if (!dirs[name] && currentDirs[name]) releaseKey(key);
      }
      currentDirs = dirs;
      indUp.classList.toggle('on', dirs.up);
      indDown.classList.toggle('on', dirs.down);
      indLeft.classList.toggle('on', dirs.left);
      indRight.classList.toggle('on', dirs.right);
    }

    function resetKnob() {
      knob.style.transform = 'translate(-50%, -50%)';
      applyDirs({ up: false, down: false, left: false, right: false });
      base.classList.remove('engaged');
    }

    function updateKnob(clientX, clientY) {
      if (!baseRect) return;
      const cx = baseRect.left + baseRect.width / 2;
      const cy = baseRect.top + baseRect.height / 2;
      let dx = clientX - cx;
      let dy = clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > maxRadius) {
        dx = (dx / dist) * maxRadius;
        dy = (dy / dist) * maxRadius;
      }
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;

      // Small dead zone so tiny jitter doesn't fire keys
      const dead = maxRadius * 0.22;
      if (dist < dead) {
        applyDirs({ up: false, down: false, left: false, right: false });
        return;
      }
      const ang = Math.atan2(dy, dx);
      let deg = (ang * 180 / Math.PI + 90 + 360) % 360;
      const dirs = { up: false, down: false, left: false, right: false };
      if (deg >= 337.5 || deg < 22.5) dirs.up = true;
      else if (deg < 67.5) { dirs.up = true; dirs.right = true; }
      else if (deg < 112.5) dirs.right = true;
      else if (deg < 157.5) { dirs.down = true; dirs.right = true; }
      else if (deg < 202.5) dirs.down = true;
      else if (deg < 247.5) { dirs.down = true; dirs.left = true; }
      else if (deg < 292.5) dirs.left = true;
      else { dirs.up = true; dirs.left = true; }

      applyDirs(dirs);
    }

    function startAt(clientX, clientY) {
      baseRect = base.getBoundingClientRect();
      maxRadius = baseRect.width * 0.38;
      base.classList.add('engaged');
      updateKnob(clientX, clientY);
    }
    function end() {
      activeId = null;
      baseRect = null;
      resetKnob();
    }

    // ---- Native Touch Events (preferred when available) ----
    if ('ontouchstart' in window) {
      usingTouchEvents = true;

      base.addEventListener('touchstart', (e) => {
        if (activeId !== null) return;
        const t = e.changedTouches[0];
        if (!t) return;
        e.preventDefault();
        activeId = t.identifier;
        startAt(t.clientX, t.clientY);
      }, { passive: false });

      // Listen on window for move/end so the touch can slide outside the
      // base without losing tracking.
      window.addEventListener('touchmove', (e) => {
        if (activeId === null) return;
        const t = findTouch(e.changedTouches, activeId);
        if (!t) return;
        e.preventDefault();
        updateKnob(t.clientX, t.clientY);
      }, { passive: false });

      function onEnd(e) {
        if (activeId === null) return;
        const t = findTouch(e.changedTouches, activeId);
        if (!t) return;
        end();
      }
      window.addEventListener('touchend', onEnd);
      window.addEventListener('touchcancel', onEnd);
    }

    // ---- Pointer Events fallback (desktop / stylus / non-touch) ----
    base.addEventListener('pointerdown', (e) => {
      if (usingTouchEvents) return; // touch path already handled it
      if (activeId !== null) return;
      e.preventDefault();
      activeId = e.pointerId;
      try { base.setPointerCapture && base.setPointerCapture(e.pointerId); } catch (_) {}
      startAt(e.clientX, e.clientY);
    });
    base.addEventListener('pointermove', (e) => {
      if (usingTouchEvents) return;
      if (e.pointerId !== activeId) return;
      e.preventDefault();
      updateKnob(e.clientX, e.clientY);
    });
    function pEnd(e) {
      if (usingTouchEvents) return;
      if (e && e.pointerId !== activeId) return;
      end();
    }
    base.addEventListener('pointerup', pEnd);
    base.addEventListener('pointercancel', pEnd);
    base.addEventListener('lostpointercapture', pEnd);

    return wrap;
  }

  function makeActionButton(label, key, opts) {
    const b = document.createElement('button');
    b.className = 'touch-btn action ' + (opts.cls || '');
    b.setAttribute('data-k', key);
    b.setAttribute('aria-label', opts.aria || label);
    b.setAttribute('type', 'button');
    b.style.touchAction = 'none';
    b.innerHTML = `
      <span class="btn-glyph">${opts.glyph || label}</span>
      <span class="btn-sub">${opts.sub || ''}</span>
    `;
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    return b;
  }

  // Attach press-and-hold behaviour to an action button using the best
  // available event path. For multi-touch safety, each button tracks its
  // own activeTouchId independently.
  function wireHold(btn, key) {
    let activeTouchId = null;
    let activePointerId = null;

    function press() { btn.classList.add('active'); pressKey(key); }
    function release() { btn.classList.remove('active'); releaseKey(key); }

    if ('ontouchstart' in window) {
      btn.addEventListener('touchstart', (e) => {
        if (activeTouchId !== null) return;
        const t = e.changedTouches[0];
        if (!t) return;
        e.preventDefault();
        activeTouchId = t.identifier;
        press();
      }, { passive: false });

      function onEnd(e) {
        if (activeTouchId === null) return;
        const t = findTouch(e.changedTouches, activeTouchId);
        if (!t) return;
        activeTouchId = null;
        release();
      }
      // Listen on window so finger can slide off the button and we still
      // get the up event.
      window.addEventListener('touchend', onEnd);
      window.addEventListener('touchcancel', onEnd);
      return;
    }

    // Pointer-events fallback
    btn.addEventListener('pointerdown', (e) => {
      if (activePointerId !== null) return;
      e.preventDefault();
      activePointerId = e.pointerId;
      try { btn.setPointerCapture && btn.setPointerCapture(e.pointerId); } catch (_) {}
      press();
    });
    function pEnd(e) {
      if (e && e.pointerId !== activePointerId) return;
      activePointerId = null;
      release();
    }
    btn.addEventListener('pointerup', pEnd);
    btn.addEventListener('pointercancel', pEnd);
    btn.addEventListener('lostpointercapture', pEnd);
    // Intentionally NOT pointerleave — captured pointer stays bound until lift.
  }

  // Attach tap behaviour (fires once on press, no hold).
  function wireTap(btn, fn) {
    let firedFor = null; // touch.identifier or pointerId
    function doTap() {
      btn.classList.add('active');
      fn();
      setTimeout(() => btn.classList.remove('active'), 120);
    }

    if ('ontouchstart' in window) {
      btn.addEventListener('touchstart', (e) => {
        if (firedFor !== null) return;
        const t = e.changedTouches[0];
        if (!t) return;
        e.preventDefault();
        firedFor = t.identifier;
        doTap();
      }, { passive: false });
      function onEnd(e) {
        if (firedFor === null) return;
        const t = findTouch(e.changedTouches, firedFor);
        if (!t) return;
        firedFor = null;
      }
      window.addEventListener('touchend', onEnd);
      window.addEventListener('touchcancel', onEnd);
      return;
    }

    btn.addEventListener('pointerdown', (e) => {
      if (firedFor !== null) return;
      e.preventDefault();
      firedFor = e.pointerId;
      doTap();
    });
    function pEnd(e) {
      if (e && e.pointerId !== firedFor) return;
      firedFor = null;
    }
    btn.addEventListener('pointerup', pEnd);
    btn.addEventListener('pointercancel', pEnd);
  }

  function buildUI() {
    const root = document.createElement('div');
    root.id = 'touch-controls';

    const stick = buildThumbstick();
    root.appendChild(stick);

    const actions = document.createElement('div');
    actions.className = 'touch-actions';
    actions.setAttribute('role', 'group');
    actions.setAttribute('aria-label', 'Actions');

    const btnA = makeActionButton('A', 'e',     { cls: 'a',   glyph: 'A', sub: 'Use', aria: 'Action' });
    const btnB = makeActionButton('B', ' ',     { cls: 'b',   glyph: 'B', sub: 'Jump', aria: 'Jump' });

    actions.appendChild(btnB);
    actions.appendChild(btnA);
    root.appendChild(actions);

    document.body.appendChild(root);

    wireHold(btnA, 'e');
    wireHold(btnB, ' ');

    // Hold-to-exit menu button — placed top-left away from action cluster.
    // Must be held for 800ms to trigger, preventing accidental taps.
    const menuBtn = document.createElement('button');
    menuBtn.id = 'touch-menu-btn';
    menuBtn.type = 'button';
    menuBtn.setAttribute('aria-label', 'Hold to return to level select');
    menuBtn.innerHTML = '<span class="menu-glyph">✕</span><span class="menu-ring"></span><span class="menu-label">Hold to exit</span>';
    menuBtn.style.touchAction = 'none';
    document.body.appendChild(menuBtn);
    wireHoldToExit(menuBtn);

    // Safety: release everything when window loses focus
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) releaseAll();
    });

    return root;
  }

  // ---- Hold-to-exit helper ----
  function wireHoldToExit(btn) {
    const HOLD_MS = 800;
    let holdTimer = null;
    let holdStart = 0;
    let rafId = null;
    const ring = btn.querySelector('.menu-ring');
    function updateRing() {
      if (holdStart === 0) { if (ring) ring.style.setProperty('--p', '0'); return; }
      const elapsed = performance.now() - holdStart;
      const p = Math.min(1, elapsed / HOLD_MS);
      if (ring) ring.style.setProperty('--p', p.toFixed(3));
      if (p < 1) rafId = requestAnimationFrame(updateRing);
    }
    function startHold(ev) {
      if (ev && ev.preventDefault) ev.preventDefault();
      // If we're already on the title/level-select, a hold is pointless — bail.
      const title = document.getElementById('overlay-title');
      if (title && !title.classList.contains('hidden')) return;
      btn.classList.add('holding');
      holdStart = performance.now();
      rafId = requestAnimationFrame(updateRing);
      holdTimer = setTimeout(() => {
        btn.classList.remove('holding');
        btn.classList.add('triggered');
        setTimeout(() => btn.classList.remove('triggered'), 400);
        holdStart = 0;
        if (ring) ring.style.setProperty('--p', '0');
        if (typeof window.__returnToTitle === 'function') {
          window.__returnToTitle();
        } else {
          tapKey('Escape');
        }
      }, HOLD_MS);
    }
    function cancelHold() {
      btn.classList.remove('holding');
      if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      holdStart = 0;
      if (ring) ring.style.setProperty('--p', '0');
    }
    btn.addEventListener('pointerdown', startHold);
    btn.addEventListener('pointerup', cancelHold);
    btn.addEventListener('pointercancel', cancelHold);
    btn.addEventListener('pointerleave', cancelHold);
    // touch fallback
    btn.addEventListener('touchstart', startHold, { passive: false });
    btn.addEventListener('touchend', cancelHold);
    btn.addEventListener('touchcancel', cancelHold);
  }

  function enable()  { document.body.classList.add('has-touch'); }
  function disable() { document.body.classList.remove('has-touch'); }

  // ---- Idle-fade: dim the pad after inactivity so it stops covering gameplay.
  //      Any touch/pointer/key interaction snaps it back to full opacity.
  const IDLE_MS = 5000;
  let idleTimer = null;
  function setIdle(on) {
    const root = document.getElementById('touch-controls');
    if (!root) return;
    if (on) {
      root.classList.add('idle');
      document.body.classList.add('touch-idle');
    } else {
      root.classList.remove('idle');
      document.body.classList.remove('touch-idle');
    }
  }
  function kickIdle() {
    setIdle(false);
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => setIdle(true), IDLE_MS);
  }
  function wireIdleFade() {
    if (!isTouch) return;
    // Any interaction with the pad keeps it visible; any other gameplay
    // tap on the canvas also wakes it in case user is mid-game.
    ['pointerdown', 'pointermove', 'touchstart', 'touchmove', 'keydown'].forEach((ev) => {
      window.addEventListener(ev, kickIdle, { passive: true, capture: true });
    });
    kickIdle(); // start the timer once UI is mounted
  }

  function boot() {
    if (isTouch) {
      buildUI();
      enable();
      wireIdleFade();
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Translate keyboard-centric prompt text to touch-button labels.
  function keyLabel(text) {
    if (!isTouch || typeof text !== 'string') return text;
    return text
      .replace(/\bPress E\b/g, 'Tap A')
      .replace(/\bpress E\b/g, 'tap A')
      .replace(/\bPRESS E\b/g, 'TAP A')
      .replace(/\[E\]/g, '[A]')
      .replace(/\bE key\b/gi, 'A button')
      .replace(/\bPress SPACE\b/gi, 'Tap B')
      .replace(/\bpress space\b/gi, 'tap B')
      .replace(/\[SPACE\]/gi, '[B]')
      .replace(/\bPress Esc(ape)?\b/gi, 'Tap X')
      .replace(/\bpress esc(ape)?\b/gi, 'tap X')
      .replace(/\[ESC\]/gi, '[X]');
  }

  window.HorridorsTouch = {
    isTouch: () => isTouch,
    pressKey, releaseKey, tapKey, releaseAll,
    enable, disable,
    keyLabel,
  };
})();
