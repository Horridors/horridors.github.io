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

  const api = {
    get() { return TIERS[current]; },
    id()  { return current; },
    set(id) {
      if (!TIERS[id]) return false;
      current = id;
      for (const fn of listeners) { try { fn(TIERS[id]); } catch (e) {} }
      // Update any HUD badges
      updateBadges();
      return true;
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
      api.set(tier);
      picker.querySelectorAll('.difficulty-option').forEach(b => {
        b.setAttribute('aria-checked', b.getAttribute('data-tier') === tier ? 'true' : 'false');
      });
    });
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
