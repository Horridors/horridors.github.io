// =====================================================================
// HORRIDORS — Level 2: The Flooded Sublevel
// Standalone scene. Boots when window.__startLevel2() is called.
// Re-uses the same #game canvas but renders its own world & loop.
// =====================================================================

(function () {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const VIEW_W = canvas.width;  // 960
  const VIEW_H = canvas.height; // 600

  // ---------- World ----------
  // Plus-shaped flooded sublevel: central hub + 3 side rooms (left/top/right)
  const WORLD_W = 2400;
  const WORLD_H = 1600;

  // Hub corridor (flooded): central horizontal + vertical cross
  const HUB = {
    // Horizontal strip
    hx: 300, hy: 760, hw: 1800, hh: 180,
    // Vertical strip (goes up to top room)
    vx: 1110, vy: 300, vw: 180, vh: 900,
    // Small stairwell at bottom (exit)
    ex: 1110, ey: 1180, ew: 180, eh: 180,
  };

  // Rooms (400×400, opening onto hub)
  const ROOMS = {
    aquarium: { id: 'aquarium', name: 'Aquarium Room', left: 60, right: 460, top: 560, bottom: 960, doorSide: 'right', doorY: 820 },
    pipe:     { id: 'pipe',     name: 'Pipe Room',     left: 940, right: 1460, top: 80, bottom: 560, doorSide: 'bottom', doorX: 1200 },
    control:  { id: 'control',  name: 'Control Room',  left: 1940, right: 2340, top: 560, bottom: 960, doorSide: 'left', doorX: 1940, doorY: 820 },
  };
  for (const r of Object.values(ROOMS)) {
    r.w = r.right - r.left;
    r.h = r.bottom - r.top;
    r.cx = (r.left + r.right) / 2;
    r.cy = (r.top + r.bottom) / 2;
  }
  // Exit (stairs up)
  const EXIT = { x: HUB.ex, y: HUB.ey + 60, w: HUB.ew, h: 100 };

  // ---------- Camera ----------
  const camera = { x: 0, y: 0 };

  // Coins sprinkled through the day-care flood (helps grow wallet for L7 shop)
  // Walkable zones: HUB horizontal (x:300-2100, y:760-940), HUB vertical (x:1110-1290, y:300-1200),
  // Aquarium (x:60-460, y:560-960), Pipe (x:940-1460, y:80-560), Control (x:1940-2340, y:560-960)
  const coins = [
    // Aquarium Room
    { x: 180,  y: 680,  got: false, v: 1 },
    { x: 360,  y: 820,  got: false, v: 1 },
    // HUB horizontal corridor
    { x: 620,  y: 840,  got: false, v: 1 },
    { x: 1680, y: 860,  got: false, v: 1 },
    { x: 1900, y: 820,  got: false, v: 1 },
    // Pipe Room (top)
    { x: 1080, y: 200,  got: false, v: 2 },
    { x: 1360, y: 400,  got: false, v: 2 },
    // HUB vertical corridor
    { x: 1200, y: 520,  got: false, v: 1 },
    { x: 1200, y: 980,  got: false, v: 1 },
    // Control Room
    { x: 2040, y: 680,  got: false, v: 2 },
    { x: 2220, y: 880,  got: false, v: 1 },
  ];

  // ---------- Input ----------
  const keys = new Set();
  const justPressed = new Set();
  function keydown(e) {
    const k = e.key.toLowerCase();
    if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k)) e.preventDefault();
    if (!keys.has(k)) justPressed.add(k);
    keys.add(k);
  }
  function keyup(e) { keys.delete(e.key.toLowerCase()); }
  function blur() { keys.clear(); }
  const isDown = (...ks) => ks.some(k => keys.has(k));
  const wasPressed = (...ks) => ks.some(k => justPressed.has(k));

  // ---------- State ----------
  const state = {
    scene: 'title', // 'title' | 'play' | 'cipher' | 'valve' | 'note' | 'caught' | 'end'
    _prevScene: 'play',
    hasFlashlight: true,
    flashlightOn: true,
    hasGrabpack: false,     // picked up in the Pipe Room tool locker
    elements: { fire: false, thunder: false, earth: false, water: false, air: false },
    selectedElem: null,     // '1'..'5' key selects an unlocked element
    zapFlash: 0,            // visual flash when thunder is used
    pickupFlash: 0,         // visual flash when a major item (Grabpack) is picked up
    panelZapped: false,     // pr_panel hidden coin cache opened via thunder
    socky: { active: false, x: 2040, y: 820, bob: 0, met: false, given: false }, // friendly green helper in Control Room
    hasSquidley: false,     // ally picked up
    hasValveRed: false,
    hasValveBlue: false,
    hasValveYellow: false,
    hasGaugeRed: false,     // readings collected
    hasGaugeBlue: false,
    hasGaugeYellow: false,
    gaugeValues: null,      // randomized on start: {red, blue, yellow} 1-9
    cipherSolved: false,
    valveSolved: false,
    cipherOrder: null,      // correct order e.g. ['bubble','wave','fish','anchor']
    cipherInput: [],
    valveInput: [0, 0, 0],
    coins: 0,
    notes: [],
    searched: new Set(),
    objective: '',
    speakerLine: null,
    speakerT: 0,
    hidden: false,
    muted: false,
    sprint: 0,              // sprint meter 0..1 (for shift burst)
    chase: { active: false, t: 0, duration: 0 },
    alarmFlash: 0,
  };

  // ---------- Audio (reuse L1's audioCtx if exposed) ----------
  let audioCtx = null, masterGain = null;
  function ensureAudio() {
    if (audioCtx) return;
    if (window.__horridorsL1) {
      audioCtx = window.__horridorsL1.audioCtx();
      masterGain = window.__horridorsL1.masterGain();
    }
    if (!audioCtx) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = audioCtx.createGain();
        masterGain.gain.value = 0.5;
        masterGain.connect(audioCtx.destination);
      } catch(e) {}
    }
  }
  function tone(freq, dur=0.15, type='sine', gain=0.18, slideTo=null) {
    if (!audioCtx || state.muted) return;
    try {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type;
      o.frequency.value = freq;
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, audioCtx.currentTime + dur);
      g.gain.value = gain;
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.connect(g); g.connect(masterGain);
      o.start(); o.stop(audioCtx.currentTime + dur);
    } catch(e) {}
  }
  function sfx(name) {
    switch (name) {
      case 'pickup':  tone(520, 0.1, 'triangle', 0.15); setTimeout(() => tone(780, 0.1, 'triangle', 0.15), 60); break;
      case 'drip':    tone(1200, 0.05, 'sine', 0.1, 600); break;
      case 'squelch': tone(180, 0.2, 'sawtooth', 0.12, 90); break;
      case 'click':   tone(900, 0.05, 'square', 0.08); break;
      case 'good':    tone(520, 0.1, 'triangle', 0.15); setTimeout(() => tone(660, 0.1, 'triangle', 0.15), 80); setTimeout(() => tone(880, 0.15, 'triangle', 0.15), 160); break;
      case 'bad':     tone(240, 0.2, 'sawtooth', 0.18, 120); break;
      case 'squid':   tone(660, 0.08, 'sine', 0.12); setTimeout(() => tone(900, 0.08, 'sine', 0.12), 80); setTimeout(() => tone(1100, 0.1, 'sine', 0.1), 160); break;
      case 'jingle':  tone(660, 0.15, 'triangle'); setTimeout(() => tone(880, 0.15, 'triangle'), 120); setTimeout(() => tone(1320, 0.2, 'triangle'), 240); break;
      case 'monster': tone(140, 0.3, 'sawtooth', 0.2, 80); break;
    }
  }

  // Wet ambient hum
  let ambientNodes = null;
  function startAmbient() {
    if (!audioCtx || ambientNodes) return;
    if (window.HorridorsAmbient) {
      ambientNodes = window.HorridorsAmbient.start(audioCtx, masterGain, { mood: 'flooded' });
      window.__horridorsL2Ambient = ambientNodes;
    }
    if (window.HorridorsMusic) window.HorridorsMusic.setTheme(audioCtx, masterGain, 'l2');
  }
  function stopAmbient() {
    try { if (ambientNodes && ambientNodes.stop) ambientNodes.stop(); } catch (e) {}
    ambientNodes = null;
    window.__horridorsL2Ambient = null;
  }

  // ---------- Player ----------
  const PLAYER_SPEED = 175;
  const player = {
    x: 1170, y: 1020, w: 22, h: 22,
    vx: 0, vy: 0,
    facing: 0, // radians
    lastMoveX: 0, lastMoveY: -1,
  };

  // ---------- Squidley ally ----------
  // Floating green squid that follows the player smoothly.
  const squidley = {
    x: 160, y: 760, vx: 0, vy: 0,
    bob: 0, active: false, // becomes true after player picks him up
    // Trailing positions (tentacles wiggle)
    armPhase: 0,
  };

  // ---------- Monster: The Drip ----------
  // Inverse-light mechanic: slow in light, fast in darkness.
  const drip = {
    x: 1700, y: 850, vx: 0, vy: 0, active: false, spotted: 0,
    phase: 0, fleeing: false, respawnCooldown: 0,
  };
  const DRIP_SPEED_DARK = 135;
  const DRIP_SPEED_LIT  = 45;

  // ---------- Walls ----------
  const walls = [];
  function addWall(x, y, w, h, flags={}) { walls.push({ x, y, w, h, ...flags }); }
  function buildWalls() {
    walls.length = 0;
    // World boundary (thick perimeter walls)
    addWall(0, 0, WORLD_W, 40);                 // top
    addWall(0, WORLD_H - 40, WORLD_W, 40);      // bottom
    addWall(0, 0, 40, WORLD_H);                 // left
    addWall(WORLD_W - 40, 0, 40, WORLD_H);      // right

    // Hub horizontal corridor: top & bottom walls with doorways to rooms
    // Top wall of horizontal hub: from hx to hx+hw at y = hy
    const hyTop = HUB.hy;
    const hyBot = HUB.hy + HUB.hh;

    // Top wall pieces; break at pipe-room door and vertical hub opening
    // Vertical hub takes x in [HUB.vx, HUB.vx+HUB.vw] -> gap in hub top wall
    addHorizWallBroken(HUB.hx, hyTop, HUB.hw, [
      { x: HUB.vx, w: HUB.vw }, // vertical hub opening
    ], 10);

    // Bottom wall of horizontal hub: break at exit stairwell (HUB.ex..ex+ew)
    addHorizWallBroken(HUB.hx, hyBot - 10, HUB.hw, [
      { x: HUB.ex, w: HUB.ew },
    ], 10);

    // Vertical hub left & right walls
    // IMPORTANT: break where the horizontal hub crosses (y = HUB.hy .. HUB.hy+HUB.hh)
    const vCrossGap = { y: HUB.hy, h: HUB.hh }; // 760..940
    addVertWallBroken(HUB.vx, HUB.vy, HUB.vh, [vCrossGap], 10);
    addVertWallBroken(HUB.vx + HUB.vw - 10, HUB.vy, HUB.vh, [vCrossGap], 10);

    // Exit stairwell short walls
    addVertWallBroken(HUB.ex, HUB.ey, HUB.eh, [], 10);
    addVertWallBroken(HUB.ex + HUB.ew - 10, HUB.ey, HUB.eh, [], 10);
    addWall(HUB.ex, HUB.ey + HUB.eh - 10, HUB.ew, 10); // exit back wall (will be removed on cleared)

    // --- ROOMS ---
    // Aquarium Room: open on right side into hub horizontal at y=760..940
    const aq = ROOMS.aquarium;
    // top, bottom, left walls
    addWall(aq.left, aq.top, aq.w, 10);
    addWall(aq.left, aq.bottom - 10, aq.w, 10);
    addWall(aq.left, aq.top, 10, aq.h);
    // right wall with doorway at doorY..doorY+hh lined up with hub
    const aqDoorTop = aq.doorY;  // 820 -> matches HUB.hy (760) offset inside hub (800..880)
    const aqDoorH = 120;
    addVertWallBroken(aq.right - 10, aq.top, aq.h, [
      { y: HUB.hy + 20, h: HUB.hh - 40 }
    ], 10);

    // Pipe Room: open on bottom into vertical hub
    const pr = ROOMS.pipe;
    addWall(pr.left, pr.top, pr.w, 10);                      // top
    addWall(pr.left, pr.top, 10, pr.h);                       // left
    addWall(pr.right - 10, pr.top, 10, pr.h);                 // right
    addHorizWallBroken(pr.left, pr.bottom - 10, pr.w, [
      { x: HUB.vx + 10, w: HUB.vw - 20 }
    ], 10);

    // Control Room: open on left into hub horizontal
    const cr = ROOMS.control;
    addWall(cr.left, cr.top, cr.w, 10);
    addWall(cr.left, cr.bottom - 10, cr.w, 10);
    addWall(cr.right - 10, cr.top, 10, cr.h);
    addVertWallBroken(cr.left, cr.top, cr.h, [
      { y: HUB.hy + 20, h: HUB.hh - 40 }
    ], 10);

    // === Furniture (each is a wall + furniture marker) ===
    // Aquarium Room furniture
    addFurn('aq_tank_big',  aq.left + 40,  aq.top + 40,  140, 80, 'tank',    { label: 'big fish tank', note: 'A hand-written sticker: “Do not overfeed Inky Bin.”' });
    addFurn('aq_tank_small',aq.left + 220, aq.top + 40,  80,  60, 'tank',    { label: 'tiny tank (empty)', note: 'Dried coral. Something shiny tumbles out.' });
    addFurn('aq_shelf',     aq.left + 40,  aq.top + 200, 200, 26, 'shelf_aq',{ label: 'supply shelf' });
    addFurn('aq_cabinet',   aq.left + 280, aq.top + 180, 90,  100, 'cabinet', { label: 'cleaning cabinet' });
    addFurn('aq_barrel',    aq.left + 80,  aq.top + 290, 44,  44, 'barrel',  { label: 'bucket', repeat: true });
    addFurn('aq_book',      aq.left + 180, aq.top + 300, 48,  14, 'book',    { label: 'soggy notebook' });
    // Pipe Room furniture
    addFurn('pr_pipes',     pr.left + 40,  pr.top + 40,  200, 30, 'pipes',   { label: 'main pipe array' });
    addFurn('pr_pump',      pr.left + 280, pr.top + 40,  90,  70, 'pump',    { label: 'rusty pump' });
    addFurn('pr_wheel',     pr.left + 40,  pr.top + 150, 60,  60, 'wheel',   { label: 'pipe wheel', action: 'cipher' });
    addFurn('pr_panel',     pr.left + 180, pr.top + 180, 110, 36, 'panel_blue', { label: 'warning panel', repeat: true });
    addFurn('pr_locker',    pr.left + 320, pr.top + 200, 60,  110, 'locker',  { label: 'tool locker', repeat: true });
    addFurn('pr_gauge',     pr.left + 130, pr.top + 260, 50,  50, 'gauge_blue', { label: 'blue pressure gauge', action: 'gaugeBlue' });
    // Control Room furniture
    addFurn('cr_panel',     cr.left + 40,  cr.top + 40,  300, 40, 'panel_big', { label: 'main control panel', action: 'valve' });
    addFurn('cr_console',   cr.left + 40,  cr.top + 110, 100, 80, 'console', { label: 'computer console' });
    addFurn('cr_locker',    cr.left + 200, cr.top + 120, 60,  110, 'locker',  { label: 'officer locker' });
    addFurn('cr_chair',     cr.left + 280, cr.top + 140, 40,  40, 'chair',   { label: 'office chair', repeat: true });
    addFurn('cr_crate',     cr.left + 50,  cr.top + 260, 80,  60, 'crate',   { label: 'red crate' });
    addFurn('cr_gauge',     cr.left + 260, cr.top + 240, 50,  50, 'gauge_red', { label: 'red pressure gauge', action: 'gaugeRed' });
    // Hub furniture
    // All hub furniture hugs the top wall (y = HUB.hy+14 onward) so player has a clear path below
    addFurn('hub_crate1',   HUB.hx + 180, HUB.hy + 14, 60, 40, 'crate',    { label: 'floating crate', repeat: true });
    addFurn('hub_gauge',    HUB.vx + 20,  HUB.vy + 120, 40, 60, 'gauge_yellow', { label: 'yellow pressure gauge', action: 'gaugeYellow' });
    addFurn('hub_board',    HUB.hx + 540, HUB.hy + 14, 140, 36, 'board',   { label: 'notice board' });
    addFurn('hub_barrel',   HUB.hx + 1500,HUB.hy + 14, 44, 44, 'barrel',   { label: 'drum', repeat: true });
  }
  function addHorizWallBroken(x, y, w, gaps, thick) {
    // Sort gaps by x
    gaps.sort((a,b) => a.x - b.x);
    let cx = x;
    for (const g of gaps) {
      const segW = g.x - cx;
      if (segW > 0) addWall(cx, y, segW, thick);
      cx = g.x + g.w;
    }
    if (cx < x + w) addWall(cx, y, x + w - cx, thick);
  }
  function addVertWallBroken(x, y, h, gaps, thick) {
    gaps.sort((a,b) => a.y - b.y);
    let cy = y;
    for (const g of gaps) {
      const segH = g.y - cy;
      if (segH > 0) addWall(x, cy, thick, segH);
      cy = g.y + g.h;
    }
    if (cy < y + h) addWall(x, cy, thick, y + h - cy);
  }

  // ---------- Furniture ----------
  const furniture = [];
  function addFurn(id, x, y, w, h, art, opts={}) {
    const f = { id, x, y, w, h, art, ...opts };
    furniture.push(f);
    // Also collide unless explicitly non-solid
    if (!opts.nonSolid) addWall(x, y, w, h, { _isFurn: true });
  }

  // ---------- Items ----------
  const items = [];
  function addItem(it) { items.push(it); }

  // Spawn the Water crystal inside the aquarium room (bottom, by the tank).
  // Safe to call multiple times — noop if already spawned or already owned.
  function spawnWaterCrystal() {
    if (!window.HorridorsWallet) return;
    if (!window.HorridorsWallet.hasGrabpack()) return;
    if (window.HorridorsWallet.hasElement('water')) return;
    if (items.some(it => it.icon === 'crystal' && it.element === 'water')) return;
    addItem({
      x: ROOMS.aquarium.left + 80, y: ROOMS.aquarium.bottom - 80,
      w: 22, h: 22, icon: 'crystal', element: 'water',
      prompt: '💧 Pick up the Water crystal',
      onPickup() {
        sfx('good');
        if (window.HorridorsWallet) window.HorridorsWallet.unlockElement('water');
        state.elements.water = true;
        speak('💧 WATER crystal! Your Grabpack drinks it right up.', 3800);
        if (window.HorridorsStory) window.HorridorsStory.addCoins(3);
        state.coins += 3;
      }
    });
  }

  function collectItem(idx) {
    const it = items[idx];
    if (!it) return;
    it.onPickup && it.onPickup();
    items.splice(idx, 1);
  }

  // ---------- Notes ----------
  function addNote(title, text) {
    state.notes.push({ title, text });
    openNoteOverlay(title, text);
    rebuildNotesList();
    sfx('pickup');
  }
  const overlayNote = document.getElementById('overlay-note');
  const overlayNotes = document.getElementById('overlay-notes');
  const notesList = document.getElementById('notes-list');
  function openNoteOverlay(title, text) {
    document.getElementById('note-title').textContent = title;
    document.getElementById('note-text').innerHTML = text;
    overlayNote.classList.remove('hidden');
    state._prevScene = state.scene;
    state.scene = 'note';
  }
  function closeNote() {
    overlayNote.classList.add('hidden');
    if (state.scene === 'note') state.scene = state._prevScene || 'play';
  }
  function rebuildNotesList() {
    if (!notesList) return;
    notesList.innerHTML = state.notes.map(n =>
      `<div class="note-entry"><div class="note-entry-title">${escapeHtml(n.title)}</div><div class="note-entry-text">${n.text}</div></div>`
    ).join('') || '<div class="notes-empty">No notes yet. Keep searching.</div>';
  }
  function escapeHtml(s) { return s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

  // ---------- Speaker / subtitle ----------
  const subtitle = document.getElementById('subtitle');
  const _kl = (t) => (window.HorridorsTouch && window.HorridorsTouch.keyLabel) ? window.HorridorsTouch.keyLabel(t) : t;
  function speak(line, ms=3000) {
    const L = _kl(line);
    state.speakerLine = L; state.speakerT = ms/1000;
    subtitle.textContent = L;
    subtitle.classList.remove('hidden');
  }
  function tickSpeaker(dt) {
    if (state.speakerT > 0) {
      state.speakerT -= dt;
      if (state.speakerT <= 0) { subtitle.textContent = ''; state.speakerLine = null; }
    }
  }

  // ---------- Objective / HUD (drawn on canvas for L2) ----------
  function setObjective(o) { state.objective = _kl(o); }

  // ---------- Search handlers ----------
  const SEARCH = {
    aq_tank_big() {
      if (!state.hasSquidley) {
        state.hasSquidley = true;
        squidley.active = true;
        squidley.x = player.x + 24; squidley.y = player.y - 10;
        speak('A little green squid squirms onto your shoulder. He glows faintly.', 4200);
        sfx('squid');
        setObjective('Search every room. Find 3 gauges + 1 pipe wheel + the exit.');
        return;
      }
      speak('Inky Bin\'s old tank. Empty now.', 2600);
    },
    aq_tank_small() {
      if (state.searched.has('aq_tank_small')) { speak('Just dried coral.', 1800); return; }
      state.coins += 2; if(window.HorridorsWallet)window.HorridorsWallet.addCoins(2); if(window.HorridorsStory)window.HorridorsStory.addCoins(2); sfx('pickup');
      speak('A tiny treasure pouch tumbles out. +2 coins.', 2600);
    },
    aq_shelf() {
      if (state.searched.has('aq_shelf')) return;
      addNote('Janitor\'s clipboard', 'Remember the order: water always fills the <b>bubble</b> pipe first. Then the <b>wave</b>. Then the <b>fish</b>. Last the <b>anchor</b>.');
    },
    aq_cabinet() {
      if (state.searched.has('aq_cabinet')) return;
      if (!state.hasValveRed) {
        state.hasValveRed = true;
        speak('You found a RED valve handle hidden behind the bleach.', 3200);
        sfx('pickup');
        return;
      }
      speak('Cleaning supplies. That\'s it.', 1800);
    },
    aq_barrel() { speak('Empty. Smells like a fish tank.', 1800); },
    aq_book() {
      if (state.searched.has('aq_book')) return;
      addNote('Soggy notebook, page 4', 'Dear journal. Today I noticed the <b>yellow gauge</b> ticked up to <b>' + state.gaugeValues.yellow + '</b>. Sam says that\'s normal.');
      state.hasGaugeYellow = true;
    },
    pr_pipes() {
      speak('Big rattly pipes. Cold to the touch.', 2000);
    },
    pr_pump() {
      if (state.searched.has('pr_pump')) return;
      addNote('Pump sticker', 'If the panels blink red, turn the pipe wheel in the correct order. Water remembers where it came from.');
    },
    pr_wheel() {
      if (state.cipherSolved) { speak('The wheel won\'t turn anymore. It\'s set.', 2000); return; }
      openCipher();
    },
    pr_panel() {
      // Thunder zap unlocks a hidden coin cache behind the panel
      if (state.hasGrabpack && state.elements.thunder && state.selectedElem === 'thunder' && !state.panelZapped) {
        state.panelZapped = true;
        state.zapFlash = 0.9;
        state.coins += 5; if(window.HorridorsWallet)window.HorridorsWallet.addCoins(5); if (window.HorridorsStory) window.HorridorsStory.addCoins(5);
        speak('ZZZAP! The panel coughs open — a little coin stash rolls out. +5 coins.', 3800);
        sfx('good');
        return;
      }
      if (state.searched.has('pr_panel')) {
        if (state.hasGrabpack && !state.elements.thunder) {
          speak('The panel is stuck. Maybe a jolt would wake it up.', 2600);
        } else if (state.panelZapped) {
          speak('You already cracked it open.', 1800);
        } else {
          speak('A dusty warning panel. Feels stuck.', 2200);
        }
        return;
      }
      addNote('Warning panel', 'DO NOT RUN THE PUMPS OUT OF ORDER. Use the chart in the notice board. (The cover feels <i>stuck</i> — maybe a jolt would pop it open one day.)');
    },
    pr_locker() {
      if (!state.hasValveBlue) {
        state.hasValveBlue = true;
        speak('A BLUE valve handle is tucked behind greasy gloves. There\'s more stuff in there — search it again.', 4400);
        sfx('pickup');
        return;
      }
      if (!state.hasGrabpack) {
        state.hasGrabpack = true;
        if (window.HorridorsWallet && window.HorridorsWallet.giveGrabpack) window.HorridorsWallet.giveGrabpack();
        // Now that the Grabpack is equipped, spawn the Water crystal so the
        // player can actually find it in this level.
        spawnWaterCrystal();
        state.flashlightOn = true;
        state.pickupFlash = 1.4; // bright flash that fades
        addNote('🧤 THE GRABPACK', 'You found the <b>GRABPACK</b>!<br/><br/>It\'s a chunky backpack with a <b>stretchy glove arm</b> called the <b>ELEMENTAL HAND</b>. Your flashlight just clicked right into its palm.<br/><br/>Five empty crystal sockets on the wrist hum faintly:<br/>🔥 <b>Fire</b> • ⚡ <b>Thunder</b> • 🪨 <b>Earth</b> • 💧 <b>Water</b> • 💨 <b>Air</b><br/><br/>New friends in these walls know how to unlock them.<br/><br/><b style="color:#ffd866">HOW TO USE:</b><br/>• Press <b>1–5</b> to pick an element<br/>• Press <b>E</b> to shoot or use it<br/>• Find crystals to unlock each slot');
        speak('🧤 THE GRABPACK! Press 1–5 to pick an element, then E to use it.', 6000);
        sfx('good');
        setTimeout(() => sfx('jingle'), 300);
        if (window.refreshChecklist) window.refreshChecklist();
        return;
      }
      speak('Just gloves and a wrench.', 1800);
    },
    pr_gauge() {
      if (state.searched.has('pr_gauge')) return;
      state.hasGaugeBlue = true;
      speak('BLUE gauge reads: ' + state.gaugeValues.blue, 3000);
      addNote('Blue gauge reading', 'BLUE gauge reading: <b>' + state.gaugeValues.blue + '</b>');
      sfx('click');
    },
    cr_panel() {
      if (!state.cipherSolved) { speak('The panel is dead. The pipes need to be primed first.', 2800); return; }
      if (!(state.hasValveRed && state.hasValveBlue && state.hasValveYellow)) { speak('The sockets on the panel are empty. Find the 3 valve handles.', 3400); return; }
      openValve();
    },
    cr_console() {
      if (state.searched.has('cr_console')) return;
      addNote('Login screen', '&gt; DRAIN PROTOCOL<br/>&gt; Enter the three gauge readings into the three valves:<br/>&gt; RED · BLUE · YELLOW<br/>&gt; All three must match.');
    },
    cr_locker() {
      if (state.searched.has('cr_locker')) return;
      if (!state.hasValveYellow) {
        state.hasValveYellow = true;
        speak('A YELLOW valve handle is on the top shelf.', 3200);
        sfx('pickup');
        return;
      }
      speak('An officer\'s spare hat.', 1800);
    },
    cr_chair() { speak('Someone spun it very recently.', 1800); },
    cr_crate() {
      if (state.searched.has('cr_crate')) return;
      state.coins += 3; if(window.HorridorsWallet)window.HorridorsWallet.addCoins(3); if(window.HorridorsStory)window.HorridorsStory.addCoins(3); sfx('pickup');
      speak('Three coins clink in the bottom. +3 coins.', 2600);
    },
    cr_gauge() {
      if (state.searched.has('cr_gauge')) return;
      state.hasGaugeRed = true;
      speak('RED gauge reads: ' + state.gaugeValues.red, 3000);
      addNote('Red gauge reading', 'RED gauge reading: <b>' + state.gaugeValues.red + '</b>');
      sfx('click');
    },
    hub_crate1() { speak('Too heavy to lift. Floats a little.', 1800); },
    hub_gauge() {
      if (state.searched.has('hub_gauge')) return;
      state.hasGaugeYellow = true;
      speak('YELLOW gauge reads: ' + state.gaugeValues.yellow, 3000);
      addNote('Yellow gauge reading', 'YELLOW gauge reading: <b>' + state.gaugeValues.yellow + '</b>');
      sfx('click');
    },
    hub_board() {
      if (state.searched.has('hub_board')) {
        speak('You already read the notice. Bubble, wave, fish, anchor.', 2600);
        return;
      }
      addNote('Notice board', 'WATER FILL ORDER (poster, faded):<br/>1) BUBBLE  2) WAVE  3) FISH  4) ANCHOR<br/>— The Groundskeeper');
    },
    hub_barrel() { speak('Smells awful. Empty.', 1800); },
  };

  // ---------- Socky Shok (friendly NPC dialog) ----------
  function talkToSocky() {
    if (!state.socky.met) {
      state.socky.met = true;
      addNote('Socky Shok', 'I met a little green guy in the Control Room. He\'s called <b>Socky Shok</b>. He barely says anything, but he gave me a buzzing <b>THUNDER</b> crystal for my Grabpack. He seems nice. Smells like a battery.');
      speak('“Hi. I\'m Socky Shok. You like thunder? Here.”', 4200);
      sfx('squid');
      return;
    }
    if (!state.socky.given) {
      // Gift the thunder crystal if the player has the Grabpack
      if (!state.hasGrabpack) {
        speak('“You got a Grabpack? I\'ve got a zappy crystal for it.”', 3400);
        return;
      }
      state.elements.thunder = true;
      if (window.HorridorsWallet && window.HorridorsWallet.unlockElement) window.HorridorsWallet.unlockElement('thunder');
      state.socky.given = true;
      state.selectedElem = 'thunder';
      state.zapFlash = 0.6;
      speak('⚡ THUNDER crystal slotted into your Grabpack! Press 2 to aim it, E to zap.', 5200);
      sfx('good');
      if (window.refreshChecklist) window.refreshChecklist();
      return;
    }
    // Repeat dialog
    const lines = [
      '“Bzzzt. Nice day.”',
      '“Try zapping something stuck.”',
      '“I like your raincoat.”',
      '“Mother? Dunno who that is. Sorry.”',
      '“…bzzzt.”',
    ];
    speak(lines[Math.floor(Math.random()*lines.length)], 2800);
  }

  // ---------- Drip monster ----------
  function spawnDrip() {
    if (drip.active) return;
    drip.active = true;
    drip.x = HUB.hx + HUB.hw - 180;
    drip.y = HUB.hy + 60;
    sfx('monster');
    speak('The pipes clang. Something wet steps out.', 3200);
  }
  function killPlayer(by) {
    if (state.scene !== 'play') return;
    state.scene = 'caught';
    const cap = document.getElementById('caught-whisper');
    if (cap) cap.textContent = by === 'drip' ? '"drip… drip… found you."' : '"Found you."';
    document.getElementById('overlay-caught').classList.remove('hidden');
    sfx('bad');
  }

  // ---------- Collisions ----------
  function rectsIntersect(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  function moveEntity(ent, dx, dy) {
    // X
    ent.x += dx;
    for (const w of walls) {
      if (rectsIntersect(ent, w)) {
        if (dx > 0) ent.x = w.x - ent.w;
        else if (dx < 0) ent.x = w.x + w.w;
      }
    }
    // Y
    ent.y += dy;
    for (const w of walls) {
      if (rectsIntersect(ent, w)) {
        if (dy > 0) ent.y = w.y - ent.h;
        else if (dy < 0) ent.y = w.y + w.h;
      }
    }
  }

  // ---------- Interactables ----------
  function nearestInteractable() {
    const cx = player.x + player.w/2, cy = player.y + player.h/2;
    let best = null, bestD = 110 * 110;
    // items
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const dx = it.x - cx, dy = it.y - cy;
      const d = dx*dx + dy*dy;
      if (d < bestD) { bestD = d; best = { type: 'item', idx: i, label: it.prompt || 'Pick up' }; }
    }
    // furniture
    for (const f of furniture) {
      const fx = f.x + f.w/2, fy = f.y + f.h/2;
      const dx = fx - cx, dy = fy - cy;
      const d = dx*dx + dy*dy;
      if (d < bestD) {
        const already = state.searched.has(f.id);
        const label = f.action === 'cipher' ? 'Turn the pipe wheel'
                    : f.action === 'valve' ? 'Use control panel'
                    : (already && !f.repeat ? 'Already searched' : 'Search ' + (f.label || 'it'));
        bestD = d; best = { type: 'furn', f, label };
      }
    }
    // Socky Shok NPC
    if (state.socky.active) {
      const dx = state.socky.x - cx, dy = state.socky.y - cy;
      const d = dx*dx + dy*dy;
      if (d < bestD) {
        bestD = d;
        best = { type: 'socky', label: state.socky.met ? 'Chat with Socky Shok' : 'Say hi to the green guy' };
      }
    }
    // exit
    if (state.valveSolved) {
      const ex = EXIT.x + EXIT.w/2, ey = EXIT.y + EXIT.h/2;
      const dx = ex - cx, dy = ey - cy;
      const d = dx*dx + dy*dy;
      if (d < bestD) { bestD = d; best = { type: 'exit', label: 'Climb the stairs' }; }
    }
    return best;
  }

  // ---------- Cipher overlay ----------
  const overlayCipher = document.getElementById('overlay-cipher');
  const cipherStatus = document.getElementById('cipher-status');
  function openCipher() {
    state._prevScene = state.scene;
    state.scene = 'cipher';
    state.cipherInput = [];
    overlayCipher.classList.remove('hidden');
    refreshCipherUI();
    cipherStatus.textContent = '';
  }
  function closeCipher() {
    overlayCipher.classList.add('hidden');
    if (state.scene === 'cipher') state.scene = 'play';
  }
  function refreshCipherUI() {
    const slots = overlayCipher.querySelectorAll('.cipher-slot');
    slots.forEach((s, i) => {
      const val = state.cipherInput[i];
      if (val) { s.textContent = val; s.classList.add('filled'); }
      else { s.textContent = '?'; s.classList.remove('filled'); }
    });
    const btns = overlayCipher.querySelectorAll('.pipe-btn');
    btns.forEach(b => {
      const sym = b.getAttribute('data-symbol');
      if (state.cipherInput.includes(sym)) b.classList.add('used');
      else b.classList.remove('used');
    });
  }
  overlayCipher.querySelectorAll('.pipe-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (state.scene !== 'cipher') return;
      const sym = btn.getAttribute('data-symbol');
      if (state.cipherInput.includes(sym)) return;
      state.cipherInput.push(sym);
      sfx('click');
      refreshCipherUI();
      if (state.cipherInput.length === state.cipherOrder.length) {
        // Check
        const ok = state.cipherInput.every((s, i) => s === state.cipherOrder[i]);
        if (ok) {
          state.cipherSolved = true;
          cipherStatus.textContent = 'The pipes groan. Water rushes.';
          cipherStatus.style.color = '#7ee2a8';
          sfx('good');
          speak('The pipes hissed awake. The main control panel should work now.', 3600);
          setObjective('Bring 3 valve handles + 3 gauge readings to the Control Room panel.');
          setTimeout(closeCipher, 1400);
        } else {
          cipherStatus.textContent = 'The pipes shudder. That wasn\'t right.';
          cipherStatus.style.color = '#ff7a8c';
          sfx('bad');
          setTimeout(() => { state.cipherInput = []; refreshCipherUI(); cipherStatus.textContent = 'Try again.'; }, 1000);
        }
      }
    });
  });
  document.getElementById('btn-cipher-close').addEventListener('click', closeCipher);

  // ---------- Valve overlay ----------
  const overlayValve = document.getElementById('overlay-valve');
  const valveStatus = document.getElementById('valve-status');
  function openValve() {
    state._prevScene = state.scene;
    state.scene = 'valve';
    overlayValve.classList.remove('hidden');
    refreshValveUI();
    // Hint sub
    document.getElementById('valve-sub').innerHTML = [
      'RED reading: ' + (state.hasGaugeRed ? state.gaugeValues.red : '?'),
      'BLUE reading: ' + (state.hasGaugeBlue ? state.gaugeValues.blue : '?'),
      'YELLOW reading: ' + (state.hasGaugeYellow ? state.gaugeValues.yellow : '?'),
    ].join(' &nbsp;·&nbsp; ');
  }
  function closeValve() {
    overlayValve.classList.add('hidden');
    if (state.scene === 'valve') state.scene = 'play';
  }
  function refreshValveUI() {
    for (let i = 0; i < 3; i++) {
      document.getElementById('vw' + i).textContent = state.valveInput[i];
    }
  }
  overlayValve.querySelectorAll('.vw-btn').forEach(b => {
    b.addEventListener('click', () => {
      if (state.scene !== 'valve') return;
      const w = +b.getAttribute('data-w');
      const dir = +b.getAttribute('data-dir');
      state.valveInput[w] = (state.valveInput[w] + dir + 10) % 10;
      sfx('click');
      refreshValveUI();
    });
  });
  document.getElementById('btn-valve-try').addEventListener('click', () => {
    if (state.scene !== 'valve') return;
    const want = [state.gaugeValues.red, state.gaugeValues.blue, state.gaugeValues.yellow];
    const ok = state.valveInput.every((v, i) => v === want[i]);
    if (ok) {
      state.valveSolved = true;
      valveStatus.textContent = 'CLUNK — the flood drains. Stairs unlocked.';
      valveStatus.style.color = '#7ee2a8';
      sfx('good');
      speak('The water drains. A staircase appears in the floor.', 3600);
      setObjective('Climb the stairs to escape.');
      setTimeout(closeValve, 1600);
    } else {
      valveStatus.textContent = 'Nothing clicks. The readings don\'t match.';
      valveStatus.style.color = '#ff7a8c';
      sfx('bad');
    }
  });
  document.getElementById('btn-valve-close').addEventListener('click', closeValve);

  // ---------- Drawing ----------
  function inView(x, y, w, h) {
    return x + w > camera.x && x < camera.x + VIEW_W && y + h > camera.y && y < camera.y + VIEW_H;
  }

  function drawFloors() {
    // Dark water base
    ctx.fillStyle = '#071018';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // Hub (flooded floor, teal)
    drawTile(HUB.hx, HUB.hy, HUB.hw, HUB.hh, '#123d4a', true);
    drawTile(HUB.vx, HUB.vy, HUB.vw, HUB.vh, '#123d4a', true);
    drawTile(HUB.ex, HUB.ey, HUB.ew, HUB.eh, '#0f3540', true);

    // Rooms
    drawTile(ROOMS.aquarium.left, ROOMS.aquarium.top, ROOMS.aquarium.w, ROOMS.aquarium.h, '#183f4a', false);
    drawTile(ROOMS.pipe.left, ROOMS.pipe.top, ROOMS.pipe.w, ROOMS.pipe.h, '#1a2a3c', false);
    drawTile(ROOMS.control.left, ROOMS.control.top, ROOMS.control.w, ROOMS.control.h, '#2a1a2a', false);

    // Room labels on floor (subtle)
    ctx.save();
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = '#bfeee0';
    ctx.font = '700 22px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('AQUARIUM', ROOMS.aquarium.cx - camera.x, ROOMS.aquarium.cy - camera.y + 180);
    ctx.fillText('PIPES', ROOMS.pipe.cx - camera.x, ROOMS.pipe.cy - camera.y + 180);
    ctx.fillText('CONTROL', ROOMS.control.cx - camera.x, ROOMS.control.cy - camera.y + 180);
    ctx.restore();

    // Water overlay on hub (animated ripples)
    drawWater(HUB.hx, HUB.hy, HUB.hw, HUB.hh);
    drawWater(HUB.vx, HUB.vy, HUB.vw, HUB.vh);
    if (!state.valveSolved) drawWater(HUB.ex, HUB.ey, HUB.ew, HUB.eh);

    // Exit stairs (visible once solved)
    if (state.valveSolved) {
      const ex = HUB.ex - camera.x, ey = HUB.ey - camera.y;
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = i % 2 ? '#5b6b75' : '#3b4651';
        ctx.fillRect(ex + 8, ey + 10 + i * 22, HUB.ew - 16, 18);
      }
      ctx.fillStyle = '#f5e6a8';
      ctx.font = '700 14px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('↑ EXIT ↑', ex + HUB.ew/2, ey + 8);
    }
  }

  function drawTile(x, y, w, h, base, wet) {
    if (!inView(x, y, w, h)) return;
    ctx.fillStyle = base;
    ctx.fillRect(x - camera.x, y - camera.y, w, h);
    // Tile grid
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let gx = x; gx < x + w; gx += 60) {
      ctx.beginPath(); ctx.moveTo(gx - camera.x + 0.5, y - camera.y); ctx.lineTo(gx - camera.x + 0.5, y - camera.y + h); ctx.stroke();
    }
    for (let gy = y; gy < y + h; gy += 60) {
      ctx.beginPath(); ctx.moveTo(x - camera.x, gy - camera.y + 0.5); ctx.lineTo(x - camera.x + w, gy - camera.y + 0.5); ctx.stroke();
    }
  }

  function drawWater(x, y, w, h) {
    if (!inView(x, y, w, h)) return;
    const t = performance.now() / 1000;
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#2ba1b5';
    ctx.fillRect(x - camera.x, y - camera.y, w, h);
    // Ripples
    ctx.globalAlpha = 0.15;
    ctx.strokeStyle = '#bff2ff';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 6; i++) {
      const cx = x + ((i * 83 + Math.sin(t + i) * 40) % w);
      const cy = y + ((i * 61 + Math.cos(t * 0.8 + i) * 30) % h);
      ctx.beginPath();
      ctx.arc(cx - camera.x, cy - camera.y, 10 + (Math.sin(t * 2 + i) + 1) * 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawWalls() {
    for (const w of walls) {
      if (w._isFurn) continue;
      if (!inView(w.x, w.y, w.w, w.h)) continue;
      ctx.fillStyle = '#2a3742';
      ctx.fillRect(w.x - camera.x, w.y - camera.y, w.w, w.h);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(w.x - camera.x, w.y - camera.y, w.w, 2);
    }
  }

  function drawFurn(f) {
    if (!inView(f.x, f.y, f.w, f.h)) return;
    const x = f.x - camera.x, y = f.y - camera.y;
    ctx.save();
    switch (f.art) {
      case 'tank': {
        // Glass tank
        ctx.fillStyle = '#2a6b7a';
        ctx.fillRect(x, y, f.w, f.h);
        ctx.fillStyle = 'rgba(180, 240, 255, 0.25)';
        ctx.fillRect(x + 3, y + 3, f.w - 6, f.h - 6);
        ctx.strokeStyle = '#5a7680';
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 0.5, y + 0.5, f.w - 1, f.h - 1);
        // Bubbles
        const t = performance.now() / 700;
        for (let i = 0; i < 4; i++) {
          const bx = x + 10 + i * (f.w / 5);
          const by = y + f.h - ((t * 8 + i * 17) % (f.h - 4));
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.beginPath(); ctx.arc(bx, by, 2 + (i%2), 0, Math.PI*2); ctx.fill();
        }
        // If big tank and Squidley not yet picked up, show him inside
        if (f.id === 'aq_tank_big' && !state.hasSquidley) {
          drawSquidDrawing(x + f.w/2, y + f.h/2 + 6, 16, performance.now()/400, 1);
        }
        break;
      }
      case 'shelf_aq': {
        ctx.fillStyle = '#6b4a2a';
        ctx.fillRect(x, y, f.w, f.h);
        // jars
        for (let i = 0; i < 4; i++) {
          const jx = x + 10 + i * (f.w/4);
          ctx.fillStyle = ['#7ad7ff','#ffd68a','#b99cff','#bff0d0'][i];
          ctx.fillRect(jx, y - 14, 14, 14);
          ctx.fillStyle = '#3a2a1a';
          ctx.fillRect(jx, y - 16, 14, 3);
        }
        break;
      }
      case 'cabinet': {
        ctx.fillStyle = '#4b7f88';
        ctx.fillRect(x, y, f.w, f.h);
        ctx.fillStyle = '#355f67';
        ctx.fillRect(x + 5, y + 5, f.w - 10, f.h - 10);
        ctx.fillStyle = '#e8eef0';
        ctx.fillRect(x + f.w/2 - 2, y + f.h/2 - 2, 4, 4);
        break;
      }
      case 'barrel': {
        ctx.fillStyle = '#5b3a22';
        ctx.fillRect(x, y, f.w, f.h);
        ctx.strokeStyle = '#3a240f';
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) ctx.strokeRect(x + 2, y + 6 + i*12, f.w - 4, 2);
        break;
      }
      case 'book': {
        ctx.fillStyle = '#5c2a2a';
        ctx.fillRect(x, y, f.w, f.h);
        ctx.fillStyle = '#f5d06b';
        ctx.fillRect(x + 2, y + 2, f.w - 4, 2);
        break;
      }
      case 'pipes': {
        ctx.fillStyle = '#9aa8b0';
        ctx.fillRect(x, y, f.w, f.h);
        ctx.fillStyle = '#6d7a82';
        for (let i = 0; i < 4; i++) ctx.fillRect(x + i * 50, y, 6, f.h);
        // Drip
        const t = performance.now() / 500;
        ctx.fillStyle = 'rgba(126,226,255,0.9)';
        ctx.beginPath();
        ctx.arc(x + 30, y + f.h + 4 + Math.sin(t) * 3, 2.5, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'pump': {
        ctx.fillStyle = '#6a7480';
        ctx.fillRect(x, y, f.w, f.h);
        ctx.fillStyle = '#c04242';
        ctx.beginPath();
        ctx.arc(x + f.w/2, y + f.h/2, 14, 0, Math.PI*2);
        ctx.fill();
        ctx.fillStyle = '#222';
        ctx.fillRect(x + f.w/2 - 1, y + f.h/2 - 10, 2, 20);
        break;
      }
      case 'wheel': {
        // Pipe wheel (interact to open cipher)
        ctx.fillStyle = '#3a4d56';
        ctx.fillRect(x, y, f.w, f.h);
        const cx = x + f.w/2, cy = y + f.h/2;
        ctx.strokeStyle = state.cipherSolved ? '#7ee2a8' : '#d5a64e';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(cx, cy, f.w/2 - 6, 0, Math.PI*2);
        ctx.stroke();
        // spokes
        const rotRef = performance.now()/800 * (state.cipherSolved ? 0.2 : 0);
        for (let i = 0; i < 4; i++) {
          const a = rotRef + i * Math.PI/2;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.cos(a) * (f.w/2 - 8), cy + Math.sin(a) * (f.w/2 - 8));
          ctx.stroke();
        }
        if (!state.cipherSolved) {
          ctx.fillStyle = '#ffda6a'; ctx.font = '700 10px Inter, sans-serif'; ctx.textAlign = 'center';
          ctx.fillText('!', cx, cy + 3);
        }
        break;
      }
      case 'panel_blue': {
        ctx.fillStyle = '#1c3a55';
        ctx.fillRect(x, y, f.w, f.h);
        for (let i = 0; i < 5; i++) {
          ctx.fillStyle = (Math.sin(performance.now()/400 + i) > 0) ? '#7ad7ff' : '#2a5a7a';
          ctx.fillRect(x + 6 + i * 20, y + 8, 10, 10);
        }
        break;
      }
      case 'panel_big': {
        ctx.fillStyle = state.cipherSolved ? '#2b4c24' : '#3a1a1a';
        ctx.fillRect(x, y, f.w, f.h);
        for (let i = 0; i < 8; i++) {
          const on = state.cipherSolved && (Math.sin(performance.now()/300 + i) > 0);
          ctx.fillStyle = on ? '#7ee2a8' : (state.cipherSolved ? '#294823' : '#6a2a2a');
          ctx.fillRect(x + 8 + i * 34, y + 10, 24, 20);
        }
        ctx.fillStyle = '#f5e6a8';
        ctx.font = '700 10px Inter, sans-serif'; ctx.textAlign = 'left';
        ctx.fillText(state.cipherSolved ? 'READY' : 'OFFLINE', x + 8, y + f.h - 4);
        break;
      }
      case 'locker': {
        ctx.fillStyle = '#5b6b75';
        ctx.fillRect(x, y, f.w, f.h);
        ctx.fillStyle = '#3b4651';
        ctx.fillRect(x + 4, y + 4, f.w - 8, f.h - 8);
        ctx.fillStyle = '#c0cbd2';
        ctx.fillRect(x + f.w - 10, y + f.h/2 - 2, 4, 4);
        break;
      }
      case 'gauge_red':
      case 'gauge_blue':
      case 'gauge_yellow': {
        ctx.fillStyle = '#2a2a33';
        ctx.fillRect(x, y, f.w, f.h);
        const cx = x + f.w/2, cy = y + f.h/2;
        ctx.fillStyle = '#f7e9cf';
        ctx.beginPath(); ctx.arc(cx, cy, f.w/2 - 6, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#1a1a22'; ctx.lineWidth = 2;
        ctx.stroke();
        // needle pointing toward value (0..9 -> -135..+135 deg)
        const v = f.art === 'gauge_red' ? state.gaugeValues.red
                : f.art === 'gauge_blue' ? state.gaugeValues.blue
                : state.gaugeValues.yellow;
        const a = (-135 + (v / 9) * 270) * Math.PI/180;
        ctx.strokeStyle = f.art === 'gauge_red' ? '#ff5a5a' : f.art === 'gauge_blue' ? '#5aa0ff' : '#ffdc5a';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * (f.w/2 - 10), cy + Math.sin(a) * (f.w/2 - 10)); ctx.stroke();
        ctx.fillStyle = '#1a1a22'; ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI*2); ctx.fill();
        // Color tag
        ctx.fillStyle = f.art === 'gauge_red' ? '#ff5a5a' : f.art === 'gauge_blue' ? '#5aa0ff' : '#ffdc5a';
        ctx.fillRect(x + 2, y + 2, 6, 6);
        break;
      }
      case 'console': {
        ctx.fillStyle = '#2a2a33';
        ctx.fillRect(x, y, f.w, f.h);
        ctx.fillStyle = '#072a14';
        ctx.fillRect(x + 6, y + 6, f.w - 12, f.h - 26);
        ctx.fillStyle = '#7ee2a8';
        ctx.font = '10px monospace';
        const t = Math.floor(performance.now()/200) % 3;
        ctx.fillText('> SYSTEM' + '.'.repeat(t), x + 10, y + 22);
        break;
      }
      case 'chair': {
        ctx.fillStyle = '#2a2a33'; ctx.fillRect(x, y, f.w, f.h);
        ctx.fillStyle = '#4a4a55'; ctx.fillRect(x + 4, y + 4, f.w - 8, f.h - 8);
        break;
      }
      case 'crate': {
        ctx.fillStyle = '#7b4a2a'; ctx.fillRect(x, y, f.w, f.h);
        ctx.strokeStyle = '#4a2a1a'; ctx.lineWidth = 2;
        ctx.strokeRect(x + 1.5, y + 1.5, f.w - 3, f.h - 3);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + f.w, y + f.h); ctx.moveTo(x + f.w, y); ctx.lineTo(x, y + f.h); ctx.stroke();
        break;
      }
      case 'board': {
        ctx.fillStyle = '#3a2f20'; ctx.fillRect(x, y, f.w, f.h);
        ctx.fillStyle = '#e8dfc4'; ctx.fillRect(x + 4, y + 4, f.w - 8, f.h - 8);
        ctx.fillStyle = '#1a1a22'; ctx.font = '9px Inter, sans-serif';
        ctx.fillText('NOTICES', x + 8, y + 16);
        ctx.fillStyle = '#8a7b55';
        for (let i = 0; i < 4; i++) ctx.fillRect(x + 8, y + 22 + i * 8, 50, 2);
        break;
      }
    }
    ctx.restore();
  }

  // Draw a squid (reused for tank + ally)
  function drawSquidDrawing(cx, cy, size, t, alpha) {
    // Inky Bin — dark teal octopus with 5 tentacles, sharp angry eyes, tufts on head
    ctx.save();
    ctx.globalAlpha = alpha;
    // Body (rounded teal)
    const grad = ctx.createRadialGradient(cx, cy - size * 0.4, 2, cx, cy, size * 1.1);
    grad.addColorStop(0, '#4ac8a0');
    grad.addColorStop(0.6, '#2a8a6a');
    grad.addColorStop(1, '#155a44');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(cx, cy - size * 0.3, size * 0.9, size * 1.0, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0c3a2a'; ctx.lineWidth = 1.6;
    ctx.stroke();

    // Tufts / spikes on top of head (3 small bumps)
    ctx.fillStyle = '#2a8a6a';
    ctx.strokeStyle = '#0c3a2a'; ctx.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) {
      const tx = cx + (i - 1) * size * 0.28;
      const ty = cy - size * 1.15;
      ctx.beginPath();
      ctx.moveTo(tx - size * 0.1, ty + size * 0.15);
      ctx.quadraticCurveTo(tx, ty - size * 0.1, tx + size * 0.1, ty + size * 0.15);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // 5 tentacles splaying outward
    ctx.strokeStyle = '#1e6b52';
    ctx.lineWidth = Math.max(2.2, size * 0.18);
    ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const baseAng = Math.PI / 2 + (i - 2) * 0.45; // splay downward
      const len = size * (1.15 + (i === 2 ? 0.2 : 0));
      const wiggle = Math.sin(t + i * 0.7) * 0.4;
      const bx = cx + Math.cos(baseAng - Math.PI/2) * size * 0.55;
      const by = cy + size * 0.2;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(
        bx + Math.cos(baseAng) * size * 0.3 + wiggle * size * 0.5,
        by + size * 0.6 + wiggle * size * 0.2,
        bx + Math.cos(baseAng + wiggle * 0.5) * len,
        by + size * 1.0 + Math.sin(t + i) * size * 0.12
      );
      ctx.stroke();
    }

    // Sharp angry slitted eyes (two narrow ovals with dark pupils and angry brows)
    const eyeY = cy - size * 0.5;
    const eyeDX = size * 0.32;
    // eye whites (narrow slits)
    ctx.fillStyle = '#f8fff2';
    ctx.beginPath(); ctx.ellipse(cx - eyeDX, eyeY, size * 0.24, size * 0.13, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + eyeDX, eyeY, size * 0.24, size * 0.13, 0.3, 0, Math.PI * 2); ctx.fill();
    // dark pupils
    ctx.fillStyle = '#0a1a10';
    ctx.beginPath(); ctx.ellipse(cx - eyeDX + size*0.04, eyeY, size * 0.09, size * 0.11, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + eyeDX - size*0.04, eyeY, size * 0.09, size * 0.11, 0, 0, Math.PI * 2); ctx.fill();
    // angry brows (slanted)
    ctx.strokeStyle = '#0a1a10';
    ctx.lineWidth = Math.max(1.4, size * 0.09);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - eyeDX - size * 0.28, eyeY - size * 0.34);
    ctx.lineTo(cx - eyeDX + size * 0.18, eyeY - size * 0.15);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + eyeDX + size * 0.28, eyeY - size * 0.34);
    ctx.lineTo(cx + eyeDX - size * 0.18, eyeY - size * 0.15);
    ctx.stroke();
    // Small grumpy mouth
    ctx.strokeStyle = '#0c3a2a'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(cx, cy - size*0.08, size * 0.16, 1.15 * Math.PI, 1.85 * Math.PI); ctx.stroke();
    ctx.restore();
  }

  function drawSquidley() {
    if (!squidley.active) return;
    if (window.HorridorsSprites && window.HorridorsSprites.drawCharacter) {
      const bob = Math.sin(squidley.bob || 0) * 3;
      window.HorridorsSprites.drawCharacter(ctx, 'inkybin', squidley.x - camera.x, (squidley.y + bob) - camera.y, 1, 52);
      return;
    }
}

  // ---------- Socky Shok (friendly teal helper NPC) ----------
  // V4: TEAL (not green), TALLER capsule body, NO EAR. Single lightning bolt on top,
  // stubby T-arms, tiny feet (NO socks), big white oval eyes with black pupils.
  function drawSocky() {
    const socky = state.socky;
    if (!socky || !socky.active) return;
    if (window.HorridorsSprites && window.HorridorsSprites.drawCharacter) {
      const bobY = Math.sin(socky.bob || 0) * 4;
      window.HorridorsSprites.drawCharacter(ctx, 'sockyshok', socky.x - camera.x, (socky.y + bobY) - camera.y, 1, 56);
      return;
    }
  }

  // Thunder-zap visual flash (white flicker)
  function drawZapFlash() {
    if (state.zapFlash <= 0) return;
    const a = Math.min(0.55, state.zapFlash);
    ctx.save();
    ctx.fillStyle = 'rgba(240, 250, 255, ' + a + ')';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.restore();
  }

  // Big gold pickup flash
  function drawPickupFlash() {
    if (state.pickupFlash <= 0) return;
    const a = Math.min(0.65, state.pickupFlash);
    ctx.save();
    const g = ctx.createRadialGradient(VIEW_W/2, VIEW_H/2, 60, VIEW_W/2, VIEW_H/2, Math.max(VIEW_W, VIEW_H) * 0.65);
    g.addColorStop(0, 'rgba(255, 232, 128, ' + a + ')');
    g.addColorStop(0.5, 'rgba(255, 200, 80, ' + (a * 0.5) + ')');
    g.addColorStop(1, 'rgba(40, 20, 0, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    // text banner during flash
    if (state.pickupFlash > 0.7) {
      ctx.font = 'bold 46px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(80, 40, 0, ' + Math.min(1, state.pickupFlash - 0.3) + ')';
      ctx.fillText('🧤 GRABPACK ACQUIRED!', VIEW_W/2 + 2, VIEW_H/2 + 2);
      ctx.fillStyle = 'rgba(255, 248, 220, ' + Math.min(1, state.pickupFlash - 0.3) + ')';
      ctx.fillText('🧤 GRABPACK ACQUIRED!', VIEW_W/2, VIEW_H/2);
      ctx.font = '600 18px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255, 248, 220, ' + Math.min(1, state.pickupFlash - 0.3) + ')';
      ctx.fillText('Press 1–5 to pick an element • E to use', VIEW_W/2, VIEW_H/2 + 40);
    }
    ctx.restore();
  }

  function drawPlayer() {
    if (window.HorridorsSprites && window.HorridorsSprites.drawCharacter) {
      window.HorridorsSprites.drawChesterWalk(ctx, (player.x + player.w/2) - camera.x, (player.y + player.h + 8) - camera.y, (player.facing !== undefined ? (Math.cos(player.facing) >= 0 ? 1 : -1) : 1), 56, player.vx, player.vy);
      return;
    }
}

  function drawDrip() {
    if (!drip.active) return;
    if (window.HorridorsSprites && window.HorridorsSprites.drawCharacter) {
      window.HorridorsSprites.drawCharacter(ctx, 'drip', drip.x - camera.x, drip.y - camera.y, 1, 54);
      return;
    }
}

  function drawItems() {
    for (const it of items) {
      const x = it.x - camera.x, y = it.y - camera.y;
      const bob = Math.sin(performance.now()/400 + it.x) * 2;
      ctx.save();
      ctx.translate(x, y + bob);
      switch (it.icon) {
        case 'coin':
          ctx.fillStyle = '#f5c542';
          ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = '#a88028';
          ctx.fillRect(-2, -1, 4, 2);
          break;
        case 'fishtreat':
          ctx.fillStyle = '#ffb074';
          ctx.fillRect(-6, -3, 12, 6);
          ctx.fillStyle = '#c9723c';
          ctx.fillRect(-2, -3, 2, 6);
          break;
        case 'crystal': {
          // Elemental crystal: diamond shape, pulsing glow, color from element.
          const meta = (window.HorridorsWallet && window.HorridorsWallet.elementMeta)
            ? window.HorridorsWallet.elementMeta(it.element)
            : { color: it.crystalColor || '#6ac8ff', icon: '💧' };
          const color = meta.color;
          const pulse = 0.7 + Math.sin(performance.now()/280) * 0.3;
          // Outer glow
          ctx.save();
          ctx.globalAlpha = 0.55 * pulse;
          const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 22);
          g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g;
          ctx.fillRect(-22, -22, 44, 44);
          ctx.restore();
          // Diamond body
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.moveTo(0, -9);
          ctx.lineTo(7, 0);
          ctx.lineTo(0, 9);
          ctx.lineTo(-7, 0);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke();
          // Highlight glint
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.beginPath(); ctx.moveTo(-2, -4); ctx.lineTo(2, -2); ctx.lineTo(-2, 2); ctx.closePath(); ctx.fill();
          break;
        }
        case 'gem': {
          // Hidden pentagon gem with pulsing glow
          const pulse = 0.75 + Math.sin(performance.now()/300) * 0.25;
          const color = it.gemColor || '#6fe0c5';
          ctx.save();
          ctx.globalAlpha = 0.5 * pulse;
          const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 18);
          g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g;
          ctx.fillRect(-18, -18, 36, 36);
          ctx.restore();
          ctx.fillStyle = color;
          ctx.beginPath();
          for (let k = 0; k < 5; k++) {
            const a = -Math.PI/2 + k * Math.PI*2/5;
            const r = 7;
            const gx = Math.cos(a) * r, gy = Math.sin(a) * r;
            if (k === 0) ctx.moveTo(gx, gy); else ctx.lineTo(gx, gy);
          }
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.beginPath(); ctx.arc(-1.6, -2, 1.6, 0, Math.PI*2); ctx.fill();
          break;
        }
        default:
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI*2); ctx.fill();
      }
      ctx.restore();
    }
  }

  // ---------- Lighting ----------
  function drawLighting() {
    const darkAlpha = state.scene === 'play' && drip.active ? 0.72 : 0.62;
    if (!drawLighting._mask) {
      drawLighting._mask = document.createElement('canvas');
      drawLighting._mask.width = VIEW_W;
      drawLighting._mask.height = VIEW_H;
      drawLighting._dark = document.createElement('canvas');
      drawLighting._dark.width = VIEW_W;
      drawLighting._dark.height = VIEW_H;
    }
    const mc = drawLighting._mask; const mctx = mc.getContext('2d');
    mctx.globalCompositeOperation = 'source-over';
    mctx.fillStyle = '#000'; mctx.fillRect(0, 0, VIEW_W, VIEW_H);

    mctx.globalCompositeOperation = 'lighter';
    const lights = [];
    // Ceiling lights — sparse and sickly
    for (let lx = 380; lx <= HUB.hx + HUB.hw; lx += 280) {
      const flicker = Math.sin(performance.now()/170 + lx) > -0.8 ? 1 : 0.35;
      lights.push({ x: lx, y: HUB.hy + 90, r: 180, intensity: 0.9 * flicker, color: [180, 220, 230] });
    }
    lights.push({ x: HUB.vx + HUB.vw/2, y: HUB.vy + 180, r: 180, intensity: 0.85, color: [180, 220, 230] });
    lights.push({ x: HUB.vx + HUB.vw/2, y: HUB.vy + 560, r: 180, intensity: 0.85, color: [180, 220, 230] });
    // Room ceiling lights
    lights.push({ x: ROOMS.aquarium.cx, y: ROOMS.aquarium.top + 120, r: 210, intensity: 0.95, color: [140, 230, 220] });
    lights.push({ x: ROOMS.aquarium.cx, y: ROOMS.aquarium.bottom - 100, r: 200, intensity: 0.9, color: [140, 230, 220] });
    lights.push({ x: ROOMS.pipe.cx - 100, y: ROOMS.pipe.top + 120, r: 180, intensity: 0.85, color: [200, 220, 255] });
    lights.push({ x: ROOMS.pipe.cx + 120, y: ROOMS.pipe.top + 280, r: 180, intensity: 0.8, color: [200, 220, 255] });
    lights.push({ x: ROOMS.control.cx, y: ROOMS.control.top + 120, r: 200, intensity: 1.05, color: [255, 200, 200] });
    lights.push({ x: ROOMS.control.cx, y: ROOMS.control.bottom - 120, r: 180, intensity: 0.85, color: [255, 200, 200] });
    // Exit stairwell
    if (state.valveSolved) lights.push({ x: HUB.ex + HUB.ew/2, y: HUB.ey + 100, r: 200, intensity: 1.1, color: [255, 220, 140] });
    // Gauges: each lit faintly in its tag color
    for (const f of furniture) {
      if (f.art === 'gauge_red')   lights.push({ x: f.x + f.w/2, y: f.y + f.h/2, r: 70, intensity: 0.7, color: [255, 120, 120] });
      if (f.art === 'gauge_blue')  lights.push({ x: f.x + f.w/2, y: f.y + f.h/2, r: 70, intensity: 0.7, color: [120, 180, 255] });
      if (f.art === 'gauge_yellow')lights.push({ x: f.x + f.w/2, y: f.y + f.h/2, r: 70, intensity: 0.7, color: [255, 220, 120] });
    }
    // Player halo
    const px = player.x + player.w/2 - camera.x;
    const py = player.y + player.h/2 - camera.y;
    lights.push({ sx: px, sy: py, r: 130, intensity: 0.9, color: [220, 220, 240] });
    // Squidley glow (brighter when active)
    if (squidley.active) {
      lights.push({ sx: squidley.x - camera.x, sy: squidley.y - camera.y, r: 150, intensity: 0.95, color: [130, 255, 180] });
    }

    for (const L of lights) {
      const sx = (L.sx !== undefined) ? L.sx : (L.x - camera.x);
      const sy = (L.sy !== undefined) ? L.sy : (L.y - camera.y);
      if (sx < -300 || sx > VIEW_W + 300 || sy < -300 || sy > VIEW_H + 300) continue;
      const g = mctx.createRadialGradient(sx, sy, 0, sx, sy, L.r);
      const [r, gg, b] = L.color;
      const a = Math.min(1, L.intensity);
      g.addColorStop(0, `rgba(${r},${gg},${b},${a})`);
      g.addColorStop(0.6, `rgba(${r},${gg},${b},${a*0.5})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      mctx.fillStyle = g;
      mctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }

    // Flashlight cone
    if (state.flashlightOn && state.hasFlashlight) {
      const fx = px, fy = py;
      const angle = player.facing || 0;
      const reach = 240;
      const half = Math.PI / 4.5;
      mctx.save();
      mctx.beginPath();
      mctx.moveTo(fx, fy);
      for (let i = 0; i <= 28; i++) {
        const a = angle - half + (half * 2 * i / 28);
        mctx.lineTo(fx + Math.cos(a) * reach, fy + Math.sin(a) * reach);
      }
      mctx.closePath();
      const gr = mctx.createRadialGradient(fx, fy, 10, fx, fy, reach);
      gr.addColorStop(0, 'rgba(255,250,220,1)');
      gr.addColorStop(0.5, 'rgba(255,240,200,0.6)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      mctx.fillStyle = gr;
      mctx.fill();
      mctx.restore();
    }

    // Build dark overlay
    const dc = drawLighting._dark; const dctx = dc.getContext('2d');
    dctx.globalCompositeOperation = 'source-over';
    dctx.clearRect(0, 0, VIEW_W, VIEW_H);
    dctx.fillStyle = `rgba(6, 10, 18, ${darkAlpha})`;
    dctx.fillRect(0, 0, VIEW_W, VIEW_H);
    dctx.globalCompositeOperation = 'destination-out';
    dctx.drawImage(mc, 0, 0);
    dctx.globalCompositeOperation = 'source-over';

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(dc, 0, 0);
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.12;
    ctx.drawImage(mc, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  // ---------- Point-in-light test (used by Drip AI) ----------
  function playerLightOnDrip() {
    if (!state.flashlightOn || !state.hasFlashlight) return false;
    const px = player.x + player.w/2, py = player.y + player.h/2;
    const dx = drip.x - px, dy = drip.y - py;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist > 260) return false;
    const ang = Math.atan2(dy, dx);
    let diff = ang - (player.facing || 0);
    while (diff > Math.PI) diff -= Math.PI*2;
    while (diff < -Math.PI) diff += Math.PI*2;
    return Math.abs(diff) < Math.PI / 4;
  }

  // ---------- Objectives builder ----------
  function buildObjectiveList() {
    const s = state;
    const steps = [];
    // Step 1: find Squidley
    steps.push({
      text: 'Free Inky Bin from the Aquarium tank',
      done: !!s.hasSquidley,
      active: !s.hasSquidley,
    });
    // Step 2: solve pipe cipher
    steps.push({
      text: s.cipherSolved ? 'Pipes primed' : 'Find the pipe order (hub board + aquarium notes)',
      done: !!s.cipherSolved,
      active: !!s.hasSquidley && !s.cipherSolved,
    });
    // Step 3: collect 3 valve handles
    const valves = (s.hasValveRed?1:0) + (s.hasValveBlue?1:0) + (s.hasValveYellow?1:0);
    steps.push({
      text: 'Collect 3 valve handles (' + valves + '/3)',
      done: valves === 3,
      active: s.cipherSolved && valves < 3,
    });
    // Step 4: collect 3 gauge readings
    const gauges = (s.hasGaugeRed?1:0) + (s.hasGaugeBlue?1:0) + (s.hasGaugeYellow?1:0);
    steps.push({
      text: 'Read 3 gauges R/B/Y (' + gauges + '/3)',
      done: gauges === 3,
      active: s.cipherSolved && valves === 3 && gauges < 3,
    });
    // Step 5: open Control Panel
    steps.push({
      text: s.valveSolved ? 'Panel drained the flood' : 'Enter readings at Control Panel',
      done: !!s.valveSolved,
      active: s.cipherSolved && valves === 3 && gauges === 3 && !s.valveSolved,
    });
    // Bonus: Grabpack (optional but useful)
    steps.push({
      text: s.hasGrabpack ? 'Grabpack: equipped' : 'Grabpack: search the tool locker',
      done: !!s.hasGrabpack,
      active: !s.hasGrabpack,
    });
    // Bonus: Socky Shok friend
    steps.push({
      text: s.socky.given ? 'Socky Shok: thunder gifted' : (s.socky.met ? 'Socky Shok: say hi again' : 'Say hi to the green guy'),
      done: !!s.socky.given,
      active: !s.socky.given,
    });
    // Step 6: exit stairs
    steps.push({
      text: 'Climb the exit stairs',
      done: false,
      active: !!s.valveSolved,
    });
    return steps;
  }

  // Returns a short contextual hint for the player based on their current progress
  function currentHint() {
    const s = state;
    if (!s.hasSquidley) {
      return 'Hint: head LEFT to the Aquarium. Search the big tank (press E).';
    }
    if (!s.cipherSolved) {
      return 'Hint: read the hub notice board and Aquarium notes for the pipe order, then use the Pipe Sequencer.';
    }
    const valves = (s.hasValveRed?1:0) + (s.hasValveBlue?1:0) + (s.hasValveYellow?1:0);
    const gauges = (s.hasGaugeRed?1:0) + (s.hasGaugeBlue?1:0) + (s.hasGaugeYellow?1:0);
    if (valves < 3 || gauges < 3) {
      const need = [];
      if (!s.hasValveRed) need.push('red valve (Aquarium cabinet)');
      if (!s.hasValveBlue) need.push('blue valve (Pipe Room locker)');
      if (!s.hasValveYellow) need.push('yellow valve (Control Room locker)');
      if (!s.hasGaugeRed) need.push('red gauge (Control Room)');
      if (!s.hasGaugeBlue) need.push('blue gauge (Pipe Room)');
      if (!s.hasGaugeYellow) need.push('yellow gauge (hub)');
      return 'Still need: ' + need.slice(0,2).join(' · ');
    }
    if (!s.valveSolved) {
      return 'Hint: open the Control Panel in the Control Room and dial the 3 gauge readings.';
    }
    return 'Hint: the exit stairs are in the hub — press E on them.';
  }

  // ---------- HUD (drawn on canvas) ----------
  function drawHUD() {
    ctx.save();
    // Top bar background — taller to fit objective checklist
    const HUD_H = 110;
    ctx.fillStyle = 'rgba(0, 10, 14, 0.6)';
    ctx.fillRect(0, 0, VIEW_W, HUD_H);
    ctx.strokeStyle = 'rgba(126,226,168,0.35)';
    ctx.beginPath(); ctx.moveTo(0, HUD_H); ctx.lineTo(VIEW_W, HUD_H); ctx.stroke();

    ctx.font = '600 13px Inter, system-ui, sans-serif';
    ctx.textBaseline = 'middle';

    // Inventory icons (bottom row of the HUD bar)
    const INV_Y = 94;
    let ix = 10;
    const drawSlot = (icon, have, label) => {
      ctx.globalAlpha = have ? 1 : 0.3;
      ctx.fillStyle = have ? '#ffd94a' : '#8a9199';
      ctx.font = '18px Inter, system-ui, sans-serif';
      ctx.fillText(icon, ix, INV_Y);
      ix += 26;
      ctx.font = '600 11px Inter, sans-serif';
      ctx.fillStyle = have ? '#e6f2ef' : '#4a5561';
      ctx.fillText(label, ix, INV_Y);
      ix += ctx.measureText(label).width + 18;
      ctx.globalAlpha = 1;
    };

    // Title bar: LEVEL 2 + current room hint on the left
    ctx.font = '700 11px Inter, sans-serif';
    ctx.fillStyle = 'rgba(126,226,168,0.85)';
    ctx.fillText('LEVEL 2  —  THE FLOODED SUBLEVEL', 10, 14);
    ctx.font = '600 11px Inter, sans-serif';
    ctx.fillStyle = '#a9c9c2';
    const hint = currentHint();
    if (hint) {
      const hintLines = wrapText(hint, 480, ctx);
      for (let i = 0; i < Math.min(hintLines.length, 2); i++) {
        ctx.fillText(hintLines[i], 10, 32 + i * 13);
      }
    }
    // Flashlight merges into the Grabpack once picked up
    if (state.hasGrabpack) {
      drawSlot('🧤', true, 'Grabpack');
    } else {
      drawSlot('🔦', state.hasFlashlight, 'flashlight');
    }
    drawSlot('🦑', state.hasSquidley, 'Inky Bin');
    drawSlot('🔴', state.hasValveRed, 'red valve');
    drawSlot('🔵', state.hasValveBlue, 'blue valve');
    drawSlot('🟡', state.hasValveYellow, 'yellow valve');
    drawSlot('🪙', true, state.coins + ' coins');

    // Elemental Hand row (only once Grabpack is picked up)
    if (state.hasGrabpack) {
      const EL_Y = INV_Y + 22;
      const elems = [
        { key: '1', name: 'fire',    icon: '🔥', color: '#ff8a3a' },
        { key: '2', name: 'thunder', icon: '⚡',    color: '#fff06a' },
        { key: '3', name: 'earth',   icon: '🌱', color: '#7ac266' },
        { key: '4', name: 'water',   icon: '💧', color: '#6ac8ff' },
        { key: '5', name: 'air',     icon: '💨', color: '#cfe6ff' },
      ];
      ctx.font = '700 10px Inter, sans-serif';
      ctx.fillStyle = 'rgba(200,220,210,0.75)';
      ctx.fillText('ELEMENTAL HAND', 10, EL_Y - 4);
      let ex = 110;
      for (const e of elems) {
        const unlocked = !!state.elements[e.name];
        const selected = state.selectedElem === e.name && unlocked;
        // chip bg
        ctx.fillStyle = selected ? 'rgba(255,255,255,0.18)' : (unlocked ? 'rgba(255,255,255,0.08)' : 'rgba(40,50,55,0.55)');
        ctx.fillRect(ex - 2, EL_Y - 12, 36, 16);
        if (selected) {
          ctx.strokeStyle = e.color;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(ex - 2, EL_Y - 12, 36, 16);
        }
        // icon
        ctx.globalAlpha = unlocked ? 1 : 0.32;
        ctx.font = '600 12px Inter, sans-serif';
        ctx.fillStyle = unlocked ? e.color : '#8a8a92';
        ctx.fillText(e.icon, ex + 2, EL_Y);
        // key hint
        ctx.font = '700 9px Inter, sans-serif';
        ctx.fillStyle = unlocked ? 'rgba(230,242,239,0.9)' : '#56606a';
        ctx.fillText(e.key, ex + 22, EL_Y - 2);
        ctx.globalAlpha = 1;
        ex += 42;
      }
    }

    // Objectives checklist on the right — computed from state so it’s always accurate
    const steps = buildObjectiveList();
    ctx.textAlign = 'right';
    const pad = 10;
    const objX = VIEW_W - pad;
    // Small "QUEST" header
    ctx.font = '700 10px Inter, sans-serif';
    ctx.fillStyle = 'rgba(126,226,168,0.85)';
    ctx.fillText('OBJECTIVES', objX, 10);
    ctx.font = '600 11px Inter, sans-serif';
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      ctx.fillStyle = s.done ? 'rgba(130,220,170,0.55)' : (s.active ? '#ffe58a' : '#cfe9df');
      const prefix = s.done ? '✓ ' : (s.active ? '▸ ' : '· ');
      ctx.fillText(prefix + s.text, objX, 24 + i * 13);
    }
    ctx.textAlign = 'left';

    // Drip warning (only when actively chasing — Squidley scares him so no warning when fleeing)
    if (drip.active && !drip.fleeing) {
      ctx.fillStyle = 'rgba(255, 90, 90, ' + (0.55 + Math.sin(performance.now()/200)*0.15) + ')';
      ctx.fillRect(0, 110, VIEW_W, 4);
    } else if (drip.active && drip.fleeing) {
      ctx.fillStyle = 'rgba(126, 226, 168, 0.45)';
      ctx.fillRect(0, 110, VIEW_W, 3);
    }

    // Progress rings bottom-left: gauges
    const gx = 10, gy = VIEW_H - 28;
    ctx.font = '600 11px Inter, sans-serif';
    ctx.fillStyle = state.hasGaugeRed ? '#ff7a7a' : '#4a3a3a';
    ctx.fillText('R: ' + (state.hasGaugeRed ? state.gaugeValues.red : '?'), gx, gy);
    ctx.fillStyle = state.hasGaugeBlue ? '#7ab0ff' : '#3a3a4a';
    ctx.fillText('B: ' + (state.hasGaugeBlue ? state.gaugeValues.blue : '?'), gx + 42, gy);
    ctx.fillStyle = state.hasGaugeYellow ? '#ffd66a' : '#4a3a1a';
    ctx.fillText('Y: ' + (state.hasGaugeYellow ? state.gaugeValues.yellow : '?'), gx + 82, gy);
    ctx.fillStyle = state.cipherSolved ? '#7ee2a8' : '#3a3a4a';
    ctx.fillText(state.cipherSolved ? '✓ pipes primed' : 'pipes: offline', gx + 130, gy);

    ctx.restore();
  }
  function wrapText(text, maxWidth, ctx) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; }
      else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }

  // ---------- Prompt ----------
  const promptEl = document.getElementById('prompt');
  function showPrompt(text) {
    text = _kl(text);
    if (!promptEl) return;
    const suffix = (window.HorridorsTouch && window.HorridorsTouch.isTouch()) ? '  (A / B)' : '  (E / Space)';
    if (text) { promptEl.textContent = text + suffix; promptEl.classList.remove('hidden'); }
    else { promptEl.textContent = ''; promptEl.classList.add('hidden'); }
  }

  function isInHub(x, y) {
    if (x >= HUB.hx && x <= HUB.hx + HUB.hw && y >= HUB.hy && y <= HUB.hy + HUB.hh) return true;
    if (x >= HUB.vx && x <= HUB.vx + HUB.vw && y >= HUB.vy && y <= HUB.vy + HUB.vh) return true;
    if (x >= HUB.ex && x <= HUB.ex + HUB.ew && y >= HUB.ey && y <= HUB.ey + HUB.eh) return true;
    return false;
  }

  // ---------- Update ----------
  function update(dt) {
    tickSpeaker(dt);

    if (state.scene !== 'play') {
      player.vx = 0; player.vy = 0;
      return;
    }

    // Movement
    let dx = 0, dy = 0;
    if (isDown('w','arrowup')) dy -= 1;
    if (isDown('s','arrowdown')) dy += 1;
    if (isDown('a','arrowleft')) dx -= 1;
    if (isDown('d','arrowright')) dx += 1;
    if (dx && dy) { dx *= 0.7071; dy *= 0.7071; }

    // Water slows player
    let speed = PLAYER_SPEED;
    if (isInHub(player.x + player.w/2, player.y + player.h/2)) speed *= 0.82;
    // Sprint burst (shift)
    if (isDown('shift') && state.sprint > 0) { speed *= 1.5; state.sprint = Math.max(0, state.sprint - dt * 0.5); }
    else { state.sprint = Math.min(1, state.sprint + dt * 0.2); }

    moveEntity(player, dx * speed * dt, dy * speed * dt);
    player.vx = dx * speed; player.vy = dy * speed;

    // Coin pickups
    if (window.HorridorsWallet) {
      const pcx = player.x + player.w/2, pcy = player.y + player.h/2;
      for (const c of coins) {
        if (c.got) continue;
        if (Math.hypot(pcx - c.x, pcy - c.y) < 22) {
          c.got = true;
          window.HorridorsWallet.addCoins(c.v);
        }
      }
    }
    if (dx || dy) { player.facing = Math.atan2(dy, dx); player.lastMoveX = dx; player.lastMoveY = dy; }

    // Interact
    const near = nearestInteractable();
    if (near) showPrompt(near.label);
    else showPrompt('');
    if (wasPressed('e', ' ')) {
      if (near) {
        if (near.type === 'item') collectItem(near.idx);
        else if (near.type === 'furn') {
          const f = near.f;
          if (f.action === 'cipher') { if (!state.cipherSolved) openCipher(); else speak('Already primed.', 1600); }
          else if (f.action === 'valve') {
            if (!state.cipherSolved) speak('Panel is offline. Prime the pipes first.', 2600);
            else if (!(state.hasValveRed && state.hasValveBlue && state.hasValveYellow)) speak('Need all three valve handles first.', 2800);
            else openValve();
          }
          else if (f.action === 'gaugeBlue' || f.action === 'gaugeRed' || f.action === 'gaugeYellow' || SEARCH[f.id]) {
            const handler = SEARCH[f.id];
            if (handler) handler();
            state.searched.add(f.id);
            sfx('squelch');
          }
        }
        else if (near.type === 'exit') {
          endLevel2();
        }
        else if (near.type === 'socky') {
          talkToSocky();
        }
      }
    }
    // Grabpack element selection (1–5) — only unlocked elements are selectable
    if (state.hasGrabpack) {
      const elemKeys = [ ['1','fire'], ['2','thunder'], ['3','earth'], ['4','water'], ['5','air'] ];
      for (const [k, name] of elemKeys) {
        if (wasPressed(k)) {
          if (state.elements[name]) {
            state.selectedElem = state.selectedElem === name ? null : name;
            sfx('click');
            speak(state.selectedElem ? ('Elemental Hand → ' + name.toUpperCase()) : 'Elemental Hand: empty palm.', 1600);
          } else {
            speak(name.toUpperCase() + ' crystal is still locked. Find a friend who can give it to you.', 2600);
          }
        }
      }
    }
    // Decay zap flash
    if (state.zapFlash > 0) state.zapFlash = Math.max(0, state.zapFlash - dt * 2.2);
    if (state.pickupFlash > 0) state.pickupFlash = Math.max(0, state.pickupFlash - dt * 0.55);
    // Bob Socky gently
    if (state.socky.active) state.socky.bob += dt * 2.2;
    if (wasPressed('f')) { state.flashlightOn = !state.flashlightOn; sfx('click'); }
    if (wasPressed('n')) { toggleNotes(); }
    if (wasPressed('m')) { setMuted(!state.muted); }

    // Squidley follow
    if (squidley.active) {
      const tx = player.x - 22, ty = player.y - 20;
      squidley.vx += ((tx - squidley.x) * 6 - squidley.vx * 4) * dt;
      squidley.vy += ((ty - squidley.y) * 6 - squidley.vy * 4) * dt;
      squidley.x += squidley.vx * dt;
      squidley.y += squidley.vy * dt;
      squidley.bob += dt;
    }

    // Drip spawn conditions: once player has at least 1 valve OR 1 gauge AND is in the hub
    const anyProgress = state.hasValveRed || state.hasValveBlue || state.hasValveYellow
      || state.hasGaugeRed || state.hasGaugeBlue || state.hasGaugeYellow;
    if (!drip.active && anyProgress && (drip.respawnCooldown || 0) <= 0 && isInHub(player.x + player.w/2, player.y + player.h/2)) {
      spawnDrip();
    }

    // Drip AI
    if (drip.active) {
      const lit = playerLightOnDrip();
      const px = player.x + player.w/2, py = player.y + player.h/2;
      const ddx = px - drip.x, ddy = py - drip.y;
      const ddist = Math.sqrt(ddx*ddx + ddy*ddy) || 1;

      // Squidley scares The Drip away — flee instead of chase
      if (squidley.active) {
        if (!drip.fleeing) {
          drip.fleeing = true;
          speak('Inky Bin flashes bright — the Drip recoils, hissing.', 3000);
          // Unlock the comic cutscene the FIRST time this happens
          unlockCollectible('comic1');
        }
        // Run AWAY from player, toward the far end of the horizontal hub
        const awayX = drip.x < px ? HUB.hx + 40 : HUB.hx + HUB.hw - 40;
        const awayY = HUB.hy + HUB.hh/2;
        const fdx = awayX - drip.x, fdy = awayY - drip.y;
        const fd = Math.sqrt(fdx*fdx + fdy*fdy) || 1;
        const fleeSpeed = 180;
        moveEntity(drip, (fdx/fd) * fleeSpeed * dt, (fdy/fd) * fleeSpeed * dt);
        drip.phase += dt;
        // If very far from player, vanish (gives brief respite)
        if (ddist > 520) {
          drip.active = false;
          drip.fleeing = false;
          // Aggression shortens respawn cooldown (Extreme = ~5s, Easy = ~11s)
          const _d3 = (window.__difficulty && window.__difficulty.get()) || { aggroMul: 1 };
          drip.respawnCooldown = 8 / Math.max(0.5, _d3.aggroMul);
          speak('The Drip slinks back into the pipes.', 2600);
        }
        // No damage while fleeing
      } else {
        // Normal chase behavior
        drip.fleeing = false;
        const _d2 = (window.__difficulty && window.__difficulty.get()) || { speedMul: 1, aggroMul: 1 };
        const targetSpeed = (lit ? DRIP_SPEED_LIT : DRIP_SPEED_DARK) * _d2.speedMul;
        let mvx = ddx / ddist, mvy = ddy / ddist;
        if (!isInHub(px, py)) {
          // Aim at nearest hub point (simple: clamp target to HUB horizontal strip)
          const tx = Math.max(HUB.hx + 20, Math.min(HUB.hx + HUB.hw - 20, px));
          const ty = HUB.hy + HUB.hh/2;
          const tdx = tx - drip.x, tdy = ty - drip.y;
          const td = Math.sqrt(tdx*tdx + tdy*tdy) || 1;
          mvx = tdx/td; mvy = tdy/td;
        }
        moveEntity(drip, mvx * targetSpeed * dt, mvy * targetSpeed * dt);
        drip.phase += dt;
        // Catch
        const hit = { x: drip.x - 12, y: drip.y - 12, w: 24, h: 40 };
        const pbox = { x: player.x, y: player.y, w: player.w, h: player.h };
        if (rectsIntersect(hit, pbox) && !state.hidden) {
          killPlayer('drip');
        }
      }
    } else if (drip.respawnCooldown > 0) {
      drip.respawnCooldown -= dt;
    }

    // Camera follow
    const targetCX = player.x + player.w/2 - VIEW_W/2;
    const targetCY = player.y + player.h/2 - VIEW_H/2;
    camera.x += (targetCX - camera.x) * 0.12;
    camera.y += (targetCY - camera.y) * 0.12;
    camera.x = Math.max(0, Math.min(WORLD_W - VIEW_W, camera.x));
    camera.y = Math.max(0, Math.min(WORLD_H - VIEW_H, camera.y));

    // Update gauge auto-pickup hint: none — handled by actions
  }

  // ---------- Render ----------
  function render() {
    drawFloors();
    drawWalls();
    for (const f of furniture) drawFurn(f);
    drawItems();
    // Coins
    if (window.HorridorsSprites) {
      const t = performance.now();
      for (const c of coins) {
        if (c.got) continue;
        window.HorridorsSprites.drawCoin(ctx, c.x - camera.x, c.y - camera.y, t, 7);
      }
    }
    drawDrip();
    drawSquidley();
    drawSocky();
    drawPlayer();
    drawLighting();
    drawZapFlash();
    drawPickupFlash();
    drawHUD();
  }

  // ---------- End level ----------
  function endLevel2() {
    if (state.scene === 'end') return;
    state.scene = 'end';
    drip.active = false;
    const rewards = [];
    rewards.push('🦑 Friend of Inky Bin');
    rewards.push('🪙 ' + state.coins + ' Sublevel Coins');
    if (state.notes.length > 0) rewards.push('📜 ' + state.notes.length + ' Notes Found');
    if (state.searched.size >= 8) rewards.push('🏅 Thorough Searcher');
    if (state.searched.size >= 14) rewards.push('🌟 Every Drawer Opened');
    if (state.hasGaugeRed && state.hasGaugeBlue && state.hasGaugeYellow) rewards.push('🎖️ Master Plumber');
    document.getElementById('l2-reward-chest').innerHTML = rewards.map(r => `<div class="reward-item">${r}</div>`).join('');
    document.getElementById('overlay-l2-end').classList.remove('hidden');
    sfx('jingle');
  }

  // ---------- Init ----------
  function setMuted(m) {
    state.muted = m;
    if (masterGain) masterGain.gain.value = m ? 0 : 0.5;
    const btn = document.getElementById('btn-mute');
    if (btn) btn.textContent = m ? '🔇' : '🔊';
  }

  function toggleNotes() {
    if (!overlayNotes) return;
    if (overlayNotes.classList.contains('hidden')) {
      rebuildNotesList();
      overlayNotes.classList.remove('hidden');
      state._prevScene = state.scene;
      state.scene = 'note';
    } else {
      overlayNotes.classList.add('hidden');
      if (state.scene === 'note') state.scene = state._prevScene || 'play';
    }
  }

  // Esc / E / Space / Enter / N close overlays (only when an overlay is actually open)
  window.addEventListener('keydown', (e) => {
    if (!running) return;
    const k = (e.key || '').toLowerCase();
    const isClose = k === 'escape' || k === 'e' || k === ' ' || k === 'enter' || k === 'spacebar';
    const noteOpen = !overlayNote.classList.contains('hidden');
    const notesOpen = !overlayNotes.classList.contains('hidden');
    if (noteOpen && isClose) {
      closeNote();
      justPressed.delete('e'); justPressed.delete(' '); justPressed.delete('enter'); justPressed.delete('escape');
      e.preventDefault();
      return;
    }
    if (notesOpen && (isClose || k === 'n')) {
      toggleNotes();
      justPressed.delete('n'); justPressed.delete('e'); justPressed.delete(' '); justPressed.delete('enter'); justPressed.delete('escape');
      e.preventDefault();
      return;
    }
    // E / Space / Enter / Esc close the comic & collectibles panels
    const oc = document.getElementById('overlay-comic');
    const og = document.getElementById('overlay-collectibles');
    if (oc && !oc.classList.contains('hidden') && isClose) {
      closeComic();
      justPressed.delete('e'); justPressed.delete(' '); justPressed.delete('enter'); justPressed.delete('escape');
      e.preventDefault();
      return;
    }
    if (og && !og.classList.contains('hidden') && isClose) {
      closeCollectibles();
      justPressed.delete('e'); justPressed.delete(' '); justPressed.delete('enter'); justPressed.delete('escape');
      e.preventDefault();
      return;
    }
    if (k === 'escape') {
      if (!overlayCipher.classList.contains('hidden')) closeCipher();
      if (!overlayValve.classList.contains('hidden')) closeValve();
    }
  });

  // ---------- Game loop ----------
  let lastT = 0;
  let running = false;
  let _l2TaskTick = 0;
  function loop(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    update(dt);
    render();
    justPressed.clear();
    _l2TaskTick += dt;
    if (_l2TaskTick >= 0.5) { _l2TaskTick = 0; if (window.refreshChecklist) window.refreshChecklist(); }
    requestAnimationFrame(loop);
  }

  // ---------- Public start ----------
  function resetLevel2State() {
    state.scene = 'play';
    state.hasSquidley = false;
    state.hasValveRed = state.hasValveBlue = state.hasValveYellow = false;
    state.hasGaugeRed = state.hasGaugeBlue = state.hasGaugeYellow = false;
    state.cipherSolved = false;
    state.valveSolved = false;
    state.cipherInput = [];
    state.valveInput = [0, 0, 0];
    state.coins = 0;
    state.notes = [];
    state.searched.clear();
    state.hidden = false;
    // Reset Grabpack + Socky + elements (they re-appear on replay)
    state.hasGrabpack = false;
    state.elements = { fire: false, thunder: false, earth: false, water: false, air: false };
    state.selectedElem = null;
    // Seed from the persistent wallet so elements already earned in prior
    // levels (or a prior L2 run) remain visible.
    if (window.HorridorsWallet) {
      if (window.HorridorsWallet.hasGrabpack()) state.hasGrabpack = true;
      const snap = window.HorridorsWallet.elementsSnapshot ? window.HorridorsWallet.elementsSnapshot() : {};
      for (const k of Object.keys(state.elements)) state.elements[k] = !!snap[k];
      // Pick a sensible default selection: thunder if owned, else first owned.
      if (state.elements.thunder) state.selectedElem = 'thunder';
      else {
        const owned = Object.keys(state.elements).find(k => state.elements[k]);
        state.selectedElem = owned || null;
      }
    }
    state.zapFlash = 0;
    state.pickupFlash = 0;
    state.panelZapped = false;
    state.socky.active = true;
    state.socky.met = false;
    state.socky.given = false;
    state.socky.x = ROOMS.control.left + 260;
    state.socky.y = ROOMS.control.top + 160;
    // Random gauge values each run (1..9)
    state.gaugeValues = {
      red: 2 + Math.floor(Math.random() * 7),
      blue: 2 + Math.floor(Math.random() * 7),
      yellow: 2 + Math.floor(Math.random() * 7),
    };
    state.cipherOrder = ['bubble', 'wave', 'fish', 'anchor'];
    squidley.active = false;
    drip.active = false;
    items.length = 0;
    // Spawn items: a few coins, a fish treat near the tank
    addItem({ x: HUB.hx + 300, y: HUB.hy + 90, w: 14, h: 14, icon: 'coin', prompt: 'Grab the coin', onPickup() { state.coins += 1; if(window.HorridorsWallet)window.HorridorsWallet.addCoins(1); if(window.HorridorsStory)window.HorridorsStory.addCoins(1); sfx('pickup'); } });
    addItem({ x: HUB.hx + 1000, y: HUB.hy + 110, w: 14, h: 14, icon: 'coin', prompt: 'Grab the coin', onPickup() { state.coins += 1; if(window.HorridorsWallet)window.HorridorsWallet.addCoins(1); if(window.HorridorsStory)window.HorridorsStory.addCoins(1); sfx('pickup'); } });
    addItem({ x: ROOMS.aquarium.left + 300, y: ROOMS.aquarium.top + 120, w: 14, h: 14, icon: 'fishtreat', prompt: 'Take the fish treat', onPickup() { state.coins += 1; if(window.HorridorsWallet)window.HorridorsWallet.addCoins(1); if(window.HorridorsStory)window.HorridorsStory.addCoins(1); sfx('pickup'); speak('A little fish treat. Inky Bin would love this.', 2600); } });
    // Extra scattered collectibles across hub + rooms
    addItem({ x: HUB.hx + 140,  y: HUB.hy + 50,  w: 14, h: 14, icon: 'coin', prompt: 'Grab the coin', onPickup() { state.coins += 1; if(window.HorridorsWallet)window.HorridorsWallet.addCoins(1); if(window.HorridorsStory)window.HorridorsStory.addCoins(1); sfx('pickup'); } });
    addItem({ x: HUB.hx + 540,  y: HUB.hy + 130, w: 14, h: 14, icon: 'coin', prompt: 'Grab the coin', onPickup() { state.coins += 1; if(window.HorridorsWallet)window.HorridorsWallet.addCoins(1); if(window.HorridorsStory)window.HorridorsStory.addCoins(1); sfx('pickup'); } });
    addItem({ x: HUB.hx + 780,  y: HUB.hy + 60,  w: 14, h: 14, icon: 'coin', prompt: 'Grab the coin', onPickup() { state.coins += 1; if(window.HorridorsWallet)window.HorridorsWallet.addCoins(1); if(window.HorridorsStory)window.HorridorsStory.addCoins(1); sfx('pickup'); } });
    addItem({ x: HUB.hx + 1280, y: HUB.hy + 80,  w: 14, h: 14, icon: 'coin', prompt: 'Grab the coin', onPickup() { state.coins += 1; if(window.HorridorsWallet)window.HorridorsWallet.addCoins(1); if(window.HorridorsStory)window.HorridorsStory.addCoins(1); sfx('pickup'); } });
    addItem({ x: HUB.hx + 1540, y: HUB.hy + 120, w: 14, h: 14, icon: 'coin', prompt: 'Grab the coin', onPickup() { state.coins += 1; if(window.HorridorsWallet)window.HorridorsWallet.addCoins(1); if(window.HorridorsStory)window.HorridorsStory.addCoins(1); sfx('pickup'); } });
    addItem({ x: HUB.vx + 60,   y: HUB.vy + 200, w: 14, h: 14, icon: 'coin', prompt: 'Grab the coin', onPickup() { state.coins += 1; if(window.HorridorsWallet)window.HorridorsWallet.addCoins(1); if(window.HorridorsStory)window.HorridorsStory.addCoins(1); sfx('pickup'); } });
    addItem({ x: HUB.vx + 90,   y: HUB.vy + 500, w: 14, h: 14, icon: 'coin', prompt: 'Grab the coin', onPickup() { state.coins += 1; if(window.HorridorsWallet)window.HorridorsWallet.addCoins(1); if(window.HorridorsStory)window.HorridorsStory.addCoins(1); sfx('pickup'); } });
    addItem({ x: ROOMS.aquarium.left + 120, y: ROOMS.aquarium.top + 280, w: 14, h: 14, icon: 'coin', prompt: 'Grab the coin', onPickup() { state.coins += 1; if(window.HorridorsWallet)window.HorridorsWallet.addCoins(1); if(window.HorridorsStory)window.HorridorsStory.addCoins(1); sfx('pickup'); } });
    addItem({ x: ROOMS.pipe.left + 160,     y: ROOMS.pipe.top + 340,     w: 14, h: 14, icon: 'coin', prompt: 'Grab the coin', onPickup() { state.coins += 1; if(window.HorridorsWallet)window.HorridorsWallet.addCoins(1); if(window.HorridorsStory)window.HorridorsStory.addCoins(1); sfx('pickup'); } });
    addItem({ x: ROOMS.pipe.left + 340,     y: ROOMS.pipe.top + 180,     w: 14, h: 14, icon: 'coin', prompt: 'Grab the coin', onPickup() { state.coins += 1; if(window.HorridorsWallet)window.HorridorsWallet.addCoins(1); if(window.HorridorsStory)window.HorridorsStory.addCoins(1); sfx('pickup'); } });
    addItem({ x: ROOMS.control.left + 200,  y: ROOMS.control.top + 240,  w: 14, h: 14, icon: 'coin', prompt: 'Grab the coin', onPickup() { state.coins += 1; if(window.HorridorsWallet)window.HorridorsWallet.addCoins(1); if(window.HorridorsStory)window.HorridorsStory.addCoins(1); sfx('pickup'); } });
    // ---- Hidden gem L2: bottle tucked behind the rusty pump in Pipe Room ----
    if (!window.HorridorsStory || !window.HorridorsStory.hasGem('l2_bottle')) {
      addItem({
        x: ROOMS.pipe.left + 380, y: ROOMS.pipe.top + 100,
        w: 14, h: 14, icon: 'gem', gemColor: '#6fe0c5',
        prompt: '💎 ?',
        onPickup() { sfx('jingle'); if(window.HorridorsStory) window.HorridorsStory.unlockGem('l2_bottle'); }
      });
    }
    // ---- WATER crystal: spawned via spawnWaterCrystal() so we can add it at
    // reset OR mid-level (the instant the Grabpack is picked up). ----
    spawnWaterCrystal();

    buildWalls();
    // Reset player & camera
    player.x = 1170; player.y = 1020; player.facing = -Math.PI/2;
    camera.x = player.x - VIEW_W/2; camera.y = player.y - VIEW_H/2;

    // Wake up Socky Shok in the Control Room (small bob animation, says hi when approached)
    state.socky.active = true;
    state.socky.x = ROOMS.control.left + 260;
    state.socky.y = ROOMS.control.top + 160;
    state.socky.met = false;
    state.socky.given = false;

    setObjective('Find the big aquarium tank.');
  }

  // ---------- Collectibles / cutscene ----------
  // Persistent across L2 replays within the same page session.
  window.__horridorsProgress = window.__horridorsProgress || { collectibles: {} };
  const COLLECTIBLES = {
    comic1: {
      title: 'Inky Bin vs. The Drip #1',
      sub: '“Lights Out, Sort Of” — the first time Inky Bin saved you.',
      show: showComic1,
    },
  };
  function unlockCollectible(id) {
    const progress = window.__horridorsProgress;
    if (progress.collectibles[id]) return false; // already unlocked
    progress.collectibles[id] = true;
    // Play celebratory sound + show comic
    sfx('good');
    if (COLLECTIBLES[id] && COLLECTIBLES[id].show) {
      // Short delay so the speak() line lands first
      setTimeout(() => COLLECTIBLES[id].show(true), 900);
    }
    refreshCollectiblesButton();
    return true;
  }
  function showComic1(isNew) {
    const overlay = document.getElementById('overlay-comic');
    if (!overlay) return;
    // Update the NEW badge visibility
    const badge = document.getElementById('comic-badge');
    if (badge) badge.style.display = isNew ? 'inline-block' : 'none';
    overlay.classList.remove('hidden');
    state._prevScene = state.scene;
    state.scene = 'comic';
  }
  function closeComic() {
    const overlay = document.getElementById('overlay-comic');
    if (overlay) overlay.classList.add('hidden');
    if (state.scene === 'comic') state.scene = 'play';
  }
  const btnComicClose = document.getElementById('btn-comic-close');
  if (btnComicClose) btnComicClose.addEventListener('click', closeComic);

  // Collectibles gallery
  function openCollectibles() {
    const overlay = document.getElementById('overlay-collectibles');
    const list = document.getElementById('collectibles-list');
    if (!overlay || !list) return;
    list.innerHTML = '';
    const progress = window.__horridorsProgress;
    for (const id of Object.keys(COLLECTIBLES)) {
      const c = COLLECTIBLES[id];
      const unlocked = !!progress.collectibles[id];
      const div = document.createElement('div');
      div.className = 'collectible-item' + (unlocked ? '' : ' locked');
      div.innerHTML = '<div class="ci-title">' + (unlocked ? c.title : '??? Locked') +
        '</div><div class="ci-sub">' + (unlocked ? c.sub : 'Keep playing to unlock.') + '</div>';
      if (unlocked) {
        div.addEventListener('click', () => {
          overlay.classList.add('hidden');
          c.show(false);
        });
      }
      list.appendChild(div);
    }
    overlay.classList.remove('hidden');
    state._prevScene = state.scene;
    state.scene = 'collectibles';
  }
  function closeCollectibles() {
    const overlay = document.getElementById('overlay-collectibles');
    if (overlay) overlay.classList.add('hidden');
    if (state.scene === 'collectibles') state.scene = 'play';
  }
  const btnCollectiblesClose = document.getElementById('btn-collectibles-close');
  if (btnCollectiblesClose) btnCollectiblesClose.addEventListener('click', closeCollectibles);

  // Floating button to open gallery any time
  function ensureCollectiblesButton() {
    if (document.getElementById('btn-collectibles')) return;
    const btn = document.createElement('button');
    btn.id = 'btn-collectibles';
    btn.innerHTML = '📖 Collectibles <span class="ci-count" id="ci-count">0</span>';
    btn.addEventListener('click', openCollectibles);
    // Insert into game-frame
    const frame = document.getElementById('game-frame') || document.body;
    frame.appendChild(btn);
  }
  function refreshCollectiblesButton() {
    ensureCollectiblesButton();
    const count = Object.keys(window.__horridorsProgress.collectibles).length;
    const total = Object.keys(COLLECTIBLES).length;
    const badge = document.getElementById('ci-count');
    if (badge) badge.textContent = count + '/' + total;
  }

  function start() {
    // Guard against duplicate listeners / double RAF when re-entering
    if (!running) {
      window.addEventListener('keydown', keydown);
      window.addEventListener('keyup', keyup);
      window.addEventListener('blur', blur);
    }
    ensureAudio();

    // Hide any Level 1 DOM UI that might still be visible
    ['hud','overlay-title','overlay-end','overlay-caught','overlay-puzzle','overlay-combo','overlay-notes','chase-bar','hide-indicator','btn-notes','subtitle','prompt'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });

    // Show Level 2 title first
    document.getElementById('overlay-l2-title').classList.remove('hidden');
    state.scene = 'title';

    // Begin loop (only if not already running)
    if (!running) {
      running = true;
      lastT = performance.now();
      requestAnimationFrame(loop);
    }

    rebuildNotesList();
    refreshCollectiblesButton();
  }

  function stopLevel2() {
    running = false;
    try { window.removeEventListener('keydown', keydown); } catch (e) {}
    try { window.removeEventListener('keyup', keyup); } catch (e) {}
    try { window.removeEventListener('blur', blur); } catch (e) {}
    try { keys.clear(); } catch (e) {}
    try { stopAmbient(); } catch (e) {}
  }

  // Resume: pick up where the player left off — skip title + no state reset.
  function resumeLevel2() {
    ensureAudio();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    startAmbient();
    // Wire listeners if not running
    if (!running) {
      window.addEventListener('keydown', keydown);
      window.addEventListener('keyup', keyup);
      window.addEventListener('blur', blur);
      running = true;
      lastT = performance.now();
      requestAnimationFrame(loop);
    }
    // Hide all L2-related overlays so play is uninterrupted
    ['overlay-l2-title','overlay-l2-end','overlay-caught','overlay-cipher','overlay-valve','overlay-note']
      .forEach(id => { const el = document.getElementById(id); if (el) el.classList.add('hidden'); });
    state.scene = 'play';
    registerL2Tasks && registerL2Tasks();
  }

  // Title start button
  const btnL2Start = document.getElementById('btn-l2-start');
  if (btnL2Start) {
    btnL2Start.addEventListener('click', () => {
      ensureAudio();
      startAmbient();
      document.getElementById('overlay-l2-title').classList.add('hidden');
      resetLevel2State();
      state.scene = 'play';
      speak('The elevator groans shut behind you. Water up to your ankles.', 4200);
      // Remind about the Grabpack a few seconds in
      setTimeout(() => {
        if (!state.hasGrabpack && running) {
          speak('🧤 Tip: search the tool locker in the Pipe Room — a GRABPACK is hidden inside.', 5500);
        }
      }, 5500);
      registerL2Tasks();
    });
  }

  function l2DoneIds() {
    const done = new Set();
    if (state.hasSquidley) done.add('ally');
    if (state.hasValveRed && state.hasValveBlue && state.hasValveYellow) done.add('valves');
    if (state.cipherSolved) done.add('cipher');
    if (state.valveSolved) done.add('pumps');
    if (state.hasGrabpack) done.add('grabpack');
    if (state.socky.met) done.add('socky');
    if (state.elements.thunder) done.add('thunder');
    if (state.scene === 'end') done.add('escape');
    return done;
  }
  function registerL2Tasks() {
    if (!window.HorridorsTasks) return;
    window.HorridorsTasks.setLevel('l2', 'Level 2 — Tasks', [
      { id: 'ally',     label: 'Find a friend in the dark' },
      { id: 'valves',   label: 'Gather all three valves' },
      { id: 'cipher',   label: 'Solve the pipe cipher' },
      { id: 'pumps',    label: 'Set the pump gauges right' },
      { id: 'grabpack', label: 'Find the Grabpack' },
      { id: 'socky',    label: 'Meet Socky Shok' },
      { id: 'thunder',  label: 'Get the Thunder crystal' },
      { id: 'escape',   label: 'Escape up the stairs' },
    ], l2DoneIds);
  }

  // Level 2 end buttons
  const btnL2Replay = document.getElementById('btn-l2-replay');
  if (btnL2Replay) {
    btnL2Replay.addEventListener('click', () => {
      document.getElementById('overlay-l2-end').classList.add('hidden');
      resetLevel2State();
      state.scene = 'play';
      speak('Back into the dark. Water is rising again.', 3200);
    });
  }
  // Climb to Level 3 — hand off cleanly
  const btnLevel3 = document.getElementById('btn-level3');
  if (btnLevel3) {
    btnLevel3.addEventListener('click', () => {
      // Stop L2 game loop and listeners
      running = false;
      document.getElementById('overlay-l2-end').classList.add('hidden');
      document.getElementById('overlay-l2-title').classList.add('hidden');
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', blur);
      // Stop L2 ambient cleanly
      stopAmbient();
      // Hand off to Level 3
      if (typeof window.__startLevel3 === 'function') {
        window.__startLevel3();
      } else {
        console.warn('Level 3 not loaded — reloading');
        window.location.reload();
      }
    });
  }

  // Retry from caught — retry L2
  const btnRetry = document.getElementById('btn-retry');
  if (btnRetry) {
    btnRetry.addEventListener('click', () => {
      if (running) {
        document.getElementById('overlay-caught').classList.add('hidden');
        resetLevel2State();
        state.scene = 'play';
      }
    });
  }

  // Note close reused
  const btnNoteClose = document.getElementById('btn-note-close');
  if (btnNoteClose) {
    btnNoteClose.addEventListener('click', () => {
      if (running) closeNote();
    });
  }
  // Notes drawer toggle reused
  const btnNotes = document.getElementById('btn-notes');
  if (btnNotes) {
    btnNotes.addEventListener('click', () => {
      if (running) toggleNotes();
    });
  }
  const btnNotesClose = document.getElementById('btn-notes-close');
  if (btnNotesClose) {
    btnNotesClose.addEventListener('click', () => { if (running) toggleNotes(); });
  }

  // Expose starter
  window.__startLevel2 = start;
  window.__horridorsL2 = {
    audioCtx: () => audioCtx,
    masterGain: () => masterGain,
    stopAmbient,
    stop: stopLevel2,
    resume: resumeLevel2,
    isRunning: () => running,
    sfx: (n) => { try { sfx(n); } catch (e) {} },
  };
  // Debug
  window.__level2 = { state, player, squidley, drip, ROOMS, HUB, items, furniture, walls, SEARCH, sfx, speak, start };
})();
