// Horridors — auto-save module (browser-side persistence)
// =========================================================================
// Lifts the previous "no localStorage" rule because real players (hi Ellie!)
// were losing progress after surviving Grinpatch and tapping off the screen.
//
// Saves to localStorage under the key 'horridors:save:v1'. If localStorage
// is unavailable (private mode, ITP, etc.) we silently degrade to in-memory
// only — game still works, just doesn't persist between sessions.
//
// What we persist:
//   - levelInProgress: { 1: bool, 2: bool, ... 8: bool }   (mid-level flag)
//   - levelsCompleted: { 1: bool, ... }                    (cleared at least once)
//   - highestLevel: int (the highest level the player has reached or unlocked)
//   - coins: int
//   - grabpack: bool
//   - elements: { fire, thunder, earth, water, air }
//   - difficulty: 'easy' | 'normal' | 'hard'
//
// Public API (all on window.HorridorsSave):
//   .save()           — snapshot current game state and write to localStorage
//   .load()           — read save (returns the parsed object or null)
//   .clear()          — wipe save (used by "New Game")
//   .hasSave()        — true if a save exists with at least one level started
//   .applyToWallet()  — apply saved coins/grabpack/elements onto HorridorsWallet
//   .applyToProgress()— apply saved levelInProgress map onto window.__levelInProgress
//   .markCompleted(n) — convenience: mark level n complete + advance highestLevel
//   .flashSavedTick() — show a small "Saved ✓" toast top-right (kid-visible feedback)
//
// We keep the contract small and explicit so each level's existing code can
// just call HorridorsSave.save() at meaningful checkpoints without knowing
// the schema.
// =========================================================================

