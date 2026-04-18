// =====================================================================
// HORRIDORS - LEVEL 8: THE FINAL MATCH
// Chester + Thistle + Inky Bin vs all the Horridors (except Blacky
// Pants, who is fast asleep and mossy). Team battle in the pit.
// Defeat every enemy, then break open Mum's cage and escape.
// Standalone module; boots via window.__startLevel8().
// Optimisation: sprite bitmap cache per monster — main loop does one
// drawImage call per entity per frame.
// =====================================================================
(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const VIEW_W = canvas.width;
  const VIEW_H = canvas.height;

  const WORLD_W = 1600, WORLD_H = 900;
  const ARENA = { x1: 90, x2: WORLD_W - 90, y1: 140, y2: WORLD_H - 100 };

  const cam = { x: 0, y: 0 };

  // ---------- State ----------
  const state = {
    scene: 'title',
    speakerLine: null, speakerT: 0,
    muted: false,
    hp: 7, maxHp: 7, hitCd: 0,
    ending: false, endingT: 0,
    screenFlash: 0, screenShake: 0,
    motherFreed: false,
    cageBroken: 0, // 0..3 hits to open
    victory: false,
    objectives: [
      { id: 'fight',  text: 'Defeat every Horridor in the arena', done: false },
      { id: 'cage',   text: 'Break open Mum\'s cage (E ×3)',      done: false },
      { id: 'mother', text: 'Free Mum and escape',                 done: false },
    ],
  };

  // Enemies — 3 HP each
  const enemies = []; // {kind,x,y,w,h,hp,maxHp,vx,vy,cd,bob,hurtT,dead,deadT,phase}
  function makeEnemy(kind, x, y) {
    const def = ENEMY_DEFS[kind];
    return { kind, x, y, w: def.w, h: def.h, hp: def.hp, maxHp: def.hp,
      vx: 0, vy: 0, cd: 1.5 + Math.random()*1.2, bob: Math.random()*Math.PI*2,
      hurtT: 0, dead: false, deadT: 0, phase: 0 };
  }
  // Final-boss stats: each enemy is a mini-boss. One of each only.
  const ENEMY_DEFS = {
    socky:    { w: 80,  h: 96,  hp: 12, speed: 40, attack: 22, color: '#46b9d3', name: 'Socky Shok' },
    expre:    { w: 76,  h: 100, hp: 10, speed: 50, attack: 28, color: '#b07ed9', name: 'Ex Preshon' },
    exlena:   { w: 72,  h: 92,  hp: 15, speed: 52, attack: 26, color: '#e28bb6', name: 'Exlena (Final Boss)' },
    drip:     { w: 60,  h: 80,  hp: 8,  speed: 32, attack: 18, color: '#6fbfff', name: 'Drip' },
  };
  // Defeat lines per kind
  const DEFEAT_LINES = {
    socky:  'Socky Shok falls — the betrayer is down.',
    expre:  'Ex Preshon collapses in a puff of sadness.',
    exlena: 'Exlena roars one last time — the final boss is down.',
    drip:   'The Drip scout pops with a splash.',
  };
  // Track whether Exlena has spawned her minion (phase 2 at 50% HP)
  let exlenaMinionsSpawned = false;

  // Allies — team
  const player = { x: ARENA.x1 + 200, y: ARENA.y2 - 120, w: 22, h: 28, facing: 1, punchT: 0 };
  const thistle = { x: ARENA.x1 + 260, y: ARENA.y2 - 110, w: 20, h: 26, trail: [],
    atkCd: 0, hurtT: 0, vx: 0 };
  const inkybin = { x: ARENA.x1 + 320, y: ARENA.y2 - 100, w: 40, h: 40, trail: [],
    atkCd: 0, hurtT: 0, bob: 0 };

  // Projectiles (bin lobs ink, enemies fire ranged)
  const projectiles = []; // {x,y,vx,vy,life,r,team,damage}

  // Cage + Mother
  const cage = { x: WORLD_W/2 - 80, y: ARENA.y1 + 40, w: 160, h: 170 };
  const mother = { x: cage.x + cage.w/2 - 18, y: cage.y + 36, w: 36, h: 120, freed: false };

  // Cutscene
  const cutscene = {
    active: false, page: 0,
    pages: [
      { title: 'The last door',
        text: 'The staff door groans open. Beyond it — a pit. A cold, stone pit deep under the day care. The air smells like old biscuits and rust.' },
      { title: 'The final pit',
        text: 'Four champions wait. Drip twitches at the edge. Ex Preshon looms, shadow pooling around him. Socky Shok snaps her fingers with a crackle. And at the centre — Exlena the librarian, meaner than ever. Tougher than ever. The real final boss.' },
      { title: 'Mum',
        text: 'In the middle, a rusty cage. And inside the cage — Mum. She\'s tired but she stands up when she sees Chester. She mouths one word through the bars: "Run." Chester shakes his head. Not this time.' },
      { title: 'Not alone',
        text: 'Thistle is beside Chester, star glowing. Inky Bin has rolled up behind them, splashing ink in loops of excitement. This is what the three of them have been training for.' },
      { title: 'The plan',
        text: 'Three of us — four of them. Each Horridor takes real hits now. Drip and Socky are dangerous, Ex Preshon throws heavy shadow orbs, and Exlena will call more Drips when she weakens. Stay moving. Save coins for upgrades next time you see a shop.' },
      { title: 'Controls',
        text: 'Arrows / WASD to move. E to punch with the Grabpack (damage the nearest enemy). Get close to the cage and press E to bash it open.' },
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
    const prev = window.__horridorsL7 || window.__horridorsL6 || window.__horridorsL5 || window.__horridorsL4 || window.__horridorsL3 || window.__horridorsL2 || window.__horridorsL1;
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
      case 'punch':  tone(380, 0.1, 'square', 0.22); setTimeout(() => tone(240, 0.1, 'square', 0.2), 40); break;
      case 'hit':    tone(180, 0.2, 'sawtooth', 0.22); break;
      case 'kill':   [600,450,300].forEach((f,i) => setTimeout(() => tone(f, 0.16, 'sine', 0.22), i*60)); break;
      case 'ally':   tone(820, 0.08, 'triangle', 0.16); break;
      case 'hurt':   tone(140, 0.22, 'sawtooth', 0.26); break;
      case 'bash':   tone(100, 0.16, 'sawtooth', 0.3); setTimeout(() => tone(90, 0.12, 'square', 0.22), 50); break;
      case 'open':   [400,600,800,1000].forEach((f,i) => setTimeout(() => tone(f, 0.14, 'triangle', 0.2), i*70)); break;
      case 'mum':    [523, 659, 784, 988, 1318].forEach((f,i) => setTimeout(() => tone(f, 0.22, 'sine', 0.22), i*130)); break;
      case 'win':    [523, 659, 784, 1047, 1318, 1568].forEach((f,i) => setTimeout(() => tone(f, 0.24, 'triangle', 0.24), i*140)); break;
      case 'ink':    tone(520, 0.08, 'square', 0.16); break;
      case 'zap':    tone(880, 0.08, 'square', 0.16); setTimeout(() => tone(660, 0.08, 'square', 0.14), 60); break;
    }
  }
  let ambientNodes = null;
  function startAmbient() { if (audioCtx && window.HorridorsAmbient) ambientNodes = window.HorridorsAmbient.start(audioCtx, masterGain, { mood: 'abyss' }); if (audioCtx && window.HorridorsMusic) window.HorridorsMusic.setTheme(audioCtx, masterGain, 'l8'); }
  function stopAmbient() { if (ambientNodes && ambientNodes.stop) ambientNodes.stop(); ambientNodes = null; }

  const _kl = (t) => (window.HorridorsTouch && window.HorridorsTouch.keyLabel) ? window.HorridorsTouch.keyLabel(t) : t;
  function speak(line, d = 3000) { state.speakerLine = _kl(line); state.speakerT = d / 1000; }

  // ---------- World & collisions ----------
  const obstacles = [];
  function addWall(x,y,w,h){ obstacles.push({x,y,w,h}); }
  function buildWorld() {
    obstacles.length = 0;
    addWall(0, 0, WORLD_W, ARENA.y1);
    addWall(0, ARENA.y2, WORLD_W, WORLD_H - ARENA.y2);
    addWall(0, 0, ARENA.x1, WORLD_H);
    addWall(ARENA.x2, 0, WORLD_W - ARENA.x2, WORLD_H);
    // Cage (solid barrier until broken)
    // (We treat cage bars as soft — player walks around until last step.)
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

  function buildSockySprite() {
    return spriteCache('l8_socky', 120, 140, (g) => {
      g.lineJoin = 'round'; g.lineCap = 'round';
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.beginPath(); g.ellipse(60, 136, 32, 5, 0, 0, Math.PI*2); g.fill();
      // Sock body
      g.fillStyle = '#46b9d3'; g.strokeStyle = '#0a1a24'; g.lineWidth = 3;
      g.beginPath();
      g.moveTo(32, 30); g.quadraticCurveTo(18, 70, 26, 114);
      g.quadraticCurveTo(60, 128, 94, 114);
      g.quadraticCurveTo(102, 70, 88, 30);
      g.closePath(); g.fill(); g.stroke();
      // Stripe
      g.fillStyle = '#2e8aa0'; g.fillRect(26, 46, 68, 8);
      g.fillRect(26, 62, 68, 6);
      // Zigzag fang mouth
      g.strokeStyle = '#0a1a24'; g.lineWidth = 3; g.fillStyle = '#fff';
      g.beginPath();
      g.moveTo(40, 82); g.lineTo(46, 92); g.lineTo(52, 82); g.lineTo(58, 92);
      g.lineTo(64, 82); g.lineTo(70, 92); g.lineTo(76, 82); g.lineTo(82, 92);
      g.stroke();
      // Lightning eye (right)
      g.strokeStyle = '#ffd84a'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(80, 20); g.lineTo(72, 38); g.lineTo(82, 42); g.lineTo(74, 58);
      g.stroke();
      // Round eyes
      g.fillStyle = '#fff'; g.strokeStyle = '#0a1a24'; g.lineWidth = 2;
      g.beginPath(); g.arc(46, 42, 9, 0, Math.PI*2); g.fill(); g.stroke();
      g.beginPath(); g.arc(74, 42, 9, 0, Math.PI*2); g.fill(); g.stroke();
      g.fillStyle = '#0a1a24';
      g.beginPath(); g.arc(48, 44, 3.6, 0, Math.PI*2); g.fill();
      g.beginPath(); g.arc(76, 44, 3.6, 0, Math.PI*2); g.fill();
    });
  }

  function buildExPreshonSprite() {
    return spriteCache('l8_expre', 100, 130, (g) => {
      g.lineJoin = 'round'; g.lineCap = 'round';
      g.fillStyle = 'rgba(0,0,0,0.28)';
      g.beginPath(); g.ellipse(50, 126, 30, 5, 0, 0, Math.PI*2); g.fill();
      // Tall purple body
      g.fillStyle = '#b07ed9'; g.strokeStyle = '#1a0a28'; g.lineWidth = 3;
      g.beginPath();
      g.moveTo(20, 30); g.quadraticCurveTo(10, 70, 18, 120);
      g.quadraticCurveTo(50, 128, 82, 120);
      g.quadraticCurveTo(90, 70, 80, 30);
      g.quadraticCurveTo(50, 14, 20, 30);
      g.closePath(); g.fill(); g.stroke();
      // Droopy frown mouth
      g.strokeStyle = '#1a0a28'; g.lineWidth = 3; g.fillStyle = '#3a1848';
      g.beginPath();
      g.moveTo(30, 80); g.quadraticCurveTo(50, 100, 70, 80);
      g.quadraticCurveTo(50, 90, 30, 80); g.closePath(); g.fill(); g.stroke();
      // Single big eye
      g.fillStyle = '#fff'; g.strokeStyle = '#1a0a28'; g.lineWidth = 2.5;
      g.beginPath(); g.arc(50, 48, 18, 0, Math.PI*2); g.fill(); g.stroke();
      g.fillStyle = '#e34d6f';
      g.beginPath(); g.arc(50, 48, 10, 0, Math.PI*2); g.fill();
      g.fillStyle = '#1a0a28';
      g.beginPath(); g.arc(50, 48, 5, 0, Math.PI*2); g.fill();
      // Tears
      g.fillStyle = '#6fbfff';
      g.beginPath(); g.moveTo(36, 60); g.lineTo(32, 74); g.lineTo(38, 74); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(64, 60); g.lineTo(62, 76); g.lineTo(68, 76); g.closePath(); g.fill();
    });
  }

  function buildExlenaSprite() {
    return spriteCache('l8_exlena', 96, 124, (g) => {
      g.lineJoin = 'round'; g.lineCap = 'round';
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.beginPath(); g.ellipse(48, 120, 28, 5, 0, 0, Math.PI*2); g.fill();
      // Pink body (smaller, more wiry)
      g.fillStyle = '#e28bb6'; g.strokeStyle = '#42142e'; g.lineWidth = 3;
      g.beginPath();
      g.moveTo(16, 34); g.quadraticCurveTo(6, 76, 18, 114);
      g.quadraticCurveTo(48, 122, 78, 114);
      g.quadraticCurveTo(90, 76, 80, 34);
      g.quadraticCurveTo(48, 18, 16, 34);
      g.closePath(); g.fill(); g.stroke();
      // Hair tuft
      g.fillStyle = '#42142e';
      g.beginPath(); g.moveTo(30, 26); g.lineTo(34, 10); g.lineTo(42, 22); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(54, 22); g.lineTo(60, 10); g.lineTo(66, 26); g.closePath(); g.fill();
      // Eyes (two) — small angry
      g.fillStyle = '#fff'; g.strokeStyle = '#42142e'; g.lineWidth = 2;
      g.beginPath(); g.arc(36, 48, 8, 0, Math.PI*2); g.fill(); g.stroke();
      g.beginPath(); g.arc(60, 48, 8, 0, Math.PI*2); g.fill(); g.stroke();
      g.fillStyle = '#42142e';
      g.beginPath(); g.arc(38, 50, 3.2, 0, Math.PI*2); g.fill();
      g.beginPath(); g.arc(62, 50, 3.2, 0, Math.PI*2); g.fill();
      // Brows
      g.strokeStyle = '#42142e'; g.lineWidth = 2.4;
      g.beginPath(); g.moveTo(28, 40); g.lineTo(44, 44); g.stroke();
      g.beginPath(); g.moveTo(68, 40); g.lineTo(52, 44); g.stroke();
      // Scowling mouth
      g.strokeStyle = '#42142e'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(34, 80); g.quadraticCurveTo(48, 72, 62, 80); g.stroke();
    });
  }

  function buildDripSprite() {
    return spriteCache('l8_drip', 70, 90, (g) => {
      g.lineJoin = 'round'; g.lineCap = 'round';
      g.fillStyle = 'rgba(0,0,0,0.2)';
      g.beginPath(); g.ellipse(35, 86, 20, 4, 0, 0, Math.PI*2); g.fill();
      // Droplet body
      g.fillStyle = '#6fbfff'; g.strokeStyle = '#0a2644'; g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(35, 6); g.quadraticCurveTo(62, 48, 48, 72);
      g.quadraticCurveTo(35, 86, 22, 72);
      g.quadraticCurveTo(8, 48, 35, 6);
      g.closePath(); g.fill(); g.stroke();
      // Highlight
      g.fillStyle = 'rgba(255,255,255,0.4)';
      g.beginPath(); g.ellipse(26, 34, 5, 10, 0, 0, Math.PI*2); g.fill();
      // Eyes
      g.fillStyle = '#fff'; g.strokeStyle = '#0a2644'; g.lineWidth = 1.6;
      g.beginPath(); g.arc(28, 48, 6, 0, Math.PI*2); g.fill(); g.stroke();
      g.beginPath(); g.arc(44, 48, 6, 0, Math.PI*2); g.fill(); g.stroke();
      g.fillStyle = '#0a2644';
      g.beginPath(); g.arc(30, 50, 2.4, 0, Math.PI*2); g.fill();
      g.beginPath(); g.arc(46, 50, 2.4, 0, Math.PI*2); g.fill();
      // Mouth
      g.strokeStyle = '#0a2644'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(28, 62); g.quadraticCurveTo(36, 68, 44, 62); g.stroke();
    });
  }

  function buildPlayerSprite(facing) {
    return spriteCache('l8_player_' + facing, 32, 48, (g) => {
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
      g.fillStyle = '#4aa86b';
      g.fillRect(cx - 10 + (f === 1 ? 0 : 5), cy - 22, 6, 12);
      g.fillStyle = '#ffd84a'; g.beginPath(); g.arc(cx + f*12, cy - 16, 2.5, 0, Math.PI*2); g.fill();
    });
  }

  function buildThistleSprite() {
    return spriteCache('l8_thistle', 40, 70, (g) => {
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

  function buildInkyBinSprite() {
    return spriteCache('l8_inkybin', 60, 72, (g) => {
      g.lineJoin = 'round'; g.lineCap = 'round';
      // Shadow
      g.fillStyle = 'rgba(0,0,0,0.28)';
      g.beginPath(); g.ellipse(30, 68, 22, 4, 0, 0, Math.PI*2); g.fill();
      // Body (navy bin)
      g.fillStyle = '#2a3e5a'; g.strokeStyle = '#101820'; g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(10, 20); g.lineTo(14, 64); g.lineTo(46, 64); g.lineTo(50, 20);
      g.closePath(); g.fill(); g.stroke();
      // Lid
      g.fillStyle = '#3c5170';
      g.fillRect(8, 14, 44, 7); g.strokeRect(8.5, 14.5, 43, 6);
      // Bin ridges
      g.strokeStyle = '#101820'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(14, 32); g.lineTo(47, 32); g.stroke();
      g.beginPath(); g.moveTo(14, 44); g.lineTo(47, 44); g.stroke();
      g.beginPath(); g.moveTo(14, 54); g.lineTo(47, 54); g.stroke();
      // Ink splash on top
      g.fillStyle = '#0d1a2a';
      g.beginPath(); g.arc(22, 14, 5, 0, Math.PI*2); g.fill();
      g.beginPath(); g.arc(32, 12, 3, 0, Math.PI*2); g.fill();
      g.beginPath(); g.arc(40, 14, 4, 0, Math.PI*2); g.fill();
      // Big friendly eyes
      g.fillStyle = '#fff'; g.strokeStyle = '#101820'; g.lineWidth = 1.6;
      g.beginPath(); g.arc(22, 34, 5, 0, Math.PI*2); g.fill(); g.stroke();
      g.beginPath(); g.arc(38, 34, 5, 0, Math.PI*2); g.fill(); g.stroke();
      g.fillStyle = '#101820';
      g.beginPath(); g.arc(23, 35, 2, 0, Math.PI*2); g.fill();
      g.beginPath(); g.arc(39, 35, 2, 0, Math.PI*2); g.fill();
      // Smile
      g.strokeStyle = '#101820'; g.lineWidth = 2;
      g.beginPath(); g.arc(30, 46, 6, 0.15*Math.PI, 0.85*Math.PI); g.stroke();
    });
  }

  function buildMotherSprite() {
    return spriteCache('l8_mother', 50, 130, (g) => {
      g.lineJoin = 'round'; g.lineCap = 'round';
      g.fillStyle = 'rgba(0,0,0,0.24)';
      g.beginPath(); g.ellipse(25, 126, 18, 4, 0, 0, Math.PI*2); g.fill();
      // Dress
      g.fillStyle = '#8a6fb8'; g.strokeStyle = '#1a1024'; g.lineWidth = 2;
      g.beginPath();
      g.moveTo(10, 60); g.lineTo(4, 122); g.lineTo(46, 122); g.lineTo(40, 60);
      g.closePath(); g.fill(); g.stroke();
      // Apron
      g.fillStyle = '#f2e6d0';
      g.fillRect(16, 64, 18, 42);
      g.strokeRect(16.5, 64.5, 17, 41);
      // Head
      g.fillStyle = '#f5d2aa';
      g.beginPath(); g.arc(25, 36, 16, 0, Math.PI*2); g.fill(); g.stroke();
      // Hair (brown bob)
      g.fillStyle = '#6a4a2a';
      g.beginPath();
      g.moveTo(9, 34); g.quadraticCurveTo(12, 16, 25, 14);
      g.quadraticCurveTo(38, 16, 41, 34);
      g.lineTo(38, 40); g.quadraticCurveTo(36, 30, 25, 28);
      g.quadraticCurveTo(14, 30, 12, 40);
      g.closePath(); g.fill(); g.stroke();
      // Eyes (closed / tired then happy)
      g.strokeStyle = '#1a1024'; g.lineWidth = 1.6;
      g.beginPath(); g.arc(19, 36, 3, 0.15*Math.PI, 0.85*Math.PI); g.stroke();
      g.beginPath(); g.arc(31, 36, 3, 0.15*Math.PI, 0.85*Math.PI); g.stroke();
      // Smile
      g.beginPath(); g.arc(25, 42, 4, 0.2*Math.PI, 0.8*Math.PI); g.stroke();
      // Neck
      g.fillStyle = '#f5d2aa'; g.fillRect(21, 48, 8, 14);
      // Arms
      g.fillStyle = '#8a6fb8';
      g.fillRect(0, 62, 10, 28); g.strokeRect(0.5, 62.5, 9, 27);
      g.fillRect(40, 62, 10, 28); g.strokeRect(40.5, 62.5, 9, 27);
    });
  }

  // ---------- Combat ----------
  function nearestEnemy(fx, fy, maxDist) {
    let best = null, bestD = Infinity;
    for (const e of enemies) {
      if (e.dead) continue;
      const dx = (e.x + e.w/2) - fx, dy = (e.y + e.h/2) - fy;
      const d = Math.hypot(dx, dy);
      if (d < bestD) { bestD = d; best = e; }
    }
    if (best && (maxDist == null || bestD <= maxDist)) return { e: best, d: bestD };
    return null;
  }

  function playerPunch() {
    if (player.punchT > 0) return;
    player.punchT = 0.25;
    sfx('punch');
    const cx = player.x + player.w/2, cy = player.y + player.h/2;
    const near = nearestEnemy(cx, cy, 70);
    if (near) {
      near.e.hp -= 1; near.e.hurtT = 0.3;
      near.e.vx += player.facing * 160;
      state.screenShake = 0.25;
      sfx('hit');
      if (near.e.hp <= 0) killEnemy(near.e);
    }
  }

  function killEnemy(e) {
    if (e.dead) return;
    e.dead = true; e.deadT = 1.2;
    sfx('kill');
    state.screenFlash = 0.35;
    // Unique defeat line per kind
    if (DEFEAT_LINES[e.kind]) speak(DEFEAT_LINES[e.kind], 2200);
    // Check if all dead
    const anyAlive = enemies.some(x => !x.dead);
    if (!anyAlive) {
      state.objectives[0].done = true;
      // Paced victory sequence: breathe, then prompt
      speak('The last Horridor falls...', 2200);
      setTimeout(() => speak('Silence. Just the torches flickering.', 2200), 2200);
      setTimeout(() => speak('Now — get to Mum\'s cage. Press E to bash it open.', 3400), 4600);
    }
  }

  function damagePlayer(amount) {
    if (state.hitCd > 0) return;
    // Final boss hits harder
    state.hp -= (amount + 1); state.hitCd = 0.9;
    state.screenShake = 0.5; sfx('hurt');
    if (state.hp <= 0) {
      state.hp = 0;
      resetAfterDefeat();
    }
  }
  function resetAfterDefeat() {
    speak('Down! Shake it off. Regrouping...', 2000);
    state.hp = state.maxHp;
    state.hitCd = 2;
    // Rebuild enemies (full heal) — keep the challenge fresh
    spawnEnemies();
    state.cageBroken = 0;
    state.objectives.forEach(o => o.done = false);
    player.x = ARENA.x1 + 200; player.y = ARENA.y2 - 120;
    thistle.x = ARENA.x1 + 260; thistle.y = ARENA.y2 - 110;
    inkybin.x = ARENA.x1 + 320; inkybin.y = ARENA.y2 - 100;
  }

  function allyFight(ally, attackRange, damage, cooldownRange) {
    if (ally.hurtT > 0) ally.hurtT -= 0.016;
    if (ally.atkCd > 0) { ally.atkCd -= 0.016; return; }
    const cx = ally.x + ally.w/2, cy = ally.y + ally.h/2;
    const near = nearestEnemy(cx, cy, attackRange);
    if (near) {
      near.e.hp -= damage; near.e.hurtT = 0.25;
      sfx('ally');
      ally.atkCd = cooldownRange[0] + Math.random() * (cooldownRange[1] - cooldownRange[0]);
      if (near.e.hp <= 0) killEnemy(near.e);
    }
  }

  function inkybinFight() {
    inkybin.atkCd -= 0.016;
    if (inkybin.atkCd > 0) return;
    // Lob an ink projectile at nearest enemy
    const cx = inkybin.x + inkybin.w/2, cy = inkybin.y + inkybin.h/2;
    const near = nearestEnemy(cx, cy, 280);
    if (near) {
      const tx = near.e.x + near.e.w/2, ty = near.e.y + near.e.h/2;
      const dx = tx - cx, dy = ty - cy; const d = Math.hypot(dx, dy) || 1;
      projectiles.push({ x: cx, y: cy, vx: dx/d * 220, vy: dy/d * 220 - 60, life: 1.4, r: 10, team: 'ally', damage: 1 });
      sfx('ink');
      inkybin.atkCd = 1.0 + Math.random() * 0.6;
    }
  }

  // ---------- Enemies ----------
  function spawnEnemies() {
    enemies.length = 0;
    exlenaMinionsSpawned = false;
    // FINAL BOSS: one of each character. Each is a mini-boss with heavy HP.
    enemies.push(makeEnemy('drip',   WORLD_W/2 - 380, ARENA.y1 + 440));
    enemies.push(makeEnemy('expre',  WORLD_W/2 - 140, ARENA.y1 + 260));
    enemies.push(makeEnemy('socky',  WORLD_W/2 + 120, ARENA.y1 + 260));
    enemies.push(makeEnemy('exlena', WORLD_W/2 + 40,  ARENA.y1 + 380));
  }

  function updateEnemy(e, dt) {
    if (e.dead) { e.deadT -= dt; return; }
    const def = ENEMY_DEFS[e.kind];
    e.bob += dt;
    if (e.hurtT > 0) e.hurtT -= dt;
    // Pick target: Chester is main threat; occasionally chase allies
    let tgtX = player.x + player.w/2, tgtY = player.y + player.h/2;
    const r = Math.random();
    if (r < 0.25) { tgtX = thistle.x + thistle.w/2; tgtY = thistle.y + thistle.h/2; }
    else if (r < 0.4) { tgtX = inkybin.x + inkybin.w/2; tgtY = inkybin.y + inkybin.h/2; }
    const cx = e.x + e.w/2, cy = e.y + e.h/2;
    const dx = tgtX - cx, dy = tgtY - cy; const d = Math.hypot(dx, dy) || 1;
    const nx = dx / d, ny = dy / d;
    // Apply velocity (knockback decays)
    e.vx *= 0.86; e.vy *= 0.86;
    const sp = def.speed;
    const moveX = nx * sp * dt + e.vx * dt;
    const moveY = ny * sp * dt + e.vy * dt;
    moveWithCollision(e, moveX, moveY);
    // Melee attack if close to any ally
    e.cd -= dt;
    if (e.cd <= 0) {
      // Find closest ally
      const allies = [player, thistle, inkybin];
      let best = null, bd = Infinity;
      for (const a of allies) {
        const ax = a.x + a.w/2, ay = a.y + a.h/2;
        const dd = Math.hypot(ax - cx, ay - cy);
        if (dd < bd) { bd = dd; best = a; }
      }
      if (best && bd < 56) {
        e.cd = 1.1 + Math.random() * 0.5;
        if (best === player) damagePlayer(1);
        else { best.hurtT = 0.3; }
        sfx('zap');
      } else if (bd < 320 && e.kind === 'socky') {
        // Socky: triple-zap spread (±18°)
        const bx = tgtX - cx, by = tgtY - cy; const bd2 = Math.hypot(bx, by) || 1;
        const nxs = bx / bd2, nys = by / bd2;
        for (const ang of [0, 0.31, -0.31]) {
          const cs = Math.cos(ang), sn = Math.sin(ang);
          projectiles.push({ x: cx, y: cy, vx: (nxs*cs - nys*sn) * 300, vy: (nxs*sn + nys*cs) * 300, life: 1.2, r: 8, team: 'enemy', damage: 1 });
        }
        sfx('zap');
        e.cd = 1.6 + Math.random() * 0.6;
      } else if (bd < 300 && e.kind === 'expre') {
        // Ex Preshon: heavy slow shadow orb (bigger radius, slower, more damage)
        const bx = tgtX - cx, by = tgtY - cy; const bd2 = Math.hypot(bx, by) || 1;
        projectiles.push({ x: cx, y: cy, vx: bx/bd2 * 180, vy: by/bd2 * 180, life: 2.0, r: 14, team: 'enemy', damage: 2 });
        sfx('zap');
        e.cd = 2.2 + Math.random() * 0.8;
      } else if (bd < 340 && e.kind === 'exlena') {
        // Exlena: volley of 5 thorns in an arc
        const baseAng = Math.atan2(tgtY - cy, tgtX - cx);
        for (let i = -2; i <= 2; i++) {
          const a = baseAng + i * 0.22;
          projectiles.push({ x: cx, y: cy, vx: Math.cos(a) * 280, vy: Math.sin(a) * 280, life: 1.3, r: 7, team: 'enemy', damage: 1 });
        }
        sfx('zap');
        e.cd = 2.4 + Math.random() * 0.8;
        // Exlena phase 2 — at <=50% HP, spawn one Drip minion (once)
        if (!exlenaMinionsSpawned && e.hp <= e.maxHp * 0.5) {
          exlenaMinionsSpawned = true;
          speak('Exlena: "Drippppp — to me!"', 2200);
          enemies.push(makeEnemy('drip', e.x - 60, e.y + 10));
          enemies.push(makeEnemy('drip', e.x + 80, e.y + 10));
        }
      } else if (bd < 200 && e.kind === 'drip') {
        // Drip: fast dart
        const bx = tgtX - cx, by = tgtY - cy; const bd2 = Math.hypot(bx, by) || 1;
        projectiles.push({ x: cx, y: cy, vx: bx/bd2 * 340, vy: by/bd2 * 340, life: 0.9, r: 5, team: 'enemy', damage: 1 });
        sfx('zap');
        e.cd = 1.2 + Math.random() * 0.5;
      } else {
        e.cd = 0.5;
      }
    }
  }

  // ---------- Update ----------
  function update(dt) {
    if (state.scene !== 'play') return;
    if (state.hitCd > 0) state.hitCd -= dt;
    if (state.screenFlash > 0) state.screenFlash -= dt * 1.4;
    if (state.screenShake > 0) state.screenShake -= dt * 1.5;
    if (player.punchT > 0) player.punchT -= dt;
    if (state.speakerT > 0) state.speakerT -= dt; else state.speakerLine = null;

    // Player movement
    let dx = 0, dy = 0;
    if (keys.has('arrowleft')  || keys.has('a')) dx -= 1;
    if (keys.has('arrowright') || keys.has('d')) dx += 1;
    if (keys.has('arrowup')    || keys.has('w')) dy -= 1;
    if (keys.has('arrowdown')  || keys.has('s')) dy += 1;
    if (dx || dy) {
      const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m;
      const spd = 220 * dt;
      moveWithCollision(player, dx * spd, dy * spd);
      if (dx !== 0) player.facing = dx > 0 ? 1 : -1;
    }
    // Punch / cage bash
    if (wasPressed('e', ' ', 'enter')) {
      // Near cage & all enemies defeated?
      const allDead = enemies.every(x => x.dead);
      const nearCage = (player.x + player.w/2 > cage.x - 30 && player.x + player.w/2 < cage.x + cage.w + 30 &&
                       player.y + player.h/2 > cage.y - 30 && player.y + player.h/2 < cage.y + cage.h + 60);
      if (allDead && nearCage && state.cageBroken < 3) {
        state.cageBroken += 1;
        sfx('bash'); state.screenShake = 0.3;
        if (state.cageBroken === 1) speak('CLANG! Rusty bars bending...', 1400);
        if (state.cageBroken === 2) speak('CLANG! Almost there...', 1400);
        if (state.cageBroken >= 3) { openCage(); }
      } else {
        playerPunch();
      }
    }

    // Thistle — follow player, bite nearest enemy
    followerUpdate(thistle, dt, 52, 220, 1.2);
    allyFight(thistle, 54, 1, [1.0, 1.8]);

    // Inky Bin — follows slower, lobs ink
    followerUpdate(inkybin, dt, 90, 170, 1.0);
    inkybin.bob += dt * 3;
    inkybinFight();

    // Enemies
    for (const e of enemies) updateEnemy(e, dt);

    // Projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += 120 * dt; // gravity-ish on lobs
      p.life -= dt;
      if (p.life <= 0) { projectiles.splice(i, 1); continue; }
      if (p.team === 'ally') {
        for (const en of enemies) {
          if (en.dead) continue;
          if (p.x > en.x && p.x < en.x + en.w && p.y > en.y && p.y < en.y + en.h) {
            en.hp -= p.damage; en.hurtT = 0.25; en.vx += p.vx * 0.2;
            sfx('hit');
            if (en.hp <= 0) killEnemy(en);
            projectiles.splice(i, 1); break;
          }
        }
      } else if (p.team === 'enemy') {
        if (p.x > player.x && p.x < player.x + player.w && p.y > player.y && p.y < player.y + player.h) {
          damagePlayer(p.damage);
          projectiles.splice(i, 1);
        }
      }
    }

    // Mother escape
    if (state.motherFreed) {
      mother.y += -20 * dt; // brief float then walk-out ending triggers overlay
      state.endingT -= dt;
      if (state.endingT <= 0 && !state.victory) {
        state.victory = true;
        showEnd();
      }
    }

    justPressed.clear();

    // Camera centered on player
    const tx = player.x + player.w/2 - VIEW_W/2;
    const ty = player.y + player.h/2 - VIEW_H/2;
    cam.x += (tx - cam.x) * Math.min(1, dt * 3);
    cam.y += (ty - cam.y) * Math.min(1, dt * 3);
    cam.x = Math.max(0, Math.min(WORLD_W - VIEW_W, cam.x));
    cam.y = Math.max(0, Math.min(WORLD_H - VIEW_H, cam.y));
    if (state.screenShake > 0) {
      cam.x += (Math.random() - 0.5) * 10 * state.screenShake;
      cam.y += (Math.random() - 0.5) * 10 * state.screenShake;
    }
  }

  function followerUpdate(f, dt, followDist, maxSpeed, smoothing) {
    const tx = player.x - (f === thistle ? 30 : 44);
    const ty = player.y + (f === thistle ? 4 : 18);
    const dx = tx - f.x, dy = ty - f.y;
    const d = Math.hypot(dx, dy);
    if (d > followDist / 2) {
      const spd = Math.min(maxSpeed, d * smoothing) * dt;
      const nx = dx / (d || 1), ny = dy / (d || 1);
      moveWithCollision(f, nx * spd, ny * spd);
    }
    if (f.trail) {
      f.trail.push({ x: f.x + f.w/2, y: f.y + f.h/2 });
      if (f.trail.length > 16) f.trail.shift();
    }
  }

  function openCage() {
    state.objectives[1].done = true;
    sfx('open');
    state.screenFlash = 0.9;
    state.screenShake = 1.0;
    state.motherFreed = true;
    mother.freed = true;
    state.objectives[2].done = true;
    // Paced Mum-reunion: 6.5 seconds with scripted beats
    state.endingT = 6.5;
    speak('CRAAASH! The bars break open.', 2200);
    setTimeout(() => sfx('mum'), 500);
    setTimeout(() => {
      speak('Mum steps out, blinking in the torch light...', 2400);
    }, 2200);
    setTimeout(() => {
      speak('"Chester. Oh, Chester, my brave boy."', 2400);
      sfx('win');
    }, 4600);
  }

  // ---------- Render ----------
  function drawFloor() {
    // Dark arena floor with circular match ring
    ctx.fillStyle = '#120820';
    ctx.fillRect(ARENA.x1, ARENA.y1, ARENA.x2 - ARENA.x1, ARENA.y2 - ARENA.y1);
    // Cracked tiles
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1;
    for (let x = ARENA.x1; x < ARENA.x2; x += 80) {
      ctx.beginPath(); ctx.moveTo(x, ARENA.y1); ctx.lineTo(x, ARENA.y2); ctx.stroke();
    }
    for (let y = ARENA.y1; y < ARENA.y2; y += 80) {
      ctx.beginPath(); ctx.moveTo(ARENA.x1, y); ctx.lineTo(ARENA.x2, y); ctx.stroke();
    }
    // Red match ring in center
    const cx = WORLD_W/2, cy = (ARENA.y1 + ARENA.y2)/2;
    ctx.strokeStyle = 'rgba(227,77,111,0.35)'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(cx, cy, 320, 0, Math.PI*2); ctx.stroke();
    ctx.strokeStyle = 'rgba(227,77,111,0.2)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, 200, 0, Math.PI*2); ctx.stroke();
  }

  function drawWalls() {
    ctx.fillStyle = '#0a0310';
    ctx.fillRect(0, 0, WORLD_W, ARENA.y1);
    ctx.fillRect(0, ARENA.y2, WORLD_W, WORLD_H - ARENA.y2);
    ctx.fillRect(0, 0, ARENA.x1, WORLD_H);
    ctx.fillRect(ARENA.x2, 0, WORLD_W - ARENA.x2, WORLD_H);
    // Torches
    ctx.fillStyle = '#ff8a2e';
    const t = performance.now() / 180;
    for (const tx of [200, 600, 1000, 1400]) {
      const flicker = 10 + Math.sin(t + tx) * 3;
      ctx.beginPath(); ctx.arc(tx, ARENA.y1 - 30, flicker, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = 'rgba(255,180,80,0.25)';
      ctx.beginPath(); ctx.arc(tx, ARENA.y1 - 30, flicker + 10, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#ff8a2e';
    }
  }

  function drawCage() {
    // Cage frame
    const alpha = state.cageBroken >= 3 ? 0.2 : 1.0;
    ctx.save();
    ctx.globalAlpha = alpha;
    // Outer frame
    ctx.fillStyle = '#2a1a12'; ctx.strokeStyle = '#120a08'; ctx.lineWidth = 3;
    ctx.fillRect(cage.x, cage.y, cage.w, cage.h);
    ctx.strokeRect(cage.x + 0.5, cage.y + 0.5, cage.w - 1, cage.h - 1);
    // Bars (vertical)
    ctx.fillStyle = '#5a4030';
    for (let bx = cage.x + 12; bx < cage.x + cage.w - 6; bx += 14) {
      if (state.cageBroken >= 1 && bx > cage.x + 30 && bx < cage.x + 50) continue; // bent out
      if (state.cageBroken >= 2 && bx > cage.x + cage.w - 50 && bx < cage.x + cage.w - 30) continue;
      if (state.cageBroken >= 3 && bx > cage.x + cage.w/2 - 20 && bx < cage.x + cage.w/2 + 20) continue;
      ctx.fillRect(bx, cage.y + 8, 4, cage.h - 16);
    }
    // Horizontal bar
    ctx.fillRect(cage.x + 6, cage.y + 10, cage.w - 12, 5);
    ctx.fillRect(cage.x + 6, cage.y + cage.h - 14, cage.w - 12, 5);
    // Break effect
    if (state.cageBroken > 0) {
      ctx.strokeStyle = 'rgba(255, 220, 120, 0.7)';
      ctx.lineWidth = 2;
      for (let i = 0; i < state.cageBroken * 4; i++) {
        ctx.beginPath();
        ctx.moveTo(cage.x + 10 + Math.random() * (cage.w - 20), cage.y + 20);
        ctx.lineTo(cage.x + 10 + Math.random() * (cage.w - 20), cage.y + cage.h - 20);
        ctx.stroke();
      }
    }
    ctx.restore();
    // Sign on top
    ctx.fillStyle = '#e34d6f'; ctx.strokeStyle = '#1a0612'; ctx.lineWidth = 2;
    ctx.fillRect(cage.x + cage.w/2 - 30, cage.y - 20, 60, 18);
    ctx.strokeRect(cage.x + cage.w/2 - 30 + 0.5, cage.y - 19.5, 59, 17);
    ctx.fillStyle = '#fff'; ctx.font = '700 11px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('MUM', cage.x + cage.w/2, cage.y - 7);
  }

  function drawMother() {
    if (!mother.freed && state.cageBroken < 3) {
      // Inside cage
      const mx = cage.x + cage.w/2 - 25;
      const my = cage.y + 36;
      const img = buildMotherSprite();
      ctx.drawImage(img, mx, my);
    } else {
      // Free — walk out
      const img = buildMotherSprite();
      ctx.drawImage(img, mother.x, mother.y);
      // Heart
      ctx.fillStyle = '#ff6f8a';
      const ht = performance.now() / 250;
      ctx.font = `700 ${18 + Math.sin(ht) * 2}px system-ui`;
      ctx.textAlign = 'center';
      ctx.fillText('♥', mother.x + mother.w/2, mother.y - 10);
    }
  }

  function drawEnemy(e) {
    const bob = Math.sin(e.bob * 2) * 3;
    const y = e.y + bob;
    let img;
    if (e.kind === 'socky') img = buildSockySprite();
    else if (e.kind === 'expre') img = buildExPreshonSprite();
    else if (e.kind === 'exlena') img = buildExlenaSprite();
    else if (e.kind === 'drip') img = buildDripSprite();
    if (!img) return;
    ctx.save();
    if (e.dead) {
      const k = Math.max(0, e.deadT / 1.2);
      ctx.globalAlpha = k;
      ctx.translate(e.x + e.w/2, y + e.h/2);
      ctx.rotate((1 - k) * 0.8);
      ctx.translate(-e.w/2, -e.h/2);
      ctx.drawImage(img, 0, 0, e.w, e.h);
      ctx.restore();
      return;
    }
    if (e.hurtT > 0) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.drawImage(img, e.x, y, e.w, e.h);
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = `rgba(255, 255, 255, ${e.hurtT * 2})`;
      ctx.fillRect(e.x, y, e.w, e.h);
    } else {
      ctx.drawImage(img, e.x, y, e.w, e.h);
    }
    ctx.restore();
    // HP bar
    const hpRatio = e.hp / e.maxHp;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(e.x, y - 10, e.w, 5);
    ctx.fillStyle = hpRatio > 0.6 ? '#6ee870' : hpRatio > 0.3 ? '#ffd84a' : '#e34d6f';
    ctx.fillRect(e.x + 1, y - 9, (e.w - 2) * Math.max(0, hpRatio), 3);
  }

  function drawPlayerSprite() {
    const img = buildPlayerSprite(player.facing);
    ctx.save();
    if (state.hitCd > 0 && Math.floor(state.hitCd * 10) % 2 === 0) ctx.globalAlpha = 0.35;
    ctx.drawImage(img, player.x - 5, player.y - 20);
    ctx.restore();
    // Punch visual
    if (player.punchT > 0) {
      const px = player.x + player.w/2 + player.facing * 22;
      const py = player.y + player.h/2 - 6;
      ctx.fillStyle = '#ffd84a';
      ctx.strokeStyle = '#1a1024'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px, py, 8 + player.punchT * 14, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#1a1024';
      ctx.font = '900 10px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('POW', px, py + 3);
    }
  }

  function drawThistleFollower() {
    const img = buildThistleSprite();
    ctx.save();
    if (thistle.hurtT > 0 && Math.floor(thistle.hurtT * 20) % 2 === 0) ctx.globalAlpha = 0.5;
    ctx.drawImage(img, thistle.x - 10, thistle.y - 40);
    ctx.restore();
  }

  function drawInkyBin() {
    const img = buildInkyBinSprite();
    const bob = Math.sin(inkybin.bob) * 2;
    ctx.save();
    if (inkybin.hurtT > 0 && Math.floor(inkybin.hurtT * 20) % 2 === 0) ctx.globalAlpha = 0.5;
    ctx.drawImage(img, inkybin.x - 10, inkybin.y - 30 + bob);
    ctx.restore();
  }

  function drawProjectiles() {
    for (const p of projectiles) {
      if (p.team === 'ally') {
        ctx.fillStyle = '#1a0a28';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = 'rgba(100, 40, 200, 0.4)';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 3, 0, Math.PI*2); ctx.fill();
      } else {
        ctx.fillStyle = '#6fbfff';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.stroke();
      }
    }
  }

  function drawHUD() {
    ctx.save();
    // Top bar
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, VIEW_W, 46);
    // Hearts (HP)
    for (let i = 0; i < state.maxHp; i++) {
      const hx = 16 + i * 30;
      const filled = i < state.hp;
      ctx.fillStyle = filled ? '#e34d6f' : 'rgba(255,255,255,0.15)';
      drawHeart(hx, 14, 10);
    }
    // Objectives (right side)
    ctx.font = '600 12px system-ui'; ctx.textAlign = 'right';
    let oy = 14;
    for (const o of state.objectives) {
      ctx.fillStyle = o.done ? '#8dc16b' : '#f2e6d0';
      ctx.fillText((o.done ? '✓ ' : '• ') + o.text, VIEW_W - 12, oy);
      oy += 14;
    }
    // Count of enemies left
    const alive = enemies.filter(e => !e.dead).length;
    ctx.fillStyle = alive > 0 ? '#e34d6f' : '#8dc16b';
    ctx.font = '800 14px system-ui'; ctx.textAlign = 'left';
    ctx.fillText(`Horridors remaining: ${alive}`, 180, 26);
    // Controls hint
    ctx.font = '500 11px system-ui'; ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.textAlign = 'right';
    ctx.fillText('WASD / arrows · E = punch / bash', VIEW_W - 16, oy + 6);
    // Speaker line
    if (state.speakerLine && state.speakerT > 0) {
      ctx.fillStyle = 'rgba(20,10,30,0.85)';
      ctx.fillRect(VIEW_W/2 - 260, VIEW_H - 60, 520, 44);
      ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 2;
      ctx.strokeRect(VIEW_W/2 - 260 + 0.5, VIEW_H - 60 + 0.5, 519, 43);
      ctx.fillStyle = '#ffd84a';
      ctx.font = '700 14px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(state.speakerLine, VIEW_W/2, VIEW_H - 32);
    }
    if (state.screenFlash > 0) {
      ctx.fillStyle = `rgba(255, 220, 120, ${Math.min(0.4, state.screenFlash)})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    ctx.restore();
  }

  function drawHeart(x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x + s, y + s + s * 0.3);
    ctx.bezierCurveTo(x + s, y + s, x, y + s, x, y + s * 0.6);
    ctx.bezierCurveTo(x, y + s * 0.2, x + s * 0.3, y, x + s, y + s * 0.3);
    ctx.bezierCurveTo(x + s * 1.7, y, x + 2 * s, y + s * 0.2, x + 2 * s, y + s * 0.6);
    ctx.bezierCurveTo(x + 2 * s, y + s, x + s, y + s, x + s, y + s + s * 0.3);
    ctx.closePath(); ctx.fill();
  }

  function render() {
    ctx.fillStyle = '#080410';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    drawFloor();
    drawWalls();
    drawCage();
    drawMother();
    // Sort entities by y for proper overlap
    const rend = [];
    for (const e of enemies) rend.push({ y: e.y + e.h, kind: 'e', obj: e });
    rend.push({ y: player.y + player.h, kind: 'p' });
    rend.push({ y: thistle.y + thistle.h, kind: 't' });
    rend.push({ y: inkybin.y + inkybin.h, kind: 'b' });
    rend.sort((a, b) => a.y - b.y);
    for (const r of rend) {
      if (r.kind === 'e') drawEnemy(r.obj);
      else if (r.kind === 'p') drawPlayerSprite();
      else if (r.kind === 't') drawThistleFollower();
      else if (r.kind === 'b') drawInkyBin();
    }
    drawProjectiles();
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

  // Cutscene
  function showCutscene() {
    cutscene.active = true; cutscene.page = 0;
    const ov = document.getElementById('overlay-l8-intro');
    if (ov) { ov.classList.remove('hidden'); renderCutscenePage(); }
  }
  function renderCutscenePage() {
    const p = cutscene.pages[cutscene.page];
    document.getElementById('l8-intro-title').textContent = p.title;
    document.getElementById('l8-intro-text').textContent = p.text;
    document.getElementById('btn-l8-intro-next').textContent = (cutscene.page === cutscene.pages.length - 1) ? 'Begin' : 'Next →';
  }
  function advanceCutscene() {
    if (cutscene.page < cutscene.pages.length - 1) { cutscene.page++; renderCutscenePage(); }
    else { cutscene.active = false; document.getElementById('overlay-l8-intro').classList.add('hidden'); actuallyBegin(); }
  }

  function showEnd() {
    const ov = document.getElementById('overlay-l8-end');
    if (ov) ov.classList.remove('hidden');
  }

  function resetL8State() {
    state.scene = 'play';
    state.hp = state.maxHp; state.hitCd = 0;
    state.speakerLine = null; state.speakerT = 0;
    state.motherFreed = false; state.cageBroken = 0;
    state.victory = false; state.endingT = 0;
    state.screenFlash = 0; state.screenShake = 0;
    state.objectives.forEach(o => o.done = false);
    player.x = ARENA.x1 + 200; player.y = ARENA.y2 - 120; player.facing = 1;
    thistle.x = ARENA.x1 + 260; thistle.y = ARENA.y2 - 110; thistle.trail = [];
    thistle.atkCd = 0.8; thistle.hurtT = 0;
    inkybin.x = ARENA.x1 + 320; inkybin.y = ARENA.y2 - 100; inkybin.trail = [];
    inkybin.atkCd = 1.5; inkybin.hurtT = 0; inkybin.bob = 0;
    mother.x = cage.x + cage.w/2 - 25; mother.y = cage.y + 36; mother.freed = false;
    projectiles.length = 0;
    buildWorld();
    spawnEnemies();
  }

  function start() {
    const toHide = [
      'overlay-title','overlay-end','overlay-caught','overlay-notes',
      'overlay-l2-title','overlay-l2-end',
      'overlay-l3-title','overlay-l3-end',
      'overlay-l4-title','overlay-l4-end',
      'overlay-l5-intro','overlay-l5-end',
      'overlay-l6-intro','overlay-l6-end',
      'overlay-l7-intro','overlay-l7-end',
      'overlay-l8-end','overlay-credits',
    ];
    for (const id of toHide) document.getElementById(id)?.classList.add('hidden');
    const hud = document.getElementById('hud'); if (hud) hud.classList.add('hidden');
    const btnGems = document.getElementById('btn-gems'); if (btnGems) btnGems.style.display = 'none';
    showCutscene();
  }

  function actuallyBegin() {
    ensureAudio();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    startAmbient();
    resetL8State();
    if (!running) {
      running = true;
      window.addEventListener('keydown', keydown);
      window.addEventListener('keyup', keyup);
      window.addEventListener('blur', blur);
      lastT = performance.now();
      requestAnimationFrame(loop);
    }
    setTimeout(() => speak('DING! Knock them down. Allies will attack on their own.', 3400), 400);
  }

  document.getElementById('btn-l8-intro-next')?.addEventListener('click', advanceCutscene);
  document.getElementById('btn-l8-intro-skip')?.addEventListener('click', () => {
    cutscene.active = false;
    document.getElementById('overlay-l8-intro').classList.add('hidden');
    actuallyBegin();
  });
  document.getElementById('btn-l8-credits')?.addEventListener('click', () => {
    document.getElementById('overlay-l8-end').classList.add('hidden');
    running = false; stopAmbient();
    window.removeEventListener('keydown', keydown);
    window.removeEventListener('keyup', keyup);
    window.removeEventListener('blur', blur);
    if (window.__startCredits) window.__startCredits();
  });
  document.getElementById('btn-l8-home')?.addEventListener('click', () => {
    running = false; stopAmbient();
    window.removeEventListener('keydown', keydown);
    window.removeEventListener('keyup', keyup);
    window.removeEventListener('blur', blur);
    window.location.reload();
  });

  window.__startLevel8 = start;
  window.__horridorsL8 = {
    audioCtx: () => audioCtx, masterGain: () => masterGain,
    stop: () => {
      running = false; stopAmbient();
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', blur);
    },
  };
  console.log('[Level 8] Loaded. Call window.__startLevel8() to begin.');
})();
