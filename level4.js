// =====================================================================
// HORRIDORS - LEVEL 4: THE BASEMENT
// Progressively harder than L3: TWO monsters, 4 keys, candle puzzle,
// 15 star tokens, furnace exit. Standalone scene module; boots via
// window.__startLevel4().
// =====================================================================
(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const VIEW_W = canvas.width;
  const VIEW_H = canvas.height;

  // Larger world than L3 to feel harder & more sprawling
  const WORLD_W = 2600, WORLD_H = 1700;

  // Three stacked horizontal chambers separated by thick stone walls.
  // Player starts top, has to work down to the bottom (furnace).
  const CHAMBERS = {
    upper: { x1: 120, x2: 2480, y1: 120,  y2: 560  },   // Entry hall
    middle:{ x1: 120, x2: 2480, y1: 700,  y2: 1120 },   // Storage catacomb
    lower: { x1: 120, x2: 2480, y1: 1260, y2: 1600 },   // Furnace room
  };
  // Vertical staircases connect chambers
  const STAIRS = [
    { x: 400,  y1: 560,  y2: 700,  w: 80 },   // upper -> middle, far left
    { x: 2060, y1: 560,  y2: 700,  w: 80 },   // upper -> middle, far right
    { x: 1200, y1: 1120, y2: 1260, w: 80 },   // middle -> lower, center
  ];

  const cam = { x: 0, y: 0 };

  // Coins in the basement — all inside walkable chambers
  // Chambers: upper y:120-560, middle y:700-1120, lower y:1260-1600
  const coins = [
    { x: 320,  y: 280, got: false, v: 1 },    // upper left
    { x: 1340, y: 380, got: false, v: 2 },    // upper middle
    { x: 2280, y: 460, got: false, v: 1 },    // upper right
    { x: 520,  y: 820, got: false, v: 1 },    // middle left
    { x: 1620, y: 860, got: false, v: 1 },    // middle middle
    { x: 2100, y: 1040, got: false, v: 2 },   // middle right
    { x: 620,  y: 1380, got: false, v: 2 },   // lower left
    { x: 1380, y: 1420, got: false, v: 2 },   // lower center
    { x: 2200, y: 1500, got: false, v: 1 },   // lower right
  ];

  function drawCoinsL4() {
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
    scene: 'title',           // 'title' | 'play' | 'candles' | 'caught' | 'end'
    speakerLine: null, speakerT: 0,
    muted: false,
    flashlightOn: true,
    flashlightCharge: 1.0,
    keys: 0,                  // 0..4
    totalKeys: 4,
    candlePuzzleSolved: false,
    candleOrder: [0, 2, 1],   // FIXED story order: 1 → 3 → 2 (Mum's note spells it)
    candleProgress: 0,
    candleNoteRead: false,
    shakeT: 0,                // screen-shake timer (ms) for wrong-candle feedback
    shakeMag: 0,              // pixel magnitude for current shake
    stars: 0,
    starsTotal: 0,
    objectives: [
      { id: 'keys',    text: 'Collect 4 SKELETON KEYS',         done: false },
      { id: 'note',    text: 'Find the candle order note',      done: false },
      { id: 'candles', text: 'Light the 3 candle sconces',      done: false },
      { id: 'exit',    text: 'Drop through the furnace hatch',  done: false },
    ],
  };

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
    const prev = window.__horridorsL3 || window.__horridorsL2 || window.__horridorsL1;
    if (prev && prev.audioCtx()) { audioCtx = prev.audioCtx(); masterGain = prev.masterGain(); return; }
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = state.muted ? 0 : 0.5;
      masterGain.connect(audioCtx.destination);
    } catch {}
  }
  function tone(freq, dur, type = 'sine', vol = 0.2) {
    if (!audioCtx) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    o.connect(g).connect(masterGain);
    o.start(); o.stop(audioCtx.currentTime + dur);
  }
  function sfx(name) {
    if (!audioCtx || state.muted) return;
    switch (name) {
      case 'click':   tone(800, 0.05, 'square', 0.15); break;
      case 'pickup':  tone(640, 0.08, 'triangle', 0.18); setTimeout(()=>tone(960, 0.1, 'triangle', 0.18), 60); break;
      case 'keypick': tone(520, 0.12, 'sine', 0.22); setTimeout(()=>tone(780, 0.14, 'sine', 0.22), 90); setTimeout(()=>tone(1040, 0.16, 'sine', 0.18), 180); break;
      case 'candle':  tone(440, 0.2, 'triangle', 0.18); setTimeout(()=>tone(660, 0.18, 'triangle', 0.16), 80); break;
      case 'bad':     tone(120, 0.3, 'sawtooth', 0.25); break;
      case 'snuff':   // whoosh + low thud — more dramatic than 'bad'
                      tone(260, 0.18, 'sawtooth', 0.14);
                      setTimeout(()=>tone(110, 0.35, 'sawtooth', 0.22), 60);
                      setTimeout(()=>tone(70,  0.45, 'square',   0.18), 140);
                      break;
      case 'jingle':  [523,659,784,1047].forEach((f,i)=>setTimeout(()=>tone(f,0.18,'triangle',0.22), i*90)); break;
      case 'door':    tone(110, 0.3, 'square', 0.22); setTimeout(()=>tone(220, 0.2, 'square', 0.18), 150); break;
      case 'exlenahiss':tone(90, 0.4, 'sawtooth', 0.1); tone(130, 0.35, 'sawtooth', 0.08); break;
      case 'snarl':   tone(70, 0.3, 'sawtooth', 0.12); break;
    }
  }

  let ambientNodes = null;
  function startAmbient() {
    if (!audioCtx) return;
    if (window.HorridorsAmbient) {
      ambientNodes = window.HorridorsAmbient.start(audioCtx, masterGain, { mood: 'basement' });
    }
    if (window.HorridorsMusic) window.HorridorsMusic.setTheme(audioCtx, masterGain, 'l4');
  }
  function stopAmbient() {
    if (ambientNodes && ambientNodes.stop) ambientNodes.stop();
    ambientNodes = null;
  }

  // ---------- Helpers ----------
  const _kl = (t) => (window.HorridorsTouch && window.HorridorsTouch.keyLabel) ? window.HorridorsTouch.keyLabel(t) : t;
  function speak(line, duration = 3000) {
    state.speakerLine = _kl(line);
    state.speakerT = duration;
  }
  function tickSpeaker(dt) {
    if (state.speakerT > 0) {
      state.speakerT -= dt * 1000;
      if (state.speakerT <= 0) state.speakerLine = null;
    }
  }
  function distance(a, b) {
    return Math.hypot((a.x + a.w/2) - (b.x + b.w/2), (a.y + a.h/2) - (b.y + b.h/2));
  }
  function rectIntersect(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // ---------- Entities ----------
  const player = {
    x: 220, y: 220, w: 22, h: 22,
    vx: 0, vy: 0,
    speed: 180,
    facing: 0,
    lastMoveX: 1, lastMoveY: 0,
  };

  // Ex Preshon (same behavior as L3 but faster in L4 since player has keys to defend)
  const expression = {
    x: 2300, y: 800, w: 38, h: 56,
    vx: 0, vy: 0,
    state: 'lurk',        // 'lurk' | 'charge' | 'frozen' | 'recoil' | 'blink'
    speed: 135,           // slightly faster than L3 (115)
    recoilSpeed: 240,
    blinkT: 0, blinkInterval: 5 + Math.random() * 3,
    snarlT: 0,
    spawned: false,
    hurtFlash: 0,
    safeUntil: 0,
    eyeGlow: 1, // 1=open, 0=closed, drops during blink
  };

  // EXLENA — Ex Preshon's girlfriend, a daycare teacher turned Horridor.
  // Pink body, small black horns, huge ringed eyes, toothy grin. NOT scared of the torch.
  // Scared when the player holds a key — teachers don't trust kids with keys.
  const exlena = {
    x: 2300, y: 1400, w: 38, h: 46,
    vx: 0, vy: 0,
    state: 'lurk',
    speed: 150,
    recoilSpeed: 200,
    spawned: false,
    spawnT: 0,
    hissT: 0,
  };

  const CAUGHT_DIST = 22;

  // ---------- World ----------
  const obstacles = [];
  function addObs(x, y, w, h) { obstacles.push({ x, y, w, h }); }
  const furniture = [];
  function addFurn(f) { f.searched = false; furniture.push(f); }

  // Collectibles & interactables
  const items = []; // {kind,x,y,w,h,collected,...}

  // Candle sconces — 3 tall candleholders in the lower chamber
  const candles = [
    { id: 0, x: 500,  y: 1340, w: 30, h: 50, lit: false, flicker: 0 },
    { id: 1, x: 1280, y: 1340, w: 30, h: 50, lit: false, flicker: 0 },
    { id: 2, x: 2060, y: 1340, w: 30, h: 50, lit: false, flicker: 0 },
  ];

  // Candle-order note — a readable scrap in the middle chamber
  const candleNote = { x: 1200, y: 920, w: 28, h: 30, read: false };

  // Furnace hatch (the exit)
  const furnaceHatch = { x: 1240, y: 1530, w: 60, h: 50, unlocked: false };

  function buildWorld() {
    obstacles.length = 0;
    furniture.length = 0;
    items.length = 0;
    candles.forEach(c => { c.lit = false; c.flicker = 0; });
    candleNote.read = false;
    furnaceHatch.unlocked = false;

    // World perimeter
    addObs(-50, -50, WORLD_W + 100, 50 + 120);          // top (covers above upper chamber)
    addObs(-50, WORLD_H, WORLD_W + 100, 50);            // bottom
    addObs(-50, -50, 50 + 120, WORLD_H + 100);          // left
    addObs(WORLD_W - 120, -50, 50 + 120, WORLD_H + 100);// right

    // Chambers: fill the gaps BETWEEN chambers with solid stone
    // Upper chamber interior: y 120-560
    // Gap: 560-700 is SOLID except where stairs are
    buildWallStrip(120, 560, 700, STAIRS.filter(s => s.y1 === 560));
    // Gap: 1120-1260 is SOLID except middle stairs
    buildWallStrip(120, 1120, 1260, STAIRS.filter(s => s.y1 === 1120));

    // Maze walls inside the UPPER chamber (entry hall)
    // L-shaped partitions create a winding path
    addObs(600,  200, 24, 260);
    addObs(600,  200, 200, 24);
    addObs(1000, 380, 24, 180);
    addObs(1400, 200, 24, 220);
    addObs(1400, 200, 240, 24);
    addObs(1900, 300, 24, 200);
    addObs(1900, 300, 220, 24);

    // MIDDLE chamber partitions (storage catacomb — dense)
    addObs(300,  740, 24, 240);
    addObs(300,  960, 240, 24);
    addObs(700,  740, 24, 200);
    addObs(700,  920, 24, 180);
    addObs(1000, 740, 360, 24);
    addObs(1360, 740, 24, 220);
    addObs(1600, 920, 320, 24);
    addObs(1920, 740, 24, 200);
    addObs(2200, 740, 24, 300);

    // LOWER chamber partitions (furnace room — a bit sparser, candles are here)
    addObs(300,  1300, 24, 180);
    addObs(700,  1420, 240, 24);
    addObs(1100, 1300, 24, 160);
    addObs(1500, 1300, 24, 180);
    addObs(1800, 1420, 260, 24);

    // Skeleton Keys — 4 placed strategically across the 3 chambers
    items.push(
      { kind: 'key', label: 'Key 1', x: 1700, y: 250, w: 24, h: 20, collected: false },   // upper
      { kind: 'key', label: 'Key 2', x: 450,  y: 1000, w: 24, h: 20, collected: false },  // middle-left
      { kind: 'key', label: 'Key 3', x: 2100, y: 850, w: 24, h: 20, collected: false },   // middle-right
      { kind: 'key', label: 'Key 4', x: 2340, y: 1480, w: 24, h: 20, collected: false },  // lower-right corner
    );

    // STAR TOKENS — 15 scattered
    const starSpots = [
      // Upper
      [260, 260], [860, 300], [1200, 500], [1780, 480], [2300, 250],
      // Middle
      [200, 800], [520, 840], [920, 1040], [1500, 800], [1820, 1000], [2380, 1040],
      // Lower
      [400, 1400], [900, 1500], [1700, 1500], [2200, 1300],
    ];
    for (const [x, y] of starSpots) {
      items.push({ kind: 'star', x, y, w: 18, h: 18, collected: false });
    }
    state.starsTotal = items.filter(it => it.kind === 'star').length;
    state.stars = 0;

    // HIDDEN GEM L4: rusty keyring tucked in the darkest boiler corner
    if (!window.HorridorsStory || !window.HorridorsStory.hasGem('l4_keyring')) {
      items.push({ kind: 'gem', gemId: 'l4_keyring', gemColor: '#c09cff', x: 140, y: 1450, w: 18, h: 18, collected: false });
    }

    // FIRE crystal (Elemental Hand): smoldering atop a boiler coil in the lower chamber.
    // Only shows if the player has the Grabpack but doesn't yet own Fire.
    if (window.HorridorsWallet && window.HorridorsWallet.hasGrabpack() && !window.HorridorsWallet.hasElement('fire')) {
      items.push({ kind: 'crystal', element: 'fire', x: 2000, y: 1380, w: 22, h: 22, collected: false });
      // Nudge the player toward it the moment they enter.
      setTimeout(() => { try { speak && speak('🔥 A warm flicker pulses deep in the boiler room — feels like fire.', 3800); } catch(e) {} }, 1800);
    }

    // FIXED story order (1 → 3 → 2) — Mum's note in the middle chamber spells it.
    // Kept as state so render/UI can read it; NOT randomized anymore.
    state.candleOrder = [0, 2, 1];
    state.candleProgress = 0;
    state.candlePuzzleSolved = false;
  }

  // Build a stone wall strip between two chambers, leaving gaps at stairs
  function buildWallStrip(xStart, yTop, yBottom, stairsInGap) {
    const h = yBottom - yTop;
    let cursor = xStart;
    const sorted = stairsInGap.slice().sort((a, b) => a.x - b.x);
    for (const s of sorted) {
      if (s.x > cursor) addObs(cursor, yTop, s.x - cursor, h);
      cursor = s.x + s.w;
    }
    if (cursor < WORLD_W - 120) addObs(cursor, yTop, (WORLD_W - 120) - cursor, h);
  }

  // ---------- Movement / Collision ----------
  function clampToWorld() {
    if (player.x < 10) player.x = 10;
    if (player.y < 10) player.y = 10;
    if (player.x + player.w > WORLD_W - 10) player.x = WORLD_W - 10 - player.w;
    if (player.y + player.h > WORLD_H - 10) player.y = WORLD_H - 10 - player.h;
  }
  function moveWithCollision(ent, dx, dy) {
    // X
    ent.x += dx;
    for (const o of obstacles) {
      if (rectIntersect(ent, o)) {
        if (dx > 0) ent.x = o.x - ent.w;
        else if (dx < 0) ent.x = o.x + o.w;
      }
    }
    // Y
    ent.y += dy;
    for (const o of obstacles) {
      if (rectIntersect(ent, o)) {
        if (dy > 0) ent.y = o.y - ent.h;
        else if (dy < 0) ent.y = o.y + o.h;
      }
    }
  }

  // Simple line-of-sight (any obstacle in straight line blocks it)
  function lineOfSight(a, b) {
    const steps = 20;
    const ax = a.x + a.w/2, ay = a.y + a.h/2;
    const bx = b.x + b.w/2, by = b.y + b.h/2;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t;
      for (const o of obstacles) {
        if (x > o.x && x < o.x + o.w && y > o.y && y < o.y + o.h) return false;
      }
    }
    return true;
  }

  // ---------- Update ----------
  function update(dt) {
    tickSpeaker(dt);
    if (state.scene !== 'play') {
      player.vx = 0; player.vy = 0;
      return;
    }
    // F = flashlight
    if (wasPressed('f')) { state.flashlightOn = !state.flashlightOn; sfx('click'); }
    if (state.flashlightOn) state.flashlightCharge = Math.max(0.2, state.flashlightCharge - dt * 0.004);
    else state.flashlightCharge = Math.min(1.0, state.flashlightCharge + dt * 0.08);

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

    // Camera
    const targetCamX = player.x - VIEW_W / 2;
    const targetCamY = player.y - VIEW_H / 2;
    cam.x += (targetCamX - cam.x) * 0.18;
    cam.y += (targetCamY - cam.y) * 0.18;
    cam.x = Math.max(0, Math.min(cam.x, WORLD_W - VIEW_W));
    cam.y = Math.max(0, Math.min(cam.y, WORLD_H - VIEW_H));
    // Screen shake (wrong-candle feedback) — decay linearly, apply AFTER clamp so edges still jitter
    if (state.shakeT > 0) {
      state.shakeT -= dt * 1000;
      const mag = state.shakeMag * Math.max(0, state.shakeT / 420);
      cam.x += (Math.random() - 0.5) * 2 * mag;
      cam.y += (Math.random() - 0.5) * 2 * mag;
      if (state.shakeT <= 0) { state.shakeT = 0; state.shakeMag = 0; }
    }

    // Spawn Ex Preshon once player moves a bit
    if (!expression.spawned && (player.x > 300 || player.y > 300)) {
      expression.spawned = true;
      expression.x = WORLD_W - 300;
      expression.y = 200;
      speak('Something is down here with you. Don\u2019t blink.', 3200);
      sfx('snarl');
    }
    // Spawn EXLENA when player enters middle chamber (y > 700)
    if (!exlena.spawned && player.y > CHAMBERS.middle.y1 + 40) {
      exlena.spawned = true;
      exlena.x = CHAMBERS.middle.x2 - 120;
      exlena.y = CHAMBERS.middle.y1 + 60;
      speak('EXLENA — the teacher — watches from the shadows. Grab a KEY. She fears them.', 3800);
      sfx('exlenahiss');
    }

    if (expression.spawned) updateExpression(dt);
    if (exlena.spawned) updateExlena(dt);

    // Pickups
    for (const it of items) {
      if (it.collected) continue;
      if (!rectIntersect(player, it)) continue;
      if (it.kind === 'key') {
        it.collected = true;
        state.keys++;
        sfx('keypick');
        speak(`SKELETON KEY ${state.keys}/${state.totalKeys}`, 1800);
        if (state.keys === state.totalKeys) {
          const obj = state.objectives.find(o => o.id === 'keys');
          if (obj) obj.done = true;
          speak('All 4 keys! The furnace hatch stirs.', 3200);
        }
      } else if (it.kind === 'star') {
        it.collected = true;
        state.stars++;
        sfx('pickup');
        if (state.stars === state.starsTotal) speak(`All ${state.starsTotal} stars!`, 2400);
      } else if (it.kind === 'gem') {
        it.collected = true;
        sfx('pickup');
        if (window.HorridorsStory && it.gemId) window.HorridorsStory.unlockGem(it.gemId);
      } else if (it.kind === 'crystal') {
        it.collected = true;
        sfx('pickup');
        if (window.HorridorsWallet && it.element) window.HorridorsWallet.unlockElement(it.element);
        if (window.HorridorsWallet) window.HorridorsWallet.addCoins(3);
        speak('🔥 FIRE crystal! Your Grabpack hums warm.', 3600);
      }
    }

    // Candle note — Mum's handwriting reveals the fixed story order
    if (!candleNote.read && rectIntersect(player, candleNote)) {
      candleNote.read = true;
      state.candleNoteRead = true;
      state.objectives.find(o => o.id === 'note').done = true;
      const order = state.candleOrder.map(n => n + 1).join(' \u2192 ');
      speak(`Mum's note: "Light them in this order — ${order}. Don't guess."`, 4800);
      sfx('pickup');
    }

    // Candle interaction: press E near a candle to light it in sequence
    if (wasPressed('e', ' ')) {
      // Candles
      let interacted = false;
      for (const c of candles) {
        if (Math.hypot(player.x - c.x, player.y - c.y) < 50 && !c.lit) {
          if (!state.candleNoteRead) {
            speak('You need the candle order note first.', 2400);
            interacted = true;
            break;
          }
          // Is this the next in the correct order?
          const expected = state.candleOrder[state.candleProgress];
          if (c.id === expected) {
            c.lit = true;
            state.candleProgress++;
            sfx('candle');
            if (state.candleProgress === 3) {
              state.candlePuzzleSolved = true;
              state.objectives.find(o => o.id === 'candles').done = true;
              speak('All sconces lit. The furnace rumbles awake.', 3200);
            } else {
              speak(`Candle ${c.id + 1} lit. ${3 - state.candleProgress} to go.`, 2000);
            }
          } else {
            // Wrong order — dramatic reset: snuff sfx, shake, toast, show the order again
            for (const cc of candles) cc.lit = false;
            state.candleProgress = 0;
            sfx('snuff');
            state.shakeT = 420;
            state.shakeMag = 8;
            const order = state.candleOrder.map(n => n + 1).join(' \u2192 ');
            speak(`Wrong candle! All sconces snuff out. Order: ${order}.`, 3400);
          }
          interacted = true;
          break;
        }
      }
      // Hatch interaction (also via auto-finish, but E works too)
      if (!interacted && rectIntersect({ x: player.x - 20, y: player.y - 20, w: player.w + 40, h: player.h + 40 }, furnaceHatch)) {
        tryExit();
      }
    }

    // Check if hatch should unlock
    if (!furnaceHatch.unlocked && state.keys === state.totalKeys && state.candlePuzzleSolved) {
      furnaceHatch.unlocked = true;
      speak('The furnace hatch clicks open. Drop in.', 3200);
      sfx('door');
    }

    // Auto-finish on walking onto the hatch
    if (furnaceHatch.unlocked && state.scene === 'play' && rectIntersect(player, furnaceHatch)) {
      endLevel4();
    }

    // Candle flicker animation (for visual life)
    for (const c of candles) {
      if (c.lit) c.flicker = (c.flicker + dt * 10) % (Math.PI * 2);
    }

    // M = mute
    if (wasPressed('m')) { state.muted = !state.muted; if (masterGain) masterGain.gain.value = state.muted ? 0 : 0.5; }

    justPressed.clear();
  }

  // ---------- Monsters ----------
  function playerFlashlightHits(mon) {
    const dx = (mon.x + mon.w/2) - (player.x + player.w/2);
    const dy = (mon.y + mon.h/2) - (player.y + player.h/2);
    const angleToMonster = Math.atan2(dy, dx);
    const diff = Math.atan2(Math.sin(angleToMonster - player.facing), Math.cos(angleToMonster - player.facing));
    return Math.abs(diff) < (Math.PI / 3.6); // ±50° forgiving
  }

  function updateExpression(dt) {
    if (expression.hurtFlash > 0) expression.hurtFlash = Math.max(0, expression.hurtFlash - dt);
    // Eye glow tracks blink state
    const targetGlow = expression.state === 'blink' ? 0 : 1;
    expression.eyeGlow += (targetGlow - expression.eyeGlow) * Math.min(1, dt * 14);

    expression.blinkT += dt;
    if (expression.state !== 'blink' && expression.blinkT > expression.blinkInterval) {
      expression.state = 'blink';
      expression.blinkT = 0;
      expression.blinkInterval = 5 + Math.random() * 3;
      setTimeout(() => { expression.state = 'charge'; }, 350);
    }

    const dist = distance(player, expression);
    if (dist < 280) {
      expression.snarlT -= dt;
      if (expression.snarlT <= 0) { sfx('snarl'); expression.snarlT = 1 + Math.random() * 0.6; }
    }
    const los = lineOfSight(player, expression);
    const flashlit = state.flashlightOn && state.flashlightCharge > 0;
    const inBeam = flashlit && los && dist < 400 && playerFlashlightHits(expression);
    const now = performance.now();
    if (inBeam) expression.safeUntil = now + 1200;
    const inGrace = now < expression.safeUntil;

    if (expression.state !== 'blink') {
      if (inBeam || inGrace) {
        expression.state = 'recoil';
        if (inBeam) expression.hurtFlash = 0.35;
      } else {
        expression.state = 'charge';
      }
    }

    const _dL4 = (window.__difficulty && window.__difficulty.get()) || { speedMul: 1 };
    if (expression.state === 'charge' || expression.state === 'blink') {
      const tx = player.x - expression.x;
      const ty = player.y - expression.y;
      const len = Math.hypot(tx, ty) || 1;
      const sp = (expression.state === 'blink' ? 200 : expression.speed) * _dL4.speedMul;
      moveWithCollision(expression, (tx / len) * sp * dt, (ty / len) * sp * dt);
    } else if (expression.state === 'recoil') {
      const tx = expression.x - player.x;
      const ty = expression.y - player.y;
      const len = Math.hypot(tx, ty) || 1;
      moveWithCollision(expression, (tx / len) * expression.recoilSpeed * dt, (ty / len) * expression.recoilSpeed * dt);
    }

    // Push out
    if (rectIntersect(player, expression) && (expression.state === 'recoil' || expression.state === 'blink')) {
      const dx = (expression.x + expression.w/2) - (player.x + player.w/2);
      const dy = (expression.y + expression.h/2) - (player.y + player.h/2);
      const len = Math.hypot(dx, dy) || 1;
      moveWithCollision(expression, (dx / len) * 80 * dt, (dy / len) * 80 * dt);
    }

    if (rectIntersect(player, expression) &&
        (expression.state === 'charge' || expression.state === 'blink')) {
      caught();
    }
  }

  function updateExlena(dt) {
    exlena.hissT -= dt;
    if (exlena.hissT <= 0 && distance(player, exlena) < 350) { sfx('exlenahiss'); exlena.hissT = 1.4 + Math.random() * 0.8; }

    const dist = distance(player, exlena);
    const hasAnyKey = state.keys > 0;
    const los = lineOfSight(player, exlena);

    // EXLENA is SCARED by keys. Holding 1+ key and LOOKING at her (wide cone) pushes her back.
    const keyFear = hasAnyKey && los && dist < 360 && playerFlashlightHits(exlena);
    const now = performance.now();
    if (keyFear) exlena.spawnT = now + 1000; // repurpose spawnT as grace
    const inGrace = now < exlena.spawnT;

    if (keyFear || inGrace) {
      // Recoil
      const tx = exlena.x - player.x;
      const ty = exlena.y - player.y;
      const len = Math.hypot(tx, ty) || 1;
      exlena.state = 'recoil';
      moveWithCollision(exlena, (tx / len) * exlena.recoilSpeed * dt, (ty / len) * exlena.recoilSpeed * dt);
    } else {
      // Slowly creep toward player. Slower than Ex Preshon but doesn't care about torch.
      exlena.state = 'charge';
      const tx = player.x - exlena.x;
      const ty = player.y - exlena.y;
      const len = Math.hypot(tx, ty) || 1;
      const _dE = (window.__difficulty && window.__difficulty.get()) || { speedMul: 1 };
      const exSp = exlena.speed * _dE.speedMul;
      moveWithCollision(exlena, (tx / len) * exSp * dt, (ty / len) * exSp * dt);
    }

    if (rectIntersect(player, exlena) && exlena.state === 'charge') {
      caught('exlena');
    } else if (rectIntersect(player, exlena)) {
      // Push out during recoil so you don't get stuck
      const dx = (exlena.x + exlena.w/2) - (player.x + player.w/2);
      const dy = (exlena.y + exlena.h/2) - (player.y + player.h/2);
      const len = Math.hypot(dx, dy) || 1;
      moveWithCollision(exlena, (dx / len) * 80 * dt, (dy / len) * 80 * dt);
    }
  }

  function caught(by = 'expression') {
    if (state.scene !== 'play') return;
    state.scene = 'caught';
    sfx('bad');
    const whisper = document.getElementById('caught-whisper');
    if (whisper) {
      whisper.textContent = by === 'exlena'
        ? '"...teacher knows best..."'
        : '"...one eye still open..."';
    }
    document.getElementById('overlay-caught').classList.remove('hidden');
  }

  function tryExit() {
    if (!furnaceHatch.unlocked) {
      if (state.keys < state.totalKeys) speak(`Hatch is locked. ${state.totalKeys - state.keys} keys left.`, 2600);
      else if (!state.candlePuzzleSolved) speak('The hatch hums but won\u2019t open. Light the candles.', 2800);
    } else {
      endLevel4();
    }
  }

  function endLevel4() {
    if (state.scene === 'end') return;
    state.scene = 'end';
    state.objectives.find(o => o.id === 'exit').done = true;
    sfx('door'); setTimeout(() => sfx('jingle'), 200);
    const rewards = [
      '\ud83d\udddd\ufe0f ' + state.keys + ' Skeleton Keys',
      '\ud83d\udd6f\ufe0f Candles Lit in Order',
      '\u2b50 ' + state.stars + '/' + state.starsTotal + ' Stars Collected',
      '\ud83d\udd25 Furnace Hatch Reached',
    ];
    document.getElementById('l4-reward-chest').innerHTML = rewards.map(r => `<div class="reward-item">${r}</div>`).join('');
    document.getElementById('overlay-l4-end').classList.remove('hidden');
  }

  // ---------- Rendering ----------
  function drawFloor() {
    ctx.fillStyle = '#05060a';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    ctx.save();
    ctx.translate(-cam.x, -cam.y);

    // Chamber palettes (basement = cold blues and dusty purples)
    const palette = {
      upper:  ['#16152a', '#0c0b1c'],
      middle: ['#1a1420', '#0d0914'],
      lower:  ['#241422', '#160a18'],  // warmer red-purple near furnace
    };
    for (const k of Object.keys(CHAMBERS)) {
      const c = CHAMBERS[k];
      drawCheckerTile(c.x1, c.y1, c.x2 - c.x1, c.y2 - c.y1, palette[k][0], palette[k][1]);
    }
    // Stair tiles
    for (const s of STAIRS) {
      const gradStops = ['#2a2438', '#1b1626'];
      drawCheckerTile(s.x, s.y1, s.w, s.y2 - s.y1, gradStops[0], gradStops[1]);
    }
    ctx.restore();
  }
  function drawCheckerTile(x, y, w, h, a, b) {
    const size = 40;
    for (let ty = 0; ty < h; ty += size) {
      for (let tx = 0; tx < w; tx += size) {
        ctx.fillStyle = (((tx/size + ty/size) & 1) === 0) ? a : b;
        ctx.fillRect(x + tx, y + ty, Math.min(size, w - tx), Math.min(size, h - ty));
      }
    }
  }

  function drawObstacles() {
    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    for (const o of obstacles) {
      // Skip world-perimeter obstacles (outside viewable range)
      if (o.x + o.w < cam.x || o.x > cam.x + VIEW_W) continue;
      if (o.y + o.h < cam.y || o.y > cam.y + VIEW_H) continue;
      // Stone brick texture
      const grad = ctx.createLinearGradient(o.x, o.y, o.x, o.y + o.h);
      grad.addColorStop(0, '#3a3548');
      grad.addColorStop(1, '#221d2c');
      ctx.fillStyle = grad;
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.strokeStyle = 'rgba(10,5,15,0.6)';
      ctx.lineWidth = 1;
      ctx.strokeRect(o.x + 0.5, o.y + 0.5, o.w - 1, o.h - 1);
      // Brick lines
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      for (let by = o.y + 16; by < o.y + o.h; by += 16) {
        ctx.beginPath();
        ctx.moveTo(o.x, by);
        ctx.lineTo(o.x + o.w, by);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawItems() {
    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    const t = performance.now() / 1000;
    for (const it of items) {
      if (it.collected) continue;
      if (it.x + it.w < cam.x || it.x > cam.x + VIEW_W) continue;
      if (it.y + it.h < cam.y || it.y > cam.y + VIEW_H) continue;
      const cx = it.x + it.w/2;
      const cy = it.y + it.h/2 + Math.sin(t * 2 + cx * 0.01) * 2;
      const pulse = 0.7 + 0.3 * Math.sin(t * 3 + cx * 0.02);
      if (it.kind === 'star') {
        const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, 22);
        grad.addColorStop(0, `rgba(255, 220, 90, ${0.85 * pulse})`);
        grad.addColorStop(0.4, `rgba(255, 180, 60, ${0.35 * pulse})`);
        grad.addColorStop(1, 'rgba(255, 160, 40, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(cx, cy, 22, 0, Math.PI * 2); ctx.fill();
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
        ctx.closePath(); ctx.fill(); ctx.stroke();
      } else if (it.kind === 'gem') {
        const color = it.gemColor || '#c09cff';
        ctx.fillStyle = color; ctx.globalAlpha = 0.35 * pulse;
        ctx.beginPath(); ctx.arc(cx, cy, 20, 0, Math.PI*2); ctx.fill();
        ctx.globalAlpha = 1;
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
      } else if (it.kind === 'crystal') {
        // Elemental crystal: diamond shape, pulsing radial glow in element color.
        const meta = (window.HorridorsWallet && window.HorridorsWallet.elementMeta)
          ? window.HorridorsWallet.elementMeta(it.element)
          : null;
        const color = (meta && meta.color) || '#ff8a3a';
        // Bright outer glow so the crystal reads from across a dark room.
        const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, 40);
        grad.addColorStop(0, color);
        grad.addColorStop(0.35, color + '99');
        grad.addColorStop(0.7, color + '33');
        grad.addColorStop(1, color + '00');
        ctx.fillStyle = grad; ctx.globalAlpha = 0.95 * pulse;
        ctx.beginPath(); ctx.arc(cx, cy, 40, 0, Math.PI*2); ctx.fill();
        ctx.globalAlpha = 1;
        // Tiny floating sparks (flame feel) for fire, soft orbs otherwise.
        const tNow = performance.now() / 600;
        for (let k = 0; k < 4; k++) {
          const ang = tNow + k * Math.PI / 2;
          const r = 10 + 4 * Math.sin(tNow * 2 + k);
          const sx = cx + Math.cos(ang) * r;
          const sy = cy + Math.sin(ang) * r - 2;
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.6 + 0.4 * Math.sin(tNow * 3 + k);
          ctx.beginPath(); ctx.arc(sx, sy, 1.6, 0, Math.PI*2); ctx.fill();
        }
        ctx.globalAlpha = 1;
        // Diamond body (bigger to match 22px hitbox)
        ctx.fillStyle = color;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(cx, cy - 11);
        ctx.lineTo(cx + 9, cy);
        ctx.lineTo(cx, cy + 11);
        ctx.lineTo(cx - 9, cy);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        // White glint
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.beginPath(); ctx.arc(cx - 2, cy - 3, 2, 0, Math.PI*2); ctx.fill();
      } else if (it.kind === 'key') {
        // Skeleton key glow
        const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, 30);
        grad.addColorStop(0, `rgba(200, 220, 255, ${0.9 * pulse})`);
        grad.addColorStop(0.5, `rgba(140, 180, 240, ${0.4 * pulse})`);
        grad.addColorStop(1, 'rgba(100, 140, 220, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(cx, cy, 30, 0, Math.PI * 2); ctx.fill();
        // Key shape
        ctx.fillStyle = '#e6e8f2';
        ctx.strokeStyle = '#7f8fa9';
        ctx.lineWidth = 1.2;
        // bow (circle)
        ctx.beginPath(); ctx.arc(cx - 7, cy, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        // shaft
        ctx.fillRect(cx - 3, cy - 1, 12, 3);
        ctx.strokeRect(cx - 3 + 0.5, cy - 1 + 0.5, 12 - 1, 3 - 1);
        // teeth
        ctx.fillRect(cx + 5, cy + 2, 2, 4);
        ctx.fillRect(cx + 8, cy + 2, 2, 3);
      }
    }
    ctx.restore();
  }

  function drawCandles() {
    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    const t = performance.now() / 1000;
    for (const c of candles) {
      // Sconce base
      ctx.fillStyle = '#3a2818';
      ctx.fillRect(c.x, c.y + 30, c.w, 20);
      ctx.strokeStyle = '#1a0f08';
      ctx.strokeRect(c.x + 0.5, c.y + 30 + 0.5, c.w - 1, 20 - 1);
      // Candle
      ctx.fillStyle = '#f0e2c0';
      ctx.fillRect(c.x + 10, c.y + 10, 10, 22);
      ctx.strokeStyle = '#8a7855';
      ctx.strokeRect(c.x + 10 + 0.5, c.y + 10 + 0.5, 10 - 1, 22 - 1);
      // Label (1/2/3) above
      ctx.fillStyle = c.lit ? '#ffcf80' : 'rgba(255,200,140,0.35)';
      ctx.font = '700 14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(String(c.id + 1), c.x + c.w/2, c.y + 6);
      // Flame
      if (c.lit) {
        const flickerScale = 0.9 + 0.2 * Math.sin(t * 12 + c.id);
        const fx = c.x + c.w/2;
        const fy = c.y + 8;
        const grad = ctx.createRadialGradient(fx, fy, 2, fx, fy, 50 * flickerScale);
        grad.addColorStop(0, 'rgba(255, 220, 120, 0.95)');
        grad.addColorStop(0.3, 'rgba(255, 160, 60, 0.5)');
        grad.addColorStop(1, 'rgba(255, 120, 40, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(fx, fy, 50 * flickerScale, 0, Math.PI * 2); ctx.fill();
        // Inner hot flame
        ctx.fillStyle = 'rgba(255,240,180,0.95)';
        ctx.beginPath();
        ctx.ellipse(fx, fy - 2, 3, 6 * flickerScale, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawCandleNote() {
    if (candleNote.read) return;
    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    const t = performance.now() / 1000;
    const cx = candleNote.x + candleNote.w/2;
    const cy = candleNote.y + candleNote.h/2 + Math.sin(t * 1.6) * 2;
    // Paper
    ctx.fillStyle = '#e8dcaa';
    ctx.strokeStyle = '#5a4a20';
    ctx.lineWidth = 1;
    ctx.fillRect(candleNote.x, candleNote.y, candleNote.w, candleNote.h);
    ctx.strokeRect(candleNote.x + 0.5, candleNote.y + 0.5, candleNote.w - 1, candleNote.h - 1);
    // Scribbles
    ctx.strokeStyle = '#5a4a20';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(candleNote.x + 4, candleNote.y + 6 + i * 6);
      ctx.lineTo(candleNote.x + candleNote.w - 4, candleNote.y + 6 + i * 6);
      ctx.stroke();
    }
    // Glow
    const pulse = 0.6 + 0.4 * Math.sin(t * 2);
    const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, 26);
    grad.addColorStop(0, `rgba(255, 220, 120, ${0.6 * pulse})`);
    grad.addColorStop(1, 'rgba(255, 200, 100, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(cx, cy, 26, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawFurnaceHatch() {
    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    const t = performance.now() / 1000;
    const x = furnaceHatch.x, y = furnaceHatch.y, w = furnaceHatch.w, h = furnaceHatch.h;
    // Metal frame
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, furnaceHatch.unlocked ? '#ffa840' : '#3a3038');
    grad.addColorStop(1, furnaceHatch.unlocked ? '#c46018' : '#1a1420');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#0a0608';
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    // Grate bars
    ctx.strokeStyle = furnaceHatch.unlocked ? 'rgba(255,140,40,0.8)' : 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(x, y + (h * i) / 4);
      ctx.lineTo(x + w, y + (h * i) / 4);
      ctx.stroke();
    }
    // Fire glow when unlocked
    if (furnaceHatch.unlocked) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 4);
      const fg = ctx.createRadialGradient(x + w/2, y + h/2, 4, x + w/2, y + h/2, 80);
      fg.addColorStop(0, `rgba(255, 180, 60, ${0.6 * pulse})`);
      fg.addColorStop(1, 'rgba(255, 100, 40, 0)');
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.arc(x + w/2, y + h/2, 80, 0, Math.PI * 2); ctx.fill();
    }
    // Label
    ctx.fillStyle = furnaceHatch.unlocked ? '#fff2cc' : 'rgba(220,180,150,0.4)';
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(furnaceHatch.unlocked ? 'FURNACE' : 'LOCKED', x + w/2, y - 6);
    ctx.restore();
  }

  function drawPlayer() {
    if (window.HorridorsSprites && window.HorridorsSprites.drawCharacter) {
      ctx.save();
      ctx.translate(-cam.x, -cam.y);
      window.HorridorsSprites.drawChesterWalk(ctx, player.x + player.w/2, player.y + player.h + 8, (player.facing !== undefined ? (Math.cos(player.facing) >= 0 ? 1 : -1) : 1), 56, player.vx, player.vy);
      ctx.restore();
      return;
    }
}

  function drawMonster(m, type) {
    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    const cx = m.x + m.w/2;
    const cy = m.y + m.h + 6;
    const charName = (type === 'expression') ? 'expreshon' : 'exlena';
    const size = (type === 'expression') ? 92 : 88;
    if (window.HorridorsSprites && window.HorridorsSprites.drawCharacter) {
      window.HorridorsSprites.drawCharacter(ctx, charName, cx, cy, 1, size);
    }
    ctx.restore();
  }

  function drawLighting() {
    // Build a darkness mask, then punch out the flashlight cone (in world space via camera offset).
    ctx.save();
    const grad = ctx.createRadialGradient(
      (player.x + player.w/2) - cam.x,
      (player.y + player.h/2) - cam.y,
      20,
      (player.x + player.w/2) - cam.x,
      (player.y + player.h/2) - cam.y,
      260
    );
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.4, 'rgba(0,0,0,0.35)');
    grad.addColorStop(1, 'rgba(0,0,0,0.92)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    if (state.flashlightOn && state.flashlightCharge > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      const cx = (player.x + player.w/2) - cam.x;
      const cy = (player.y + player.h/2) - cam.y;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      const reach = 340 * (0.7 + 0.3 * state.flashlightCharge);
      const half = Math.PI / 3.6; // ±50°
      ctx.arc(cx, cy, reach, player.facing - half, player.facing + half);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Warm halo
      const h = ctx.createRadialGradient(cx, cy, 10, cx, cy, 80);
      h.addColorStop(0, 'rgba(255,220,160,0.18)');
      h.addColorStop(1, 'rgba(255,220,160,0)');
      ctx.fillStyle = h;
      ctx.fillRect(cx - 100, cy - 100, 200, 200);
    }
    ctx.restore();
  }

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
      ctx.fillStyle = 'rgba(12,8,22,0.85)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(180,140,255,0.45)';
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      ctx.fillStyle = '#e8d8ff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, VIEW_W/2, y + h/2);
      ctx.restore();
    }

    // Top-left hint
    let hint = '';
    if (state.scene === 'play') {
      if (state.keys < state.totalKeys) hint = `Find ${state.totalKeys - state.keys} more SKELETON KEYS.`;
      else if (!state.candleNoteRead) hint = 'Find the candle-order note in the middle chamber.';
      else if (!state.candlePuzzleSolved) hint = `Light candles in order: ${state.candleOrder.map(n => n + 1).join(' → ')}`;
      else if (!furnaceHatch.unlocked) hint = 'Drop through the FURNACE HATCH (lower chamber).';
      else hint = 'Hatch open — drop in!';
    }
    if (hint) {
      ctx.save();
      ctx.font = '600 13px system-ui, sans-serif';
      const m = ctx.measureText(hint);
      const pad = 10;
      const w = m.width + pad*2, h = 26;
      const x = 14, y = 14;
      ctx.fillStyle = 'rgba(12,8,22,0.85)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(180,140,255,0.45)';
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      ctx.fillStyle = '#d8c8ff';
      ctx.textBaseline = 'middle';
      ctx.fillText(hint, x + pad, y + h/2);
      ctx.restore();
    }

    // Top-right objectives
    const lines = state.objectives.map(o => (o.done ? '✓ ' : '☐ ') + o.text);
    ctx.save();
    ctx.font = '600 12px system-ui, sans-serif';
    let maxW = 0;
    for (const l of lines) maxW = Math.max(maxW, ctx.measureText(l).width);
    const w = maxW + 22, h = lines.length * 18 + 30;
    const x = VIEW_W - w - 14, y = 14;
    ctx.fillStyle = 'rgba(12,8,22,0.85)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(180,140,255,0.45)';
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle = '#c0a8ff';
    ctx.fillText('OBJECTIVES', x + 10, y + 16);
    for (let i = 0; i < lines.length; i++) {
      ctx.fillStyle = state.objectives[i].done ? '#a4ffb6' : '#e8d8ff';
      ctx.fillText(lines[i], x + 10, y + 32 + i * 18);
    }
    ctx.restore();

    // Bottom-left status row
    ctx.save();
    ctx.font = '600 12px system-ui, sans-serif';
    const fl = state.flashlightOn ? 'ON' : 'OFF';
    const txt = `🔦 ${fl}   |   🗝 ${state.keys}/${state.totalKeys}   |   🕯 ${state.candleProgress}/3   |   ⭐ ${state.stars}/${state.starsTotal}`;
    const m = ctx.measureText(txt);
    const w2 = m.width + 20, h2 = 26;
    const x2 = 14, y2 = VIEW_H - h2 - 14;
    ctx.fillStyle = 'rgba(12,8,22,0.85)';
    ctx.fillRect(x2, y2, w2, h2);
    ctx.strokeStyle = 'rgba(180,140,255,0.45)';
    ctx.strokeRect(x2 + 0.5, y2 + 0.5, w2 - 1, h2 - 1);
    ctx.fillStyle = '#e8d8ff';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, x2 + 10, y2 + h2/2);
    ctx.restore();
  }

  function render() {
    drawFloor();
    drawObstacles();
    drawItems();
    drawCoinsL4();
    drawCandles();
    drawCandleNote();
    drawFurnaceHatch();
    if (expression.spawned) drawMonster(expression, 'expression');
    if (exlena.spawned) drawMonster(exlena, 'exlena');
    drawPlayer();
    drawLighting();
    drawHUD();
  }

  // ---------- Loop ----------
  let running = false;
  let lastT = 0;
  let _l4TaskTick = 0;
  function loop(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - lastT) / 1000) || 0;
    lastT = now;
    update(dt);
    render();
    _l4TaskTick += dt;
    if (_l4TaskTick >= 0.5) { _l4TaskTick = 0; if (window.refreshChecklist) window.refreshChecklist(); }
    requestAnimationFrame(loop);
  }

  function l4DoneIds() {
    const done = new Set();
    for (const o of state.objectives) if (o.done) done.add(o.id);
    if (state.scene === 'end') done.add('exit');
    return done;
  }
  function registerL4Tasks() {
    if (!window.HorridorsTasks) return;
    window.HorridorsTasks.setLevel('l4', 'Level 4 — Tasks', [
      { id: 'keys',    label: 'Collect 4 skeleton keys' },
      { id: 'note',    label: 'Find the candle-order note' },
      { id: 'candles', label: 'Light the candle sconces' },
      { id: 'exit',    label: 'Drop through the furnace hatch' },
    ], l4DoneIds);
  }

  // ---------- Start / Stop ----------
  function resetLevel4State() {
    state.scene = 'play';
    state.flashlightOn = true;
    state.flashlightCharge = 1.0;
    state.keys = 0;
    state.candleProgress = 0;
    state.candlePuzzleSolved = false;
    state.candleNoteRead = false;
    state.stars = 0;
    state.speakerLine = null;
    state.speakerT = 0;
    for (const o of state.objectives) o.done = false;
    expression.spawned = false;
    expression.state = 'lurk';
    expression.hurtFlash = 0;
    expression.safeUntil = 0;
    exlena.spawned = false;
    exlena.state = 'lurk';
    exlena.spawnT = 0;
    player.x = 220; player.y = 220;
    player.vx = 0; player.vy = 0;
    buildWorld();
  }

  function start() {
    // Hide other levels' overlays
    const toHide = [
      'overlay-title','overlay-end','overlay-caught','overlay-notes',
      'overlay-l2-title','overlay-l2-end','overlay-cipher','overlay-valve','overlay-note',
      'overlay-l3-title','overlay-l3-end','overlay-mirror','overlay-code','overlay-comic',
      'overlay-l4-end','overlay-candles',
    ];
    for (const id of toHide) document.getElementById(id)?.classList.add('hidden');
    document.getElementById('overlay-l4-title').classList.remove('hidden');
  }

  function actuallyBegin() {
    document.getElementById('overlay-l4-title').classList.add('hidden');
    // Apply Bargain Bin powerups
    const W = window.HorridorsWallet;
    if (W && W.hasPowerup('quickFeet')) player.speed = 189; // +5%
    ensureAudio();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    startAmbient();
    resetLevel4State();
    if (!running) {
      running = true;
      window.addEventListener('keydown', keydown);
      window.addEventListener('keyup', keyup);
      window.addEventListener('blur', blur);
      lastT = performance.now();
      requestAnimationFrame(loop);
    }
    speak('Cold air. Two shadows. Stay moving.', 3200);
    registerL4Tasks();
  }

  // ---- Early shop (Bargain Bin) — teaches kids that saving their coins pays ----
  const L4_SHOP_ITEMS = [
    { id: 'flashBattery', name: 'Flashlight Battery', desc: 'Slightly wider light in dark rooms', cost: 8 },
    { id: 'smallHeart',   name: 'Small Heart',        desc: '+1 HP at L7 (stacks with Extra Heart)', cost: 10 },
    { id: 'quickFeet',    name: 'Quick Feet',         desc: '+5% move speed, forever',           cost: 12 },
  ];
  function renderL4Shop() {
    const W = window.HorridorsWallet;
    const coinEl = document.getElementById('l4-shop-coin-count');
    if (coinEl && W) coinEl.textContent = W.getCoins();
    const host = document.getElementById('l4-shop-items');
    if (!host) return;
    host.innerHTML = '';
    for (const it of L4_SHOP_ITEMS) {
      const owned = W && W.hasPowerup(it.id);
      const canAfford = W && W.getCoins() >= it.cost;
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;background:#1a1130;border:1px solid #3a2a5a;border-radius:8px;';
      row.innerHTML = `
        <div style="flex:1;">
          <div style="font:700 14px system-ui;color:#f2e8ff;">${it.name} <span style="font:600 12px system-ui;color:#ffd84a;">— ${it.cost} coins</span></div>
          <div style="font:500 12px system-ui;color:#b5a3d0;margin-top:2px;">${it.desc}</div>
        </div>
        <button data-l4shop-id="${it.id}" style="padding:7px 12px;border-radius:6px;border:none;font:700 12px system-ui;cursor:${owned||!canAfford?'default':'pointer'};background:${owned?'#4aa86b':(canAfford?'#ffd84a':'#3a2a5a')};color:${owned?'#fff':(canAfford?'#1a1024':'#7a6aa0')};" ${owned||!canAfford?'disabled':''}>${owned?'Owned ✓':(canAfford?'Buy':'Need coins')}</button>
      `;
      host.appendChild(row);
    }
    host.querySelectorAll('button[data-l4shop-id]').forEach(b => {
      b.addEventListener('click', () => {
        const id = b.getAttribute('data-l4shop-id');
        const it = L4_SHOP_ITEMS.find(x => x.id === id);
        if (W && W.buyPowerup(id, it.cost)) {
          try { sfx('full'); } catch(e){}
          renderL4Shop();
        } else {
          try { sfx('wrong'); } catch(e){}
        }
      });
    });
  }
  function showL4Shop() {
    const ov = document.getElementById('overlay-l4-shop');
    if (!ov) { actuallyBegin(); return; }
    document.getElementById('overlay-l4-title').classList.add('hidden');
    ov.classList.remove('hidden');
    renderL4Shop();
  }
  function closeL4Shop() {
    document.getElementById('overlay-l4-shop')?.classList.add('hidden');
    actuallyBegin();
  }
  document.getElementById('btn-l4-shop-done')?.addEventListener('click', closeL4Shop);
  // E / Space / Enter also close the shop
  window.addEventListener('keydown', (e) => {
    const ov = document.getElementById('overlay-l4-shop');
    if (!ov || ov.classList.contains('hidden')) return;
    const k = e.key;
    if (k === 'e' || k === 'E' || k === ' ' || k === 'Enter' || k === 'Escape') {
      e.preventDefault();
      closeL4Shop();
    }
  });

  // Wire up overlay buttons — start now routes through the shop first
  document.getElementById('btn-l4-start')?.addEventListener('click', showL4Shop);
  document.getElementById('btn-l4-replay')?.addEventListener('click', () => {
    document.getElementById('overlay-l4-end').classList.add('hidden');
    resetLevel4State();
    speak('Again. Keys and candles.', 2400);
  });
  document.getElementById('btn-l4-home')?.addEventListener('click', () => {
    running = false;
    stopAmbient();
    window.removeEventListener('keydown', keydown);
    window.removeEventListener('keyup', keyup);
    window.removeEventListener('blur', blur);
    window.location.reload();
  });
  document.getElementById('btn-l4-next')?.addEventListener('click', () => {
    // Hand off to Level 5
    document.getElementById('overlay-l4-end').classList.add('hidden');
    running = false;
    stopAmbient();
    window.removeEventListener('keydown', keydown);
    window.removeEventListener('keyup', keyup);
    window.removeEventListener('blur', blur);
    if (window.__startLevel5) window.__startLevel5();
  });

  // Also handle the existing "Try Again" caught-retry button when L4 is active
  const btnRetry = document.getElementById('btn-retry');
  if (btnRetry) {
    btnRetry.addEventListener('click', () => {
      if (state.scene !== 'caught') return;
      document.getElementById('overlay-caught').classList.add('hidden');
      resetLevel4State();
      speak('One more try.', 1800);
    });
  }

  function stopLevel4() {
    running = false;
    try { window.removeEventListener('keydown', keydown); } catch (e) {}
    try { window.removeEventListener('keyup', keyup); } catch (e) {}
    try { window.removeEventListener('blur', blur); } catch (e) {}
    try { keys.clear(); } catch (e) {}
    try { stopAmbient(); } catch (e) {}
  }

  function resumeLevel4() {
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
    ['overlay-l4-title','overlay-l4-end','overlay-caught','overlay-candles']
      .forEach(id => { const el = document.getElementById(id); if (el) el.classList.add('hidden'); });
    state.scene = 'play';
    registerL4Tasks && registerL4Tasks();
  }

  // Expose
  window.__startLevel4 = start;
  window.__horridorsL4 = {
    audioCtx: () => audioCtx,
    masterGain: () => masterGain,
    stopAmbient,
    stop: stopLevel4,
    resume: resumeLevel4,
    isRunning: () => running,
    sfx: (n) => { try { sfx(n); } catch (e) {} },
  };
  // Debug hook
  window.__level4 = {
    state, player, expression, exlena, candles, items, obstacles, furnaceHatch,
    teleport: (x, y) => { player.x = x; player.y = y; },
    giveKeys: () => { state.keys = 4; for (const it of items) if (it.kind === 'key') it.collected = true; state.objectives.find(o=>o.id==='keys').done = true; },
    readNote: () => { candleNote.read = true; state.candleNoteRead = true; state.objectives.find(o=>o.id==='note').done = true; },
    solveCandles: () => { for (const c of candles) c.lit = true; state.candlePuzzleSolved = true; state.candleProgress = 3; state.objectives.find(o=>o.id==='candles').done = true; },
    forceEnd: endLevel4,
    forceCaught: () => caught(),
  };
  console.log('[Level 4] Loaded. Call window.__startLevel4() to begin.');
})();
