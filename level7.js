// =====================================================================
// HORRIDORS - LEVEL 7: BLACKY PANTS
// A new monster. Chester attacks with the Grabpack, firing elements in
// a specific order: 🔥 FIRE → ⚡ THUNDER → 🌱 EARTH → 💧 WATER. Each element
// charges up when the matching wall pylon is stood on; once charged,
// press the corresponding hotkey to shoot. Any wrong element = he resets.
// After all four, Blacky Pants becomes a soft mossy boulder, snoozing.
// Boots via window.__startLevel7().
// =====================================================================
(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const VIEW_W = canvas.width;
  const VIEW_H = canvas.height;

  const WORLD_W = 1400, WORLD_H = 820;
  const ARENA = { x1: 80, x2: WORLD_W - 80, y1: 120, y2: WORLD_H - 80 };

  const cam = { x: 0, y: 0 };

  // Element order the player must follow
  const ELEMENTS = [
    { id: 'fire',    color: '#ff7a45', key: '1', label: '🔥 FIRE',    hint: 'The red pylon — stand on it, then press 1.' },
    { id: 'thunder', color: '#ffe14a', key: '2', label: '⚡ THUNDER', hint: 'The yellow pylon — stand on it, then press 2.' },
    { id: 'earth',   color: '#8dc16b', key: '3', label: '🌱 EARTH',   hint: 'The green pylon — stand on it, then press 3.' },
    { id: 'water',   color: '#6fbfff', key: '4', label: '💧 WATER',  hint: 'The blue pylon — stand on it, then press 4.' },
  ];

  // Pylons around the arena
  const PYLONS = [
    { id: 'fire',    x: 180,            y: 260, w: 64, h: 64, color: '#ff7a45' },
    { id: 'thunder', x: WORLD_W - 244,  y: 260, w: 64, h: 64, color: '#ffe14a' },
    { id: 'earth',   x: 180,            y: 620, w: 64, h: 64, color: '#8dc16b' },
    { id: 'water',   x: WORLD_W - 244,  y: 620, w: 64, h: 64, color: '#6fbfff' },
  ];

  const state = {
    scene: 'title',
    speakerLine: null, speakerT: 0,
    muted: false,
    // Boss
    boss: { x: WORLD_W/2 - 70, y: ARENA.y1 + 180, w: 140, h: 160, bob: 0, stage: 0, shake: 0, state: 'ready', mossLevel: 0, vx: 1, patrolMin: 260, patrolMax: WORLD_W - 400 },
    // Charge — which element pylon is currently active under player
    charge: null,    // 'fire'|'thunder'|'earth'|'water'|null
    chargeAmt: 0,
    hp: 3, hitCd: 0,
    ending: false,
    screenFlash: 0,
    lastShotT: 0,
    objectives: [
      { id: 'fire',    text: 'Blast Blacky Pants with FIRE',    done: false },
      { id: 'thunder', text: 'Hit him with THUNDER',            done: false },
      { id: 'earth',   text: 'Smother him with EARTH (moss)',   done: false },
      { id: 'water',   text: 'Finish with WATER',               done: false },
    ],
  };

  const projectiles = []; // {x,y,vx,vy,life,element,r,trail:[]}
  const bossZaps = [];    // {x,y,vx,vy,life,r} — punches from Blacky

  // Cutscene
  const cutscene = {
    active: false, page: 0,
    pages: [
      { title: 'Blacky Pants',
        text: 'He lurches out of the boiler room — all triangular head, tiny fangs, scribbled-black trousers. He has been watching us the whole time.' },
      { title: 'Chester\'s plan',
        text: 'Grabpack upgraded. It can pull from four elemental pylons in the arena. Use the right element, in the right order, and he\'ll go down.' },
      { title: 'The order',
        text: 'FIRE first — soften his scribbles.\nTHUNDER — stun his big grin.\nEARTH — make him mossy.\nWATER — he\'ll be full-moss and harmless.' },
      { title: 'Controls',
        text: 'Stand ON a matching pylon to charge. When the pylon\'s bar fills, press its number key (1-4) to fire. Go in order. Three hits and you\'re out.' },
    ],
  };

  // ---------- Input ----------
  const keys = new Set(); const justPressed = new Set();
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
    const prev = window.__horridorsL6 || window.__horridorsL5 || window.__horridorsL4 || window.__horridorsL3 || window.__horridorsL2 || window.__horridorsL1;
    if (prev && prev.audioCtx && prev.audioCtx()) { audioCtx = prev.audioCtx(); masterGain = prev.masterGain(); return; }
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = state.muted ? 0 : 0.5;
      masterGain.connect(audioCtx.destination);
    } catch {}
  }
  function tone(f, d, t = 'sine', v = 0.2) {
    if (!audioCtx) return;
    const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
    o.type = t; o.frequency.value = f;
    g.gain.setValueAtTime(v, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + d);
    o.connect(g).connect(masterGain);
    o.start(); o.stop(audioCtx.currentTime + d);
  }
  function sfx(n) {
    if (!audioCtx || state.muted) return;
    switch (n) {
      case 'fire':    [880, 660, 440].forEach((f,i) => setTimeout(() => tone(f, 0.18, 'sawtooth', 0.2), i*40)); break;
      case 'thunder': tone(1800, 0.12, 'square', 0.22); setTimeout(() => tone(220, 0.3, 'sawtooth', 0.22), 80); break;
      case 'earth':   tone(150, 0.35, 'triangle', 0.2); setTimeout(() => tone(110, 0.25, 'triangle', 0.18), 120); break;
      case 'water':   tone(520, 0.25, 'sine', 0.22); setTimeout(() => tone(420, 0.3, 'sine', 0.2), 160); break;
      case 'wrong':   tone(140, 0.35, 'sawtooth', 0.24); break;
      case 'hit':     tone(320, 0.25, 'square', 0.24); break;
      case 'charge':  tone(700, 0.06, 'triangle', 0.12); break;
      case 'full':    [600,900,1200].forEach((f,i) => setTimeout(() => tone(f,0.12,'triangle',0.2), i*80)); break;
      case 'bossHit': tone(100, 0.4, 'sawtooth', 0.26); break;
      case 'win':     [523,659,784,1047,1320].forEach((f,i)=>setTimeout(()=>tone(f,0.2,'triangle',0.25), i*110)); break;
      case 'boom':    tone(80, 0.4, 'sawtooth', 0.3); break;
    }
  }
  let ambientNodes = null;
  function startAmbient() { if (audioCtx && window.HorridorsAmbient) ambientNodes = window.HorridorsAmbient.start(audioCtx, masterGain, { mood: 'abyss' }); if (audioCtx && window.HorridorsMusic) window.HorridorsMusic.setTheme(audioCtx, masterGain, 'l7'); }
  function stopAmbient() { if (ambientNodes && ambientNodes.stop) ambientNodes.stop(); ambientNodes = null; }

  function speak(line, d = 3000) { state.speakerLine = line; state.speakerT = d / 1000; }

  // ---------- Player + allies ----------
  const player = { x: WORLD_W/2 - 11, y: ARENA.y2 - 80, w: 22, h: 28, facing: 1 };
  const thistle = { x: WORLD_W/2 - 40, y: ARENA.y2 - 80, w: 20, h: 26, trail: [] };
  // Obstacles
  const obstacles = [];
  function addWall(x,y,w,h){ obstacles.push({x,y,w,h}); }
  function buildWorld() {
    obstacles.length = 0;
    addWall(0, 0, WORLD_W, ARENA.y1);
    addWall(0, ARENA.y2, WORLD_W, WORLD_H - ARENA.y2);
    addWall(0, 0, ARENA.x1, WORLD_H);
    addWall(ARENA.x2, 0, WORLD_W - ARENA.x2, WORLD_H);
  }
  function rectIntersect(a,b){ return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
  function moveWithCollision(ent, dx, dy) {
    ent.x += dx;
    for (const o of obstacles) if (rectIntersect(ent, o)) { if (dx > 0) ent.x = o.x - ent.w; else if (dx < 0) ent.x = o.x + o.w; }
    ent.y += dy;
    for (const o of obstacles) if (rectIntersect(ent, o)) { if (dy > 0) ent.y = o.y - ent.h; else if (dy < 0) ent.y = o.y + o.h; }
  }

  // ---------- Sprite cache ----------
  const cache = {};
  function spriteCache(key, w, h, drawFn) {
    if (cache[key]) return cache[key];
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    drawFn(c.getContext('2d'));
    cache[key] = c; return c;
  }

  function buildBlackyPantsSprite(mossLevel) {
    // mossLevel 0..4: 0=clean, 4=full moss. Based on drawing (triangular head, big eyes, fangs, black pants)
    return spriteCache('blacky_' + mossLevel, 170, 200, (g) => {
      g.lineJoin = 'round'; g.lineCap = 'round';
      // Shadow
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.beginPath(); g.ellipse(85, 194, 48, 5, 0, 0, Math.PI*2); g.fill();
      // Legs / pants — messy scribble (two scribbled blobs)
      g.strokeStyle = '#0a0612'; g.lineWidth = 3; g.fillStyle = '#15101c';
      g.beginPath();
      g.moveTo(48, 120); g.lineTo(42, 184); g.lineTo(70, 184); g.lineTo(76, 120); g.closePath(); g.fill(); g.stroke();
      g.beginPath();
      g.moveTo(92, 120); g.lineTo(96, 184); g.lineTo(126, 184); g.lineTo(120, 120); g.closePath(); g.fill(); g.stroke();
      // Pant scribbles
      g.strokeStyle = '#28202e'; g.lineWidth = 2;
      for (let i = 0; i < 10; i++) {
        const lx = 48 + (i % 2) * 44 + Math.random() * 4;
        g.beginPath(); g.moveTo(lx, 125 + i * 5); g.lineTo(lx + 28, 130 + i * 5); g.stroke();
      }
      // Body — a wide trapezoid
      g.fillStyle = mossLevel >= 2 ? '#4a5f3b' : '#3a3048';
      g.beginPath();
      g.moveTo(36, 70); g.lineTo(132, 70); g.lineTo(138, 122); g.lineTo(30, 122); g.closePath();
      g.fill(); g.strokeStyle = '#0a0612'; g.lineWidth = 3; g.stroke();
      // Arms (thin stick arms)
      g.strokeStyle = '#0a0612'; g.lineWidth = 4;
      g.beginPath(); g.moveTo(36, 80); g.lineTo(8, 96); g.lineTo(14, 116); g.stroke();
      g.beginPath(); g.moveTo(132, 80); g.lineTo(158, 96); g.lineTo(152, 116); g.stroke();
      // Head — triangular / pointy top (matches drawing)
      g.fillStyle = mossLevel >= 2 ? '#4a5f3b' : '#2a1830';
      g.strokeStyle = '#0a0612'; g.lineWidth = 3;
      g.beginPath();
      g.moveTo(84, 6);    // pointy top
      g.lineTo(32, 66);    // left bottom
      g.lineTo(138, 66);   // right bottom
      g.closePath(); g.fill(); g.stroke();
      // Eyes — two big round white eyes
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(64, 46, 12, 0, Math.PI*2); g.fill();
      g.beginPath(); g.arc(102, 46, 12, 0, Math.PI*2); g.fill();
      g.strokeStyle = '#0a0612'; g.lineWidth = 2;
      g.beginPath(); g.arc(64, 46, 12, 0, Math.PI*2); g.stroke();
      g.beginPath(); g.arc(102, 46, 12, 0, Math.PI*2); g.stroke();
      g.fillStyle = '#0a0612';
      g.beginPath(); g.arc(64, 48, 4.5, 0, Math.PI*2); g.fill();
      g.beginPath(); g.arc(102, 48, 4.5, 0, Math.PI*2); g.fill();
      // Mouth — wide grin with two pointy fangs (drawing has tiny fangs)
      g.strokeStyle = '#0a0612'; g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(54, 60); g.quadraticCurveTo(84, 72, 114, 60);
      g.stroke();
      g.fillStyle = '#fff';
      g.beginPath(); g.moveTo(70, 61); g.lineTo(74, 70); g.lineTo(78, 61); g.closePath(); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(90, 61); g.lineTo(94, 70); g.lineTo(98, 61); g.closePath(); g.fill(); g.stroke();
      // Moss overlay by level
      if (mossLevel >= 1) {
        g.fillStyle = '#7db050';
        for (let i = 0; i < 14 * mossLevel; i++) {
          const px = 30 + Math.random() * 110, py = 20 + Math.random() * 140;
          g.beginPath(); g.arc(px, py, 2 + Math.random() * 3, 0, Math.PI*2); g.fill();
        }
      }
      if (mossLevel >= 3) {
        // Heavy moss clumps
        g.fillStyle = '#5a8a3a';
        for (let i = 0; i < 20; i++) {
          const px = 30 + Math.random() * 110, py = 20 + Math.random() * 140;
          g.beginPath(); g.arc(px, py, 4 + Math.random() * 5, 0, Math.PI*2); g.fill();
        }
        // Droopy eyes
        g.fillStyle = '#0a0612';
        g.fillRect(56, 48, 16, 3);
        g.fillRect(94, 48, 16, 3);
      }
      if (mossLevel >= 4) {
        // Fully mossy, sleeping — draw closed eyes
        g.fillStyle = '#6a9a4a';
        g.fillRect(20, 10, 130, 140);
        g.strokeStyle = '#1a2a0c'; g.lineWidth = 2;
        g.strokeRect(21, 11, 128, 138);
        // Sleepy Z
        g.fillStyle = '#fff';
        g.font = '900 26px system-ui';
        g.textAlign = 'center';
        g.fillText('zZ', 84, 60);
        // Closed eye lines
        g.strokeStyle = '#0a0612'; g.lineWidth = 2;
        g.beginPath(); g.arc(64, 46, 10, 0.15*Math.PI, 0.85*Math.PI); g.stroke();
        g.beginPath(); g.arc(102, 46, 10, 0.15*Math.PI, 0.85*Math.PI); g.stroke();
      }
    });
  }

  function buildPlayerSprite(facing) {
    return spriteCache('l7_player_' + facing, 32, 48, (g) => {
      // Same as L6 player sprite
      const cx = 16, cy = 46; const f = facing;
      g.lineJoin = 'round'; g.lineCap = 'round';
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.beginPath(); g.ellipse(cx, cy + 2, 12, 3, 0, 0, Math.PI*2); g.fill();
      g.strokeStyle = '#141414'; g.lineWidth = 2;
      g.fillStyle = '#3b2a6e';
      g.fillRect(cx - 7, cy - 6, 5, 8); g.fillRect(cx + 2, cy - 6, 5, 8);
      g.fillStyle = '#f6d854';
      g.beginPath(); g.moveTo(cx-10, cy-6); g.lineTo(cx-11, cy-22); g.lineTo(cx+11, cy-22); g.lineTo(cx+10, cy-6); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#f6d854'; g.beginPath(); g.arc(cx, cy-26, 9, 0, Math.PI*2); g.fill(); g.stroke();
      g.fillStyle = '#f5d2aa'; g.beginPath(); g.arc(cx, cy-26, 6, 0, Math.PI*2); g.fill();
      g.fillStyle = '#141414';
      g.beginPath(); g.arc(cx - 2 + f*0.5, cy-26, 0.9, 0, Math.PI*2); g.fill();
      g.beginPath(); g.arc(cx + 2 + f*0.5, cy-26, 0.9, 0, Math.PI*2); g.fill();
      g.strokeStyle = '#141414'; g.lineWidth = 1.2;
      g.beginPath(); g.arc(cx, cy-23, 1.4, 0.1*Math.PI, 0.9*Math.PI); g.stroke();
      // Grabpack visible (small green backpack + nozzle)
      g.fillStyle = '#4aa86b';
      g.fillRect(cx - 10 + (f === 1 ? 0 : 5), cy - 22, 6, 12);
      g.fillStyle = '#ffd84a'; g.beginPath(); g.arc(cx + f*12, cy - 16, 2.5, 0, Math.PI*2); g.fill();
    });
  }
  function buildThistleSprite() {
    return spriteCache('l7_thistle', 40, 70, (g) => {
      const cx = 20, cy = 66; const s = 0.9;
      g.lineJoin = 'round'; g.lineCap = 'round';
      g.fillStyle = 'rgba(0,0,0,0.2)';
      g.beginPath(); g.ellipse(cx, cy + 2, 14, 3, 0, 0, Math.PI*2); g.fill();
      g.strokeStyle = '#141414'; g.lineWidth = 2;
      g.fillStyle = '#fbd34a';
      g.beginPath(); g.ellipse(cx, cy - 18*s, 12*s, 12*s, 0, 0, Math.PI*2); g.fill(); g.stroke();
      g.beginPath(); g.ellipse(cx, cy - 36*s, 12*s, 12*s, 0, 0, Math.PI*2); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(cx - 8*s, cy - 45*s); g.lineTo(cx - 14*s, cy - 58*s); g.lineTo(cx - 4*s, cy - 47*s); g.closePath(); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(cx + 4*s, cy - 47*s); g.lineTo(cx + 12*s, cy - 58*s); g.lineTo(cx + 8*s, cy - 45*s); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#f7c7d8'; g.fillRect(cx - 10*s, cy - 46*s, 20*s, 3*s);
      g.fillStyle = '#fbd34a';
      g.beginPath(); g.moveTo(cx - 8*s, cy - 46*s); g.lineTo(cx - 6*s, cy - 55*s); g.lineTo(cx + 6*s, cy - 55*s); g.lineTo(cx + 8*s, cy - 46*s); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#fff';
      g.beginPath(); g.ellipse(cx-5*s, cy-37*s, 3*s, 3.5*s, 0, 0, Math.PI*2); g.fill();
      g.beginPath(); g.ellipse(cx+5*s, cy-37*s, 3*s, 3.5*s, 0, 0, Math.PI*2); g.fill();
      g.fillStyle = '#141414';
      g.beginPath(); g.arc(cx-5*s, cy-37*s, 1.3*s, 0, Math.PI*2); g.fill();
      g.beginPath(); g.arc(cx+5*s, cy-37*s, 1.3*s, 0, Math.PI*2); g.fill();
      g.strokeStyle = '#141414'; g.lineWidth = 1.6;
      g.beginPath(); g.arc(cx, cy-32*s, 4*s, 0.2*Math.PI, 0.8*Math.PI); g.stroke();
    });
  }
  function buildPylonSprite(color) {
    return spriteCache('pylon_' + color, 80, 80, (g) => {
      g.fillStyle = '#1a1228';
      g.fillRect(8, 8, 64, 64);
      g.strokeStyle = '#0a0612'; g.lineWidth = 2;
      g.strokeRect(8+0.5, 8+0.5, 63, 63);
      g.fillStyle = color;
      g.beginPath(); g.arc(40, 40, 18, 0, Math.PI*2); g.fill();
      g.strokeStyle = '#0a0612'; g.lineWidth = 2;
      g.beginPath(); g.arc(40, 40, 18, 0, Math.PI*2); g.stroke();
      // Inner rune
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(40, 40, 6, 0, Math.PI*2);
      g.fill();
    });
  }

  // ---------- Boss logic ----------
  function currentExpectedId() {
    return ELEMENTS[state.boss.stage]?.id || null;
  }
  function shootElement(elId) {
    if (state.boss.state !== 'ready') return;
    const expected = currentExpectedId();
    if (expected !== elId) {
      sfx('wrong');
      speak('WRONG ELEMENT! Reset the order.', 2400);
      state.boss.stage = 0;
      state.objectives.forEach(o => o.done = false);
      state.boss.mossLevel = 0;
      if (window.HorridorsTasks) window.HorridorsTasks.refresh();
      return;
    }
    if (state.chargeAmt < 1) {
      sfx('wrong');
      speak('Pylon not charged yet!', 1600);
      return;
    }
    // Fire projectile from player toward boss
    const tx = state.boss.x + state.boss.w/2;
    const ty = state.boss.y + state.boss.h/2;
    const sx = player.x + player.w/2, sy = player.y + player.h/2;
    const dx = tx - sx, dy = ty - sy;
    const d = Math.hypot(dx, dy) || 1;
    const spd = 620;
    projectiles.push({ x: sx, y: sy, vx: dx/d * spd, vy: dy/d * spd, life: 1.6, r: 18, element: elId, trail: [] });
    sfx(elId);
    state.chargeAmt = 0;
    state.lastShotT = performance.now() / 1000;
  }

  function bossHit(elId) {
    // Advance stage
    const el = ELEMENTS[state.boss.stage];
    if (!el || el.id !== elId) return;
    state.objectives.find(o => o.id === elId).done = true;
    state.boss.stage++;
    state.boss.mossLevel = Math.min(4, state.boss.stage);
    state.boss.shake = 1.2;
    state.screenFlash = 0.6;
    sfx('bossHit');
    if (state.boss.stage >= ELEMENTS.length) {
      state.boss.state = 'defeated';
      sfx('win');
      speak('Blacky Pants is FULL MOSS. He\'s just a big snoring bush now.', 2800);
      setTimeout(() => {
        speak("He's sleeping now. Mossy and peaceful. Good night, big guy.", 2800);
      }, 2800);
      setTimeout(() => {
        speak('Only one door left, Chester. Mum is just through it.', 2600);
      }, 5600);
      setTimeout(() => {
        state.ending = true; state.scene = 'end';
        document.getElementById('overlay-l7-end')?.classList.remove('hidden');
      }, 8400);
    } else {
      const next = ELEMENTS[state.boss.stage];
      speak(`Nice hit! Next: ${next.label}.`, 2400);
    }
  }

  function bossPunch() {
    const sx = state.boss.x + state.boss.w/2, sy = state.boss.y + state.boss.h/2;
    const tx = player.x + player.w/2, ty = player.y + player.h/2;
    const dx = tx - sx, dy = ty - sy;
    const d = Math.hypot(dx, dy) || 1;
    // Faster base zap, and throw a spread (3 projectiles: straight + ±15° angles)
    const baseVx = dx / d, baseVy = dy / d;
    const SPEED = 240;
    const angles = [0, 0.26, -0.26]; // center + ~15° spread
    for (const a of angles) {
      const cs = Math.cos(a), sn = Math.sin(a);
      const vx = (baseVx * cs - baseVy * sn) * SPEED;
      const vy = (baseVx * sn + baseVy * cs) * SPEED;
      bossZaps.push({ x: sx, y: sy, vx, vy, life: 3.2, r: 16 });
    }
    try { sfx && sfx('boom'); } catch(e){}
  }

  let bossPunchCd = 2.0;

  // ---------- Update ----------
  function update(dt) {
    if (state.scene !== 'play') return;
    if (state.speakerT > 0) state.speakerT -= dt;
    if (state.hitCd > 0) state.hitCd -= dt;
    if (state.boss.shake > 0) state.boss.shake -= dt;
    if (state.screenFlash > 0) state.screenFlash -= dt;

    // Boss movement — slow patrol L/R, if not defeated
    state.boss.bob = Math.sin(performance.now() / 500) * 5;
    if (state.boss.state === 'ready') {
      state.boss.x += state.boss.vx * 70 * dt;
      if (state.boss.x < state.boss.patrolMin) { state.boss.x = state.boss.patrolMin; state.boss.vx = 1; }
      if (state.boss.x > state.boss.patrolMax) { state.boss.x = state.boss.patrolMax; state.boss.vx = -1; }
      bossPunchCd -= dt;
      if (bossPunchCd <= 0) {
        bossPunch();
        bossPunchCd = 1.6 + Math.random() * 1.0;
      }
    }

    // Input
    let dx = 0, dy = 0;
    if (keys.has('arrowleft') || keys.has('a')) { dx -= 1; player.facing = -1; }
    if (keys.has('arrowright') || keys.has('d')) { dx += 1; player.facing = 1; }
    if (keys.has('arrowup') || keys.has('w')) dy -= 1;
    if (keys.has('arrowdown') || keys.has('s')) dy += 1;
    if (dx && dy) { dx *= 0.707; dy *= 0.707; }
    const SPEED = 210;
    moveWithCollision(player, dx * SPEED * dt, dy * SPEED * dt);

    // Thistle follows player
    thistle.trail.push({ x: player.x, y: player.y });
    if (thistle.trail.length > 22) thistle.trail.shift();
    const target = thistle.trail[0] || { x: player.x - 30, y: player.y };
    const tdx = target.x - thistle.x, tdy = target.y - thistle.y;
    const tD = Math.hypot(tdx, tdy);
    if (tD > 6) {
      const tvx = (tdx / tD) * 190 * dt, tvy = (tdy / tD) * 190 * dt;
      moveWithCollision(thistle, Math.max(-9, Math.min(9, tvx)), Math.max(-9, Math.min(9, tvy)));
    }

    // Find pylon the player is standing on
    let onPylon = null;
    for (const p of PYLONS) {
      if (rectIntersect(player, { x: p.x, y: p.y, w: p.w, h: p.h })) { onPylon = p; break; }
    }
    if (onPylon) {
      // Valid only if it matches current stage
      const expected = currentExpectedId();
      if (onPylon.id === expected) {
        state.charge = onPylon.id;
        const chT = state.chargeTime || 1.1;
        state.chargeAmt = Math.min(1, state.chargeAmt + dt / chT);
        if (state.chargeAmt >= 1 && state.chargeAmt - dt / chT < 1) sfx('full');
      } else {
        // On wrong pylon — tell them
        state.charge = onPylon.id;
        state.chargeAmt = 0;
      }
    } else {
      state.charge = null;
      state.chargeAmt = Math.max(0, state.chargeAmt - dt / 2.2);
    }

    // Element hotkeys (1..4)
    if (wasPressed('1')) shootElement('fire');
    if (wasPressed('2')) shootElement('thunder');
    if (wasPressed('3')) shootElement('earth');
    if (wasPressed('4')) shootElement('water');

    // Update projectiles
    for (const pr of projectiles) {
      pr.trail.push({ x: pr.x, y: pr.y });
      if (pr.trail.length > 14) pr.trail.shift();
      pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.life -= dt;
      // Hit boss
      const bx = state.boss.x + state.boss.w/2, by = state.boss.y + state.boss.h/2;
      if (Math.hypot(pr.x - bx, pr.y - by) < 70 + pr.r && state.boss.state === 'ready') {
        pr.life = 0;
        bossHit(pr.element);
      }
      if (pr.x < ARENA.x1 || pr.x > ARENA.x2 || pr.y < ARENA.y1 || pr.y > ARENA.y2) pr.life = 0;
    }
    for (let i = projectiles.length - 1; i >= 0; i--) if (projectiles[i].life <= 0) projectiles.splice(i, 1);

    // Boss zaps hit player
    for (const z of bossZaps) {
      z.x += z.vx * dt; z.y += z.vy * dt; z.life -= dt;
      const dxp = z.x - (player.x + player.w/2);
      const dyp = z.y - (player.y + player.h/2);
      if (state.hitCd <= 0 && Math.hypot(dxp, dyp) < z.r + 12) {
        z.life = 0; state.hitCd = 0.9 + (state.shieldBonus || 0); state.hp--;
        state.screenFlash = 0.7; sfx('hit');
        if (state.hp <= 0) {
          speak('Knocked down. Restarting the fight.', 2400);
          const W2 = window.HorridorsWallet;
          state.hp = 3 + (W2 && W2.hasPowerup('extraHp') ? 1 : 0);
          state.boss.stage = 0; state.boss.mossLevel = 0;
          state.objectives.forEach(o => o.done = false);
          player.x = WORLD_W/2 - 11; player.y = ARENA.y2 - 80;
        } else speak(`Ouch! ${state.hp} hits left.`, 1600);
      }
      if (z.x < ARENA.x1 || z.x > ARENA.x2 || z.y < ARENA.y1 || z.y > ARENA.y2) z.life = 0;
    }
    for (let i = bossZaps.length - 1; i >= 0; i--) if (bossZaps[i].life <= 0) bossZaps.splice(i, 1);

    // Camera
    let tCamX = player.x + player.w/2 - VIEW_W/2;
    let tCamY = player.y + player.h/2 - VIEW_H/2;
    tCamX = Math.max(0, Math.min(WORLD_W - VIEW_W, tCamX));
    tCamY = Math.max(0, Math.min(WORLD_H - VIEW_H, tCamY));
    cam.x += (tCamX - cam.x) * Math.min(1, dt * 6);
    cam.y += (tCamY - cam.y) * Math.min(1, dt * 6);

    if (window.HorridorsTasks) window.HorridorsTasks.refresh('l7', l7DoneIds);
    justPressed.clear();
  }

  function l7DoneIds() {
    const done = new Set();
    for (const o of state.objectives) if (o.done) done.add(o.id);
    return done;
  }
  function registerTasks() {
    if (!window.HorridorsTasks) return;
    window.HorridorsTasks.setLevel('l7', 'Level 7 — Elements', [
      { id: 'fire',    label: '🔥 Fire first' },
      { id: 'thunder', label: '⚡ Then Thunder' },
      { id: 'earth',   label: '🌱 Then Earth' },
      { id: 'water',   label: '💧 Finish with Water' },
    ], l7DoneIds);
  }

  // ---------- Render ----------
  function drawFloor() {
    const grad = ctx.createLinearGradient(0, ARENA.y1, 0, ARENA.y2);
    grad.addColorStop(0, '#221430');
    grad.addColorStop(1, '#0c0618');
    ctx.fillStyle = grad;
    ctx.fillRect(ARENA.x1, ARENA.y1, ARENA.x2 - ARENA.x1, ARENA.y2 - ARENA.y1);
    // Magic circle in center
    ctx.save();
    ctx.strokeStyle = 'rgba(200, 120, 255, 0.18)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(WORLD_W/2, WORLD_H/2, 280, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.arc(WORLD_W/2, WORLD_H/2, 210, 0, Math.PI*2); ctx.stroke();
    ctx.restore();
    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.035)'; ctx.lineWidth = 1;
    for (let x = ARENA.x1; x < ARENA.x2; x += 80) { ctx.beginPath(); ctx.moveTo(x, ARENA.y1); ctx.lineTo(x, ARENA.y2); ctx.stroke(); }
    for (let y = ARENA.y1; y < ARENA.y2; y += 80) { ctx.beginPath(); ctx.moveTo(ARENA.x1, y); ctx.lineTo(ARENA.x2, y); ctx.stroke(); }
  }
  function drawWalls() {
    ctx.fillStyle = '#0c0612';
    ctx.fillRect(0, 0, WORLD_W, ARENA.y1);
    ctx.fillRect(0, ARENA.y2, WORLD_W, WORLD_H - ARENA.y2);
    ctx.fillRect(0, 0, ARENA.x1, WORLD_H);
    ctx.fillRect(ARENA.x2, 0, WORLD_W - ARENA.x2, WORLD_H);
  }
  function drawPylons() {
    for (const p of PYLONS) {
      const sprite = buildPylonSprite(p.color);
      const expected = currentExpectedId();
      const isNext = p.id === expected && state.boss.state === 'ready';
      // Glow when it's the expected pylon
      if (isNext) {
        const pulse = 0.4 + 0.4 * Math.sin(performance.now() / 250);
        ctx.save();
        ctx.globalAlpha = pulse;
        const cx = p.x + p.w/2, cy = p.y + p.h/2;
        const g = ctx.createRadialGradient(cx, cy, 5, cx, cy, 90);
        g.addColorStop(0, p.color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(cx - 90, cy - 90, 180, 180);
        ctx.restore();
      }
      ctx.drawImage(sprite, p.x - 8, p.y - 8);
      // Label
      ctx.fillStyle = '#fff'; ctx.font = '700 12px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(ELEMENTS.find(e=>e.id===p.id).label, p.x + p.w/2, p.y - 14);
      // Charge bar if player is on this pylon
      if (state.charge === p.id && state.boss.state === 'ready') {
        const bw = p.w, bh = 6;
        ctx.fillStyle = '#1a1228';
        ctx.fillRect(p.x, p.y + p.h + 6, bw, bh);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y + p.h + 6, bw * state.chargeAmt, bh);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
        ctx.strokeRect(p.x + 0.5, p.y + p.h + 6 + 0.5, bw - 1, bh - 1);
        if (state.chargeAmt >= 1 && isNext) {
          ctx.fillStyle = '#fff'; ctx.font = '800 12px system-ui';
          ctx.fillText(`PRESS ${ELEMENTS.find(e=>e.id===p.id).key}`, p.x + p.w/2, p.y + p.h + 30);
        }
      }
    }
  }
  function drawBoss() {
    const s = state.boss;
    const sprite = buildBlackyPantsSprite(s.mossLevel);
    const shake = s.shake > 0 ? (Math.random() - 0.5) * 6 : 0;
    ctx.drawImage(sprite, s.x + shake, s.y + s.bob);
    // Health pips — 4 slots
    const bw = 120, bh = 8;
    const bx = s.x + s.w/2 - bw/2, by = s.y - 16;
    ctx.fillStyle = '#0a0612';
    ctx.fillRect(bx, by, bw, bh);
    for (let i = 0; i < 4; i++) {
      const fill = i < s.stage;
      ctx.fillStyle = fill ? ELEMENTS[i].color : '#3a2a48';
      ctx.fillRect(bx + i * (bw/4), by, bw/4 - 2, bh);
    }
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    ctx.fillStyle = '#fff'; ctx.font = '700 11px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('BLACKY PANTS', s.x + s.w/2, by - 4);
  }
  function drawProjectiles() {
    for (const pr of projectiles) {
      const el = ELEMENTS.find(e => e.id === pr.element);
      // Trail
      for (let i = 0; i < pr.trail.length; i++) {
        const t = pr.trail[i];
        ctx.fillStyle = el.color;
        ctx.globalAlpha = (i / pr.trail.length) * 0.8;
        ctx.beginPath(); ctx.arc(t.x, t.y, pr.r * (i / pr.trail.length) * 0.6 + 2, 0, Math.PI*2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      // Core
      const g = ctx.createRadialGradient(pr.x, pr.y, 2, pr.x, pr.y, pr.r * 2);
      g.addColorStop(0, '#fff');
      g.addColorStop(0.4, el.color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(pr.x - pr.r*2, pr.y - pr.r*2, pr.r*4, pr.r*4);
    }
  }
  function drawBossZaps() {
    for (const z of bossZaps) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      const g = ctx.createRadialGradient(z.x, z.y, 2, z.x, z.y, z.r * 2);
      g.addColorStop(0, '#d9b4ff');
      g.addColorStop(1, 'rgba(100,50,160,0)');
      ctx.fillStyle = g;
      ctx.fillRect(z.x - z.r*2, z.y - z.r*2, z.r*4, z.r*4);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(z.x, z.y, z.r * 0.5, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }
  }
  function drawPlayerSprite() {
    const sprite = buildPlayerSprite(player.facing === 1 ? 1 : -1);
    if (player.facing === -1) {
      ctx.save();
      ctx.translate(player.x + player.w/2, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(sprite, -player.w/2 - 5, player.y - 20);
      ctx.restore();
    } else {
      ctx.drawImage(sprite, player.x - 5, player.y - 20);
    }
    if (state.hitCd > 0.7) {
      ctx.fillStyle = 'rgba(255,80,80,0.4)';
      ctx.fillRect(player.x - 5, player.y - 20, 32, 48);
    }
  }
  function drawThistleFollower() {
    const sprite = buildThistleSprite();
    ctx.drawImage(sprite, thistle.x - 10, thistle.y - 42);
  }
  function drawHUD() {
    ctx.save();
    ctx.resetTransform && ctx.resetTransform();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, VIEW_W, 30);
    ctx.fillStyle = '#ff7a45';
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('LEVEL 7 — BLACKY PANTS', 10, 15);
    // Hearts
    ctx.textAlign = 'right';
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i < state.hp ? '#ff6a9a' : '#3a2230';
      ctx.beginPath();
      const hx = VIEW_W - 20 - i * 22, hy = 15;
      ctx.moveTo(hx, hy + 4);
      ctx.bezierCurveTo(hx - 10, hy - 6, hx - 14, hy + 4, hx, hy + 10);
      ctx.bezierCurveTo(hx + 14, hy + 4, hx + 10, hy - 6, hx, hy + 4);
      ctx.fill();
    }
    // Next element prompt
    const next = ELEMENTS[state.boss.stage];
    ctx.textAlign = 'center';
    if (next && state.boss.state === 'ready') {
      ctx.fillStyle = next.color;
      ctx.font = '800 14px system-ui';
      ctx.fillText(`NEXT: ${next.label}  (stand on the matching pylon, then press ${next.key})`, VIEW_W/2, 48);
    }
    // Speaker line
    if (state.speakerLine && state.speakerT > 0) {
      const line = state.speakerLine;
      const w = Math.min(VIEW_W - 60, 720);
      const x = (VIEW_W - w) / 2, y = VIEW_H - 70;
      ctx.fillStyle = 'rgba(0,0,0,0.78)';
      ctx.fillRect(x, y, w, 48);
      ctx.strokeStyle = next ? next.color : '#ff7a45'; ctx.lineWidth = 2;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 48 - 1);
      ctx.fillStyle = '#fff';
      ctx.font = '600 14px system-ui';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(line, VIEW_W/2, y + 24);
    }
    if (state.screenFlash > 0) {
      ctx.fillStyle = `rgba(255, 160, 80, ${Math.min(0.35, state.screenFlash)})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    ctx.restore();
  }

  function render() {
    ctx.fillStyle = '#09040f';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    drawFloor();
    drawWalls();
    drawPylons();
    drawBoss();
    drawBossZaps();
    drawProjectiles();
    drawThistleFollower();
    drawPlayerSprite();
    ctx.restore();
    drawHUD();
  }

  let running = false; let lastT = 0;
  function loop(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    update(dt); render();
    requestAnimationFrame(loop);
  }

  // Cutscene wiring
  function showCutscene() {
    cutscene.active = true; cutscene.page = 0;
    const ov = document.getElementById('overlay-l7-intro');
    if (ov) { ov.classList.remove('hidden'); renderCutscenePage(); }
  }
  function renderCutscenePage() {
    const p = cutscene.pages[cutscene.page];
    document.getElementById('l7-intro-title').textContent = p.title;
    document.getElementById('l7-intro-text').textContent = p.text;
    document.getElementById('btn-l7-intro-next').textContent = (cutscene.page === cutscene.pages.length - 1) ? 'Begin' : 'Next →';
  }
  function advanceCutscene() {
    if (cutscene.page < cutscene.pages.length - 1) { cutscene.page++; renderCutscenePage(); }
    else { cutscene.active = false; document.getElementById('overlay-l7-intro').classList.add('hidden'); showShop(); }
  }

  // ---- Shop (opens between intro and battle) ----
  const SHOP_ITEMS = [
    { id: 'extraHp',      name: 'Extra Heart',        desc: '+1 HP (4 hits instead of 3)', cost: 15 },
    { id: 'fasterCharge', name: 'Faster Charge',      desc: 'Pylon fills in 0.7s (was 1.1s)', cost: 20 },
    { id: 'shield',       name: 'Shield Aura',        desc: 'Extra 1s invuln after every hit', cost: 25 },
  ];
  function renderShop() {
    const W = window.HorridorsWallet;
    const coinCountEl = document.getElementById('shop-coin-count');
    if (coinCountEl && W) coinCountEl.textContent = W.getCoins();
    const host = document.getElementById('shop-items');
    if (!host) return;
    host.innerHTML = '';
    for (const it of SHOP_ITEMS) {
      const owned = W && W.hasPowerup(it.id);
      const canAfford = W && W.getCoins() >= it.cost;
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;background:#1a1130;border:1px solid #3a2a5a;border-radius:8px;';
      row.innerHTML = `
        <div style="flex:1;">
          <div style="font:700 15px system-ui;color:#f2e8ff;">${it.name} <span style="font:600 12px system-ui;color:#ffd84a;">— ${it.cost} coins</span></div>
          <div style="font:500 12px system-ui;color:#b5a3d0;margin-top:2px;">${it.desc}</div>
        </div>
        <button data-shop-id="${it.id}" style="padding:8px 14px;border-radius:6px;border:none;font:700 13px system-ui;cursor:${owned||!canAfford?'default':'pointer'};background:${owned?'#4aa86b':(canAfford?'#ffd84a':'#3a2a5a')};color:${owned?'#fff':(canAfford?'#1a1024':'#7a6aa0')};" ${owned||!canAfford?'disabled':''}>${owned?'Owned ✓':(canAfford?'Buy':'Not enough')}</button>
      `;
      host.appendChild(row);
    }
    host.querySelectorAll('button[data-shop-id]').forEach(b => {
      b.addEventListener('click', () => {
        const id = b.getAttribute('data-shop-id');
        const it = SHOP_ITEMS.find(x => x.id === id);
        if (W && W.buyPowerup(id, it.cost)) {
          sfx('full');
          renderShop();
        } else sfx('wrong');
      });
    });
  }
  function showShop() {
    const ov = document.getElementById('overlay-l7-shop');
    if (!ov) { actuallyBegin(); return; }
    ov.classList.remove('hidden');
    renderShop();
  }
  document.getElementById('btn-shop-done')?.addEventListener('click', () => {
    document.getElementById('overlay-l7-shop')?.classList.add('hidden');
    actuallyBegin();
  });

  function resetL7State() {
    state.scene = 'play';
    state.boss.stage = 0; state.boss.mossLevel = 0; state.boss.state = 'ready';
    state.boss.x = WORLD_W/2 - 70; state.boss.y = ARENA.y1 + 180;
    state.boss.vx = 1; state.boss.shake = 0;
    state.charge = null; state.chargeAmt = 0;
    // Apply shop powerups before battle
    const W = window.HorridorsWallet;
    state.hp = 3 + (W && W.hasPowerup('extraHp') ? 1 : 0) + (W && W.hasPowerup('smallHeart') ? 1 : 0);
    state.hitCd = 0;
    state.chargeTime = (W && W.hasPowerup('fasterCharge')) ? 0.7 : 1.1;
    state.shieldBonus = (W && W.hasPowerup('shield')) ? 1.0 : 0;
    state.speakerLine = null; state.speakerT = 0; state.ending = false;
    state.objectives.forEach(o => o.done = false);
    player.x = WORLD_W/2 - 11; player.y = ARENA.y2 - 80;
    thistle.x = WORLD_W/2 - 40; thistle.y = ARENA.y2 - 80; thistle.trail = [];
    projectiles.length = 0; bossZaps.length = 0;
    buildWorld();
  }

  function start() {
    const toHide = [
      'overlay-title','overlay-end','overlay-caught','overlay-notes',
      'overlay-l2-title','overlay-l2-end',
      'overlay-l3-title','overlay-l3-end',
      'overlay-l4-title','overlay-l4-end',
      'overlay-l5-intro','overlay-l5-end',
      'overlay-l6-intro','overlay-l6-end',
      'overlay-l7-end','overlay-l8-intro','overlay-l8-end','overlay-credits',
    ];
    for (const id of toHide) document.getElementById(id)?.classList.add('hidden');
    const hud = document.getElementById('hud'); if (hud) hud.classList.add('hidden');
    showCutscene();
  }
  function actuallyBegin() {
    ensureAudio();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    startAmbient();
    resetL7State();
    if (!running) {
      running = true;
      window.addEventListener('keydown', keydown);
      window.addEventListener('keyup', keyup);
      window.addEventListener('blur', blur);
      lastT = performance.now();
      requestAnimationFrame(loop);
    }
    registerTasks();
    setTimeout(() => speak('🔥 FIRE first! Stand on the red pylon, then press 1.', 3600), 500);
  }

  document.getElementById('btn-l7-intro-next')?.addEventListener('click', advanceCutscene);
  document.getElementById('btn-l7-intro-skip')?.addEventListener('click', () => {
    cutscene.active = false;
    document.getElementById('overlay-l7-intro').classList.add('hidden');
    showShop();
  });
  document.getElementById('btn-l7-replay')?.addEventListener('click', () => {
    document.getElementById('overlay-l7-end').classList.add('hidden');
    resetL7State();
    speak('Round two!', 1600);
  });
  document.getElementById('btn-l7-home')?.addEventListener('click', () => {
    running = false; stopAmbient();
    window.removeEventListener('keydown', keydown);
    window.removeEventListener('keyup', keyup);
    window.removeEventListener('blur', blur);
    window.location.reload();
  });
  document.getElementById('btn-l7-next')?.addEventListener('click', () => {
    document.getElementById('overlay-l7-end').classList.add('hidden');
    running = false; stopAmbient();
    window.removeEventListener('keydown', keydown);
    window.removeEventListener('keyup', keyup);
    window.removeEventListener('blur', blur);
    if (window.__startLevel8) window.__startLevel8();
  });

  window.__startLevel7 = start;
  window.__horridorsL7 = {
    audioCtx: () => audioCtx, masterGain: () => masterGain,
    stop: () => {
      running = false; stopAmbient();
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', blur);
    },
  };
  console.log('[Level 7] Loaded. Call window.__startLevel7() to begin.');
})();
