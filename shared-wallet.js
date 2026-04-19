// Horridors — shared wallet (coins + powerups)
// In-memory only. NO localStorage (sandbox blocked).
// Exposed as window.HorridorsWallet.

(function(){
  let coins = 0;
  const powerups = Object.create(null);  // { extraHp: true, fasterCharge: true, shield: true }

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
    reset: () => { coins = 0; for (const k in powerups) delete powerups[k]; runSnapshot = null; updateHUD(); },

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
  };

  // Initial HUD render once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateHUD);
  } else {
    updateHUD();
  }
})();
