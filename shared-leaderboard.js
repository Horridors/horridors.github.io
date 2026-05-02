// Horridors — Leaderboard + Run Timer (v1.2.0)
// -----------------------------------------------------------------------------
// Provides:
//   • A persistent run timer (per-level + cumulative full-game)
//   • A swipe-friendly timer chip in the top-center HUD
//   • A leaderboard panel (top 10 per level + difficulty)
//   • Submission to Supabase via REST (anon publishable key, RLS-protected)
//
// Storage keys (localStorage):
//   horridors:player:name:v1   — display name (1..16 chars)
//   horridors:client:id:v1     — random per-device client id (anti-spam)
//   horridors:run:id:v1        — current full-run uuid (regenerated each new game)
//   horridors:run:state:v1     — { startedAt, levelStartedAt, level, totalMs, levelTimes:{n:ms}, paused }
//   horridors:pb:v1            — { 'easy:1': bestMs, ... } per-difficulty per-level personal bests
//
// All times are in milliseconds. Timer uses performance.now()-style monotonic
// elapsed plus wall-clock anchoring so reloads keep counting correctly.
// -----------------------------------------------------------------------------

(function () {
  'use strict';
  if (window.HorridorsLeaderboard) return; // idempotent

  // ---------- Supabase config ----------
  const SUPABASE_URL = 'https://rjrqsbygptblppgfmdhj.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_WNcasJNJwOJSANcBp77Vxw_W60YNFRH';
  const TABLE = 'horridors_leaderboard';

  // ---------- Storage helpers ----------
  function lsGet(k, fallback) {
    try { const v = localStorage.getItem(k); return v == null ? fallback : v; }
    catch (e) { return fallback; }
  }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsGetJSON(k, fallback) {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }
  }
  function lsSetJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  // ---------- IDs ----------
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    // Fallback v4
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0, v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
  function clientId() {
    let id = lsGet('horridors:client:id:v1', '');
    if (!id) { id = uuid(); lsSet('horridors:client:id:v1', id); }
    return id;
  }
  function getRunId() {
    let id = lsGet('horridors:run:id:v1', '');
    if (!id) { id = uuid(); lsSet('horridors:run:id:v1', id); }
    return id;
  }
  function newRunId() {
    const id = uuid();
    lsSet('horridors:run:id:v1', id);
    return id;
  }

  // ---------- Player name ----------
  const NAME_KEY = 'horridors:player:name:v1';
  function getPlayerName() {
    const n = (lsGet(NAME_KEY, '') || '').trim();
    if (n) return n.slice(0, 16);
    // Default to "Chester" once, but don't overwrite if user clears it.
    return '';
  }
  function setPlayerName(name) {
    const clean = String(name || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 16);
    lsSet(NAME_KEY, clean);
    return clean;
  }

  // ---------- Difficulty (read from window.__difficulty if available) ----------
  function currentDifficultyId() {
    try {
      if (window.__difficulty && typeof window.__difficulty.id === 'function') {
        const d = window.__difficulty.id();
        if (d === 'easy' || d === 'medium' || d === 'hard' || d === 'extreme') return d;
      }
    } catch (e) {}
    return 'easy';
  }

  // ---------- Run timer state ----------
  // Persisted across reloads via horridors:run:state:v1.
  const STATE_KEY = 'horridors:run:state:v1';
  function loadState() {
    return lsGetJSON(STATE_KEY, null) || {
      startedAt: 0,        // wall-clock ms when full run began (0 if not started)
      level: 0,            // currently active level (0 = none)
      levelStartedAt: 0,   // wall-clock ms when current level began
      levelTimes: {},      // { '1': ms, '2': ms, ... }
      finished: false,
      paused: false,
      pausedAt: 0,         // wall-clock when paused
      pausedTotal: 0,      // total ms paused this run
    };
  }
  function saveState(s) { lsSetJSON(STATE_KEY, s); }

  let state = loadState();

  // Time elapsed for full run (excluding pauses)
  function totalElapsedMs() {
    if (!state.startedAt) return 0;
    if (state.finished) {
      // Sum of recorded level times if available, else stored startedAt..end
      return Object.values(state.levelTimes).reduce((a, b) => a + (b || 0), 0);
    }
    const now = Date.now();
    let elapsed = now - state.startedAt - (state.pausedTotal || 0);
    if (state.paused && state.pausedAt) elapsed -= (now - state.pausedAt);
    return Math.max(0, elapsed);
  }

  // Time elapsed for current level (excluding pauses)
  function levelElapsedMs() {
    if (!state.levelStartedAt || !state.level) return 0;
    const now = Date.now();
    // Pause math: any pause that started after levelStartedAt counts.
    let elapsed = now - state.levelStartedAt;
    if (state.paused && state.pausedAt && state.pausedAt >= state.levelStartedAt) {
      elapsed -= (now - state.pausedAt);
    }
    return Math.max(0, elapsed);
  }

  function startRun() {
    state = loadState();
    if (!state.startedAt || state.finished) {
      state = {
        startedAt: Date.now(),
        level: 0,
        levelStartedAt: 0,
        levelTimes: {},
        finished: false,
        paused: false,
        pausedAt: 0,
        pausedTotal: 0,
      };
      newRunId();
      saveState(state);
    }
  }

  function startLevel(n) {
    state = loadState();
    if (!state.startedAt || state.finished) startRun();
    state = loadState();
    // If switching levels mid-run, capture the previous level's elapsed time
    // (only if it was unfinished — completing a level submits via finishLevel).
    state.level = n;
    state.levelStartedAt = Date.now();
    saveState(state);
  }

  function finishLevel(n) {
    state = loadState();
    if (!state.level || state.level !== n) {
      // Levels can be jumped to (debug). Only record a time if we have a valid start.
      if (!state.levelStartedAt) return null;
    }
    const elapsed = levelElapsedMs();
    state.levelTimes[String(n)] = elapsed;
    state.levelStartedAt = 0;
    state.level = 0;
    saveState(state);
    // Update local PB
    const diff = currentDifficultyId();
    const pb = lsGetJSON('horridors:pb:v1', {});
    const k = diff + ':' + n;
    if (!pb[k] || elapsed < pb[k]) {
      pb[k] = elapsed;
      lsSetJSON('horridors:pb:v1', pb);
    }
    // Submit to leaderboard (fire-and-forget)
    submitTime(n, elapsed).catch(() => {});
    return elapsed;
  }

  function finishRun() {
    state = loadState();
    state.finished = true;
    saveState(state);
    const total = totalElapsedMs();
    const diff = currentDifficultyId();
    const pb = lsGetJSON('horridors:pb:v1', {});
    const k = diff + ':0';
    if (!pb[k] || total < pb[k]) {
      pb[k] = total;
      lsSetJSON('horridors:pb:v1', pb);
    }
    submitTime(0, total).catch(() => {});
    return total;
  }

  function resetRun() {
    state = {
      startedAt: 0,
      level: 0,
      levelStartedAt: 0,
      levelTimes: {},
      finished: false,
      paused: false,
      pausedAt: 0,
      pausedTotal: 0,
    };
    saveState(state);
    newRunId();
  }

  function pauseRun() {
    state = loadState();
    if (!state.startedAt || state.finished || state.paused) return;
    state.paused = true;
    state.pausedAt = Date.now();
    saveState(state);
  }
  function resumeRun() {
    state = loadState();
    if (!state.paused) return;
    state.pausedTotal = (state.pausedTotal || 0) + (Date.now() - state.pausedAt);
    state.paused = false;
    state.pausedAt = 0;
    saveState(state);
  }

  // ---------- Submission ----------
  async function submitTime(level, timeMs) {
    const name = getPlayerName();
    if (!name) return null;       // No leaderboard if no name set
    if (timeMs < 1000) return null; // Sanity: ignore <1s (likely a bug)
    const body = {
      level: level,
      difficulty: currentDifficultyId(),
      player_name: name,
      time_ms: Math.round(timeMs),
      run_id: getRunId(),
      client_id: clientId(),
    };
    try {
      const r = await fetch(SUPABASE_URL + '/rest/v1/' + TABLE, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation,resolution=ignore-duplicates',
        },
        body: JSON.stringify(body),
      });
      // 201 / 200 / 409 (duplicate) all considered success.
      if (!r.ok && r.status !== 409) {
        console.warn('[leaderboard] submit failed', r.status, await r.text());
      }
      return r.ok;
    } catch (e) {
      console.warn('[leaderboard] submit error', e);
      return false;
    }
  }

  async function fetchTop(level, difficulty, limit) {
    limit = Math.max(1, Math.min(100, limit || 10));
    const url = SUPABASE_URL + '/rest/v1/' + TABLE +
      '?select=player_name,time_ms,created_at' +
      '&level=eq.' + encodeURIComponent(level) +
      '&difficulty=eq.' + encodeURIComponent(difficulty) +
      '&order=time_ms.asc&limit=' + limit;
    try {
      const r = await fetch(url, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        },
      });
      if (!r.ok) return [];
      return await r.json();
    } catch (e) {
      return [];
    }
  }

  // ---------- Formatting ----------
  function formatMs(ms) {
    if (ms == null || isNaN(ms)) return '--:--';
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const cs = Math.floor((ms % 1000) / 10);
    if (h > 0) return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + '.' + String(cs).padStart(2, '0');
  }

  // ---------- Timer chip UI ----------
  // Top-center pill showing TOTAL time + LEVEL split. Tap to open leaderboard.
  // Hidden by default until a run is in progress.
  let chipEl = null;
  function ensureChip() {
    if (chipEl) return chipEl;
    const el = document.createElement('div');
    el.id = 'hud-timer';
    el.className = 'ui-layer';
    el.innerHTML = `
      <div class="hud-timer-row">
        <span class="hud-timer-icon" aria-hidden="true">\u23F1</span>
        <span class="hud-timer-total" id="hud-timer-total">00:00.00</span>
        <span class="hud-timer-sep">\u00B7</span>
        <span class="hud-timer-level" id="hud-timer-level">L--</span>
      </div>
      <div class="hud-timer-hint">tap for leaderboard</div>
    `;
    document.body.appendChild(el);
    el.addEventListener('click', openLeaderboard);
    el.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      // Single-tap dismiss isn't useful here \u2014 we open leaderboard instead.
      openLeaderboard();
    }, { passive: true });
    chipEl = el;
    return el;
  }

  function tickChip() {
    const el = ensureChip();
    state = loadState();
    const visible = !!state.startedAt && !state.finished;
    el.classList.toggle('show', visible);
    if (!visible) return;
    const totalEl = document.getElementById('hud-timer-total');
    const levelEl = document.getElementById('hud-timer-level');
    if (totalEl) totalEl.textContent = formatMs(totalElapsedMs());
    if (levelEl) {
      if (state.level && state.levelStartedAt) {
        levelEl.textContent = 'L' + state.level + ' ' + formatMs(levelElapsedMs());
      } else {
        levelEl.textContent = 'between levels';
      }
    }
  }

  // ---------- Leaderboard panel UI ----------
  let panelEl = null;
  function ensurePanel() {
    if (panelEl) return panelEl;
    const el = document.createElement('div');
    el.id = 'overlay-leaderboard';
    el.className = 'overlay hidden';
    el.innerHTML = `
      <div class="overlay-content leaderboard-panel">
        <div class="leaderboard-head">
          <div class="leaderboard-title">FASTEST RUNS</div>
          <button id="lb-close" class="btn-ghost lb-close-btn" aria-label="Close">Close (Esc)</button>
        </div>
        <div class="leaderboard-filters">
          <label class="lb-field">
            <span class="lb-field-label">Level</span>
            <select id="lb-level"></select>
          </label>
          <label class="lb-field">
            <span class="lb-field-label">Difficulty</span>
            <select id="lb-difficulty">
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
              <option value="extreme">Extreme</option>
            </select>
          </label>
        </div>
        <div class="leaderboard-name-row">
          <label class="lb-field">
            <span class="lb-field-label">Your name</span>
            <input id="lb-name" type="text" maxlength="16" placeholder="e.g. Chester" autocomplete="off" />
          </label>
          <button id="lb-save-name" class="btn-ghost">Save</button>
        </div>
        <div id="lb-loading" class="lb-loading">Loading top runs\u2026</div>
        <ol id="lb-list" class="lb-list"></ol>
        <div id="lb-pb" class="lb-pb"></div>
        <div class="lb-footer">
          Times sync to a global board. No accounts \u2014 just type a name.<br/>
          Designed by Chester Edmunds. Built by Dad using AI.
        </div>
      </div>
    `;
    document.body.appendChild(el);
    // Populate level options: 0 = full run, 1..8 = each level
    const levelSel = el.querySelector('#lb-level');
    const opt0 = document.createElement('option');
    opt0.value = '0';
    opt0.textContent = 'Full game (L1\u2192L8)';
    levelSel.appendChild(opt0);
    for (let i = 1; i <= 8; i++) {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = 'Level ' + i;
      levelSel.appendChild(o);
    }
    el.querySelector('#lb-close').addEventListener('click', closeLeaderboard);
    el.addEventListener('click', (e) => { if (e.target === el) closeLeaderboard(); });
    el.querySelector('#lb-level').addEventListener('change', refreshPanel);
    el.querySelector('#lb-difficulty').addEventListener('change', refreshPanel);
    el.querySelector('#lb-save-name').addEventListener('click', () => {
      const input = el.querySelector('#lb-name');
      const saved = setPlayerName(input.value);
      input.value = saved;
      refreshPanel();
    });
    panelEl = el;
    return el;
  }

  async function refreshPanel() {
    const el = ensurePanel();
    const level = parseInt(el.querySelector('#lb-level').value, 10) || 0;
    const diff  = el.querySelector('#lb-difficulty').value || 'easy';
    const list  = el.querySelector('#lb-list');
    const loading = el.querySelector('#lb-loading');
    const pbEl  = el.querySelector('#lb-pb');
    list.innerHTML = '';
    loading.style.display = '';
    pbEl.textContent = '';
    const rows = await fetchTop(level, diff, 10);
    loading.style.display = 'none';
    if (!rows.length) {
      const li = document.createElement('li');
      li.className = 'lb-empty';
      li.textContent = 'No times yet on ' + diff.toUpperCase() + ' \u2014 be the first.';
      list.appendChild(li);
    } else {
      const myName = getPlayerName();
      rows.forEach((r, i) => {
        const li = document.createElement('li');
        li.className = 'lb-row';
        if (myName && r.player_name === myName) li.classList.add('lb-row-mine');
        li.innerHTML =
          '<span class="lb-rank">#' + (i + 1) + '</span>' +
          '<span class="lb-name">' + escapeHtml(r.player_name) + '</span>' +
          '<span class="lb-time">' + formatMs(r.time_ms) + '</span>';
        list.appendChild(li);
      });
    }
    // Personal best
    const pb = lsGetJSON('horridors:pb:v1', {});
    const myKey = diff + ':' + level;
    if (pb[myKey]) {
      pbEl.textContent = 'Your best on ' + diff.toUpperCase() + ': ' + formatMs(pb[myKey]);
    } else {
      pbEl.textContent = 'No personal best yet on ' + diff.toUpperCase() + '.';
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  }

  function openLeaderboard() {
    const el = ensurePanel();
    el.classList.remove('hidden');
    // Pre-select to the difficulty + current level if available
    const cur = loadState();
    const lvl = cur.level || 0;
    el.querySelector('#lb-level').value = String(lvl);
    el.querySelector('#lb-difficulty').value = currentDifficultyId();
    el.querySelector('#lb-name').value = getPlayerName();
    refreshPanel();
  }
  function closeLeaderboard() {
    if (panelEl) panelEl.classList.add('hidden');
  }

  // Esc to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panelEl && !panelEl.classList.contains('hidden')) {
      closeLeaderboard();
    }
  });

  // ---------- Start the tick loop ----------
  function tickLoop() {
    try { tickChip(); } catch (e) {}
    requestAnimationFrame(tickLoop);
  }

  // ---------- Hooks: detect level start/end ----------
  function setupHooks() {
    // L1 start = btn-start; L2..L8 start = btn-l<N>-start (and a few "begin" variants)
    const startMap = {
      1: ['btn-start'],
      2: ['btn-l2-start'],
      3: ['btn-l3-start'],
      4: ['btn-l4-start'],
      5: ['btn-l5-start', 'btn-l5-begin'],
      6: ['btn-l6-start', 'btn-l6-begin'],
      7: ['btn-l7-start', 'btn-l7-begin'],
      8: ['btn-l8-start', 'btn-l8-begin'],
    };
    for (const lvl in startMap) {
      for (const id of startMap[lvl]) {
        const btn = document.getElementById(id);
        if (!btn) continue;
        btn.addEventListener('click', () => {
          // L1's start button means "start the whole run"
          if (parseInt(lvl, 10) === 1) startRun();
          startLevel(parseInt(lvl, 10));
        });
      }
    }
    // End overlays: L2..L8 have overlay-l<N>-end. L1 uses overlay-end (treasure room).
    // Mark finishLevel when each end overlay first appears.
    const endMap = {
      1: 'overlay-end',
      2: 'overlay-l2-end',
      3: 'overlay-l3-end',
      4: 'overlay-l4-end',
      5: 'overlay-l5-end',
      6: 'overlay-l6-end',
      7: 'overlay-l7-end',
      8: 'overlay-l8-end',
    };
    for (const lvl in endMap) {
      const el = document.getElementById(endMap[lvl]);
      if (!el) continue;
      const observer = new MutationObserver(() => {
        if (!el.classList.contains('hidden')) {
          const n = parseInt(lvl, 10);
          // Only finish if this is the active level (avoid double-fire on resume).
          const s = loadState();
          if (s.level === n || (s.levelStartedAt && !s.levelTimes[String(n)])) {
            finishLevel(n);
          }
          // L8 end → also finish the full run.
          if (n === 8) finishRun();
        }
      });
      observer.observe(el, { attributes: true, attributeFilter: ['class'] });
    }
    // "New Game" button → reset run
    const newBtn = document.getElementById('btn-newgame');
    if (newBtn) newBtn.addEventListener('click', () => resetRun());

    // Title-screen Leaderboard button
    const lbBtn = document.getElementById('btn-open-leaderboard');
    if (lbBtn) lbBtn.addEventListener('click', openLeaderboard);
  }

  // Wait for DOM to be fully wired before binding hooks
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(setupHooks, 0);
      ensureChip();
      tickLoop();
    });
  } else {
    setTimeout(() => { setupHooks(); ensureChip(); tickLoop(); }, 0);
  }

  // ---------- Public API ----------
  window.HorridorsLeaderboard = {
    startRun, startLevel, finishLevel, finishRun, resetRun,
    pauseRun, resumeRun,
    getPlayerName, setPlayerName,
    getRunId, newRunId, clientId,
    open: openLeaderboard, close: closeLeaderboard,
    submitTime, fetchTop,
    formatMs,
    totalElapsedMs, levelElapsedMs,
  };
})();
