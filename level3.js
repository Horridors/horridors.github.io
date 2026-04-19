// HORRIDORS — Level 3: Back Home (the corridor, changed)
// ----------------------------------------------------------------------
// Standalone scene module. Boots when window.__startLevel3() is called.
// Reuses the #game canvas and L1's audioCtx if available.
// New monster: EXPRESSION — the brown 1-eyed devil.
//   STARE => he freezes (when player faces him with flashlight on, line of sight).
//   LOOK AWAY => he charges fast.
// Three puzzles: 3 fuses, mirror reflection puzzle, 4-digit exit code.
// ----------------------------------------------------------------------

(() => {
  // ---------- Canvas ----------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const VIEW_W = canvas.width;   // 960
  const VIEW_H = canvas.height;  // 600

  // ---------- World ----------
  const WORLD_W = 2400, WORLD_H = 1400;
  // Corridor (long horizontal hallway)
  const CORR = { x1: 200, x2: 2240, y1: 900, y2: 1080 };
  // Rooms above the corridor (each has a doorway opening into corridor at room.dx)
  const ROOMS = {
    toy:    { x1: 240,  x2: 640,  y1: 200, y2: 820, dx: 440, name: "Toy Room" },
    puzzle: { x1: 760,  x2: 1160, y1: 200, y2: 820, dx: 960, name: "Puzzle Room" },
    supply: { x1: 1280, x2: 1680, y1: 200, y2: 820, dx: 1480, name: "Supply Closet" },
    lib:    { x1: 1800, x2: 2200, y1: 200, y2: 820, dx: 2000, name: "Library" },
  };
  // Camera
  const cam = { x: 0, y: 0 };

  // Coins scattered in the 4 rooms + corridor (all inside walkable bounds)
  // Rooms y:200-820, corridor y:900-1080
  const coins = [
    { x: 420,  y: 480, got: false, v: 1 },    // toy room
    { x: 520,  y: 720, got: false, v: 1 },    // toy room lower
    { x: 920,  y: 380, got: false, v: 2 },    // puzzle room
    { x: 1040, y: 700, got: false, v: 1 },    // puzzle room
    { x: 1440, y: 520, got: false, v: 2 },    // supply
    { x: 1600, y: 760, got: false, v: 1 },    // supply
    { x: 1920, y: 360, got: false, v: 2 },    // library
    { x: 2080, y: 640, got: false, v: 1 },    // library
    { x: 1200, y: 980, got: false, v: 2 },    // corridor middle
  ];

  function drawCoinsL3() {
    if (!window.HorridorsSprites) return;
    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    const t = performance.now();
    for (const c of coins) {
      if (c.got) continue;
      if (c.x < cam.x - 20 || c.x > cam.x + VIEW_W + 20) continue;
      window.HorridorsSprites.drawCoin(ctx, c.x, c.y, t, 7);
    }
    ctx.restore();
  }

  // ---------- State ----------
  const state = {
    scene: 'title',      // 'title' | 'play' | 'mirror' | 'code' | 'caught' | 'end'
    speakerLine: null, speakerT: 0,
    muted: false,
    flashlightOn: true,
    flashlightCharge: 1.0,   // 0..1, drains slightly when on
    fuses: 0,                // 0..3 collected
    foundFuse: { 0: false, 1: false, 2: false },
    foundFuseDigit: { 0: null, 1: null, 2: null },
    fuseDigitOrder: [0, 1, 2, 3],   // shuffled
    targetCode: [0, 0, 0, 0],
    enteredCode: [0, 0, 0, 0],
    mirrorSolved: false,
    codeSolved: false,
    breakerSolved: false,
    breakerOrder: [0, 1, 2],    // correct order (filled in resetLevel3State)
    breakerProgress: 0,          // index of next switch that must be flipped
    breakerFailed: 0,            // small counter for hint after wrong presses
    switchesOn: [false, false, false],
    objectives: [
      { id: 'fuses',   text: 'Find 3 fuses (look in furniture)',     done: false },
      { id: 'mirror',  text: 'Solve the Mirror in the Library',      done: false },
      { id: 'breaker', text: 'Flip the 3 power switches in order',    done: false },
      { id: 'code',    text: 'Crack the 4-digit code on the exit',    done: false },
      { id: 'exit',    text: 'Escape through the front door',          done: false },
    ],
    hintTimer: 0, hint: '',
    // Collectibles — shiny STAR TOKENS scattered around the map. Optional, tracked in HUD.
    stars: 0,
    starsTotal: 0,
  };

  // Pick a random 4-digit code, e.g. 4173 — each fuse reveals one digit
  function rollCode() {
    const digits = [0, 0, 0, 0].map(() => 1 + Math.floor(Math.random() * 9));
    state.targetCode = digits;
    // Shuffle which positions the 3 fuses reveal; the 4th digit is shown on the fuse box itself
    const order = [0, 1, 2, 3];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    state.fuseDigitOrder = order;
    state.foundFuseDigit = { 0: null, 1: null, 2: null };
  }

  // ---------- Input ----------
  const keys = new Set();
  const justPressed = new Set();
  function keydown(e) {
    const k = (e.key || '').toLowerCase();
    if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k)) e.preventDefault();
    if (!keys.has(k)) justPressed.add(k);
    keys.add(k);
  }
  function keyup(e) { keys.delete((e.key || '').toLowerCase()); }
  function blur() { keys.clear(); }
  const wasPressed = (...ks) => ks.some(k => justPressed.has(k));

  // ---------- Audio ----------
  let audioCtx = null, masterGain = null;
  function ensureAudio() {
    if (audioCtx) return;
    if (window.__horridorsL2 && window.__horridorsL2.audioCtx()) {
      audioCtx = window.__horridorsL2.audioCtx();
      masterGain = window.__horridorsL2.masterGain();
    } else if (window.__horridorsL1 && window.__horridorsL1.audioCtx()) {
      audioCtx = window.__horridorsL1.audioCtx();
      masterGain = window.__horridorsL1.masterGain();
    }
    if (!audioCtx) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = audioCtx.createGain();
        masterGain.gain.value = 0.5;
        masterGain.connect(audioCtx.destination);
      } catch (e) {}
    }
  }
  function tone(freq, dur = 0.1, type = 'sine', vol = 0.12, slideTo = null) {
    if (!audioCtx || state.muted) return;
    try {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, audioCtx.currentTime);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, audioCtx.currentTime + dur);
      g.gain.setValueAtTime(vol, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.connect(g); g.connect(masterGain);
      o.start(); o.stop(audioCtx.currentTime + dur);
    } catch (e) {}
  }
  function sfx(name) {
    switch (name) {
      case 'pickup':   tone(660, 0.08, 'triangle'); setTimeout(() => tone(990, 0.1, 'triangle'), 70); break;
      case 'fuse':     tone(330, 0.1, 'square'); setTimeout(() => tone(660, 0.12, 'square'), 80); setTimeout(() => tone(880, 0.18, 'square'), 180); break;
      case 'good':     tone(880, 0.15, 'sine'); setTimeout(() => tone(1320, 0.15, 'sine'), 100); break;
      case 'bad':      tone(160, 0.25, 'sawtooth', 0.18); break;
      case 'jingle':   tone(660, 0.15, 'triangle'); setTimeout(() => tone(880, 0.15, 'triangle'), 130); setTimeout(() => tone(1320, 0.2, 'triangle'), 260); setTimeout(() => tone(1760, 0.25, 'triangle'), 420); break;
      case 'snarl':    tone(110, 0.18, 'sawtooth', 0.14); setTimeout(() => tone(80, 0.25, 'sawtooth', 0.14), 60); break;
      case 'blink':    tone(220, 0.05, 'square', 0.08); break;
      case 'door':     tone(140, 0.5, 'sawtooth', 0.18, 60); break;
      case 'click':    tone(900, 0.04, 'square', 0.1); break;
    }
  }
  let ambientNodes = null;
  function startAmbient() {
    if (!audioCtx || ambientNodes) return;
    if (window.HorridorsAmbient) {
      ambientNodes = window.HorridorsAmbient.start(audioCtx, masterGain, { mood: 'corridor' });
    }
    if (window.HorridorsMusic) window.HorridorsMusic.setTheme(audioCtx, masterGain, 'l3');
  }
  function stopAmbient() {
    try { if (ambientNodes && ambientNodes.stop) ambientNodes.stop(); } catch (e) {}
    ambientNodes = null;
  }

  // ---------- Player ----------
  const player = {
    x: 250, y: 990, w: 22, h: 22,
    vx: 0, vy: 0,
    speed: 175,
    facing: 0,            // radians (0 = right)
    lastMoveX: 1, lastMoveY: 0,
  };

  // ---------- Expression (the brown one-eyed devil) ----------
  const expression = {
    x: 2150, y: 980, w: 38, h: 56,
    vx: 0, vy: 0,
    state: 'lurk',        // 'lurk' | 'charge' | 'frozen' | 'recoil' | 'blink'
    speed: 115,           // charge speed (was 180) — much slower for kid-friendliness
    recoilSpeed: 260,     // very fast back-off when flashlit — torch REALLY scares him off
    blinkT: 0,
    blinkInterval: 6 + Math.random() * 4,  // longer between blinks (was 4-7) — more time to react
    snarlT: 0,
    spawned: false,       // false until player enters first room
    eyeGlow: 1,
    seen: false,          // first sighting flag for line
    hurtFlash: 0,         // brief white flash when flashlit (feedback)
    safeUntil: 0,         // timestamp — torch grants a short grace period even after beam leaves
  };

  // Personal-space bubble: if the centers are closer than this, caught() only
  // fires while he's actively charging — frozen/recoil states will back him off
  // instead so the player can escape.
  const CAUGHT_DIST = 24;

  // ---------- Furniture (per-room searchables) ----------
  // Each room has 3 furniture pieces. One contains a fuse. Mirror is in lib.
  const furniture = [];
  function addFurn(f) { f.searched = false; furniture.push(f); }

  // Walls/obstacles (collapsed walls = obstacles). Computed lazily.
  const obstacles = []; // {x,y,w,h}
  function addObs(x, y, w, h) { obstacles.push({ x, y, w, h }); }

  // Items on the floor (rare — most are in furniture)
  const items = []; // {x,y,w,h,kind,onPickup}

  // Fuse box hint sign (always visible in corridor)
  const fuseBox = { x: 1100, y: 920, w: 36, h: 60 };
  // Breaker switches (one per room: toy, puzzle, supply). Label 1/2/3.
  const switches = [
    { id: 0, x: 600,  y: 260, w: 22, h: 30, label: '1', room: 'toy' },
    { id: 1, x: 1120, y: 260, w: 22, h: 30, label: '2', room: 'puzzle' },
    { id: 2, x: 1640, y: 260, w: 22, h: 30, label: '3', room: 'supply' },
  ];
  // Exit door — far right of corridor
  const exitDoor = { x: 2200, y: 940, w: 24, h: 100, locked: true };
  // Mirror puzzle entry — in library
  const mirrorEntry = { x: 1980, y: 360, w: 36, h: 36 };
  // Code panel — by exit
  const codePanel = { x: 2150, y: 940, w: 30, h: 60 };

  // ---------- Mirror puzzle ----------
  // 3x3 grid. Left column has FIXED symbols. Player must set rows so each row
  // mirrors the column-left symbol (i.e., row[0]==row[2]==left[r], row[1] = a "mirror" pair).
  // Simpler: each cell has a symbol id 0..3. The left column has 3 fixed symbols.
  // The player clicks tiles in cols 1 & 2 to cycle. Solved when col2[r] == left[r] for all r.
  const mirror = {
    left: [0, 1, 2],     // fixed
    grid: [[0,0],[0,0],[0,0]],   // [row][col-1] for cols 1 and 2
  };
  function rollMirror() {
    mirror.left = [0, 1, 2].sort(() => Math.random() - 0.5);
    mirror.grid = [
      [Math.floor(Math.random()*3), Math.floor(Math.random()*3)],
      [Math.floor(Math.random()*3), Math.floor(Math.random()*3)],
      [Math.floor(Math.random()*3), Math.floor(Math.random()*3)],
    ];
  }
  function checkMirrorSolved() {
    for (let r = 0; r < 3; r++) {
      // To solve: col1 == col2 and col2 == left[r]
      if (mirror.grid[r][0] !== mirror.left[r]) return false;
      if (mirror.grid[r][1] !== mirror.left[r]) return false;
    }
    return true;
  }

  // ---------- Build world ----------
  function buildWorld() {
    obstacles.length = 0; furniture.length = 0; items.length = 0;

    // World perimeter
    addObs(-50, -50, WORLD_W + 100, 50);                 // top
    addObs(-50, WORLD_H, WORLD_W + 100, 50);             // bottom
    addObs(-50, -50, 50, WORLD_H + 100);                 // left
    addObs(WORLD_W, -50, 50, WORLD_H + 100);             // right

    // Corridor walls
    addObs(CORR.x1 - 10, CORR.y1 - 20, CORR.x2 - CORR.x1 + 20, 20); // top wall (will be punctured by doorways below)
    addObs(CORR.x1 - 10, CORR.y2,      CORR.x2 - CORR.x1 + 20, 20); // bottom wall

    // Punch doorways in the top corridor wall by removing a chunk per room
    // Easiest: instead of one long top wall, use segments around each doorway.
    obstacles.pop(); obstacles.pop(); // remove top + bottom corridor walls just added — rebuild top
    addObs(CORR.x1 - 10, CORR.y2, CORR.x2 - CORR.x1 + 20, 20);
    const topSegments = [];
    const doorways = Object.values(ROOMS).map(r => ({ x: r.dx - 30, w: 60 })).sort((a, b) => a.x - b.x);
    let cursor = CORR.x1 - 10;
    for (const d of doorways) {
      if (d.x > cursor) topSegments.push({ x: cursor, w: d.x - cursor });
      cursor = d.x + d.w;
    }
    if (cursor < CORR.x2 + 10) topSegments.push({ x: cursor, w: (CORR.x2 + 10) - cursor });
    for (const s of topSegments) addObs(s.x, CORR.y1 - 20, s.w, 20);

    // Room walls (each room is a rectangle with door opening at room.dx)
    for (const k of Object.keys(ROOMS)) {
      const r = ROOMS[k];
      // top wall
      addObs(r.x1 - 10, r.y1 - 20, (r.x2 - r.x1) + 20, 20);
      // left wall
      addObs(r.x1 - 20, r.y1 - 20, 20, (r.y2 - r.y1) + 40);
      // right wall
      addObs(r.x2,      r.y1 - 20, 20, (r.y2 - r.y1) + 40);
      // bottom wall has gap for doorway at r.dx (gap width 60)
      const left  = { x: r.x1 - 10, w: (r.dx - 30) - (r.x1 - 10) };
      const right = { x: r.dx + 30, w: (r.x2 + 10) - (r.dx + 30) };
      if (left.w > 0)  addObs(left.x,  r.y2, left.w,  20);
      if (right.w > 0) addObs(right.x, r.y2, right.w, 20);
    }

    // --- SEAL the area between rooms (bug: player could walk around the back) ---
    // Rooms span x1→x2 with y1=200, y2=820. Corridor top is at y=900.
    // Fill every vertical slice outside the rooms, from y=180 down to corridor-top (y=880)
    // so there's no way to slip around the back of a room.
    const roomList = Object.values(ROOMS).sort((a, b) => a.x1 - b.x1);
    const gapY = 180;              // top of "attic" zone
    const gapH = (CORR.y1 - 20) - gapY;  // down to top corridor wall
    let cur = 0;
    for (const r of roomList) {
      const leftEdge = r.x1 - 20; // room left wall ends at r.x1-20
      if (leftEdge > cur) addObs(cur, gapY, leftEdge - cur, gapH);
      cur = r.x2 + 20;            // past room right wall
    }
    if (cur < WORLD_W) addObs(cur, gapY, WORLD_W - cur, gapH);
    // Also add a ceiling strip along the very top of the world so there's no
    // strip between y=0 and y=180 to walk through.
    addObs(0, 0, WORLD_W, gapY);
    // SEAL the bottom "basement" gap: the area BELOW the corridor (y=1080 → WORLD_H)
    // was walkable empty space. Fill it so the player stays in the corridor.
    addObs(0, CORR.y2 + 20, WORLD_W, WORLD_H - (CORR.y2 + 20));

    // Some collapsed-debris obstacles in the corridor (atmosphere)
    addObs(720,  CORR.y1 + 60, 50, 70);   // pile of rubble
    addObs(1700, CORR.y1 + 50, 70, 80);   // collapsed shelving

    // Per-room furniture
    // Toy Room: chest, plush pile, toy box (fuse possible)
    addFurn({ id: 't1', x: 320,  y: 280, w: 60, h: 50, label: 'Toy chest',  containsFuse: false });
    addFurn({ id: 't2', x: 460,  y: 320, w: 60, h: 50, label: 'Plush pile', containsFuse: true,  fuseIdx: 0 });
    addFurn({ id: 't3', x: 320,  y: 600, w: 80, h: 60, label: 'Doll house', containsFuse: false });
    // Puzzle Room: bookshelf, desk, painting (one fuse)
    addFurn({ id: 'p1', x: 820,  y: 280, w: 50, h: 60, label: 'Bookshelf',  containsFuse: false });
    addFurn({ id: 'p2', x: 980,  y: 320, w: 70, h: 50, label: 'Old desk',   containsFuse: true,  fuseIdx: 1 });
    addFurn({ id: 'p3', x: 820,  y: 600, w: 80, h: 60, label: 'Crooked painting', containsFuse: false });
    // Supply Closet: cabinet (probably fuse), crate, mop bucket
    addFurn({ id: 's1', x: 1330, y: 280, w: 60, h: 60, label: 'Steel cabinet', containsFuse: true, fuseIdx: 2 });
    addFurn({ id: 's2', x: 1500, y: 320, w: 70, h: 50, label: 'Wooden crate', containsFuse: false });
    addFurn({ id: 's3', x: 1330, y: 620, w: 50, h: 50, label: 'Mop bucket', containsFuse: false });
    // Library: bookshelf, the MIRROR, reading chair
    addFurn({ id: 'l1', x: 1850, y: 280, w: 50, h: 60, label: 'Tall bookshelf', containsFuse: false });
    addFurn({ id: 'l2', x: 2080, y: 280, w: 60, h: 50, label: 'Reading chair', containsFuse: false });
    // mirror frame is rendered separately as `mirrorEntry` above

    // Randomize so the 3 "containsFuse" tags actually map to fuses 0,1,2 — but
    // we want one fuse per room (out of 3 rooms with fuses).
    // The flags above already do this (toy=0, puzzle=1, supply=2) — good.

    // ---------- STAR TOKENS (collectibles) ----------
    // Ten glowing stars sprinkled across the corridor + rooms. Walk over to collect.
    items.push(
      // Corridor
      { kind: 'star', x: 340,  y: 1000, w: 18, h: 18, collected: false },
      { kind: 'star', x: 880,  y: 990,  w: 18, h: 18, collected: false },
      { kind: 'star', x: 1260, y: 1000, w: 18, h: 18, collected: false },
      { kind: 'star', x: 1900, y: 990,  w: 18, h: 18, collected: false },
      // Toy Room
      { kind: 'star', x: 560,  y: 760,  w: 18, h: 18, collected: false },
      // Puzzle Room
      { kind: 'star', x: 1080, y: 500,  w: 18, h: 18, collected: false },
      // Supply Closet
      { kind: 'star', x: 1580, y: 760,  w: 18, h: 18, collected: false },
      // Library
      { kind: 'star', x: 2140, y: 500,  w: 18, h: 18, collected: false },
      { kind: 'star', x: 1870, y: 760,  w: 18, h: 18, collected: false },
      // Near exit (reward for making it all the way)
      { kind: 'star', x: 2180, y: 1000, w: 18, h: 18, collected: false },
    );
    state.starsTotal = items.filter(it => it.kind === 'star').length;
    state.stars = 0;

    // ---------- HIDDEN GEM L3: broken crayon in Toy Room ----------
    if (!window.HorridorsStory || !window.HorridorsStory.hasGem('l3_crayon')) {
      items.push({ kind: 'gem', gemId: 'l3_crayon', gemColor: '#ff8db3', x: 480, y: 380, w: 18, h: 18, collected: false });
    }

    rollCode();
    rollMirror();
  }

  // ---------- Geometry helpers ----------
  function rectIntersect(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  function clampToWorld() {
    if (player.x < 10) player.x = 10;
    if (player.y < 10) player.y = 10;
    if (player.x + player.w > WORLD_W - 10) player.x = WORLD_W - 10 - player.w;
    if (player.y + player.h > WORLD_H - 10) player.y = WORLD_H - 10 - player.h;
  }
  function moveWithCollision(ent, dx, dy) {
    ent.x += dx;
    for (const o of obstacles) {
      if (rectIntersect(ent, o)) {
        if (dx > 0) ent.x = o.x - ent.w;
        else if (dx < 0) ent.x = o.x + o.w;
      }
    }
    ent.y += dy;
    for (const o of obstacles) {
      if (rectIntersect(ent, o)) {
        if (dy > 0) ent.y = o.y - ent.h;
        else if (dy < 0) ent.y = o.y + o.h;
      }
    }
    // Furniture also blocks
    for (const f of furniture) {
      if (rectIntersect(ent, f)) {
        // push out by smallest axis
        const ox = Math.min(ent.x + ent.w - f.x, f.x + f.w - ent.x);
        const oy = Math.min(ent.y + ent.h - f.y, f.y + f.h - ent.y);
        if (ox < oy) {
          if (ent.x < f.x) ent.x = f.x - ent.w; else ent.x = f.x + f.w;
        } else {
          if (ent.y < f.y) ent.y = f.y - ent.h; else ent.y = f.y + f.h;
        }
      }
    }
  }
  function distance(a, b) {
    const dx = (a.x + a.w / 2) - (b.x + b.w / 2);
    const dy = (a.y + a.h / 2) - (b.y + b.h / 2);
    return Math.sqrt(dx * dx + dy * dy);
  }
  function lineOfSight(a, b) {
    const ax = a.x + a.w / 2, ay = a.y + a.h / 2;
    const bx = b.x + b.w / 2, by = b.y + b.h / 2;
    const steps = 20;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const px = ax + (bx - ax) * t;
      const py = ay + (by - ay) * t;
      const probe = { x: px - 2, y: py - 2, w: 4, h: 4 };
      for (const o of obstacles) if (rectIntersect(probe, o)) return false;
    }
    return true;
  }

  // ---------- Subtitle / Speaker ----------
  function speak(line, ms = 2800) {
    state.speakerLine = line;
    state.speakerT = ms / 1000;
  }
  function tickSpeaker(dt) {
    if (state.speakerT > 0) state.speakerT -= dt;
    if (state.speakerT <= 0) state.speakerLine = null;
  }
  function setHint(text) {
    state.hint = text;
    state.hintTimer = 2.4;
  }

  // ---------- Update ----------
  function update(dt) {
    tickSpeaker(dt);
    if (state.hintTimer > 0) state.hintTimer -= dt;

    if (state.scene !== 'play') {
      player.vx = 0; player.vy = 0;
      return;
    }

    // F = flashlight toggle
    if (wasPressed('f')) { state.flashlightOn = !state.flashlightOn; sfx('click'); }
    // Flashlight drains slowly when on, recharges when off. Never fully dies — dims instead.
    if (state.flashlightOn) {
      state.flashlightCharge = Math.max(0.25, state.flashlightCharge - dt * 0.004);
    } else {
      state.flashlightCharge = Math.min(1.0, state.flashlightCharge + dt * 0.08);
    }

    // Movement
    let mx = 0, my = 0;
    if (keys.has('a') || keys.has('arrowleft'))  mx -= 1;
    if (keys.has('d') || keys.has('arrowright')) mx += 1;
    if (keys.has('w') || keys.has('arrowup'))    my -= 1;
    if (keys.has('s') || keys.has('arrowdown'))  my += 1;
    if (mx !== 0 && my !== 0) { mx *= 0.7071; my *= 0.7071; }
    if (mx !== 0 || my !== 0) {
      player.lastMoveX = mx; player.lastMoveY = my;
      player.facing = Math.atan2(my, mx);
    }
    moveWithCollision(player, mx * player.speed * dt, my * player.speed * dt);
    clampToWorld();

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

    // Camera follow
    const targetCamX = player.x - VIEW_W / 2;
    const targetCamY = player.y - VIEW_H / 2;
    cam.x += (targetCamX - cam.x) * 0.18;
    cam.y += (targetCamY - cam.y) * 0.18;
    cam.x = Math.max(0, Math.min(cam.x, WORLD_W - VIEW_W));
    cam.y = Math.max(0, Math.min(cam.y, WORLD_H - VIEW_H));

    // Has player entered any room? -> spawn Expression
    if (!expression.spawned) {
      for (const k of Object.keys(ROOMS)) {
        const r = ROOMS[k];
        if (player.x > r.x1 && player.x < r.x2 && player.y > r.y1 && player.y < r.y2) {
          expression.spawned = true;
          // Spawn at far end of corridor
          expression.x = (player.x < WORLD_W / 2) ? CORR.x2 - 80 : CORR.x1 + 60;
          expression.y = 970;
          speak("Footsteps... behind you. Don't look away.", 3600);
          sfx('snarl');
          break;
        }
      }
    }

    // Expression AI
    if (expression.spawned) updateExpression(dt);

    // STAR TOKEN pickup — walk over to collect
    for (const it of items) {
      if (it.collected || it.kind !== 'star') continue;
      if (rectIntersect(player, it)) {
        it.collected = true;
        state.stars++;
        sfx('click');
        // Tiny celebration line on milestones
        if (state.stars === state.starsTotal) speak(`All ${state.starsTotal} stars collected!`, 2600);
        else if (state.stars === 5 || state.stars === 10) speak(`${state.stars} stars!`, 1600);
      }
    }
    // HIDDEN GEM pickup — walk over to collect
    for (const it of items) {
      if (it.collected || it.kind !== 'gem') continue;
      if (rectIntersect(player, it)) {
        it.collected = true;
        sfx('click');
        if (window.HorridorsStory && it.gemId) window.HorridorsStory.unlockGem(it.gemId);
      }
    }

    // AUTO-FINISH: walking through the unlocked exit door ends the level.
    // (Previously required pressing E at the door — confusing when the door looked open.)
    if (state.codeSolved && state.scene === 'play') {
      const doorCX = exitDoor.x + exitDoor.w / 2;
      const doorCY = exitDoor.y + exitDoor.h / 2;
      const pcx = player.x + player.w / 2;
      const pcy = player.y + player.h / 2;
      // Proximity box: any time the player is within ~40px of the door center, finish.
      if (Math.abs(pcx - doorCX) < 50 && Math.abs(pcy - doorCY) < 70) {
        endLevel3();
      }
    }

    // E / Space = interact (search nearest furniture, mirror, code, exit)
    if (wasPressed('e', ' ')) tryInteract();

    // M = mute toggle
    if (wasPressed('m')) { state.muted = !state.muted; if (masterGain) masterGain.gain.value = state.muted ? 0 : 0.5; }
  }

  function playerIsLookingAtMonster() {
    const dx = (expression.x + expression.w / 2) - (player.x + player.w / 2);
    const dy = (expression.y + expression.h / 2) - (player.y + player.h / 2);
    const angleToMonster = Math.atan2(dy, dx);
    let diff = Math.atan2(Math.sin(angleToMonster - player.facing), Math.cos(angleToMonster - player.facing));
    return Math.abs(diff) < Math.PI / 4;  // ±45°
  }

  function updateExpression(dt) {
    // Decay hurt flash feedback
    if (expression.hurtFlash > 0) expression.hurtFlash = Math.max(0, expression.hurtFlash - dt);

    // Blink timer — sometimes Expression's eye blinks (brief invulnerability for him)
    expression.blinkT += dt;
    if (expression.state !== 'blink' && expression.blinkT > expression.blinkInterval) {
      expression.state = 'blink';
      expression.blinkT = 0;
      expression.blinkInterval = 5 + Math.random() * 4;
      expression.eyeGlow = 0;
      sfx('blink');
      setTimeout(() => {
        // Return to charge after blink — state machine will re-evaluate next tick
        expression.state = 'charge';
        expression.eyeGlow = 1;
      }, 380);
    }

    const dist = distance(player, expression);

    // Snarl ambience near player
    if (dist < 250) {
      expression.snarlT -= dt;
      if (expression.snarlT <= 0) {
        sfx('snarl');
        expression.snarlT = 0.9 + Math.random() * 0.6;
      }
    }

    // Determine state:
    //  - RECOIL = flashlight beam hits him — he backs away FAST. Primary "push him back" mechanic.
    //  - FROZEN = he's in wide view (±45°) with torch on AND close (< 120px). Last-resort freeze so he can't dart in from meters away.
    //  - GRACE  = the torch hit him very recently — even if beam isn't on him now, he keeps recoiling briefly (helps kids keep him away while running).
    //  - CHARGE = anything else.
    const los = lineOfSight(player, expression);
    const flashlit = state.flashlightOn && state.flashlightCharge > 0;
    // WIDER beam (dist 340 instead of 260) and grace timer extends the safe window
    const inBeam = flashlit && los && dist < 420 && playerFlashlightHits();  // longer reach
    const closeWideView = flashlit && los && dist < 150 && playerIsLookingAtMonster();  // wider safe bubble
    const now = performance.now();
    if (inBeam) expression.safeUntil = now + 1600;  // 1.6s of recoil even after beam moves off (very forgiving)
    const inGrace = now < expression.safeUntil;

    if (expression.state !== 'blink') {
      if (inBeam || inGrace) {
        expression.state = 'recoil';
        if (inBeam) expression.hurtFlash = 0.4;
      } else if (closeWideView) {
        expression.state = 'frozen';
      } else {
        expression.state = 'charge';
      }
    }

    const _dL3 = (window.__difficulty && window.__difficulty.get()) || { speedMul: 1 };
    if (expression.state === 'charge') {
      // Pathfind in straight line toward player using simple axis-by-axis
      const tx = player.x - expression.x;
      const ty = player.y - expression.y;
      const len = Math.hypot(tx, ty) || 1;
      const sp = expression.speed * _dL3.speedMul;
      moveWithCollision(expression, (tx / len) * sp * dt, (ty / len) * sp * dt);
    } else if (expression.state === 'blink') {
      // During blink, he creeps a bit faster
      const tx = player.x - expression.x;
      const ty = player.y - expression.y;
      const len = Math.hypot(tx, ty) || 1;
      const sp = 220 * _dL3.speedMul;
      moveWithCollision(expression, (tx / len) * sp * dt, (ty / len) * sp * dt);
    } else if (expression.state === 'recoil') {
      // Back AWAY from player slowly — buys the player time to escape
      const tx = expression.x - player.x;
      const ty = expression.y - player.y;
      const len = Math.hypot(tx, ty) || 1;
      const sp = expression.recoilSpeed;
      moveWithCollision(expression, (tx / len) * sp * dt, (ty / len) * sp * dt);
    }
    // frozen => no movement

    // Personal-space bubble push-out: if overlapping AND he's frozen or recoiling,
    // push him out of the player's space so the player never gets trapped.
    if ((expression.state === 'frozen' || expression.state === 'recoil' || expression.state === 'blink')
        && rectIntersect(player, expression)) {
      const pcx = player.x + player.w/2;
      const pcy = player.y + player.h/2;
      const ecx = expression.x + expression.w/2;
      const ecy = expression.y + expression.h/2;
      let dx = ecx - pcx, dy = ecy - pcy;
      const len = Math.hypot(dx, dy) || 1;
      // Nudge him 60px/s minimum even if frozen — but only to escape overlap
      const push = 90 * dt;
      moveWithCollision(expression, (dx / len) * push, (dy / len) * push);
    }

    // Caught = touching WHILE he is actively charging or blinking.
    // Frozen/recoil will NOT catch the player — this is the "no way out" fix.
    if (rectIntersect(player, expression) &&
        (expression.state === 'charge' || expression.state === 'blink')) {
      caught();
    }

    // First-sighting line
    if (!expression.seen && los && dist < 360) {
      expression.seen = true;
      speak('"Don\'t...blink..."', 3000);
    }
  }

  // True if the player's flashlight cone CONTAINS Ex Preshon (beam hits him).
  // Kid-friendly: uses a GENEROUS cone (±40°) so imprecise aiming still counts.
  function playerFlashlightHits() {
    const dx = (expression.x + expression.w/2) - (player.x + player.w/2);
    const dy = (expression.y + expression.h/2) - (player.y + player.h/2);
    const angleToMonster = Math.atan2(dy, dx);
    let diff = Math.atan2(Math.sin(angleToMonster - player.facing), Math.cos(angleToMonster - player.facing));
    return Math.abs(diff) < (Math.PI / 3.6);  // ±50° — very forgiving aim for kids
  }

  function caught() {
    if (state.scene !== 'play') return;
    state.scene = 'caught';
    sfx('bad');
    // Swap the whisper to match Ex Preshon
    const whisper = document.getElementById('caught-whisper');
    if (whisper) whisper.textContent = '"You blinked."';
    document.getElementById('overlay-caught').classList.remove('hidden');
  }

  // L3-specific retry handler (guarded by running flag)
  document.getElementById('btn-retry')?.addEventListener('click', () => {
    if (!running) return;
    if (state.scene !== 'caught') return;
    document.getElementById('overlay-caught').classList.add('hidden');
    resetLevel3State();
    state.scene = 'play';
    speak('Again. Eye open this time.', 2400);
  });

  function tryInteract() {
    // Mirror
    if (Math.hypot(player.x - mirrorEntry.x, player.y - mirrorEntry.y) < 70) {
      openMirror(); return;
    }
    // Breaker switches
    for (const sw of switches) {
      if (Math.hypot((player.x + player.w/2) - (sw.x + sw.w/2),
                     (player.y + player.h/2) - (sw.y + sw.h/2)) < 50) {
        flipSwitch(sw);
        return;
      }
    }
    // Code panel (near exit)
    if (Math.hypot(player.x - codePanel.x, player.y - codePanel.y) < 70) {
      openCode(); return;
    }
    // Fuse box hint (read clue)
    if (Math.hypot(player.x - fuseBox.x, player.y - fuseBox.y) < 70) {
      const lastDigit = state.targetCode[state.fuseDigitOrder[3]];
      const pos = state.fuseDigitOrder[3] + 1;
      speak(`Fuse box says: digit ${pos} = ${lastDigit}.  Find 3 fuses for the rest.`, 4500);
      return;
    }
    // Furniture
    for (const f of furniture) {
      if (Math.hypot((player.x + player.w/2) - (f.x + f.w/2), (player.y + player.h/2) - (f.y + f.h/2)) < 60 && !f.searched) {
        f.searched = true;
        if (f.containsFuse && !state.foundFuse[f.fuseIdx]) {
          state.foundFuse[f.fuseIdx] = true;
          state.fuses += 1;
          // Reveal which digit this fuse uncovers
          const slot = state.fuseDigitOrder[f.fuseIdx];
          state.foundFuseDigit[f.fuseIdx] = state.targetCode[slot];
          sfx('fuse');
          speak(`FUSE found in ${f.label}!  Position ${slot + 1} = ${state.targetCode[slot]}.`, 4200);
          // mark objective
          if (state.fuses >= 3) {
            const obj = state.objectives.find(o => o.id === 'fuses');
            if (obj) obj.done = true;
          }
        } else {
          sfx('click');
          const flavor = [
            'Empty. Just dust and broken plastic.',
            'Nothing in here but old toys.',
            'Cobwebs. A faded photograph.',
            'A scribbled drawing of an eye.',
            'Smells like the basement.',
          ];
          speak(flavor[Math.floor(Math.random() * flavor.length)], 2400);
        }
        return;
      }
    }
    // Exit door
    if (Math.hypot(player.x - exitDoor.x, player.y - exitDoor.y) < 60) {
      if (state.codeSolved) {
        endLevel3();
      } else {
        speak('Locked. The keypad needs a 4-digit code.', 2800);
      }
    }
  }

  // ---------- Mirror puzzle UI ----------
  const overlayMirror = document.getElementById('overlay-mirror');
  const mirrorBoard = document.getElementById('mirror-board');
  const mirrorStatus = document.getElementById('mirror-status');
  const SYMBOLS = ['◆', '◯', '✦'];
  const SYMBOL_COLORS = ['#ff7a5a', '#ffd166', '#9be7ff'];
  function renderMirror() {
    if (!mirrorBoard) return;
    mirrorBoard.innerHTML = '';
    for (let r = 0; r < 3; r++) {
      // Left fixed column (display-only)
      const lt = document.createElement('div');
      lt.className = 'mirror-tile fixed';
      lt.textContent = SYMBOLS[mirror.left[r]];
      lt.style.color = SYMBOL_COLORS[mirror.left[r]];
      mirrorBoard.appendChild(lt);
      // Cols 1 & 2: clickable
      for (let c = 0; c < 2; c++) {
        const t = document.createElement('button');
        t.className = 'mirror-tile';
        t.textContent = SYMBOLS[mirror.grid[r][c]];
        t.style.color = SYMBOL_COLORS[mirror.grid[r][c]];
        t.addEventListener('click', () => {
          mirror.grid[r][c] = (mirror.grid[r][c] + 1) % 3;
          sfx('click');
          renderMirror();
          if (checkMirrorSolved()) {
            state.mirrorSolved = true;
            const obj = state.objectives.find(o => o.id === 'mirror');
            if (obj) obj.done = true;
            mirrorStatus.textContent = "The mirror approves. You hear a click in the corridor.";
            mirrorStatus.style.color = '#a4ffb6';
            sfx('good');
            setTimeout(closeMirror, 1400);
          } else {
            mirrorStatus.textContent = '';
          }
        });
        mirrorBoard.appendChild(t);
      }
    }
  }
  function openMirror() {
    if (state.mirrorSolved) {
      // After mirror is solved, reveal the breaker order
      const order = state.breakerOrder.map(i => i + 1).join(' — ');
      speak(`The mirror whispers the order: ${order}`, 4000);
      return;
    }
    state.scene = 'mirror';
    overlayMirror.classList.remove('hidden');
    mirrorStatus.textContent = '';
    renderMirror();
  }

  // ---------- Breaker switch puzzle ----------
  function flipSwitch(sw) {
    if (state.breakerSolved) {
      speak('The breaker is already set. Save your strength.', 2200);
      return;
    }
    if (!state.mirrorSolved) {
      speak('The switch won\'t budge — it feels locked. Something needs to happen first.', 3200);
      return;
    }
    // Flip state
    state.switchesOn[sw.id] = !state.switchesOn[sw.id];
    sfx('click');
    if (!state.switchesOn[sw.id]) {
      // turning OFF mid-puzzle resets progress
      state.breakerProgress = 0;
      state.switchesOn = [false, false, false];
      speak('A heavy clunk. All three reset.', 2200);
      return;
    }
    // Turning ON — check if it's the next correct switch in the order
    const expected = state.breakerOrder[state.breakerProgress];
    if (sw.id === expected) {
      state.breakerProgress += 1;
      if (state.breakerProgress >= 3) {
        state.breakerSolved = true;
        const obj = state.objectives.find(o => o.id === 'breaker');
        if (obj) obj.done = true;
        sfx('good');
        speak('POWER ON. The exit keypad lights up.', 3000);
      } else {
        sfx('fuse');
        speak(`Switch ${sw.label} is hot. ${3 - state.breakerProgress} to go.`, 2400);
      }
    } else {
      // wrong switch — reset and buzz
      sfx('bad');
      state.breakerProgress = 0;
      state.switchesOn = [false, false, false];
      state.breakerFailed += 1;
      const hint = state.breakerFailed >= 2 ? ` The mirror said: ${state.breakerOrder.map(i => i+1).join('—')}.` : '';
      speak('Wrong switch. Everything resets.' + hint, 3000);
    }
  }
  function closeMirror() {
    overlayMirror.classList.add('hidden');
    state.scene = 'play';
  }
  document.getElementById('btn-mirror-close')?.addEventListener('click', closeMirror);

  // ---------- Code panel UI ----------
  const overlayCode = document.getElementById('overlay-code');
  const codeStatus = document.getElementById('code-status');
  const codeSub = document.getElementById('code-sub');
  function refreshCode() {
    for (let i = 0; i < 4; i++) {
      const el = document.getElementById('cw' + i);
      if (el) el.textContent = String(state.enteredCode[i]);
    }
    // Sub: show known digits as hints
    const known = [];
    for (let f = 0; f < 3; f++) {
      if (state.foundFuseDigit[f] !== null) {
        const slot = state.fuseDigitOrder[f];
        known.push(`pos ${slot + 1} = ${state.foundFuseDigit[f]}`);
      }
    }
    const lastSlot = state.fuseDigitOrder[3];
    known.push(`pos ${lastSlot + 1} = ${state.targetCode[lastSlot]} (fuse box)`);
    codeSub.textContent = known.length ? 'Clues: ' + known.join(' · ') : 'Find the fuses for clues.';
  }
  function openCode() {
    if (!state.breakerSolved) {
      speak('The keypad is dead. The power is off somewhere.', 2800);
      return;
    }
    state.scene = 'code';
    overlayCode.classList.remove('hidden');
    codeStatus.textContent = '';
    refreshCode();
  }
  function closeCode() {
    overlayCode.classList.add('hidden');
    state.scene = 'play';
  }
  document.getElementById('btn-code-close')?.addEventListener('click', closeCode);
  // Wheel buttons
  document.querySelectorAll('#overlay-code .cw-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const w = parseInt(btn.dataset.w, 10);
      const dir = parseInt(btn.dataset.dir, 10);
      state.enteredCode[w] = (state.enteredCode[w] + dir + 10) % 10;
      sfx('click');
      refreshCode();
    });
  });
  document.getElementById('btn-code-try')?.addEventListener('click', () => {
    const ok = state.enteredCode.every((d, i) => d === state.targetCode[i]);
    if (ok) {
      state.codeSolved = true;
      const obj = state.objectives.find(o => o.id === 'code');
      if (obj) obj.done = true;
      exitDoor.locked = false;
      codeStatus.textContent = 'CLICK. The door unlocks.';
      codeStatus.style.color = '#a4ffb6';
      sfx('good');
      setTimeout(() => {
        closeCode();
        speak('The door is open. Walk into the morning.', 3200);
      }, 1100);
    } else {
      codeStatus.textContent = 'Wrong code. The hallway groans.';
      codeStatus.style.color = '#ff8a8a';
      sfx('bad');
    }
  });

  // ---------- End level ----------
  function endLevel3() {
    if (state.scene === 'end') return;
    state.scene = 'end';
    const obj = state.objectives.find(o => o.id === 'exit');
    if (obj) obj.done = true;
    sfx('door'); sfx('jingle');
    const rewards = [];
    rewards.push('👁️ Survived Ex Preshon');
    rewards.push('🔌 ' + state.fuses + ' Fuses Recovered');
    if (state.mirrorSolved) rewards.push('🪞 Reflection Mastered');
    rewards.push('🚪 Front Door Reached');
    rewards.push('📖 Comic Unlocked: Ex Preshon — Origin');
    document.getElementById('l3-reward-chest').innerHTML = rewards.map(r => `<div class="reward-item">${r}</div>`).join('');
    document.getElementById('overlay-l3-end').classList.remove('hidden');
    // Auto-unlock the comic the first time the player finishes L3
    unlockL3Comic();
  }

  // ---------- L3 Comic collectible ----------
  window.__horridorsProgress = window.__horridorsProgress || { collectibles: {} };
  function unlockL3Comic() {
    const progress = window.__horridorsProgress;
    const firstTime = !progress.collectibles.comic_l3;
    progress.collectibles.comic_l3 = true;
    if (firstTime) {
      sfx('good');
      // Short delay so the end chime lands first, then auto-show comic with NEW badge
      setTimeout(() => showL3Comic(true), 900);
    }
  }
  function showL3Comic(isNew) {
    const overlay = document.getElementById('overlay-l3-comic');
    if (!overlay) return;
    const badge = document.getElementById('l3-comic-badge');
    if (badge) badge.style.display = isNew ? 'inline-block' : 'none';
    // Hide the end overlay beneath while comic is up (keep it around to return to)
    const endOverlay = document.getElementById('overlay-l3-end');
    if (endOverlay) endOverlay.classList.add('hidden');
    overlay.classList.remove('hidden');
    state._prevScene = state.scene;
    state.scene = 'comic_l3';
  }
  function closeL3Comic() {
    const overlay = document.getElementById('overlay-l3-comic');
    if (overlay) overlay.classList.add('hidden');
    // Return to end screen
    const endOverlay = document.getElementById('overlay-l3-end');
    if (endOverlay) endOverlay.classList.remove('hidden');
    if (state.scene === 'comic_l3') state.scene = 'end';
  }
  document.getElementById('btn-l3-comic')?.addEventListener('click', () => {
    // Replay from end screen — do not show NEW badge
    showL3Comic(false);
  });
  document.getElementById('btn-l3-comic-close')?.addEventListener('click', closeL3Comic);

  // ---------- Drawing ----------
  function drawFloor() {
    // Dark base
    ctx.fillStyle = '#0d0708';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // Corridor floor (tinted brown)
    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    // Corridor
    drawTile(CORR.x1, CORR.y1, CORR.x2 - CORR.x1, CORR.y2 - CORR.y1, '#241715', '#1b0e0c');
    // Rooms with themed tints
    const roomPalette = {
      toy:    ['#2d1e2b', '#201421'],  // dusty pink-purple
      puzzle: ['#1f2430', '#141822'],  // cool slate
      supply: ['#1e2620', '#131a16'],  // industrial green-gray
      lib:    ['#2a1e14', '#1c130b'],  // warm wood
    };
    for (const k of Object.keys(ROOMS)) {
      const r = ROOMS[k];
      const [a, b] = roomPalette[k] || ['#1f1612', '#15100c'];
      drawTile(r.x1, r.y1, r.x2 - r.x1, r.y2 - r.y1, a, b);
      // Room label card above-door (only visible up close via flashlight)
      ctx.fillStyle = 'rgba(255,180,130,0.35)';
      ctx.font = '700 14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(r.name.toUpperCase(), r.dx, r.y2 + 12);
    }
    // Kid-drawn scribbles on the walls (fun, creepy atmosphere)
    drawWallScribbles();
    ctx.restore();
  }

  // Static, deterministic wall scribbles (drawn once per frame but fixed positions)
  function drawWallScribbles() {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,180,120,0.16)';
    ctx.lineWidth = 1.4;
    // Scribble eyes on random wall locations (kid-drawn)
    const eyes = [
      [380, 250], [520, 780], [880, 250], [1020, 780], [1400, 250], [1560, 780], [1900, 250], [2120, 780],
    ];
    for (const [x, y] of eyes) {
      ctx.beginPath();
      ctx.ellipse(x, y, 14, 6, 0, 0, Math.PI*2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI*2);
      ctx.stroke();
    }
    // Wavy lines
    ctx.strokeStyle = 'rgba(220,140,90,0.12)';
    for (let i = 0; i < 6; i++) {
      const xStart = 260 + i * 340;
      ctx.beginPath();
      ctx.moveTo(xStart, 600);
      for (let x = 0; x < 80; x += 6) {
        ctx.lineTo(xStart + x, 600 + Math.sin(x * 0.3 + i) * 6);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
  function drawTile(x, y, w, h, base, alt) {
    // Tile checker
    const T = 40;
    for (let yy = y; yy < y + h; yy += T) {
      for (let xx = x; xx < x + w; xx += T) {
        ctx.fillStyle = (((xx / T) + (yy / T)) % 2 < 1) ? base : alt;
        ctx.fillRect(xx, yy, T, T);
      }
    }
    // subtle noise lines
    ctx.strokeStyle = 'rgba(120,40,30,0.08)';
    ctx.lineWidth = 1;
    for (let yy = y; yy < y + h; yy += T) {
      ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke();
    }
  }
  function drawObstacles() {
    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    for (const o of obstacles) {
      if (o.x + o.w < cam.x || o.x > cam.x + VIEW_W) continue;
      if (o.y + o.h < cam.y || o.y > cam.y + VIEW_H) continue;
      // Wall body
      ctx.fillStyle = '#2a1a14';
      ctx.fillRect(o.x, o.y, o.w, o.h);
      // top edge
      ctx.fillStyle = '#3a2620';
      ctx.fillRect(o.x, o.y, o.w, 3);
      // grunge
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (let i = 0; i < (o.w * o.h / 800); i++) {
        const px = o.x + Math.floor(((i * 37) % o.w));
        const py = o.y + Math.floor(((i * 71) % o.h));
        ctx.fillRect(px, py, 2, 2);
      }
    }
    ctx.restore();
  }
  function drawFurniture() {
    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    for (const f of furniture) {
      // body
      ctx.fillStyle = f.searched ? '#3a2418' : '#5a3a22';
      ctx.fillRect(f.x, f.y, f.w, f.h);
      ctx.strokeStyle = '#7a4a30';
      ctx.lineWidth = 2;
      ctx.strokeRect(f.x + 0.5, f.y + 0.5, f.w - 1, f.h - 1);
      // searched mark
      if (f.searched) {
        ctx.strokeStyle = '#9a6a4a';
        ctx.beginPath();
        ctx.moveTo(f.x + 6, f.y + 6); ctx.lineTo(f.x + f.w - 6, f.y + f.h - 6);
        ctx.moveTo(f.x + f.w - 6, f.y + 6); ctx.lineTo(f.x + 6, f.y + f.h - 6);
        ctx.stroke();
      }
      // hint glow when near unsearched
      const dx = (player.x + player.w/2) - (f.x + f.w/2);
      const dy = (player.y + player.h/2) - (f.y + f.h/2);
      if (!f.searched && dx*dx + dy*dy < 70*70) {
        ctx.save();
        ctx.shadowColor = '#ffae5a';
        ctx.shadowBlur = 18;
        ctx.strokeStyle = '#ffae5a';
        ctx.strokeRect(f.x - 1.5, f.y - 1.5, f.w + 3, f.h + 3);
        ctx.restore();
      }
    }
    // Mirror (in library)
    ctx.save();
    ctx.fillStyle = state.mirrorSolved ? '#3a3030' : '#1a1a22';
    ctx.fillRect(mirrorEntry.x, mirrorEntry.y, mirrorEntry.w, mirrorEntry.h);
    ctx.strokeStyle = state.mirrorSolved ? '#a4ffb6' : '#a87a4a';
    ctx.lineWidth = 3;
    ctx.strokeRect(mirrorEntry.x + 0.5, mirrorEntry.y + 0.5, mirrorEntry.w - 1, mirrorEntry.h - 1);
    // mirror highlight gleam
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(mirrorEntry.x + 6, mirrorEntry.y + 6, 8, 8);
    if (!state.mirrorSolved) {
      ctx.fillStyle = '#ffd166';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('MIRROR', mirrorEntry.x + mirrorEntry.w/2, mirrorEntry.y - 4);
    }
    ctx.restore();
    // Fuse box (corridor)
    ctx.fillStyle = '#3a2218';
    ctx.fillRect(fuseBox.x, fuseBox.y, fuseBox.w, fuseBox.h);
    ctx.strokeStyle = '#ff7a5a';
    ctx.lineWidth = 2;
    ctx.strokeRect(fuseBox.x + 0.5, fuseBox.y + 0.5, fuseBox.w - 1, fuseBox.h - 1);
    ctx.fillStyle = '#ffae5a';
    ctx.fillRect(fuseBox.x + 6, fuseBox.y + 8, 8, 8);
    ctx.fillRect(fuseBox.x + 22, fuseBox.y + 8, 8, 8);
    ctx.fillStyle = state.fuses > 0 ? '#a4ffb6' : '#5a3a20';
    ctx.fillRect(fuseBox.x + 6, fuseBox.y + 22, 24, 6);
    ctx.fillStyle = '#ff7a5a';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('FUSE BOX', fuseBox.x + fuseBox.w/2, fuseBox.y - 4);
    // Code panel near exit
    ctx.fillStyle = state.codeSolved ? '#1a3a22' : '#1a1418';
    ctx.fillRect(codePanel.x, codePanel.y, codePanel.w, codePanel.h);
    ctx.strokeStyle = state.codeSolved ? '#a4ffb6' : '#ffae5a';
    ctx.lineWidth = 2;
    ctx.strokeRect(codePanel.x + 0.5, codePanel.y + 0.5, codePanel.w - 1, codePanel.h - 1);
    ctx.fillStyle = state.codeSolved ? '#a4ffb6' : '#ffae5a';
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(codePanel.x + 4, codePanel.y + 8 + i * 11, 22, 8);
    }
    // Exit door
    ctx.fillStyle = state.codeSolved ? '#fff5c4' : '#1a0e08';
    ctx.fillRect(exitDoor.x, exitDoor.y, exitDoor.w, exitDoor.h);
    ctx.strokeStyle = state.codeSolved ? '#ffd166' : '#5a3a20';
    ctx.lineWidth = 3;
    ctx.strokeRect(exitDoor.x + 0.5, exitDoor.y + 0.5, exitDoor.w - 1, exitDoor.h - 1);
    if (state.codeSolved) {
      ctx.fillStyle = 'rgba(255,235,180,0.3)';
      ctx.fillRect(exitDoor.x - 30, exitDoor.y, 30, exitDoor.h);
    }
    // Breaker switches — wall-mounted, big visible labels
    for (const sw of switches) {
      const on = state.switchesOn[sw.id];
      const locked = !state.mirrorSolved;
      // Back plate
      ctx.fillStyle = locked ? '#251a1a' : '#2a2218';
      ctx.fillRect(sw.x - 6, sw.y - 4, sw.w + 12, sw.h + 16);
      ctx.strokeStyle = locked ? '#4a3a32' : (on ? '#a4ffb6' : '#ffae5a');
      ctx.lineWidth = 2;
      ctx.strokeRect(sw.x - 5.5, sw.y - 3.5, sw.w + 11, sw.h + 15);
      // Lever track
      ctx.fillStyle = '#0a0604';
      ctx.fillRect(sw.x + 4, sw.y + 3, sw.w - 8, sw.h - 6);
      // Lever
      ctx.fillStyle = locked ? '#5a4a40' : (on ? '#a4ffb6' : '#c7a010');
      const leverY = on ? sw.y + 4 : sw.y + sw.h - 12;
      ctx.fillRect(sw.x + 2, leverY, sw.w - 4, 8);
      // Label (big number)
      ctx.fillStyle = locked ? '#8a6a5a' : (on ? '#a4ffb6' : '#ffae5a');
      ctx.font = '700 14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(sw.label, sw.x + sw.w/2, sw.y + sw.h + 13);
      // Glow when near
      const dx = (player.x + player.w/2) - (sw.x + sw.w/2);
      const dy = (player.y + player.h/2) - (sw.y + sw.h/2);
      if (dx*dx + dy*dy < 70*70 && !locked && !state.breakerSolved) {
        ctx.save();
        ctx.shadowColor = '#ffae5a';
        ctx.shadowBlur = 14;
        ctx.strokeStyle = '#ffae5a';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(sw.x - 6.5, sw.y - 4.5, sw.w + 13, sw.h + 17);
        ctx.restore();
      }
    }
    ctx.restore();
  }
  function drawPlayer() {
    if (window.HorridorsSprites && window.HorridorsSprites.drawCharacter) {
      window.HorridorsSprites.drawCharacter(ctx, 'chester', player.x + player.w/2, player.y + player.h + 8, (player.facing !== undefined ? (Math.cos(player.facing) >= 0 ? 1 : -1) : 1), 56);
      return;
    }
}
  function drawExpression() {
    if (window.HorridorsSprites && window.HorridorsSprites.drawCharacter) {
      window.HorridorsSprites.drawCharacter(ctx, 'expreshon', expression.x + expression.w/2, expression.y + expression.h + 6, 1, 84);
      return;
    }
}

  // ---------- Lighting (flashlight) ----------
  let _maskCanvas = null, _maskCtx = null;
  function ensureMask() {
    if (_maskCanvas) return;
    _maskCanvas = document.createElement('canvas');
    _maskCanvas.width = VIEW_W;
    _maskCanvas.height = VIEW_H;
    _maskCtx = _maskCanvas.getContext('2d');
  }
  function drawLighting() {
    ensureMask();
    const m = _maskCtx;
    // Fill darkness (a touch lighter than before so the world is visible)
    m.globalCompositeOperation = 'source-over';
    m.fillStyle = 'rgba(0,0,0,0.82)';
    m.fillRect(0, 0, VIEW_W, VIEW_H);

    // Cone of flashlight (in screen space)
    if (state.flashlightOn && state.flashlightCharge > 0) {
      const sx = player.x + player.w/2 - cam.x;
      const sy = player.y + player.h/2 - cam.y;
      const range = 220 * (0.55 + 0.45 * state.flashlightCharge);
      const fov = Math.PI / 3.4;
      m.globalCompositeOperation = 'destination-out';
      const grad = m.createRadialGradient(sx, sy, 10, sx, sy, range);
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(0.55, 'rgba(0,0,0,0.85)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      m.fillStyle = grad;
      m.beginPath();
      m.moveTo(sx, sy);
      m.arc(sx, sy, range, player.facing - fov/2, player.facing + fov/2);
      m.closePath();
      m.fill();
    }
    // Bigger ambient glow around player (always visible)
    {
      const sx = player.x + player.w/2 - cam.x;
      const sy = player.y + player.h/2 - cam.y;
      m.globalCompositeOperation = 'destination-out';
      const g = m.createRadialGradient(sx, sy, 6, sx, sy, 90);
      g.addColorStop(0, 'rgba(0,0,0,0.85)');
      g.addColorStop(0.55, 'rgba(0,0,0,0.45)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      m.fillStyle = g;
      m.beginPath(); m.arc(sx, sy, 90, 0, Math.PI*2); m.fill();
    }

    // Always reveal Expression's eye (so the player can find him in the dark)
    if (expression.spawned && expression.eyeGlow > 0) {
      const ex = (expression.x + expression.w/2) - cam.x;
      const ey = (expression.y + 6) - cam.y;
      m.globalCompositeOperation = 'destination-out';
      const eg = m.createRadialGradient(ex, ey, 1, ex, ey, 80);
      eg.addColorStop(0, 'rgba(0,0,0,0.85)');
      eg.addColorStop(0.4, 'rgba(0,0,0,0.45)');
      eg.addColorStop(1, 'rgba(0,0,0,0)');
      m.fillStyle = eg;
      m.beginPath(); m.arc(ex, ey, 80, 0, Math.PI*2); m.fill();
    }

    // Pulsing red emergency lights along corridor
    const tt = performance.now() / 1000;
    const lampPositions = [400, 800, 1200, 1600, 2000];
    for (const lx of lampPositions) {
      const sx = lx - cam.x;
      const sy = (CORR.y1 + 30) - cam.y;
      const pulse = 0.45 + Math.sin(tt * 1.4 + lx) * 0.45;
      m.globalCompositeOperation = 'destination-out';
      const g = m.createRadialGradient(sx, sy, 2, sx, sy, 90);
      g.addColorStop(0, `rgba(0,0,0,${0.4 * pulse})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      m.fillStyle = g;
      m.beginPath(); m.arc(sx, sy, 90, 0, Math.PI*2); m.fill();
    }

    // Composite the darkness over the scene
    ctx.drawImage(_maskCanvas, 0, 0);

    // Red tint pass — pulsing emergency hue
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    const redPulse = 0.06 + Math.sin(tt * 1.2) * 0.04;
    ctx.fillStyle = `rgba(120, 20, 10, ${redPulse})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    // Expression's eye glow (additive — visible even outside flashlight)
    if (expression.spawned && expression.eyeGlow > 0) {
      const ex = (expression.x + expression.w/2) - cam.x;
      const ey = (expression.y + 6) - cam.y;
      const pulse = 0.7 + Math.sin(tt * 4) * 0.3;
      const eg = ctx.createRadialGradient(ex, ey, 2, ex, ey, 60);
      eg.addColorStop(0, `rgba(255, 150, 70, ${0.55 * pulse})`);
      eg.addColorStop(0.4, `rgba(255, 100, 40, ${0.25 * pulse})`);
      eg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = eg;
      ctx.beginPath(); ctx.arc(ex, ey, 60, 0, Math.PI*2); ctx.fill();
    }

    // Red lamps glow (additive)
    for (const lx of lampPositions) {
      const sx = lx - cam.x;
      const sy = (CORR.y1 + 30) - cam.y;
      const pulse = 0.5 + Math.sin(tt * 1.4 + lx) * 0.5;
      const g = ctx.createRadialGradient(sx, sy, 4, sx, sy, 90);
      g.addColorStop(0, `rgba(255, 80, 50, ${0.35 * pulse})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(sx, sy, 90, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }

  // ---------- HUD ----------
  function drawHUD() {
    // Subtitle
    if (state.speakerLine) {
      ctx.save();
      ctx.font = '600 14px system-ui, sans-serif';
      const text = state.speakerLine;
      const m = ctx.measureText(text);
      const pad = 12;
      const w = m.width + pad * 2;
      const h = 32;
      const x = VIEW_W/2 - w/2;
      const y = VIEW_H - 60;
      ctx.fillStyle = 'rgba(20,8,8,0.78)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(255,140,90,0.45)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      ctx.fillStyle = '#ffe6cc';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, VIEW_W/2, y + h/2);
      ctx.restore();
    }

    // Top-left dynamic hint (contextual)
    let hint = '';
    if (state.scene === 'play') {
      if (!expression.spawned) hint = 'Enter a room to start the search.';
      else if (state.fuses < 3) hint = `Find ${3 - state.fuses} more fuse${state.fuses === 2 ? '' : 's'}. Shine torch to push him back.`;
      else if (!state.mirrorSolved) hint = 'Solve the Mirror in the Library.';
      else if (!state.breakerSolved) hint = `Flip switches 1–2–3 in the right order (${state.breakerProgress}/3).`;
      else if (!state.codeSolved) hint = 'Enter the 4-digit code at the exit.';
      else hint = 'Door is open — head right!';
    }
    if (hint) {
      ctx.save();
      ctx.font = '600 13px system-ui, sans-serif';
      const m = ctx.measureText(hint);
      const pad = 10;
      const w = m.width + pad*2, h = 26;
      const x = 14, y = 14;
      ctx.fillStyle = 'rgba(20,8,8,0.78)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(255,140,90,0.45)';
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      ctx.fillStyle = '#ffd1a1';
      ctx.textBaseline = 'middle';
      ctx.fillText(hint, x + pad, y + h/2);
      ctx.restore();
    }

    // Top-right OBJECTIVES checklist
    const lines = state.objectives.map(o => (o.done ? '✓ ' : '☐ ') + o.text);
    ctx.save();
    ctx.font = '600 12px system-ui, sans-serif';
    let maxW = 0;
    for (const l of lines) maxW = Math.max(maxW, ctx.measureText(l).width);
    const w = maxW + 22, h = lines.length * 18 + 30;
    const x = VIEW_W - w - 14, y = 14;
    ctx.fillStyle = 'rgba(20,8,8,0.78)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(255,140,90,0.45)';
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle = '#ff9a5a';
    ctx.fillText('OBJECTIVES', x + 10, y + 16);
    ctx.fillStyle = '#fff';
    for (let i = 0; i < lines.length; i++) {
      ctx.fillStyle = state.objectives[i].done ? '#a4ffb6' : '#ffe6cc';
      ctx.fillText(lines[i], x + 10, y + 32 + i * 18);
    }
    ctx.restore();

    // Bottom-left flashlight + fuses
    ctx.save();
    ctx.font = '600 12px system-ui, sans-serif';
    const fl = state.flashlightOn ? 'ON' : 'OFF';
    const txt = `🔦 ${fl}   |   🔌 ${state.fuses}/3 fuses   |   👁️ ${expression.spawned ? expression.state.toUpperCase() : '—'}`;
    const m = ctx.measureText(txt);
    const w2 = m.width + 20, h2 = 26;
    const x2 = 14, y2 = VIEW_H - h2 - 14;
    ctx.fillStyle = 'rgba(20,8,8,0.78)';
    ctx.fillRect(x2, y2, w2, h2);
    ctx.strokeStyle = 'rgba(255,140,90,0.45)';
    ctx.strokeRect(x2 + 0.5, y2 + 0.5, w2 - 1, h2 - 1);
    ctx.fillStyle = '#ffe6cc';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, x2 + 10, y2 + h2/2);
    ctx.restore();

    // Bottom-left CODE tracker (sits above the flashlight HUD)
    if (state.scene === 'play') {
      const known = [null, null, null, null];
      // Fuse-box digit (position shown on the fuse box) — always known once seen; show it from the start
      if (state.fuseDigitOrder && state.fuseDigitOrder.length === 4) {
        const fbSlot = state.fuseDigitOrder[3];
        known[fbSlot] = state.targetCode[fbSlot];
      }
      // Fuses found so far
      for (let f = 0; f < 3; f++) {
        if (state.foundFuseDigit[f] !== null && state.foundFuseDigit[f] !== undefined) {
          const slot = state.fuseDigitOrder[f];
          known[slot] = state.foundFuseDigit[f];
        }
      }
      const foundCount = known.filter(v => v !== null).length;

      ctx.save();
      const boxSize = 26;
      const boxGap = 6;
      const labelPad = 8;
      ctx.font = '700 12px system-ui, sans-serif';
      const labelText = 'CODE';
      const labelW = ctx.measureText(labelText).width;
      const countText = `${foundCount}/4`;
      ctx.font = '600 11px system-ui, sans-serif';
      const countW = ctx.measureText(countText).width;
      const innerW = labelW + labelPad + (boxSize * 4) + (boxGap * 3) + labelPad + countW;
      const panelW = innerW + 20;
      const panelH = boxSize + 12;
      const px = 14;
      const py = y2 - panelH - 8;

      // panel
      ctx.fillStyle = 'rgba(20,8,8,0.78)';
      ctx.fillRect(px, py, panelW, panelH);
      ctx.strokeStyle = 'rgba(255,140,90,0.45)';
      ctx.strokeRect(px + 0.5, py + 0.5, panelW - 1, panelH - 1);

      // label
      ctx.fillStyle = '#ff9a5a';
      ctx.font = '700 12px system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText(labelText, px + 10, py + panelH/2);

      // digit boxes
      const boxesStartX = px + 10 + labelW + labelPad;
      const boxY = py + (panelH - boxSize)/2;
      for (let i = 0; i < 4; i++) {
        const bx = boxesStartX + i * (boxSize + boxGap);
        const isKnown = known[i] !== null;
        ctx.fillStyle = isKnown ? 'rgba(90,220,140,0.22)' : 'rgba(255,255,255,0.06)';
        ctx.fillRect(bx, boxY, boxSize, boxSize);
        ctx.strokeStyle = isKnown ? 'rgba(120,255,170,0.75)' : 'rgba(255,200,150,0.35)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(bx + 0.5, boxY + 0.5, boxSize - 1, boxSize - 1);
        ctx.fillStyle = isKnown ? '#baffca' : '#ffcf9b';
        ctx.font = `700 ${isKnown ? 16 : 14}px "Courier New", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(isKnown ? String(known[i]) : '?', bx + boxSize/2, boxY + boxSize/2 + 1);
      }

      // count
      ctx.fillStyle = '#ffd1a1';
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(countText, boxesStartX + 4 * boxSize + 3 * boxGap + labelPad, py + panelH/2);
      ctx.restore();
    }
  }

  // ---------- Render ----------
  function drawStars() {
    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    const t = performance.now() / 1000;
    for (const it of items) {
      if (it.collected || it.kind !== 'star') continue;
      // Only draw stars on-screen
      if (it.x + it.w < cam.x || it.x > cam.x + VIEW_W) continue;
      if (it.y + it.h < cam.y || it.y > cam.y + VIEW_H) continue;
      const cx = it.x + it.w/2;
      const cy = it.y + it.h/2 + Math.sin(t * 2 + cx * 0.01) * 2;
      const pulse = 0.7 + 0.3 * Math.sin(t * 3 + cx * 0.02);
      // Glow
      const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, 22);
      grad.addColorStop(0, `rgba(255, 220, 90, ${0.85 * pulse})`);
      grad.addColorStop(0.4, `rgba(255, 180, 60, ${0.35 * pulse})`);
      grad.addColorStop(1, 'rgba(255, 160, 40, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(cx, cy, 22, 0, Math.PI * 2); ctx.fill();
      // 5-point star shape
      ctx.fillStyle = '#fff3a8';
      ctx.strokeStyle = '#ffb13a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const R = 9, r = 4;
      for (let i = 0; i < 10; i++) {
        const ang = -Math.PI/2 + i * Math.PI / 5;
        const rad = (i % 2 === 0) ? R : r;
        const px = cx + Math.cos(ang) * rad;
        const py = cy + Math.sin(ang) * rad;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawGems() {
    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    const t = performance.now() / 1000;
    for (const it of items) {
      if (it.collected || it.kind !== 'gem') continue;
      if (it.x + it.w < cam.x || it.x > cam.x + VIEW_W) continue;
      if (it.y + it.h < cam.y || it.y > cam.y + VIEW_H) continue;
      const cx = it.x + it.w/2;
      const cy = it.y + it.h/2 + Math.sin(t * 2 + cx * 0.01) * 2;
      const pulse = 0.7 + 0.3 * Math.sin(t * 3 + cx * 0.02);
      const color = it.gemColor || '#ff8db3';
      // Glow
      const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, 22);
      grad.addColorStop(0, color.replace(')', `, ${0.8 * pulse})`).replace('rgb', 'rgba'));
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      // Simpler: use color with alpha via fillStyle
      ctx.fillStyle = color; ctx.globalAlpha = 0.35 * pulse;
      ctx.beginPath(); ctx.arc(cx, cy, 20, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;
      // Pentagon gem
      ctx.fillStyle = color;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI/2 + k * Math.PI*2/5;
        const r = 8;
        const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath(); ctx.arc(cx - 2, cy - 2, 1.8, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }

  // Smashed bulbs scattered under the ceiling + child-scribbled explanation note near entrance
  function drawSmashedBulbs() {
    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    // Bulb positions along the corridor ceiling
    const bulbs = [
      { x: 340,  y: 220 }, { x: 620,  y: 220 }, { x: 900,  y: 220 },
      { x: 1180, y: 220 }, { x: 1460, y: 220 }, { x: 1740, y: 220 },
      { x: 2020, y: 220 }, { x: 2250, y: 220 },
    ];
    for (const b of bulbs) {
      // socket
      ctx.fillStyle = '#4a2a1a';
      ctx.fillRect(b.x - 10, b.y - 10, 20, 10);
      // broken glass shards
      ctx.strokeStyle = 'rgba(255, 210, 160, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(b.x - 8, b.y); ctx.lineTo(b.x - 4, b.y + 8);
      ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + 2, b.y + 10);
      ctx.moveTo(b.x + 6, b.y); ctx.lineTo(b.x + 10, b.y + 7);
      ctx.stroke();
      // glass specks on the floor beneath
      ctx.fillStyle = 'rgba(255, 220, 180, 0.25)';
      for (let i = 0; i < 4; i++) {
        const sx = b.x - 14 + i * 7;
        ctx.fillRect(sx, b.y + 650 + (i % 2) * 4, 2, 2);
      }
    }
    // Scribbled note taped to the wall near entrance (around x=200, y=850)
    const noteX = 140, noteY = 850, nw = 150, nh = 90;
    ctx.save();
    ctx.fillStyle = '#efe3c8';
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    ctx.fillRect(noteX, noteY, nw, nh);
    ctx.restore();
    // torn tape
    ctx.fillStyle = 'rgba(255, 255, 200, 0.7)';
    ctx.fillRect(noteX + 50, noteY - 6, 50, 10);
    // scribbled child handwriting
    ctx.fillStyle = '#8a3a22';
    ctx.font = 'bold 11px "Comic Sans MS", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('HE SMASHED', noteX + 8, noteY + 8);
    ctx.fillText('ALL THE LIGHTS!!', noteX + 8, noteY + 22);
    ctx.fillStyle = '#3a2418';
    ctx.font = '10px "Comic Sans MS", system-ui, sans-serif';
    ctx.fillText('ex preshon hates', noteX + 8, noteY + 40);
    ctx.fillText('the bright. keep', noteX + 8, noteY + 52);
    ctx.fillText('your torch ON.', noteX + 8, noteY + 64);
    // scribbled smiley
    ctx.fillStyle = '#aa5533';
    ctx.font = '14px sans-serif';
    ctx.fillText(':(', noteX + 120, noteY + 64);
    ctx.restore();
  }

  function render() {
    drawFloor();
    drawObstacles();
    drawSmashedBulbs();
    drawFurniture();
    drawStars();
    drawGems();
    drawCoinsL3();
    drawExpression();
    drawPlayer();
    drawLighting();
    drawHUD();
  }

  // ---------- Loop ----------
  let running = false;
  let lastT = 0;
  let _l3TaskTick = 0;
  function loop(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    update(dt);
    render();
    justPressed.clear();
    _l3TaskTick += dt;
    if (_l3TaskTick >= 0.5) { _l3TaskTick = 0; if (window.refreshChecklist) window.refreshChecklist(); }
    requestAnimationFrame(loop);
  }

  // ---------- Reset ----------
  function resetLevel3State() {
    player.x = 250; player.y = 990;
    player.vx = 0; player.vy = 0;
    player.facing = 0;
    state.fuses = 0;
    state.foundFuse = { 0: false, 1: false, 2: false };
    state.foundFuseDigit = { 0: null, 1: null, 2: null };
    state.stars = 0;
    state.enteredCode = [0, 0, 0, 0];
    state.mirrorSolved = false;
    state.codeSolved = false;
    state.breakerSolved = false;
    state.breakerProgress = 0;
    state.breakerFailed = 0;
    state.switchesOn = [false, false, false];
    // Randomize the breaker order (1-2-3 permutation)
    const perm = [0, 1, 2];
    for (let i = perm.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    state.breakerOrder = perm;
    state.flashlightOn = true;
    state.flashlightCharge = 1.0;
    state.objectives.forEach(o => o.done = false);
    expression.spawned = false;
    expression.seen = false;
    expression.state = 'lurk';
    expression.x = 2150; expression.y = 980;
    expression.hurtFlash = 0;
    exitDoor.locked = true;
    cam.x = 0; cam.y = 0;
    buildWorld();
  }

  // ---------- Esc handler ----------
  window.addEventListener('keydown', (e) => {
    if (!running) return;
    const k = (e.key || '').toLowerCase();
    const isClose = (k === 'e' || k === ' ' || k === 'enter' || k === 'escape');
    // Comic overlay: E / Space / Enter / Esc all close it
    const l3ComicOverlay = document.getElementById('overlay-l3-comic');
    if (l3ComicOverlay && !l3ComicOverlay.classList.contains('hidden') && isClose) {
      closeL3Comic();
      e.preventDefault();
      return;
    }
    if (e.key === 'Escape') {
      if (!overlayMirror.classList.contains('hidden')) closeMirror();
      if (!overlayCode.classList.contains('hidden')) closeCode();
    }
    // Enter on caught -> retry
    if (e.key === 'Enter' && state.scene === 'caught') {
      document.getElementById('overlay-caught').classList.add('hidden');
      resetLevel3State();
      state.scene = 'play';
    }
  });

  // ---------- Start ----------
  function start() {
    if (!running) {
      window.addEventListener('keydown', keydown);
      window.addEventListener('keyup', keyup);
      window.addEventListener('blur', blur);
    }
    ensureAudio();

    // Hide ALL prior level UI
    [
      'hud','overlay-title','overlay-end','overlay-caught','overlay-puzzle','overlay-combo','overlay-notes',
      'chase-bar','hide-indicator','btn-notes','subtitle','prompt',
      'overlay-l2-title','overlay-l2-end','overlay-cipher','overlay-valve','overlay-note',
    ].forEach(id => { const el = document.getElementById(id); if (el) el.classList.add('hidden'); });

    // Show L3 title
    document.getElementById('overlay-l3-title').classList.remove('hidden');
    state.scene = 'title';
    buildWorld();

    if (!running) {
      running = true;
      lastT = performance.now();
      requestAnimationFrame(loop);
    }
  }

  function stopLevel3() {
    running = false;
    try { window.removeEventListener('keydown', keydown); } catch (e) {}
    try { window.removeEventListener('keyup', keyup); } catch (e) {}
    try { window.removeEventListener('blur', blur); } catch (e) {}
    try { keys.clear(); } catch (e) {}
    try { stopAmbient(); } catch (e) {}
  }

  function resumeLevel3() {
    ensureAudio();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    startAmbient();
    if (!running) {
      window.addEventListener('keydown', keydown);
      window.addEventListener('keyup', keyup);
      window.addEventListener('blur', blur);
      running = true;
      lastT = performance.now();
      requestAnimationFrame(loop);
    }
    ['overlay-l3-title','overlay-l3-end','overlay-caught','overlay-mirror','overlay-code','overlay-comic']
      .forEach(id => { const el = document.getElementById(id); if (el) el.classList.add('hidden'); });
    state.scene = 'play';
    registerL3Tasks && registerL3Tasks();
  }

  // L3 title start button
  document.getElementById('btn-l3-start')?.addEventListener('click', () => {
    ensureAudio();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    startAmbient();
    document.getElementById('overlay-l3-title').classList.add('hidden');
    resetLevel3State();
    state.scene = 'play';
    speak('You\'re back in the corridor. Every bulb is smashed — glass everywhere.', 4000);
    setTimeout(() => { if (running && state.scene === 'play') speak('💡 Ex Preshon broke the lights. He HATES light. Keep your flashlight on him!', 5200); }, 4200);
    registerL3Tasks();
  });

  function l3DoneIds() {
    const done = new Set();
    for (const o of state.objectives) if (o.done) done.add(o.id);
    if (state.scene === 'end') done.add('exit');
    return done;
  }
  function registerL3Tasks() {
    if (!window.HorridorsTasks) return;
    window.HorridorsTasks.setLevel('l3', 'Level 3 — Tasks', [
      { id: 'fuses',   label: 'Find 3 fuses' },
      { id: 'mirror',  label: 'Solve the mirror' },
      { id: 'breaker', label: 'Flip the 3 switches' },
      { id: 'code',    label: 'Crack the exit code' },
      { id: 'exit',    label: 'Escape through the front door' },
    ], l3DoneIds);
  }

  // L3 end buttons
  document.getElementById('btn-l3-replay')?.addEventListener('click', () => {
    document.getElementById('overlay-l3-end').classList.add('hidden');
    resetLevel3State();
    state.scene = 'play';
    speak('Again. Eye open.', 2400);
  });
  document.getElementById('btn-l3-home')?.addEventListener('click', () => {
    running = false;
    stopAmbient();
    window.removeEventListener('keydown', keydown);
    window.removeEventListener('keyup', keyup);
    window.removeEventListener('blur', blur);
    window.location.reload();
  });
  document.getElementById('btn-l3-next')?.addEventListener('click', () => {
    document.getElementById('overlay-l3-end').classList.add('hidden');
    running = false;
    stopAmbient();
    window.removeEventListener('keydown', keydown);
    window.removeEventListener('keyup', keyup);
    window.removeEventListener('blur', blur);
    if (typeof window.__startLevel4 === 'function') {
      window.__startLevel4();
    } else {
      window.location.reload();
    }
  });

  // Expose
  window.__startLevel3 = start;
  window.__horridorsL3 = {
    audioCtx: () => audioCtx,
    masterGain: () => masterGain,
    stopAmbient,
    stop: stopLevel3,
    resume: resumeLevel3,
    isRunning: () => running,
    sfx: (n) => { try { sfx(n); } catch (e) {} },
  };
  // Debug
  window.__level3 = { state, player, expression, ROOMS, CORR, furniture, obstacles, mirror,
    teleport: (x, y) => { player.x = x; player.y = y; },
    giveFuses: () => { state.fuses = 3; for (let i=0;i<3;i++){ state.foundFuse[i]=true; state.foundFuseDigit[i]=state.targetCode[state.fuseDigitOrder[i]]; } state.objectives.find(o=>o.id==='fuses').done = true; },
    solveMirror: () => { state.mirrorSolved = true; state.objectives.find(o=>o.id==='mirror').done = true; },
    revealCode: () => state.targetCode.slice(),
    forceCaught: caught,
    forceEnd: endLevel3,
    showComic: () => showL3Comic(false),
    closeComic: closeL3Comic,
  };
  console.log('[Level 3] Loaded. Call window.__startLevel3() to begin.');
})();
