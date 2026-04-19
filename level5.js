// =====================================================================
// HORRIDORS - LEVEL 5: THE NAUGHTY ROOM (no monsters — co-op puzzle)
// Thistle is locked in a cell. Chester runs 3 wall switches.
// Thistle flashes a pattern from her cell. Chester must repeat it.
// 4 stages, growing length. Forgiving: pattern replays on miss.
// After rescue, Thistle follows Chester to the exit.
// Standalone module; boots via window.__startLevel5().
// =====================================================================
(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const VIEW_W = canvas.width;
  const VIEW_H = canvas.height;

  // World: long horizontal cell-block corridor with 3 guard cells + Thistle's cell
  const WORLD_W = 2400, WORLD_H = 900;

  // Corridor bounds (open walkway)
  const CORRIDOR = { x1: 80, x2: 2320, y1: 380, y2: 700 };
  // Cells along the top wall
  const CELLS = [
    { id: 'decoy1',  x1: 180,  x2: 460,  y1: 140, y2: 380, label: 'CELL 1 — empty' },
    { id: 'decoy2',  x1: 520,  x2: 800,  y1: 140, y2: 380, label: 'CELL 2 — empty' },
    { id: 'decoy3',  x1: 860,  x2: 1140, y1: 140, y2: 380, label: 'CELL 3 — empty' },
    { id: 'thistle', x1: 1200, x2: 1560, y1: 140, y2: 380, label: "CELL 4 — THISTLE" },
    { id: 'decoy4',  x1: 1620, x2: 1900, y1: 140, y2: 380, label: 'CELL 5 — empty' },
    { id: 'decoy5',  x1: 1960, x2: 2240, y1: 140, y2: 380, label: 'CELL 6 — empty' },
  ];

  // 3 wall switches on the lower wall of the corridor
  // Switches have collision so the player can walk right up to them
  const SWITCHES = [
    { id: 0, x: 560,  y: 650, w: 50, h: 40, color: '#ff7a7a', label: 'A' }, // red
    { id: 1, x: 1180, y: 650, w: 50, h: 40, color: '#7acbff', label: 'B' }, // blue
    { id: 2, x: 1800, y: 650, w: 50, h: 40, color: '#ffd84a', label: 'C' }, // yellow
  ];

  // Cell door signal plate (Thistle's cell door glows when a pattern stage unlocks)
  const THISTLE = CELLS.find(c => c.id === 'thistle');
  const EXIT = { x: 2240, y: 440, w: 60, h: 160 }; // right end of corridor

  const cam = { x: 0, y: 0 };

  // Coins scattered in the corridor (gold pickups — spend in L7 shop)
  const coins = [
    { x: 240,  y: 560, got: false, v: 1 },
    { x: 420,  y: 620, got: false, v: 1 },
    { x: 720,  y: 560, got: false, v: 1 },
    { x: 980,  y: 620, got: false, v: 1 },
    { x: 1320, y: 560, got: false, v: 1 },
    { x: 1560, y: 620, got: false, v: 1 },
    { x: 1920, y: 560, got: false, v: 1 },
    { x: 2140, y: 620, got: false, v: 1 },
  ];

  // ---------- State ----------
  const state = {
    scene: 'title',  // 'title' | 'play' | 'cutscene' | 'end'
    speakerLine: null, speakerT: 0,
    muted: false,
    stage: 0,               // 0..3 (4 stages total)
    patternLen: [2, 3, 4, 4],
    pattern: [],            // current sequence of switch IDs (0/1/2)
    playerSeq: [],
    showingPattern: false,
    showIdx: 0,
    showT: 0,
    showPhase: 'off',       // 'on'|'off'|'done'
    stageClearedT: 0,
    lastSwitchFlashId: -1, lastSwitchFlashT: 0,
    thistleFreed: false,
    thistleCompanion: null, // {x, y, trail:[]} when following
    ending: false,
    missCooldown: 0,
    hintT: 0,
    objectives: [
      { id: 'stages', text: 'Finish 4 pattern stages', done: false },
      { id: 'free',   text: 'Free Thistle from the cell', done: false },
      { id: 'exit',   text: 'Lead Thistle to the exit', done: false },
    ],
  };

  // Cutscene state (intro)
  const cutscene = {
    active: false,
    page: 0,
    pages: [
      {
        title: 'The Naughty Room',
        text: 'Mrs Horrid keeps a secret room past the basement. Any kid who dares laugh, or skip a lesson, or ask too many questions gets sent there.',
      },
      {
        title: 'Thistle',
        text: "Thistle is my best school friend. She wears a sheriff-star hat and never stops smiling — even when she's scared. She was sent here two weeks ago for sharing crayons.",
      },
      {
        title: 'The Plan',
        text: "Thistle knows the cell-door code but she's stuck inside. She can flash signals through the bars. I'll flip the switches in the corridor in the pattern she shows.",
      },
      {
        title: "Let's go",
        text: 'No monsters down here — Mrs Horrid thinks nobody would be brave enough. She was wrong.',
      },
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
    const prev = window.__horridorsL4 || window.__horridorsL3 || window.__horridorsL2 || window.__horridorsL1;
    if (prev && prev.audioCtx && prev.audioCtx()) { audioCtx = prev.audioCtx(); masterGain = prev.masterGain(); return; }
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
      case 'switchA': tone(440, 0.18, 'triangle', 0.22); break;
      case 'switchB': tone(660, 0.18, 'triangle', 0.22); break;
      case 'switchC': tone(880, 0.18, 'triangle', 0.22); break;
      case 'showA':   tone(440, 0.25, 'sine', 0.25); break;
      case 'showB':   tone(660, 0.25, 'sine', 0.25); break;
      case 'showC':   tone(880, 0.25, 'sine', 0.25); break;
      case 'good':    [660,880,1100].forEach((f,i)=>setTimeout(()=>tone(f,0.15,'triangle',0.22), i*80)); break;
      case 'win':     [523,659,784,1047,1320].forEach((f,i)=>setTimeout(()=>tone(f,0.2,'triangle',0.25), i*110)); break;
      case 'bad':     tone(140, 0.35, 'sawtooth', 0.22); break;
      case 'click':   tone(800, 0.05, 'square', 0.15); break;
      case 'clank':   tone(110, 0.4, 'square', 0.22); setTimeout(()=>tone(220, 0.3, 'square', 0.18), 140); break;
      case 'thistle': tone(900, 0.1, 'sine', 0.2); setTimeout(()=>tone(1200, 0.1, 'sine', 0.18), 80); break;
    }
  }

  let ambientNodes = null;
  function startAmbient() {
    if (!audioCtx) return;
    if (window.HorridorsAmbient) {
      ambientNodes = window.HorridorsAmbient.start(audioCtx, masterGain, { mood: 'basement' });
    }
    if (window.HorridorsMusic) window.HorridorsMusic.setTheme(audioCtx, masterGain, 'l5');
  }
  function stopAmbient() {
    if (ambientNodes && ambientNodes.stop) ambientNodes.stop();
    ambientNodes = null;
  }

  // ---------- Helpers ----------
  const _kl = (t) => (window.HorridorsTouch && window.HorridorsTouch.keyLabel) ? window.HorridorsTouch.keyLabel(t) : t;
  function speak(line, duration = 3000) {
    state.speakerLine = _kl(line);
    state.speakerT = duration / 1000;
  }
  function rectIntersect(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  function dist(a, b) {
    const dx = (a.x + a.w/2) - (b.x + b.w/2);
    const dy = (a.y + a.h/2) - (b.y + b.h/2);
    return Math.sqrt(dx*dx + dy*dy);
  }

  // ---------- Player (Chester) ----------
  const player = { x: 140, y: 540, w: 22, h: 28, vx: 0, vy: 0, facing: 1, step: 0 };

  // ---------- Obstacles (cell walls, bars, corridor walls) ----------
  const obstacles = [];
  function addWall(x, y, w, h) { obstacles.push({ x, y, w, h }); }
  function buildWorld() {
    obstacles.length = 0;
    // Outer corridor walls
    addWall(0, 0, WORLD_W, CORRIDOR.y1);              // top (will carve cells)
    addWall(0, CORRIDOR.y2, WORLD_W, WORLD_H - CORRIDOR.y2); // bottom wall area
    addWall(0, 0, 60, WORLD_H);                        // left
    addWall(WORLD_W - 60, 0, 60, WORLD_H);             // right
    // Clear carve-outs: but addWall adds positive. Rewrite: draw top section around cells.
    // Replace the top wall with segments between cells
    obstacles.length = 0;
    addWall(0, CORRIDOR.y2, WORLD_W, WORLD_H - CORRIDOR.y2);
    addWall(0, 0, 60, WORLD_H);
    addWall(WORLD_W - 60, 0, 60, WORLD_H);
    // Top wall is broken into segments: between cells the wall continues
    // Each cell: bars are the bottom edge; solid walls on sides and top.
    // Start from left
    let cx = 60;
    for (const c of CELLS) {
      // Segment between previous cell's right and this cell's left at ceiling (y=0..y1)
      if (c.x1 > cx) addWall(cx, 0, c.x1 - cx, CORRIDOR.y1);
      // Cell walls: top, left, right solid; bottom is bars (see below)
      addWall(c.x1, 0, 10, c.y2 - 0);        // left wall
      addWall(c.x2 - 10, 0, 10, c.y2 - 0);    // right wall
      addWall(c.x1, 0, c.x2 - c.x1, 10);      // top wall (already covered by above)
      // BARS (bottom of cell). They're solid unless cell is Thistle's and freed.
      if (c.id !== 'thistle' || !state.thistleFreed) {
        addWall(c.x1 + 10, c.y2 - 10, (c.x2 - c.x1) - 20, 10);
      }
      cx = c.x2;
    }
    if (cx < WORLD_W - 60) addWall(cx, 0, (WORLD_W - 60) - cx, CORRIDOR.y1);
    // Switches are solid bumpers so the player can press against them
    for (const sw of SWITCHES) addWall(sw.x, sw.y, sw.w, sw.h);
  }

  // ---------- Puzzle logic ----------
  function rollPattern() {
    const len = state.patternLen[state.stage] || 4;
    state.pattern = [];
    for (let i = 0; i < len; i++) state.pattern.push(Math.floor(Math.random() * 3));
    state.playerSeq = [];
  }
  function startShowing() {
    // Announce first, then wait a beat so the player can look at Thistle
    speak('Thistle is about to signal... watch her cell!', 2400);
    sfx('thistle');
    state.showingPattern = true;
    state.showIdx = 0;
    state.showPhase = 'off';
    state.showT = 1.8;  // longer pause before the first flash (was 0.4)
  }
  function tickShowing(dt) {
    if (!state.showingPattern) return;
    state.showT -= dt;
    if (state.showT > 0) return;
    if (state.showPhase === 'off') {
      // play next
      if (state.showIdx >= state.pattern.length) {
        state.showingPattern = false;
        state.showPhase = 'done';
        return;
      }
      state.showPhase = 'on';
      state.showT = 0.9; // on duration (was 0.7)
      const id = state.pattern[state.showIdx];
      sfx(['showA','showB','showC'][id]);
    } else if (state.showPhase === 'on') {
      state.showIdx++;
      state.showPhase = 'off';
      state.showT = 0.55; // gap between flashes (was 0.28)
    }
  }
  function pressSwitch(id) {
    if (state.showingPattern) { speak("Wait — Thistle's still signalling.", 1400); return; }
    if (state.thistleFreed) return; // Puzzle is done once she's freed
    if (state.missCooldown > 0) return;
    state.lastSwitchFlashId = id;
    state.lastSwitchFlashT = 0.35;
    sfx(['switchA','switchB','switchC'][id]);
    state.playerSeq.push(id);
    const idx = state.playerSeq.length - 1;
    if (state.pattern[idx] !== id) {
      // Wrong — reset and replay
      sfx('bad');
      speak('Oops — that was wrong. Thistle will show again.', 2400);
      state.playerSeq = [];
      state.missCooldown = 1.1;
      setTimeout(() => { startShowing(); }, 1800);
      return;
    }
    if (state.playerSeq.length === state.pattern.length) {
      // Stage cleared
      sfx('good');
      state.stageClearedT = 1.6;
      state.stage++;
      if (state.stage >= state.patternLen.length) {
        // All stages cleared
        state.objectives.find(o => o.id === 'stages').done = true;
        sfx('win');
        speak('THE LOCK CLICKS OPEN!', 2600);
        setTimeout(() => { freeThistle(); }, 1600);
      } else {
        speak(`Stage ${state.stage} done! Watch again...`, 2800);
        setTimeout(() => { rollPattern(); startShowing(); }, 2600);
      }
    }
  }

  function freeThistle() {
    state.thistleFreed = true;
    sfx('clank');
    buildWorld(); // rebuild without Thistle's bars
    state.objectives.find(o => o.id === 'free').done = true;
    // Spawn follower Thistle
    state.thistleCompanion = {
      x: (THISTLE.x1 + THISTLE.x2) / 2 - 12,
      y: THISTLE.y2 - 40,
      w: 22, h: 28, vx: 0, vy: 0,
      trail: [],
      waveT: 0,
    };
    speak('Thistle: "I KNEW you\'d come! Let\'s RUN!"', 3600);
    registerTasks();
  }

  // ---------- Thistle (in cell) ----------
  // Before freeing: she lives in her cell and signals.
  // Visual position inside cell (bobbing slightly)
  function drawThistleInCell() {
    if (window.HorridorsSprites && window.HorridorsSprites.drawCharacter) {
      window.HorridorsSprites.drawCharacter(ctx, 'thistle', cell.cx, cell.cy + 30, 1, 56);
      return;
    }
}

  // Thistle sprite (child-drawing style): yellow body, sheriff hat, lightning ear,
  // big eyes, smile, chest star.  cx/cy = feet-center.
  function drawThistleSprite(cx, cy, scale = 1) {
    if (window.HorridorsSprites && window.HorridorsSprites.drawCharacter) {
      window.HorridorsSprites.drawCharacter(ctx, 'thistle', cx, cy + 40*scale, 1, 56*scale);
      return;
    }
}
  function drawStar(cx, cy, R, fill, stroke, lw) {
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.beginPath();
    const r = R * 0.45;
    for (let i = 0; i < 10; i++) {
      const ang = -Math.PI/2 + i * Math.PI / 5;
      const rad = (i % 2 === 0) ? R : r;
      const px = cx + Math.cos(ang) * rad;
      const py = cy + Math.sin(ang) * rad;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  // ---------- Chester sprite (same raincoat style as L3/L4) ----------
  function drawChester(cx, cy, scale = 1, facing = 1) {
    if (window.HorridorsSprites && window.HorridorsSprites.drawCharacter) {
      window.HorridorsSprites.drawCharacter(ctx, 'chester', cx, cy + 30*scale, facing, 56*scale);
      return;
    }
}

  // ---------- Switches ----------
  function drawSwitches() {
    for (const sw of SWITCHES) {
      // Base plate
      ctx.fillStyle = '#2a2028';
      ctx.fillRect(sw.x - 6, sw.y - 6, sw.w + 12, sw.h + 12);
      ctx.strokeStyle = '#0e0812';
      ctx.strokeRect(sw.x - 6 + 0.5, sw.y - 6 + 0.5, sw.w + 12 - 1, sw.h + 12 - 1);
      // Body
      const flashing = (state.lastSwitchFlashId === sw.id) && state.lastSwitchFlashT > 0;
      const alpha = flashing ? 1 : 0.7;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = sw.color;
      ctx.fillRect(sw.x, sw.y, sw.w, sw.h);
      ctx.strokeStyle = '#141414'; ctx.lineWidth = 2;
      ctx.strokeRect(sw.x + 0.5, sw.y + 0.5, sw.w - 1, sw.h - 1);
      ctx.restore();
      // Glow when flashing
      if (flashing) {
        ctx.save();
        const cx = sw.x + sw.w/2, cy = sw.y + sw.h/2;
        const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 60);
        g.addColorStop(0, sw.color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = g;
        ctx.fillRect(cx - 60, cy - 60, 120, 120);
        ctx.restore();
      }
      // Letter
      ctx.fillStyle = '#141414';
      ctx.font = '800 22px system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(sw.label, sw.x + sw.w/2, sw.y + sw.h/2);
      // Hint: show prompt when player is near
      const dx = (player.x + player.w/2) - (sw.x + sw.w/2);
      const dy = (player.y + player.h/2) - (sw.y + sw.h/2);
      if (Math.hypot(dx, dy) < 60) {
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.font = '600 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('E', sw.x + sw.w/2, sw.y - 10);
      }
    }
  }

  // ---------- Cells ----------
  function drawCells() {
    for (const c of CELLS) {
      // Floor inside cell — dim
      ctx.fillStyle = '#1a1222';
      ctx.fillRect(c.x1, 0, c.x2 - c.x1, c.y2);
      // Stone wall texture
      ctx.fillStyle = '#261a32';
      ctx.fillRect(c.x1 + 4, 10, c.x2 - c.x1 - 8, 6);
      // Label
      ctx.fillStyle = c.id === 'thistle' ? '#ffd84a' : 'rgba(255,255,255,0.35)';
      ctx.font = c.id === 'thistle' ? '800 11px system-ui' : '600 10px system-ui';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(c.label, (c.x1 + c.x2)/2, 22);
      // Bars (bottom edge) — unless Thistle's cell is freed
      const showBars = !(c.id === 'thistle' && state.thistleFreed);
      if (showBars) {
        const bx1 = c.x1 + 10, bx2 = c.x2 - 10;
        const by = c.y2 - 10;
        // Horizontal rail
        ctx.fillStyle = '#6b5a7a';
        ctx.fillRect(bx1, by, bx2 - bx1, 4);
        ctx.fillRect(bx1, c.y2 - 70, bx2 - bx1, 3);
        // Vertical bars
        ctx.fillStyle = '#8a7a98';
        for (let bx = bx1 + 8; bx < bx2; bx += 14) {
          ctx.fillRect(bx, c.y2 - 70, 3, 70);
        }
        // Lock plaque when Thistle's cell
        if (c.id === 'thistle') {
          const locked = !state.thistleFreed;
          ctx.fillStyle = locked ? '#5a2030' : '#2a5a30';
          ctx.fillRect((c.x1 + c.x2)/2 - 16, by - 18, 32, 14);
          ctx.strokeStyle = '#141414'; ctx.lineWidth = 1.5;
          ctx.strokeRect((c.x1 + c.x2)/2 - 16 + 0.5, by - 18 + 0.5, 32 - 1, 14 - 1);
          ctx.fillStyle = '#fff';
          ctx.font = '700 10px system-ui';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(locked ? 'LOCKED' : 'OPEN', (c.x1 + c.x2)/2, by - 11);
        }
      }
      // Stage progress indicator above Thistle's cell
      if (c.id === 'thistle' && !state.thistleFreed) {
        const y0 = 6;
        for (let i = 0; i < state.patternLen.length; i++) {
          const filled = i < state.stage;
          ctx.fillStyle = filled ? '#6bd87a' : '#3a2a4a';
          ctx.fillRect((c.x1 + c.x2)/2 - 20 + i*11, y0, 8, 6);
        }
      }
    }
  }

  // ---------- Player movement ----------
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
  }

  // ---------- Update ----------
  function update(dt) {
    if (state.scene !== 'play') return;

    // Timers
    if (state.speakerT > 0) state.speakerT -= dt;
    if (state.stageClearedT > 0) state.stageClearedT -= dt;
    if (state.lastSwitchFlashT > 0) state.lastSwitchFlashT -= dt;
    if (state.missCooldown > 0) state.missCooldown -= dt;

    tickShowing(dt);

    // Input
    let dx = 0, dy = 0;
    if (keys.has('arrowleft')  || keys.has('a')) { dx -= 1; player.facing = -1; }
    if (keys.has('arrowright') || keys.has('d')) { dx += 1; player.facing = 1; }
    if (keys.has('arrowup')    || keys.has('w')) dy -= 1;
    if (keys.has('arrowdown')  || keys.has('s')) dy += 1;
    if (dx && dy) { dx *= 0.707; dy *= 0.707; }
    const SPEED = 180;
    moveWithCollision(player, dx * SPEED * dt, dy * SPEED * dt);
    if (dx !== 0 || dy !== 0) player.step += dt * 8;

    // Interact with switch on E
    if (wasPressed('e')) {
      for (const sw of SWITCHES) {
        const d = Math.hypot((player.x + player.w/2) - (sw.x + sw.w/2), (player.y + player.h/2) - (sw.y + sw.h/2));
        if (d < 60) { pressSwitch(sw.id); break; }
      }
    }

    // Follower Thistle — follow Chester
    if (state.thistleCompanion) {
      const t = state.thistleCompanion;
      // Record Chester's position in trail
      t.trail.push({ x: player.x, y: player.y });
      if (t.trail.length > 18) t.trail.shift();
      // Thistle aims for a delayed trail position
      const target = t.trail[0] || { x: player.x - 30, y: player.y };
      const tx = target.x + 4, ty = target.y;
      const ddx = tx - t.x, ddy = ty - t.y;
      const dd = Math.hypot(ddx, ddy);
      if (dd > 4) {
        const vx = (ddx / dd) * 180 * dt;
        const vy = (ddy / dd) * 180 * dt;
        t.x += Math.max(-8, Math.min(8, vx));
        t.y += Math.max(-8, Math.min(8, vy));
      }
      t.waveT = (t.waveT || 0) + dt;
    }

    // Coin pickups
    if (window.HorridorsWallet) {
      const pcx = player.x + player.w/2, pcy = player.y + player.h/2;
      for (const c of coins) {
        if (c.got) continue;
        if (Math.hypot(pcx - c.x, pcy - c.y) < 22) {
          c.got = true;
          window.HorridorsWallet.addCoins(c.v);
          sfx && sfx('pickup');
        }
      }
    }

    // Reach exit with Thistle
    if (state.thistleFreed && !state.ending) {
      const pb = { x: player.x, y: player.y, w: player.w, h: player.h };
      if (rectIntersect(pb, EXIT)) {
        state.ending = true;
        state.objectives.find(o => o.id === 'exit').done = true;
        sfx('win');
        setTimeout(() => {
          state.scene = 'end';
          showEndOverlay();
        }, 500);
      }
    }

    // Camera follows player — but while Thistle is signalling, ease toward her cell
    let targetCamX = player.x + player.w/2 - VIEW_W/2;
    let targetCamY = player.y + player.h/2 - VIEW_H/2;
    if (state.showingPattern && !state.thistleFreed) {
      const tcx = (THISTLE.x1 + THISTLE.x2) / 2;
      const tcy = (THISTLE.y1 + THISTLE.y2) / 2;
      // Frame both Chester and Thistle — use midpoint weighted toward Thistle
      targetCamX = (tcx * 0.75 + (player.x + player.w/2) * 0.25) - VIEW_W/2;
      targetCamY = (tcy * 0.6 + (player.y + player.h/2) * 0.4) - VIEW_H/2;
    }
    targetCamX = Math.max(0, Math.min(WORLD_W - VIEW_W, targetCamX));
    targetCamY = Math.max(0, Math.min(WORLD_H - VIEW_H, targetCamY));
    // Ease toward target so transitions are smooth
    cam.x += (targetCamX - cam.x) * Math.min(1, dt * 4);
    cam.y += (targetCamY - cam.y) * Math.min(1, dt * 4);

    // Update task-tracker
    if (window.HorridorsTasks) window.HorridorsTasks.refresh('l5', l5DoneIds);

    justPressed.clear();
  }

  function l5DoneIds() {
    const done = new Set();
    if (state.stage >= state.patternLen.length) done.add('stages');
    if (state.thistleFreed) done.add('free');
    if (state.scene === 'end') done.add('exit');
    return done;
  }

  function registerTasks() {
    if (!window.HorridorsTasks) return;
    window.HorridorsTasks.setLevel('l5', 'Level 5 — Tasks', [
      { id: 'stages', label: 'Finish all 4 pattern stages' },
      { id: 'free',   label: 'Free Thistle from the cell' },
      { id: 'exit',   label: 'Lead Thistle to the exit' },
    ], l5DoneIds);
  }

  // ---------- Render ----------
  function drawFloor() {
    // Corridor floor
    const grad = ctx.createLinearGradient(0, CORRIDOR.y1, 0, CORRIDOR.y2);
    grad.addColorStop(0, '#2a1a36');
    grad.addColorStop(1, '#1a1024');
    ctx.fillStyle = grad;
    ctx.fillRect(0, CORRIDOR.y1, WORLD_W, CORRIDOR.y2 - CORRIDOR.y1);
    // Cobblestone hint
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let x = 0; x < WORLD_W; x += 60) {
      ctx.beginPath(); ctx.moveTo(x, CORRIDOR.y1); ctx.lineTo(x, CORRIDOR.y2); ctx.stroke();
    }
    for (let y = CORRIDOR.y1; y < CORRIDOR.y2; y += 60) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD_W, y); ctx.stroke();
    }
  }
  function drawWalls() {
    // Lower wall (below corridor)
    ctx.fillStyle = '#15101c';
    ctx.fillRect(0, CORRIDOR.y2, WORLD_W, WORLD_H - CORRIDOR.y2);
    // Left/right walls
    ctx.fillStyle = '#15101c';
    ctx.fillRect(0, 0, 60, WORLD_H);
    ctx.fillRect(WORLD_W - 60, 0, 60, WORLD_H);
    // Top wall segments between cells (already drawn by drawCells dim fills, but add an overall cap)
    // Draw cell top band
    let cx = 60;
    for (const c of CELLS) {
      if (c.x1 > cx) {
        ctx.fillStyle = '#15101c';
        ctx.fillRect(cx, 0, c.x1 - cx, CORRIDOR.y1);
      }
      cx = c.x2;
    }
    if (cx < WORLD_W - 60) {
      ctx.fillStyle = '#15101c';
      ctx.fillRect(cx, 0, (WORLD_W - 60) - cx, CORRIDOR.y1);
    }
  }
  function drawExit() {
    // Exit door — glowing green archway at right end
    ctx.save();
    const ready = state.thistleFreed;
    ctx.fillStyle = ready ? '#2c5a34' : '#2a2a34';
    ctx.fillRect(EXIT.x, EXIT.y, EXIT.w, EXIT.h);
    ctx.strokeStyle = '#141414'; ctx.lineWidth = 2;
    ctx.strokeRect(EXIT.x + 0.5, EXIT.y + 0.5, EXIT.w - 1, EXIT.h - 1);
    // Arch top
    ctx.fillStyle = ready ? '#3d7a48' : '#35353f';
    ctx.fillRect(EXIT.x - 4, EXIT.y - 8, EXIT.w + 8, 8);
    // Glow
    if (ready) {
      const cx = EXIT.x + EXIT.w/2, cy = EXIT.y + EXIT.h/2;
      const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, 140);
      g.addColorStop(0, 'rgba(100, 240, 140, 0.35)');
      g.addColorStop(1, 'rgba(100, 240, 140, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - 140, cy - 140, 280, 280);
    }
    // Label
    ctx.fillStyle = ready ? '#c8ffc8' : 'rgba(255,255,255,0.35)';
    ctx.font = '700 11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(ready ? 'EXIT →' : 'LOCKED', EXIT.x + EXIT.w/2, EXIT.y - 14);
    ctx.restore();
  }
  function drawCompanion() {
    const t = state.thistleCompanion;
    if (!t) return;
    drawThistleSprite(t.x + t.w/2, t.y + t.h, 0.9);
    // Little bobble happy face bubble every so often
    if (t.waveT && (t.waveT % 6) < 1.4) {
      ctx.fillStyle = 'rgba(255, 236, 130, 0.9)';
      ctx.beginPath(); ctx.arc(t.x + t.w/2 + 14, t.y, 10, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#141414'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.fillStyle = '#141414';
      ctx.font = '800 10px system-ui';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('♥', t.x + t.w/2 + 14, t.y);
    }
  }

  // Chester pickup-collectible: hidden gem L5
  function drawL5Gem() {
    // Only if not collected
    if (window.HorridorsStory && window.HorridorsStory.hasGem('l5_badge')) return;
    if (!window._l5Gem) {
      window._l5Gem = { x: 2060, y: 540, w: 18, h: 18, collected: false };
    }
    const it = window._l5Gem;
    if (it.collected) return;
    // Check pickup
    if (rectIntersect(player, it)) {
      it.collected = true;
      sfx('thistle');
      if (window.HorridorsStory) window.HorridorsStory.unlockGem('l5_badge');
    }
    if (it.collected) return;
    const t = performance.now() / 1000;
    const cx = it.x + it.w/2;
    const cy = it.y + it.h/2 + Math.sin(t * 2) * 2;
    const pulse = 0.7 + 0.3 * Math.sin(t * 3);
    ctx.save();
    ctx.fillStyle = '#6bd87a'; ctx.globalAlpha = 0.35 * pulse;
    ctx.beginPath(); ctx.arc(cx, cy, 20, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#6bd87a';
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
    ctx.restore();
  }

  function drawHUD() {
    ctx.save();
    ctx.resetTransform && ctx.resetTransform();
    // Title strip
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, VIEW_W, 30);
    ctx.fillStyle = '#ffd84a';
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('LEVEL 5 — THE NAUGHTY ROOM', 10, 15);
    // Stage counter
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'right';
    ctx.fillText(`Stage ${Math.min(state.stage + 1, state.patternLen.length)} / ${state.patternLen.length}`, VIEW_W - 10, 15);
    // Speaker line
    if (state.speakerLine && state.speakerT > 0) {
      const line = state.speakerLine;
      const w = Math.min(VIEW_W - 60, 700);
      const x = (VIEW_W - w) / 2;
      const y = VIEW_H - 70;
      ctx.fillStyle = 'rgba(0,0,0,0.78)';
      ctx.fillRect(x, y, w, 48);
      ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 2;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 48 - 1);
      ctx.fillStyle = '#fff';
      ctx.font = '600 14px system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(line, VIEW_W/2, y + 24);
    }
    // Signal watcher hint
    if (state.showingPattern) {
      ctx.fillStyle = 'rgba(255, 216, 74, 0.92)';
      ctx.font = '700 12px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('👀 Thistle is signalling — watch the glowing colour/letter!', VIEW_W/2, 54);
    } else if (!state.thistleFreed && !cutscene.active) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '600 12px system-ui';
      ctx.textAlign = 'center';
      const remaining = state.pattern.length - state.playerSeq.length;
      if (state.pattern.length === 0) {
        ctx.fillText(_kl('Walk near Thistle\'s cell to begin — press E on switches A / B / C.'), VIEW_W/2, 54);
      } else {
        ctx.fillText(_kl(`Your turn: copy the pattern. Press E on the switches (${state.playerSeq.length}/${state.pattern.length})`), VIEW_W/2, 54);
      }
    }
    ctx.restore();
  }

  function render() {
    ctx.fillStyle = '#0a0612';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    drawFloor();
    drawWalls();
    drawCells();
    drawThistleInCell();
    drawExit();
    drawSwitches();
    // Coins
    if (window.HorridorsSprites) {
      const t = performance.now();
      for (const c of coins) if (!c.got) window.HorridorsSprites.drawCoin(ctx, c.x, c.y, t, 7);
    }
    drawL5Gem();
    drawCompanion();
    drawChester(player.x + player.w/2, player.y + player.h, 1, player.facing);
    ctx.restore();
    drawHUD();
  }

  // ---------- Game loop ----------
  let running = false;
  let lastT = 0;
  function loop(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  // ---------- End overlay ----------
  function showEndOverlay() {
    const ov = document.getElementById('overlay-l5-end');
    if (ov) ov.classList.remove('hidden');
  }

  // ---------- Cutscene ----------
  function showCutscene() {
    cutscene.active = true;
    cutscene.page = 0;
    const ov = document.getElementById('overlay-l5-intro');
    if (ov) {
      ov.classList.remove('hidden');
      renderCutscenePage();
    }
  }
  function renderCutscenePage() {
    const p = cutscene.pages[cutscene.page];
    const titleEl = document.getElementById('l5-intro-title');
    const textEl  = document.getElementById('l5-intro-text');
    const nextBtn = document.getElementById('btn-l5-intro-next');
    if (titleEl) titleEl.textContent = p.title;
    if (textEl)  textEl.textContent = p.text;
    if (nextBtn) nextBtn.textContent = (cutscene.page === cutscene.pages.length - 1) ? 'Begin' : 'Next →';
  }
  function advanceCutscene() {
    if (cutscene.page < cutscene.pages.length - 1) {
      cutscene.page++;
      renderCutscenePage();
    } else {
      cutscene.active = false;
      document.getElementById('overlay-l5-intro').classList.add('hidden');
      actuallyBegin();
    }
  }

  // ---------- Start / Stop ----------
  function resetL5State() {
    state.scene = 'play';
    state.stage = 0;
    state.pattern = [];
    state.playerSeq = [];
    state.showingPattern = false;
    state.thistleFreed = false;
    state.thistleCompanion = null;
    state.ending = false;
    state.missCooldown = 0;
    state.speakerLine = null; state.speakerT = 0;
    for (const o of state.objectives) o.done = false;
    player.x = 140; player.y = 540; player.vx = 0; player.vy = 0;
    window._l5Gem = null;
    buildWorld();
  }

  function start() {
    // Hide other levels' overlays
    const toHide = [
      'overlay-title','overlay-end','overlay-caught','overlay-notes',
      'overlay-l2-title','overlay-l2-end',
      'overlay-l3-title','overlay-l3-end',
      'overlay-l4-title','overlay-l4-end',
      'overlay-l5-end',
    ];
    for (const id of toHide) document.getElementById(id)?.classList.add('hidden');
    const hud = document.getElementById('hud'); if (hud) hud.classList.add('hidden');
    showCutscene();
  }

  function actuallyBegin() {
    ensureAudio();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    startAmbient();
    resetL5State();
    if (!running) {
      running = true;
      window.addEventListener('keydown', keydown);
      window.addEventListener('keyup', keyup);
      window.addEventListener('blur', blur);
      lastT = performance.now();
      requestAnimationFrame(loop);
    }
    registerTasks();
    speak("Thistle's cell is marked. Walk closer — she'll start signalling.", 4800);
    // First pattern auto-rolls after a breathing pause so the player can orient.
    setTimeout(() => {
      if (state.pattern.length === 0) {
        speak('Look over at Thistle — she\'s getting ready...', 2600);
      }
    }, 4200);
    setTimeout(() => {
      if (state.pattern.length === 0) {
        rollPattern();
        startShowing();
      }
    }, 7200);
  }

  // Wire up cutscene buttons
  document.getElementById('btn-l5-intro-next')?.addEventListener('click', advanceCutscene);
  document.getElementById('btn-l5-intro-skip')?.addEventListener('click', () => {
    cutscene.active = false;
    document.getElementById('overlay-l5-intro').classList.add('hidden');
    actuallyBegin();
  });
  document.getElementById('btn-l5-replay')?.addEventListener('click', () => {
    document.getElementById('overlay-l5-end').classList.add('hidden');
    resetL5State();
    speak('Again! Thistle will signal the colours once more.', 2400);
    setTimeout(() => { rollPattern(); startShowing(); }, 2800);
  });
  document.getElementById('btn-l5-home')?.addEventListener('click', () => {
    running = false;
    stopAmbient();
    window.removeEventListener('keydown', keydown);
    window.removeEventListener('keyup', keyup);
    window.removeEventListener('blur', blur);
    window.location.reload();
  });
  document.getElementById('btn-l5-next')?.addEventListener('click', () => {
    document.getElementById('overlay-l5-end').classList.add('hidden');
    running = false;
    stopAmbient();
    window.removeEventListener('keydown', keydown);
    window.removeEventListener('keyup', keyup);
    window.removeEventListener('blur', blur);
    if (window.__startLevel6) window.__startLevel6();
  });

  function resumeLevel5() {
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
    ['overlay-l5-intro','overlay-l5-end','overlay-caught']
      .forEach(id => { const el = document.getElementById(id); if (el) el.classList.add('hidden'); });
  }

  // Export
  window.__startLevel5 = start;
  window.__horridorsL5 = {
    audioCtx: () => audioCtx,
    masterGain: () => masterGain,
    resume: resumeLevel5,
    isRunning: () => running,
    stop: () => {
      running = false; stopAmbient();
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', blur);
    },
  };
  console.log('[Level 5] Loaded. Call window.__startLevel5() to begin.');
})();
