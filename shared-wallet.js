// Horridors — shared wallet (coins + powerups)
// In-memory only. NO localStorage (sandbox blocked).
// Exposed as window.HorridorsWallet.

(function(){
  let coins = 0;
  const powerups = Object.create(null);  // { extraHp: true, fasterCharge: true, shield: true }

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
    reset: () => { coins = 0; for (const k in powerups) delete powerups[k]; updateHUD(); },
  };

  // Initial HUD render once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateHUD);
  } else {
    updateHUD();
  }
})();
