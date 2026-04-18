// Horridors — Shared Touch Controls (v3: analog thumbstick)
// Left side: analog thumbstick -> arrow key keydown/keyup events (8-direction).
// Right side: big A (Action/E), B (Space), and a smaller X (Escape).
// All inputs synthesise real KeyboardEvents so the game's keyboard handlers
// work with zero changes.
//
// Exposed as window.HorridorsTouch.
(function () {
  if (window.HorridorsTouch) return;

  // Detect touch: must have touch event support AND coarse pointer.
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

    let activePointerId = null;
    let baseRect = null;
    let maxRadius = 0;
    let currentDirs = { up: false, down: false, left: false, right: false };

    function applyDirs(dirs) {
      // Held-key diffs between prev and next
      const map = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
      for (const name of Object.keys(map)) {
        const key = map[name];
        if (dirs[name] && !currentDirs[name]) pressKey(key);
        if (!dirs[name] && currentDirs[name]) releaseKey(key);
      }
      currentDirs = dirs;
      // Visual indicators
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

      // Dead zone ~25% of radius
      const dead = maxRadius * 0.28;
      if (dist < dead) {
        applyDirs({ up: false, down: false, left: false, right: false });
        return;
      }
      // Angle -> 8-dir
      const ang = Math.atan2(dy, dx); // -PI..PI, 0 = right, PI/2 = down
      // Convert to 0..360 degrees with 0 = up for easier bucketing
      let deg = (ang * 180 / Math.PI + 90 + 360) % 360; // 0 = up, 90 = right
      const dirs = { up: false, down: false, left: false, right: false };
      // 8 sectors of 45deg each, centered on cardinals and diagonals.
      // Up: 337.5-22.5, UpRight: 22.5-67.5, Right: 67.5-112.5, etc.
      if (deg >= 337.5 || deg < 22.5) dirs.up = true;
      else if (deg < 67.5) { dirs.up = true; dirs.right = true; }
      else if (deg < 112.5) dirs.right = true;
      else if (deg < 157.5) { dirs.down = true; dirs.right = true; }
      else if (deg < 202.5) dirs.down = true;
      else if (deg < 247.5) { dirs.down = true; dirs.left = true; }
      else if (deg < 292.5) dirs.left = true;
      else dirs.up = true, dirs.left = true;

      applyDirs(dirs);
    }

    base.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (activePointerId !== null) return;
      activePointerId = e.pointerId;
      base.setPointerCapture && base.setPointerCapture(e.pointerId);
      baseRect = base.getBoundingClientRect();
      maxRadius = baseRect.width * 0.38;
      base.classList.add('engaged');
      updateKnob(e.clientX, e.clientY);
    });
    base.addEventListener('pointermove', (e) => {
      if (e.pointerId !== activePointerId) return;
      e.preventDefault();
      updateKnob(e.clientX, e.clientY);
    });
    function end(e) {
      if (e && e.pointerId !== activePointerId) return;
      activePointerId = null;
      baseRect = null;
      resetKnob();
    }
    base.addEventListener('pointerup', end);
    base.addEventListener('pointercancel', end);
    base.addEventListener('lostpointercapture', end);
    base.addEventListener('pointerleave', (e) => {
      // Keep holding if capture is active; only release on actual lift.
      // pointerleave fires when finger goes out of element bounds; since we
      // captured the pointer, the up event still arrives. No-op here.
    });

    return wrap;
  }

  function makeActionButton(label, key, opts) {
    const b = document.createElement('button');
    b.className = 'touch-btn action ' + (opts.cls || '');
    b.setAttribute('data-k', key);
    b.setAttribute('aria-label', opts.aria || label);
    b.style.touchAction = 'none';
    b.innerHTML = `
      <span class="btn-glyph">${opts.glyph || label}</span>
      <span class="btn-sub">${opts.sub || ''}</span>
    `;
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    return b;
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
    const btnX = makeActionButton('X', 'Escape',{ cls: 'x',   glyph: '✕', sub: 'Menu', aria: 'Menu / Close' });

    actions.appendChild(btnB);
    actions.appendChild(btnA);
    actions.appendChild(btnX);
    root.appendChild(actions);

    document.body.appendChild(root);

    // Held behaviour for A and B (E and Space)
    [btnA, btnB].forEach(btn => {
      const k = btn.getAttribute('data-k');
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        btn.setPointerCapture && btn.setPointerCapture(e.pointerId);
        btn.classList.add('active');
        pressKey(k);
      });
      const stop = () => { btn.classList.remove('active'); releaseKey(k); };
      btn.addEventListener('pointerup', stop);
      btn.addEventListener('pointercancel', stop);
      btn.addEventListener('lostpointercapture', stop);
      btn.addEventListener('pointerleave', stop);
    });

    // Tap-only: X (Escape + also fires 'e' for overlay close consistency)
    btnX.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      btnX.classList.add('active');
      tapKey('Escape');
      setTimeout(() => tapKey('e'), 20);
      setTimeout(() => btnX.classList.remove('active'), 120);
    });

    // Safety: release everything when window loses focus
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) releaseAll();
    });

    return root;
  }

  function enable()  { document.body.classList.add('has-touch'); }
  function disable() { document.body.classList.remove('has-touch'); }

  function boot() {
    if (isTouch) {
      buildUI();
      enable();
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Translate keyboard-centric prompt text to touch-button labels.
  // e.g. "Press E near the cage" -> "Tap A near the cage"
  //      "[E] Open" -> "[A] Open"
  //      "Press SPACE to jump" -> "Tap B to jump"
  //      "Press Esc" -> "Tap X"
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