(function () {
  'use strict';

  const KEY = 'horridors:save:v1';
  const VERSION = 1;
  let memCache = null; // fallback when localStorage isn't available
  let saveAvailable = true;

  // ---- localStorage helpers (defensive) ---------------------------------
  function _read() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || obj.v !== VERSION) return null;
      return obj;
    } catch (e) {
      saveAvailable = false;
      return memCache;
    }
  }

  function _write(obj) {
    try {
      localStorage.setItem(KEY, JSON.stringify(obj));
      memCache = obj;
    } catch (e) {
      saveAvailable = false;
      memCache = obj;
    }
  }

  function _clear() {
    try { localStorage.removeItem(KEY); } catch (e) {}
    memCache = null;
  }

  // ---- Snapshot the current live state ----------------------------------
  function _currentSnapshot() {
    const W = window.HorridorsWallet;
    const D = window.__difficulty;
    const inProg = window.__levelInProgress || {};
    const completed = window.__levelsCompleted || {};

    // Highest level: max of (any in-progress, any completed+1, current default 1)
    let highest = 1;
    for (let n = 1; n <= 8; n++) {
      if (completed[n]) highest = Math.max(highest, n + 1);
      if (inProg[n])    highest = Math.max(highest, n);
    }
    if (highest > 8) highest = 8;

    const elements = {};
    if (W && W.hasElement) {
      ['fire','thunder','earth','water','air'].forEach(id => { elements[id] = !!W.hasElement(id); });
    }

    return {
      v: VERSION,
      ts: Date.now(),
      levelInProgress: { ...inProg },
      levelsCompleted: { ...completed },
      highestLevel: highest,
      coins: (W && W.getCoins) ? W.getCoins() : 0,
      grabpack: (W && W.hasGrabpack) ? !!W.hasGrabpack() : false,
      elements,
      difficulty: (D && D.id) ? D.id() : 'easy',
    };
  }

  // ---- Public API --------------------------------------------------------
  function save() {
    try {
      const snap = _currentSnapshot();
      _write(snap);
      flashSavedTick();
      return snap;
    } catch (e) {
      return null;
    }
  }

  function load() {
    return _read();
  }

  function clear() {
    _clear();
  }

  function hasSave() {
    const s = _read();
    if (!s) return false;
    // A save is "real" if any level was started or completed
    const ip = s.levelInProgress || {};
    const lc = s.levelsCompleted || {};
    for (let n = 1; n <= 8; n++) {
      if (ip[n] || lc[n]) return true;
    }
    return false;
  }

  function applyToWallet(snap) {
    snap = snap || _read();
    if (!snap) return;
    const W = window.HorridorsWallet;
    if (!W) return;
    // Coins: we add the difference (wallet starts at 0 on page load)
    if (typeof snap.coins === 'number' && snap.coins > 0 && W.addCoins) {
      const cur = W.getCoins ? W.getCoins() : 0;
      const delta = snap.coins - cur;
      if (delta > 0) W.addCoins(delta);
    }
    if (snap.grabpack && W.giveGrabpack) W.giveGrabpack();
    if (snap.elements && W.giveElement) {
      for (const id of ['fire','thunder','earth','water','air']) {
        if (snap.elements[id]) W.giveElement(id);
      }
    }
  }

  function applyToProgress(snap) {
    snap = snap || _read();
    if (!snap) return;
    window.__levelInProgress = window.__levelInProgress || {};
    window.__levelsCompleted = window.__levelsCompleted || {};
    if (snap.levelInProgress) {
      for (const k in snap.levelInProgress) window.__levelInProgress[k] = !!snap.levelInProgress[k];
    }
    if (snap.levelsCompleted) {
      for (const k in snap.levelsCompleted) window.__levelsCompleted[k] = !!snap.levelsCompleted[k];
    }
  }

  function markCompleted(n) {
    window.__levelsCompleted = window.__levelsCompleted || {};
    window.__levelsCompleted[n] = true;
    if (window.__levelInProgress) window.__levelInProgress[n] = false;
    save();
  }

  // ---- "Saved ✓" toast ---------------------------------------------------
  // Tiny pill top-right of the screen that fades after 1.6s. Kid-visible so
  // they know progress is being kept. Doesn't block input.
  let _toastEl = null;
  let _toastTimer = null;
  function flashSavedTick() {
    if (!_toastEl) {
      _toastEl = document.createElement('div');
      _toastEl.id = 'save-toast';
      _toastEl.style.cssText = [
        'position:fixed',
        'top:12px',
        'right:12px',
        'z-index:10000',
        'padding:6px 12px',
        'background:rgba(20,28,18,0.85)',
        'border:1px solid rgba(126,226,168,0.5)',
        'color:#bff5cf',
        'font:600 12px/1.2 system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
        'border-radius:14px',
        'pointer-events:none',
        'opacity:0',
        'transform:translateY(-4px)',
        'transition:opacity 220ms ease-out,transform 220ms ease-out',
        'box-shadow:0 4px 12px rgba(0,0,0,0.4)',
      ].join(';');
      _toastEl.textContent = '✓ Game saved';
      document.body.appendChild(_toastEl);
    }
    // Show
    _toastEl.style.opacity = '1';
    _toastEl.style.transform = 'translateY(0)';
    if (_toastTimer) clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => {
      if (_toastEl) {
        _toastEl.style.opacity = '0';
        _toastEl.style.transform = 'translateY(-4px)';
      }
    }, 1600);
  }

  window.HorridorsSave = {
    save,
    load,
    clear,
    hasSave,
    applyToWallet,
    applyToProgress,
    markCompleted,
    flashSavedTick,
    isAvailable: () => saveAvailable,
  };

  // ---- Auto-load on page boot -------------------------------------------
  // Wait for DOMContentLoaded so HorridorsWallet etc. exist.
  function _bootApply() {
    const snap = _read();
    if (!snap) return;
    try { applyToProgress(snap); } catch (e) {}
    try { applyToWallet(snap); } catch (e) {}
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _bootApply);
  } else {
    // Defer one tick so other modules' DOMContentLoaded handlers run first
    setTimeout(_bootApply, 0);
  }

  // ---- Auto-save on tab close / hide ------------------------------------
  // pagehide is the most reliable across browsers (incl. iOS Safari).
  window.addEventListener('pagehide', () => { try { save(); } catch (e) {} });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      try { save(); } catch (e) {}
    }
  });
})();
