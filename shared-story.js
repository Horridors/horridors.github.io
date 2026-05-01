// =====================================================================
// HORRIDORS — Shared story / progress module
// Global progress object persists across levels in a single page session.
//   window.__horridorsProgress.coins            persistent coin count
//   window.__horridorsProgress.collectibles     already-unlocked comics
//   window.__horridorsProgress.introSeen        has the intro cutscene played?
//   window.__horridorsProgress.motherSeen       has L1 mother-glimpse played?
//
// Also exposes window.HorridorsStory with helpers any level can call.
// =====================================================================
(function () {
  const P = (window.__horridorsProgress = window.__horridorsProgress || {});
  if (!P.collectibles) P.collectibles = {};
  if (!P.gems) P.gems = {}; // id -> true once found (hidden gems across all levels)
  if (typeof P.coins !== 'number') P.coins = 0;
  if (typeof P.introSeen !== 'boolean') P.introSeen = false;
  if (typeof P.motherSeen !== 'boolean') P.motherSeen = false;

  // ---- Coin management: single source of truth across levels ----
  function getCoins() { return P.coins; }
  function addCoins(n) {
    P.coins += (n || 1);
    updateAllCoinHuds();
    return P.coins;
  }
  function setCoins(n) {
    P.coins = Math.max(0, n | 0);
    updateAllCoinHuds();
  }
  function updateAllCoinHuds() {
    document.querySelectorAll('[data-coin-hud]').forEach(el => {
      el.textContent = `Coins ${P.coins}`;
    });
    // NOTE: #hud-coins is now owned by HorridorsWallet (persistent across levels).
    // We intentionally do NOT write to it here to avoid two counters fighting.
  }

  // ---- Intro cutscene ----
  function showIntro(opts) {
    opts = opts || {};
    const overlay = document.getElementById('overlay-intro');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    P.introSeen = true;
    const btn = document.getElementById('btn-intro-close');
    if (btn) {
      btn.onclick = () => {
        overlay.classList.add('hidden');
        if (opts.onClose) opts.onClose();
      };
    }
    // E/Space/Enter/Escape closes
    const handler = (e) => {
      if (overlay.classList.contains('hidden')) {
        window.removeEventListener('keydown', handler);
        return;
      }
      const k = (e.key || '').toLowerCase();
      if (k === 'e' || k === ' ' || k === 'enter' || k === 'escape') {
        e.preventDefault();
        e.stopPropagation();
        overlay.classList.add('hidden');
        window.removeEventListener('keydown', handler);
        if (opts.onClose) opts.onClose();
      }
    };
    window.addEventListener('keydown', handler, true);
  }
  function hasSeenIntro() { return P.introSeen; }

  // ---- Mother glimpse ----
  function showMother(opts) {
    opts = opts || {};
    const overlay = document.getElementById('overlay-mother');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    P.motherSeen = true;
    const btn = document.getElementById('btn-mother-close');
    if (btn) {
      btn.onclick = () => {
        overlay.classList.add('hidden');
        if (opts.onClose) opts.onClose();
      };
    }
    const handler = (e) => {
      if (overlay.classList.contains('hidden')) {
        window.removeEventListener('keydown', handler);
        return;
      }
      const k = (e.key || '').toLowerCase();
      if (k === 'e' || k === ' ' || k === 'enter' || k === 'escape') {
        e.preventDefault();
        e.stopPropagation();
        overlay.classList.add('hidden');
        window.removeEventListener('keydown', handler);
        if (opts.onClose) opts.onClose();
      }
    };
    window.addEventListener('keydown', handler, true);
  }
  function hasSeenMother() { return P.motherSeen; }

  // ---- Generic overlay dismiss helper ----
  // Any level's note/dialog overlay can register itself here so E/Space/N/Esc
  // close it uniformly. Returns a disposer.
  function bindDismiss(overlayId, closeFn, opts) {
    opts = opts || {};
    const el = typeof overlayId === 'string' ? document.getElementById(overlayId) : overlayId;
    if (!el) return () => {};
    const keys = opts.keys || ['e', ' ', 'enter', 'escape', 'n'];
    const handler = (ev) => {
      if (el.classList.contains('hidden')) return;
      const k = (ev.key || '').toLowerCase();
      if (keys.includes(k)) {
        ev.preventDefault();
        ev.stopPropagation();
        closeFn();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }

  // ---- Hidden Gems registry (shared across all levels) ----
  // Each gem: { id, level, title, hint, story, color }
  const GEMS = [
    { id: 'l1_diary',   level: 1, title: 'Mum\'s Old Diary Page', color: '#ffb347',
      hint: 'Tucked behind the dusty corridor radiator.',
      story: 'A torn page from Mum\'s diary. "If the walls ever start whispering your name, my brave Chester — just hum our song. I\'ll hear you."' },
    { id: 'l2_bottle',  level: 2, title: 'Bottle Cap Collection', color: '#6fe0c5',
      hint: 'A rusted tin under a Pipe Room shelf.',
      story: 'A tin full of bottle caps. Inky Bin clearly hoarded these. A little note inside says "FoR CHeSTer. ShiNY. 💙"' },
    { id: 'l3_crayon',  level: 3, title: 'Secret Crayon Drawing', color: '#ff8db3',
      hint: 'Folded inside a plush in the Toy Room.',
      story: 'A crayon drawing of a smiling yellow girl with a star hat. Three words: "MY FRIEND THISTLE". You pocket it.' },
    { id: 'l4_keyring', level: 4, title: 'Teacher\'s Lost Keyring', color: '#c09cff',
      hint: 'Dropped in a dark corner of the boiler corridor.',
      story: 'Exlena\'s old teacher keyring. One of them looks like it could open the big prison door in the lower level…' },
    { id: 'l5_badge',   level: 5, title: 'Thistle\'s Sheriff Badge', color: '#ffd84a',
      hint: 'Left behind on Thistle\'s cell bunk.',
      story: 'A tiny tin star that says "SHERIFF THISTLE". She made it herself. She\'ll want it back.' },
  ];
  function gemCount() { return Object.keys(P.gems).length; }
  function gemTotal() { return GEMS.length; }
  function unlockGem(id) {
    if (P.gems[id]) return false;
    const g = GEMS.find(x => x.id === id);
    if (!g) return false;
    P.gems[id] = true;
    refreshGemButton();
    showGemPopup(g);
    return true;
  }
  function hasGem(id) { return !!P.gems[id]; }

  function ensureGemUI() {
    if (document.getElementById('btn-gems')) return;
    const btn = document.createElement('button');
    btn.id = 'btn-gems';
    // Sits immediately to the right of the coin pill (top-left HUD cluster)
    // so the top-right fullscreen button can't cover it. Positioned after the
    // coin pill's MEDIUM/HARD/etc. difficulty chip — re-anchored at runtime
    // by repositionGemButton() so it never overlaps that chip.
    btn.style.cssText = 'position:fixed;top:10px;left:190px;z-index:1001;padding:6px 12px;background:#1a1024;border:1px solid #ffd84a;color:#ffd84a;border-radius:999px;font:600 12px system-ui;cursor:pointer;';
    btn.innerHTML = '💎 Gems <span id="gem-count" style="background:#ffd84a;color:#1a1024;padding:1px 6px;border-radius:10px;margin-left:4px;font-weight:700;">0/' + GEMS.length + '</span>';
    btn.addEventListener('click', openGemGallery);
    (document.getElementById('game-frame') || document.body).appendChild(btn);
    // Build overlay once
    if (!document.getElementById('overlay-gems')) {
      const ov = document.createElement('div');
      ov.id = 'overlay-gems';
      ov.className = 'overlay hidden';
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:200;display:flex;align-items:center;justify-content:center;';
      ov.innerHTML = '\n<div style="background:#1a1024;border:2px solid #ffd84a;border-radius:14px;padding:22px 26px;max-width:560px;width:90%;color:#f2e6d0;font-family:system-ui;max-height:82vh;overflow:auto;">\n  <div style="font:700 22px system-ui;color:#ffd84a;margin-bottom:4px;">💎 Hidden Gems</div>\n  <div style="font-size:13px;opacity:0.8;margin-bottom:14px;">Secret treasures scattered across the Horridors. Look in corners.</div>\n  <div id="gems-list" style="display:flex;flex-direction:column;gap:10px;"></div>\n  <button id="btn-gems-close" style="margin-top:16px;padding:8px 16px;background:#ffd84a;color:#1a1024;border:none;border-radius:8px;font:700 13px system-ui;cursor:pointer;">Close</button>\n</div>';
      document.body.appendChild(ov);
      document.getElementById('btn-gems-close').addEventListener('click', closeGemGallery);
      // Click backdrop to close
      ov.addEventListener('click', (e) => { if (e.target === ov) closeGemGallery(); });
    }
  }
  function refreshGemButton() {
    ensureGemUI();
    const el = document.getElementById('gem-count');
    if (el) el.textContent = gemCount() + '/' + gemTotal();
    repositionGemButton();
  }
  // Re-anchor the gem pill to sit just past the coin pill's right edge. The
  // coin pill width changes with the difficulty chip text (EASY vs EXTREME),
  // so a fixed left: value can overlap. Call on resize, after difficulty
  // changes, and after refreshGemButton().
  function repositionGemButton() {
    const btn = document.getElementById('btn-gems');
    const coinPill = document.getElementById('hud-coins');
    if (!btn || !coinPill) return;
    const r = coinPill.getBoundingClientRect();
    if (!r || r.width < 10) return; // not laid out yet
    // 10px gutter between the coin pill and the gem pill
    const leftPx = Math.round(r.right + 10);
    btn.style.left = leftPx + 'px';
  }
  // Reposition on window resize and when difficulty/HUD updates happen later.
  window.addEventListener('resize', repositionGemButton);
  // Also reposition a short time after first paint, so the coin pill's
  // difficulty chip has populated.
  setTimeout(repositionGemButton, 0);
  setTimeout(repositionGemButton, 200);
  setTimeout(repositionGemButton, 800);
  function openGemGallery() {
    ensureGemUI();
    const list = document.getElementById('gems-list');
    list.innerHTML = '';
    for (const g of GEMS) {
      const have = hasGem(g.id);
      const row = document.createElement('div');
      row.style.cssText = 'padding:12px 14px;border-radius:10px;border:1px solid ' + (have ? g.color : '#3a2a4a') + ';background:' + (have ? 'rgba(255,216,74,0.08)' : 'rgba(40,24,60,0.4)') + ';' + (have ? '' : 'opacity:0.55;');
      row.innerHTML =
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;">' +
          '<div style="width:18px;height:18px;background:' + (have ? g.color : '#4a3a5a') + ';border-radius:50%;box-shadow:0 0 8px ' + (have ? g.color : 'transparent') + ';"></div>' +
          '<div style="font:700 14px system-ui;color:' + (have ? '#fff' : '#8a7a9a') + ';">Level ' + g.level + ' — ' + (have ? g.title : '??? Locked') + '</div>' +
        '</div>' +
        '<div style="font-size:12px;color:' + (have ? '#cfc6b4' : '#7a6a8a') + ';line-height:1.45;margin-left:28px;">' +
          (have ? g.story : 'Hint: ' + g.hint) +
        '</div>';
      list.appendChild(row);
    }
    document.getElementById('overlay-gems').classList.remove('hidden');
  }
  function closeGemGallery() {
    const ov = document.getElementById('overlay-gems');
    if (ov) ov.classList.add('hidden');
  }
  function showGemPopup(g) {
    // Compact corner toast that auto-dismisses — anchored top-right so it
    // never overlaps the centre HUD or objectives panel. Tap to dismiss early.
    const toast = document.createElement('div');
    toast.style.cssText = [
      'position:fixed',
      'top:54px',
      'right:12px',
      'left:auto',
      'transform:translateX(20px)',
      'background:#1a1024',
      'border:2px solid ' + g.color,
      'border-radius:12px',
      'padding:10px 14px',
      'color:#fff',
      'font-family:system-ui',
      'z-index:200',
      'box-shadow:0 8px 32px rgba(0,0,0,0.6)',
      'opacity:0',
      'transition:all 400ms cubic-bezier(0.2,0.9,0.3,1)',
      'max-width:240px',
      'text-align:left',
      'cursor:pointer',
      'pointer-events:auto'
    ].join(';');
    toast.innerHTML =
      '<div style="font-size:10px;letter-spacing:2px;color:' + g.color + ';font-weight:700;">💎 HIDDEN GEM</div>' +
      '<div style="font:700 14px system-ui;margin-top:2px;">' + g.title + '</div>' +
      '<div style="font-size:11px;opacity:0.85;margin-top:4px;line-height:1.4;">' + g.story + '</div>' +
      '<div style="font-size:9px;letter-spacing:0.18em;text-transform:uppercase;opacity:0.45;margin-top:6px;">tap to dismiss</div>';
    document.body.appendChild(toast);
    requestAnimationFrame(() => { toast.style.opacity = '1'; toast.style.transform = 'translateX(0)'; });
    let dismissed = false;
    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(20px)';
      setTimeout(() => toast.remove(), 500);
    };
    toast.addEventListener('click', dismiss);
    toast.addEventListener('touchstart', (e) => { e.stopPropagation(); dismiss(); }, { passive: true });
    setTimeout(dismiss, 5500);
  }

  // Auto-paint gem button once DOM is ready
  document.addEventListener('DOMContentLoaded', () => { ensureGemUI(); refreshGemButton(); });
  if (document.readyState !== 'loading') setTimeout(() => { ensureGemUI(); refreshGemButton(); }, 0);

  window.HorridorsStory = {
    getCoins, addCoins, setCoins, updateAllCoinHuds,
    showIntro, hasSeenIntro,
    showMother, hasSeenMother,
    bindDismiss,
    progress: P,
    // gems
    GEMS, unlockGem, hasGem, gemCount, gemTotal,
    openGemGallery, closeGemGallery, refreshGemButton, repositionGemButton,
  };

  // Paint initial coin counts on any existing coin HUDs now (in case HUD was drawn already)
  document.addEventListener('DOMContentLoaded', updateAllCoinHuds);
  // Also call now in case script is loaded after DOMContentLoaded
  if (document.readyState !== 'loading') setTimeout(updateAllCoinHuds, 0);
})();
