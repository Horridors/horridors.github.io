// Horridors — shared wallet (coins + powerups + elemental hand)
// In-memory only. NO localStorage (sandbox blocked).
// Exposed as window.HorridorsWallet.

(function(){
  let coins = 0;
  const powerups = Object.create(null);  // { extraHp: true, fasterCharge: true, shield: true }

  // --- Elemental Hand (Grabpack) -------------------------------------------
  // Grabpack + 5 crystal elements live on the wallet so they persist across
  // levels. Pickup sites: Grabpack (L2 tool locker), Thunder (L2 Socky Shok),
  // Fire (L4 boiler), Earth (L5 prison), Water (L2 aquarium), Air (L7 vents).
  let hasGrabpack = false;
  const elements = { fire: false, thunder: false, earth: false, water: false, air: false };
  const ELEMENT_META = {
    fire:    { icon: '🔥', color: '#ff8a3a', key: '1', name: 'Fire' },
    thunder: { icon: '⚡', color: '#fff06a', key: '2', name: 'Thunder' },
    earth:   { icon: '🌱', color: '#7ac266', key: '3', name: 'Earth' },
    water:   { icon: '💧', color: '#6ac8ff', key: '4', name: 'Water' },
    air:     { icon: '💨', color: '#cfe6ff', key: '5', name: 'Air' },
  };

  // --- Per-level run snapshot ---------------------------------------------
  // Coins earned in a level only "stick" once the level is completed. If the
  // player dies and retries, their coins (and any purchased powerups) are
  // rolled back to the state they had when the level started.
  //
  // Flow:
  //   beginLevelRun(n)    — called on fresh entry to level n (title → play,
  //                         level-jump, or after a prior completion). Takes a
  //                         snapshot only if we aren't already tracking a run
  //                         for this level.
  //   restoreLevelRun()   — called on death/retry. Rolls coins + powerups
  //                         back to the snapshot.
  //   commitLevelRun()    — called on level complete. Clears the snapshot so
  //                         earned coins are locked in.
  //
  // The snapshot also records which level the run belongs to so stray calls
  // from a different level don't corrupt the rollback.
  let runSnapshot = null; // { level: n, coins, powerups: {...} } or null

  function snapshotPowerups() {
    const out = Object.create(null);
    for (const k in powerups) out[k] = true;
    return out;
  }

  function updateHUD() {
    const el = document.querySelector('#hud-coins .hud-label');
    if (el) el.textContent = 'Coins ' + coins;
  }

  // Little floating "+N" feedback near hud-coins
  function flashGain(n) {
    const host = document.getElementById('hud-coins');
    if (!host) return;
    const pop = document.createElement('div');
    pop.textContent = '+' + n;
    pop.style.cssText = 'position:absolute;color:#ffd84a;font:700 14px system-ui;pointer-events:none;text-shadow:0 1px 2px #000;transition:transform 700ms ease-out,opacity 700ms ease-out;opacity:1;';
    const r = host.getBoundingClientRect();
    const parent = host.offsetParent || document.body;
    pop.style.left = (host.offsetLeft + host.offsetWidth + 4) + 'px';
    pop.style.top = host.offsetTop + 'px';
    host.parentElement.appendChild(pop);
    requestAnimationFrame(()=>{
      pop.style.transform = 'translateY(-16px)';
      pop.style.opacity = '0';
    });
    setTimeout(()=>pop.remove(), 720);
  }

  window.HorridorsWallet = {
    getCoins: () => coins,
    addCoins: (n) => {
      if (!n) return;
      coins += n;
      updateHUD();
      if (n > 0) flashGain(n);
    },
    spend: (n) => {
      if (coins < n) return false;
      coins -= n;
      updateHUD();
      return true;
    },
    hasPowerup: (id) => !!powerups[id],
    buyPowerup: (id, cost) => {
      if (powerups[id]) return false;
      if (coins < cost) return false;
      coins -= cost;
      powerups[id] = true;
      updateHUD();
      return true;
    },
    // For dev / jumps
    reset: () => {
      coins = 0;
      for (const k in powerups) delete powerups[k];
      hasGrabpack = false;
      for (const k of Object.keys(elements)) elements[k] = false;
      runSnapshot = null;
      updateHUD();
      updateElementHUD();
    },

    // --- Per-level run snapshot API --------------------------------------
    beginLevelRun: (level) => {
      // Only snapshot if we aren't already tracking a run for this same
      // level. This keeps the snapshot stable across intra-level retries
      // (each retry restores to the SAME baseline, not the post-retry state).
      if (runSnapshot && runSnapshot.level === level) return;
      runSnapshot = {
        level: level,
        coins: coins,
        powerups: snapshotPowerups(),
      };
    },
    restoreLevelRun: () => {
      if (!runSnapshot) return false;
      coins = runSnapshot.coins;
      // Reset powerups to the snapshotted set (removes anything bought this run).
      for (const k in powerups) delete powerups[k];
      for (const k in runSnapshot.powerups) powerups[k] = true;
      updateHUD();
      return true;
    },
    commitLevelRun: () => {
      // Level completed — bake in whatever coins + powerups the player has
      // right now by discarding the snapshot.
      runSnapshot = null;
    },
    hasActiveRun: () => !!runSnapshot,
    activeRunLevel: () => (runSnapshot ? runSnapshot.level : 0),

    // --- Elemental Hand API ---------------------------------------------
    hasGrabpack: () => hasGrabpack,
    giveGrabpack: () => { hasGrabpack = true; updateElementHUD(); },
    hasElement: (id) => !!elements[id],
    unlockElement: (id) => {
      if (!ELEMENT_META[id]) return false;
      if (elements[id]) return false;
      elements[id] = true;
      // Grabpack is a prerequisite for any element — grant it implicitly so
      // earning e.g. Earth first still renders properly.
      hasGrabpack = true;
      updateElementHUD();
      flashElementGain(id);
      return true;
    },
    elementCount: () => Object.values(elements).filter(Boolean).length,
    elementTotal: () => Object.keys(ELEMENT_META).length,
    elementsSnapshot: () => ({ ...elements }),
    elementMeta: (id) => ELEMENT_META[id],
    ELEMENT_META: ELEMENT_META,
  };

  // --- Elemental Hand HUD -------------------------------------------------
  // Persistent pill shown just beneath the coin pill, visible once Grabpack
  // is obtained. Each slot shows the emoji in color if unlocked, dim if not.
  function ensureElementHUD() {
    if (document.getElementById('hud-elements')) return document.getElementById('hud-elements');
    const host = document.getElementById('game-frame') || document.body;
    const el = document.createElement('div');
    el.id = 'hud-elements';
    el.setAttribute('aria-label', 'Elemental Hand');
    el.style.cssText = [
      'position:fixed',
      'top:44px',     // sits right under #hud-coins (which is top:10px)
      'left:10px',
      'z-index:1000',
      'display:none',  // shown by updateElementHUD() once hasGrabpack
      'align-items:center',
      'gap:4px',
      'background:rgba(0,0,0,0.55)',
      'color:#e8e8ec',
      'padding:4px 8px',
      'border-radius:999px',
      'border:1px solid rgba(255,255,255,0.18)',
      'font:700 12px system-ui,sans-serif',
      'text-shadow:0 1px 2px rgba(0,0,0,0.6)',
    ].join(';') + ';';
    // Title chip
    const lbl = document.createElement('span');
    lbl.textContent = '✋';
    lbl.style.cssText = 'font-size:13px;margin-right:2px;opacity:0.9;';
    el.appendChild(lbl);
    // One pip per element in canonical order
    for (const id of ['fire','thunder','earth','water','air']) {
      const meta = ELEMENT_META[id];
      const pip = document.createElement('span');
      pip.dataset.elem = id;
      pip.title = meta.name;
      pip.textContent = meta.icon;
      pip.style.cssText = 'display:inline-block;min-width:16px;text-align:center;font-size:13px;filter:grayscale(1);opacity:0.38;transition:filter 200ms,opacity 200ms,text-shadow 200ms;';
      el.appendChild(pip);
    }
    host.appendChild(el);
    return el;
  }

  function updateElementHUD() {
    const el = ensureElementHUD();
    if (!el) return;
    el.style.display = hasGrabpack ? 'inline-flex' : 'none';
    el.querySelectorAll('span[data-elem]').forEach(pip => {
      const id = pip.dataset.elem;
      const meta = ELEMENT_META[id];
      if (elements[id]) {
        pip.style.filter = 'none';
        pip.style.opacity = '1';
        pip.style.textShadow = '0 0 6px ' + meta.color;
      } else {
        pip.style.filter = 'grayscale(1)';
        pip.style.opacity = '0.38';
        pip.style.textShadow = 'none';
      }
    });
  }

  // Brief celebration when an element is unlocked.
  function flashElementGain(id) {
    const meta = ELEMENT_META[id];
    if (!meta) return;
    ensureElementHUD();
    const pip = document.querySelector('#hud-elements span[data-elem="' + id + '"]');
    if (!pip) return;
    // Pop animation
    const original = pip.style.transform || '';
    pip.style.transition = 'transform 250ms cubic-bezier(0.2,0.9,0.3,1.4), text-shadow 250ms';
    pip.style.transform = 'scale(1.9)';
    setTimeout(() => { pip.style.transform = original || 'scale(1)'; }, 260);

    // Toast
    const toast = document.createElement('div');
    toast.textContent = meta.icon + ' ' + meta.name + ' crystal found';
    toast.style.cssText = 'position:fixed;top:80px;left:50%;transform:translateX(-50%) translateY(-10px);background:#1a1024;border:2px solid ' + meta.color + ';color:#fff;padding:10px 18px;border-radius:999px;font:700 14px system-ui;z-index:2000;box-shadow:0 8px 24px rgba(0,0,0,0.5);opacity:0;transition:opacity 300ms,transform 300ms;pointer-events:none;';
    document.body.appendChild(toast);
    requestAnimationFrame(() => { toast.style.opacity = '1'; toast.style.transform = 'translateX(-50%) translateY(0)'; });
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(-10px)';
      setTimeout(() => toast.remove(), 320);
    }, 2600);
  }

  // Initial HUD render once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { updateHUD(); updateElementHUD(); });
  } else {
    updateHUD();
    updateElementHUD();
  }
})();
