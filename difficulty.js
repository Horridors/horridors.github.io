// Horridors — Difficulty System
// Scope: monster speed + aggression (detection/chase ranges). Extreme also
// enables one-hit death (no continue prompt — level restarts on caught).
// Picked once at the title screen. In-memory only (no localStorage).
//
// Tiers:
//   easy    (7+)   speed x0.70  aggro x0.70  oneHit=false  soft
//   medium  (10+)  speed x1.00  aggro x1.00  oneHit=false  baseline
//   hard    (teen) speed x1.25  aggro x1.25  oneHit=false  fast
//   extreme        speed x1.60  aggro x1.60  oneHit=true   brutal
//
// Usage from level code:
//   const d = window.__difficulty.get();
//   monster.speed = BASE_SPEED * d.speedMul;
//   detectRange  = BASE_RANGE * d.aggroMul;
//   if (d.oneHit) { caught = fullLevelRestart; }
(function () {
  'use strict';
  const TIERS = {
    easy:    { id: 'easy',    name: 'Easy',    age: '7+',     speedMul: 0.70, aggroMul: 0.70, oneHit: false },
    medium:  { id: 'medium',  name: 'Medium',  age: '10+',    speedMul: 1.00, aggroMul: 1.00, oneHit: false },
    hard:    { id: 'hard',    name: 'Hard',    age: 'teen',   speedMul: 1.25, aggroMul: 1.25, oneHit: false },
    extreme: { id: 'extreme', name: 'Extreme', age: 'expert', speedMul: 1.60, aggroMul: 1.60, oneHit: true  },
  };
  let current = 'easy';
  const listeners = [];

  // --- Mid-run lock ------------------------------------------------------
  // Certificate integrity rule: a certificate is only valid if all 8 levels
  // are completed consecutively at the SAME difficulty. Switching tiers
  // mid-run would let someone skate through the first half on Easy, then
  // flip to Extreme just for the final level and claim an Extreme cert.
  // To prevent that, changing difficulty mid-run requires confirmation and
  // wipes the current tier's progress, dropping the player back to the
  // title screen with L1 as the only unlocked level on the new tier.
  function isAnyLevelInProgress() {
    const lp = window.__levelInProgress;
    if (!lp) return false;
    for (let i = 1; i <= 8; i++) {
      if (lp[i]) return true;
    }
    return false;
  }
  window.__isAnyLevelInProgress = isAnyLevelInProgress;

  function applySet(id) {
    if (!TIERS[id]) return false;
    current = id;
    for (const fn of listeners) { try { fn(TIERS[id]); } catch (e) {} }
    // Update any HUD badges
    updateBadges();
    return true;
  }

  const api = {
    get() { return TIERS[current]; },
    id()  { return current; },
    // `force:true` bypasses the mid-run guard — used by the confirm-and-void flow.
    set(id, opts) {
      if (!TIERS[id]) return false;
      if (id === current) return true;
      const force = !!(opts && opts.force);
      if (!force && isAnyLevelInProgress()) {
        // Caller tried to switch mid-run. Refuse silently — the picker UI
        // shows a confirm dialog before calling set() with force.
        return false;
      }
      return applySet(id);
    },
    tiers() { return Object.values(TIERS); },
    onChange(fn) { listeners.push(fn); },
    // Helper: scale a speed by current difficulty
    speed(base) { return base * TIERS[current].speedMul; },
    // Helper: scale a detection/aggression range
    aggro(base) { return base * TIERS[current].aggroMul; },
    isOneHit() { return TIERS[current].oneHit; },
  };

  function updateBadges() {
    const d = TIERS[current];
    document.querySelectorAll('[data-difficulty-badge]').forEach((el) => {
      el.textContent = d.name;
      el.setAttribute('data-tier', d.id);
    });
  }

  window.__difficulty = api;

  // Render the picker UI on title screen once DOM is ready.
  function renderPicker() {
    const title = document.getElementById('overlay-title');
    if (!title) return;
    // Find a reasonable insertion point: after the subtitle / above buttons.
    if (document.getElementById('difficulty-picker')) return;
    const picker = document.createElement('div');
    picker.id = 'difficulty-picker';
    picker.className = 'difficulty-picker';
    picker.innerHTML = `
      <div class="difficulty-label">Difficulty</div>
      <div class="difficulty-options" role="radiogroup" aria-label="Difficulty">
        ${Object.values(TIERS).map(t => `
          <button type="button" class="difficulty-option" role="radio"
                  data-tier="${t.id}"
                  aria-checked="${t.id === current ? 'true' : 'false'}">
            <span class="d-name">${t.name}</span>
            <span class="d-age">${t.age}</span>
          </button>
        `).join('')}
      </div>
    `;
    // Try to insert just before the first primary button row
    const startBtn = document.getElementById('btn-start');
    if (startBtn && startBtn.parentNode) {
      startBtn.parentNode.insertBefore(picker, startBtn);
    } else {
      title.appendChild(picker);
    }
    picker.addEventListener('click', (ev) => {
      const btn = ev.target.closest('.difficulty-option');
      if (!btn) return;
      const tier = btn.getAttribute('data-tier');
      if (tier === current) return;
      // Mid-run guard: if any level is in progress, require confirmation.
      // Accepting wipes progress on the current tier and returns to title.
      if (isAnyLevelInProgress()) {
        openChangeTierModal(tier);
        return;
      }
      api.set(tier);
      picker.querySelectorAll('.difficulty-option').forEach(b => {
        b.setAttribute('aria-checked', b.getAttribute('data-tier') === tier ? 'true' : 'false');
      });
    });
    // Keep the picker aria-checked in sync when tier changes from other paths.
    api.onChange((t) => {
      picker.querySelectorAll('.difficulty-option').forEach(b => {
        b.setAttribute('aria-checked', b.getAttribute('data-tier') === t.id ? 'true' : 'false');
      });
    });
  }

  // --- Mid-run confirm modal --------------------------------------------
  // Styled to match the existing .overlay + .overlay-content look so no
  // extra CSS is needed.
  function ensureChangeTierModal() {
    let m = document.getElementById('overlay-tier-change');
    if (m) return m;
    m = document.createElement('div');
    m.id = 'overlay-tier-change';
    m.className = 'overlay hidden';
    m.innerHTML = `
      <div class="overlay-content key-modal">
        <div class="key-title">Change difficulty?</div>
        <div class="key-sub" id="tier-change-body">
          Certificates are only awarded for clearing all 8 levels at the same
          difficulty. Switching now will reset your progress on this tier — you
          will start again from Level 1.
        </div>
        <div class="key-buttons">
          <button type="button" id="btn-tier-confirm" class="btn-primary">Reset & switch</button>
          <button type="button" id="btn-tier-cancel" class="btn-ghost">Keep playing</button>
        </div>
      </div>
    `;
    document.body.appendChild(m);
    m.querySelector('#btn-tier-cancel').addEventListener('click', closeChangeTierModal);
    return m;
  }

  let pendingTierId = null;
  function openChangeTierModal(newTierId) {
    pendingTierId = newTierId;
    const m = ensureChangeTierModal();
    const body = m.querySelector('#tier-change-body');
    const fromName = TIERS[current] ? TIERS[current].name : current;
    const toName   = TIERS[newTierId] ? TIERS[newTierId].name : newTierId;
    body.innerHTML =
      'Certificates are only awarded for clearing all 8 levels at the same ' +
      'difficulty. Switching from <b>' + fromName + '</b> to <b>' + toName + '</b> ' +
      'now will reset your progress on ' + fromName + ' and drop you back to ' +
      'Level 1. Continue?';
    // Rebind confirm so it captures the latest pendingTierId.
    const confirmBtn = m.querySelector('#btn-tier-confirm');
    const fresh = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(fresh, confirmBtn);
    fresh.addEventListener('click', () => {
      const target = pendingTierId;
      closeChangeTierModal();
      voidRunAndSwitch(target);
    });
    m.classList.remove('hidden');
  }

  function closeChangeTierModal() {
    const m = document.getElementById('overlay-tier-change');
    if (m) m.classList.add('hidden');
    pendingTierId = null;
  }

  function voidRunAndSwitch(newTierId) {
    // 1. Wipe progress on the tier we're leaving (keeps the consecutive-run
    //    rule honest — no stitching two partial runs into one certificate).
    try {
      if (window.__resetTierProgress) {
        window.__resetTierProgress(current);
      }
    } catch (e) {}
    // 2. Clear in-progress flags so isAnyLevelInProgress() returns false next call.
    if (window.__levelInProgress) {
      for (let i = 1; i <= 8; i++) window.__levelInProgress[i] = false;
    }
    // 3. Return to title (stops every running level, shows title overlay).
    try {
      if (window.__returnToTitle) window.__returnToTitle();
    } catch (e) {}
    // 4. Actually switch the tier (force-bypass the mid-run guard — we just
    //    cleared the run above, so the guard would now allow it anyway, but
    //    force keeps this explicit).
    applySet(newTierId);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderPicker);
  } else {
    renderPicker();
  }
  // Also re-render in case title overlay is rebuilt later
  setTimeout(renderPicker, 500);
  setTimeout(updateBadges, 600);
})();
