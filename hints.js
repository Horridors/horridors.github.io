// Horridors — adaptive hint system
// =========================================================================
// Added after Chester's headmaster reported several kids getting stuck on
// Level 1. Strategy:
//   - Hints scale with difficulty (easy = chatty, normal = sparse, hard = none)
//   - Hint bar auto-appears after 30s of no progress
//   - Tutorial overlay shown once on first ever play (easy/normal only)
//   - "Stuck? Check your Clues" nudge after sustained idle time
//
// Public API:
//   window.HorridorsHints = {
//     setLevel(n)             — register the active level (1..8)
//     setProgressKey(key)     — call when player makes meaningful progress.
//                                Resets the idle timer. Marks key as 'done'
//                                so its hint won't fire again.
//     setHintSequence(level, sequence)
//                              — sequence is an array of { key, text, when }
//                                where `when(state)` returns true if this
//                                hint should be shown right now.
//     showNow(text)           — manually show a one-off hint
//     hide()                  — hide the bar
//     showStuckNudge()        — show the "Check your Clues" nudge
//     setEnabled(bool)        — disable on hard mode etc.
//   }
//
// Tutorial: window.HorridorsTutorial.maybeShow()
// =========================================================================

(function () {
  'use strict';

  // ------------------------------------------------------------------------
  // Config — idle thresholds (ms)
  // ------------------------------------------------------------------------
  const IDLE_FIRST_HINT = 30 * 1000;   // 30s after last progress → first hint
  const IDLE_STUCK_NUDGE = 60 * 1000;  // 60s after last progress → "check Clues"
  const IDLE_REPEAT      = 45 * 1000;  // 45s gap before re-showing same hint

  // ------------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------------
  const seqByLevel = {};       // { 1: [...], 2: [...], ... }
  const doneKeys   = new Set();
  let activeLevel = null;
  let lastProgressTs = Date.now();
  let lastHintTs = 0;
  let tickTimer = null;
  let enabled = true;

  // ------------------------------------------------------------------------
  // Hint bar UI
  // ------------------------------------------------------------------------
  let barEl = null;
  function ensureBar() {
    if (barEl) return barEl;
    barEl = document.createElement('div');
    barEl.id = 'hint-bar';
    barEl.style.cssText = [
      'position:fixed',
      'left:50%',
      'bottom:14%',
      'transform:translate(-50%, 8px)',
      'max-width:min(560px, 92vw)',
      'padding:12px 18px',
      'background:rgba(20,28,36,0.92)',
      'border:1px solid rgba(255,216,74,0.55)',
      'border-radius:14px',
      'color:#ffe9a3',
      'font:600 14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
      'text-align:center',
      'pointer-events:none',
      'opacity:0',
      'transition:opacity 280ms ease-out, transform 280ms ease-out',
      'box-shadow:0 8px 24px rgba(0,0,0,0.5)',
      'z-index:9500',
    ].join(';');
    barEl.innerHTML = '<span style="display:inline-block;margin-right:8px;">💡</span><span class="hint-text"></span>';
    document.body.appendChild(barEl);
    return barEl;
  }

  let hideTimer = null;
  function show(text, opts) {
    if (!enabled) return;
    const bar = ensureBar();
    const txt = bar.querySelector('.hint-text');
    if (txt) txt.innerHTML = text;
    bar.style.opacity = '1';
    bar.style.transform = 'translate(-50%, 0)';
    bar.style.borderColor = (opts && opts.urgent) ? 'rgba(255,140,140,0.7)' : 'rgba(255,216,74,0.55)';
    if (hideTimer) clearTimeout(hideTimer);
    const ttl = (opts && opts.ttl) || 8000;
    hideTimer = setTimeout(hide, ttl);
    lastHintTs = Date.now();
  }

  function hide() {
    if (!barEl) return;
    barEl.style.opacity = '0';
    barEl.style.transform = 'translate(-50%, 8px)';
  }

  // ------------------------------------------------------------------------
  // Difficulty tier resolver
  // ------------------------------------------------------------------------
  function tier() {
    try {
      const D = window.__difficulty;
      if (D && D.id) return D.id();
    } catch (e) {}
    return 'easy';
  }

  // ------------------------------------------------------------------------
  // Progress + idle loop
  // ------------------------------------------------------------------------
  function setProgressKey(key) {
    lastProgressTs = Date.now();
    if (key) doneKeys.add(key);
    hide();
  }

  function setLevel(n) {
    activeLevel = n;
    lastProgressTs = Date.now();
    lastHintTs = 0;
    hide();
    if (!tickTimer) tickTimer = setInterval(tick, 2000);
  }

  function setHintSequence(n, seq) {
    seqByLevel[n] = seq;
  }

  function setEnabled(v) {
    enabled = !!v;
    if (!enabled) hide();
  }

  // Pick the next hint that hasn't been done and whose `when()` returns true.
  function pickNextHint() {
    const seq = seqByLevel[activeLevel];
    if (!seq) return null;
    // Try to gather state — each level might expose its own state object on window
    const stateRef = {
      l1: window.__game && window.__game.state,
      l2: window.__horridorsL2 && window.__horridorsL2.state,
      l3: window.__horridorsL3 && window.__horridorsL3.state,
    };
    for (const item of seq) {
      if (doneKeys.has(item.key)) continue;
      try {
        if (item.when && !item.when(stateRef)) continue;
      } catch (e) { continue; }
      return item;
    }
    return null;
  }

  function tick() {
    if (!enabled || !activeLevel) return;
    const t = tier();
    if (t === 'hard') return; // hard mode never auto-hints

    // Don't fire hints while overlays are open (puzzle, combo, notes, etc.)
    const blockingIds = ['overlay-puzzle','overlay-combo','overlay-notes','overlay-tasks',
      'overlay-end','overlay-caught','overlay-mother','overlay-intro','overlay-resume',
      'overlay-l2-end','overlay-l3-end','overlay-l4-end','overlay-l5-end',
      'overlay-l6-end','overlay-l7-end','overlay-l8-end','overlay-credits'];
    for (const id of blockingIds) {
      const el = document.getElementById(id);
      if (el && !el.classList.contains('hidden')) return;
    }

    const idleMs = Date.now() - lastProgressTs;
    const sinceHint = Date.now() - lastHintTs;

    // First-tier hint — easy fires at 30s, normal at 50s
    const firstThreshold = (t === 'easy') ? IDLE_FIRST_HINT : IDLE_FIRST_HINT * 1.7;
    if (idleMs > firstThreshold && sinceHint > IDLE_REPEAT) {
      const hint = pickNextHint();
      if (hint) {
        show(hint.text, { ttl: 7500 });
        // Don't mark done — so if they ignore it, it'll re-show. But bump ts.
        lastHintTs = Date.now();
        return;
      }
    }

    // Stuck nudge — easy only, after sustained idle
    if (t === 'easy' && idleMs > IDLE_STUCK_NUDGE && sinceHint > IDLE_REPEAT) {
      show('Stuck? Tap <b>🔍 Clues</b> (or press <b>N</b>) to see what you\u2019ve found so far.', { ttl: 8000, urgent: false });
    }
  }

  function showStuckNudge() {
    show('Stuck? Tap <b>🔍 Clues</b> (or press <b>N</b>) to see what you\u2019ve found so far.', { ttl: 8000 });
  }

  function showNow(text, opts) { show(text, opts); }

  // ------------------------------------------------------------------------
  // Pre-baked Level 1 hint sequence
  // ------------------------------------------------------------------------
  // Each step has a `when` predicate that returns true while the player is
  // still on that step. We surface the first matching hint they haven't
  // resolved yet.
  const L1_SEQ = [
    {
      key: 'l1-search',
      text: 'Try walking up to a drawer or shelf and pressing <b>E</b> (or tap on it). Search every room.',
      when: (s) => s.l1 && (s.l1.searched ? s.l1.searched.size : 0) < 3,
    },
    {
      key: 'l1-libkey',
      text: 'Hint: there\u2019s a <b>small library key</b> hidden among the books. Search the shelves.',
      when: (s) => s.l1 && !s.l1.hasLibKey,
    },
    {
      key: 'l1-puzzle',
      text: 'Found a strange panel? Watch the symbols, then tap them in the same order to solve the <b>picture lock</b>.',
      when: (s) => s.l1 && s.l1.hasLibKey && !s.l1.puzzleSolved,
    },
    {
      key: 'l1-combo',
      text: 'Hint: the red locker uses a <b>3-digit code</b>. Look for a janitor\u2019s scribbled note.',
      when: (s) => s.l1 && s.l1.puzzleSolved && !s.l1.comboSolved,
    },
    {
      key: 'l1-keycard',
      text: 'The red locker is open \u2014 grab the <b>red keycard</b> inside.',
      when: (s) => s.l1 && s.l1.comboSolved && !s.l1.hasKeycard,
    },
    {
      key: 'l1-escape',
      text: 'You have the keycard. Find the <b>scanner door</b> and use it (E).',
      when: (s) => s.l1 && s.l1.hasKeycard,
    },
  ];
  seqByLevel[1] = L1_SEQ;

  // ------------------------------------------------------------------------
  // Public surface
  // ------------------------------------------------------------------------
  window.HorridorsHints = {
    setLevel,
    setProgressKey,
    setHintSequence,
    showNow,
    hide,
    showStuckNudge,
    setEnabled,
    isEnabled: () => enabled,
  };

  // ------------------------------------------------------------------------
  // First-time tutorial: 3 cards (Move → Search → Clues)
  // ------------------------------------------------------------------------
  // Stored in localStorage so it shows once per device (separate key from save).
  const TUT_KEY = 'horridors:tutorial:seen:v1';
  function hasSeenTutorial() {
    try { return localStorage.getItem(TUT_KEY) === '1'; } catch (e) { return false; }
  }
  function markTutorialSeen() {
    try { localStorage.setItem(TUT_KEY, '1'); } catch (e) {}
  }

  let tutEl = null;
  let tutStep = 0;
  const TUT_CARDS = [
    {
      title: '1. Move around',
      body: 'On a computer: <b>WASD</b> or <b>arrow keys</b> to walk.<br>On a phone: drag the <b>thumbstick</b> at the bottom-left.',
      icon: '🚶',
    },
    {
      title: '2. Search everything',
      body: 'Walk up to drawers, shelves, lockers, and beds.<br>Press <b>E</b> (or the <b>round button</b>) to search inside.',
      icon: '🔎',
    },
    {
      title: '3. Stuck? Check your Clues',
      body: 'Every clue you find goes in the <b>🔍 Clues</b> book.<br>Tap it (or press <b>N</b>) any time to see what you know.',
      icon: '📖',
    },
  ];

  function buildTut() {
    if (tutEl) return tutEl;
    tutEl = document.createElement('div');
    tutEl.id = 'tutorial-overlay';
    tutEl.style.cssText = [
      'position:fixed','inset:0','z-index:11000',
      'background:rgba(8,12,18,0.85)',
      'backdrop-filter:blur(4px)',
      '-webkit-backdrop-filter:blur(4px)',
      'display:flex','align-items:center','justify-content:center',
      'opacity:0','transition:opacity 240ms ease-out',
      'font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
    ].join(';');
    tutEl.innerHTML = `
      <div class="tut-card" style="
        background:linear-gradient(180deg,#1a2230,#10161e);
        border:1px solid rgba(126,226,168,0.4);
        border-radius:18px;
        padding:28px 26px 22px;
        max-width:min(440px, 92vw);
        text-align:center;
        box-shadow:0 16px 48px rgba(0,0,0,0.6);
        color:#e8eef5;
      ">
        <div class="tut-icon" style="font-size:54px;margin-bottom:10px;line-height:1;"></div>
        <div class="tut-title" style="font:700 20px/1.2 system-ui;margin-bottom:12px;color:#ffd866;"></div>
        <div class="tut-body" style="font:500 15px/1.55 system-ui;margin-bottom:22px;color:#cfd8e3;"></div>
        <div class="tut-dots" style="display:flex;gap:8px;justify-content:center;margin-bottom:18px;"></div>
        <div style="display:flex;gap:10px;justify-content:center;">
          <button class="tut-skip" style="
            background:transparent;border:1px solid rgba(255,255,255,0.2);
            color:#9aa6b2;padding:9px 16px;border-radius:10px;
            font:600 13px system-ui;cursor:pointer;">Skip</button>
          <button class="tut-next" style="
            background:linear-gradient(180deg,#5a8d4d,#3a6e2e);
            border:1px solid #7ee2a8;color:#fff;padding:9px 22px;border-radius:10px;
            font:700 14px system-ui;cursor:pointer;">Next \u25b6</button>
        </div>
      </div>
    `;
    document.body.appendChild(tutEl);
    tutEl.querySelector('.tut-skip').addEventListener('click', () => closeTut(true));
    tutEl.querySelector('.tut-next').addEventListener('click', () => {
      tutStep++;
      if (tutStep >= TUT_CARDS.length) closeTut(true);
      else renderTut();
    });
    return tutEl;
  }

  function renderTut() {
    const card = TUT_CARDS[tutStep];
    if (!card) return;
    const el = tutEl;
    el.querySelector('.tut-icon').textContent = card.icon;
    el.querySelector('.tut-title').textContent = card.title;
    el.querySelector('.tut-body').innerHTML = card.body;
    const dots = el.querySelector('.tut-dots');
    dots.innerHTML = '';
    for (let i = 0; i < TUT_CARDS.length; i++) {
      const d = document.createElement('span');
      d.style.cssText = 'width:8px;height:8px;border-radius:50%;background:' +
        (i === tutStep ? '#ffd866' : 'rgba(255,255,255,0.2)') + ';';
      dots.appendChild(d);
    }
    const nextBtn = el.querySelector('.tut-next');
    nextBtn.textContent = (tutStep === TUT_CARDS.length - 1) ? 'Got it!' : 'Next \u25b6';
  }

  function closeTut(markSeen) {
    if (!tutEl) return;
    tutEl.style.opacity = '0';
    setTimeout(() => { if (tutEl && tutEl.parentNode) tutEl.parentNode.removeChild(tutEl); tutEl = null; }, 260);
    if (markSeen) markTutorialSeen();
  }

  function maybeShow() {
    if (hasSeenTutorial()) return;
    if (tier() === 'hard') { markTutorialSeen(); return; }
    tutStep = 0;
    buildTut();
    renderTut();
    // fade in next tick
    requestAnimationFrame(() => { if (tutEl) tutEl.style.opacity = '1'; });
  }

  window.HorridorsTutorial = {
    maybeShow,
    forceShow: () => { tutStep = 0; buildTut(); renderTut(); requestAnimationFrame(() => { if (tutEl) tutEl.style.opacity = '1'; }); },
    reset: () => { try { localStorage.removeItem(TUT_KEY); } catch (e) {} },
    hasSeen: hasSeenTutorial,
  };
})();
