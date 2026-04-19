// =====================================================================
// HORRIDORS - LEVEL 6: SOCKY SHOK'S ROOM (the betrayal)
// Socky Shok reveals he was never our friend. He attacks with bouncing
// zaps. Chester + Thistle must grab 3 power-plugs and unplug Socky
// before the zaps run us down.
// Standalone module; boots via window.__startLevel6().
// Optimised: sprite bitmap cache for Socky and plug props so the main
// loop does one drawImage call per frame instead of dozens of path ops.
// =====================================================================
(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const VIEW_W = canvas.width;
  const VIEW_H = canvas.height;

  // Arena world
  const WORLD_W = 1600, WORLD_H = 900;
  const ARENA = { x1: 80, x2: WORLD_W - 80, y1: 140, y2: WORLD_H - 100 };

  const cam = { x: 0, y: 0 };

  // ---------- State ----------
  const state = {
    scene: 'title',
    speakerLine: null, speakerT: 0,
    muted: false,
    socky: { x: WORLD_W / 2 - 40, y: 220, w: 80, h: 96, angry: false, phase: 0, zapCd: 2.2, bob: 0, shake: 0, defeated: false },
    plugs: [], // {x,y,w,h,collected}
    pluggedCount: 0,
    hp: 3,
    hitCd: 0,
    ending: false,
    shockwave: 0,
    screenFlash: 0,
    objectives: [
      { id: 'plugs', text: 'Pull 3 of Socky\'s power plugs', done: false },
      { id: 'unplug', text: 'Unplug Socky Shok at the socket', done: false },
    ],
  };

  const zaps = []; // {x,y,vx,vy,life,r}

  // Cutscene (intro)
  const cutscene = {
    active: false,
    page: 0,
    pages: [
      { title: 'Socky Shok\'s Room',
        text: 'A tangle of wires. Old arcade lights. Socky Shok is swaying in the middle of the rug — his grin too wide, too still.' },
      { title: 'He was pretending',
        text: '"Hehe. You actually trusted me? The socks were a JOKE, kid. Mum stays right where she is."' },
      { title: 'Plan',
        text: 'Three big plug-sockets keep him powered. Yank all three — Chester with the Grabpack, Thistle covering us — then pull the final plug to unplug him.' },
      { title: 'Watch the zaps',
        text: 'He throws slow blue zaps. Keep moving. 3 hits and you\'re toast. The plugs are heavy — grab one, sprint back to the socket.' },
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
    const prev = window.__horridorsL5 || window.__horridorsL4 || window.__horridorsL3 || window.__horridorsL2 || window.__horridorsL1;
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
    const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    o.connect(g).connect(masterGain);
    o.start(); o.stop(audioCtx.currentTime + dur);
  }
  function sfx(name) {
    if (!audioCtx || state.muted) return;
    switch (name) {
      case 'zap': tone(660, 0.18, 'sawtooth', 0.2); setTimeout(() => tone(520, 0.12, 'sawtooth', 0.16), 60); break;
      case 'hit': tone(140, 0.35, 'sawtooth', 0.24); break;
      case 'plug': tone(880, 0.12, 'triangle', 0.2); setTimeout(() => tone(1320, 0.1, 'triangle', 0.18), 90); break;
      case 'unplug': [440, 330, 220, 110].forEach((f,i) => setTimeout(() => tone(f, 0.3, 'sawtooth', 0.24), i * 120)); break;
      case 'laugh': [240,280,260,300].forEach((f,i) => setTimeout(() => tone(f, 0.08, 'square', 0.18), i * 70)); break;
      case 'win': [523,659,784,1047,1320].forEach((f,i)=>setTimeout(()=>tone(f,0.2,'triangle',0.25), i*110)); break;
    }
  }
  let ambientNodes = null;
  function startAmbient() { if (audioCtx && window.HorridorsAmbient) ambientNodes = window.HorridorsAmbient.start(audioCtx, masterGain, { mood: 'abyss' }); if (audioCtx && window.HorridorsMusic) window.HorridorsMusic.setTheme(audioCtx, masterGain, 'l6'); }
  function stopAmbient() { if (ambientNodes && ambientNodes.stop) ambientNodes.stop(); ambientNodes = null; }

  function speak(line, duration = 3000) { state.speakerLine = line; state.speakerT = duration / 1000; }

  // ---------- Player ----------
  const player = { x: 200, y: 700, w: 22, h: 28, vx: 0, vy: 0, facing: 1, step: 0, carrying: false };
  const thistle = { x: 240, y: 720, w: 20, h: 26, trail: [], waveT: 0 };

  // ---------- Obstacles ----------
  const obstacles = [];
  function addWall(x, y, w, h) { obstacles.push({ x, y, w, h }); }
  function buildWorld() {
    obstacles.length = 0;
    // outer walls
    addWall(0, 0, WORLD_W, ARENA.y1);
    addWall(0, ARENA.y2, WORLD_W, WORLD_H - ARENA.y2);
    addWall(0, 0, ARENA.x1, WORLD_H);
    addWall(ARENA.x2, 0, WORLD_W - ARENA.x2, WORLD_H);
    // decorative speakers (solid)
    addWall(180, ARENA.y2 - 60, 60, 60);
    addWall(WORLD_W - 240, ARENA.y2 - 60, 60, 60);
  }

  // 3 plugs around the arena
  function spawnPlugs() {
    state.plugs = [
      { id: 0, x: ARENA.x1 + 80,    y: ARENA.y1 + 80, w: 28, h: 36, collected: false, homeX: ARENA.x1 + 80,    homeY: ARENA.y1 + 80 },
      { id: 1, x: ARENA.x2 - 110,   y: ARENA.y1 + 80, w: 28, h: 36, collected: false, homeX: ARENA.x2 - 110,   homeY: ARENA.y1 + 80 },
      { id: 2, x: WORLD_W/2 - 14,   y: ARENA.y2 - 110, w: 28, h: 36, collected: false, homeX: WORLD_W/2 - 14,   homeY: ARENA.y2 - 110 },
    ];
  }
  // Central socket (where you return the plugs)
  const SOCKET = { x: WORLD_W/2 - 34, y: 460, w: 68, h: 48 };

  // Coins strewn around Socky's room (gold pickups)
  const coins = [
    { x: 180,  y: 260, got: false, v: 1 },
    { x: 320,  y: 720, got: false, v: 1 },
    { x: 560,  y: 300, got: false, v: 2 },
    { x: 1040, y: 300, got: false, v: 2 },
    { x: 1260, y: 720, got: false, v: 1 },
    { x: 1440, y: 260, got: false, v: 1 },
    { x: WORLD_W/2, y: 620, got: false, v: 2 },
  ];

  // ---------- Sprite cache (offscreen canvases) ----------
  const cache = {};
  function spriteCache(key, w, h, drawFn) {
    if (cache[key]) return cache[key];
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    drawFn(g);
    cache[key] = c;
    return c;
  }

  function buildSockySprite(angry) {
    // Based on /home/user/workspace/35283.jpg — blue spherical sock
    // puppet with lightning jag eye and wide zigzag mouth
    return spriteCache('socky_' + (angry?'a':'n'), 120, 140, (g) => {
      g.lineJoin = 'round'; g.lineCap = 'round';
      // Shadow
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.beginPath(); g.ellipse(60, 132, 28, 5, 0, 0, Math.PI*2); g.fill();
      // Legs (dangly wires)
      g.strokeStyle = '#222'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(46, 108); g.lineTo(40, 126); g.stroke();
      g.beginPath(); g.moveTo(74, 108); g.lineTo(82, 126); g.stroke();
      // Body — a big teal-blue sock
      const bodyColor = angry ? '#3aa5c2' : '#4cb9d6';
      g.fillStyle = bodyColor;
      g.strokeStyle = '#0e1e26'; g.lineWidth = 3;
      g.beginPath();
      g.moveTo(34, 110);
      g.quadraticCurveTo(20, 60, 30, 30);
      g.quadraticCurveTo(45, 8, 62, 10);
      g.quadraticCurveTo(88, 14, 96, 40);
      g.quadraticCurveTo(104, 80, 96, 108);
      g.quadraticCurveTo(80, 120, 60, 120);
      g.quadraticCurveTo(40, 120, 34, 110);
      g.closePath(); g.fill(); g.stroke();
      // Sock cuff band
      g.fillStyle = angry ? '#d83a68' : '#e0557a';
      g.fillRect(34, 104, 62, 8);
      g.strokeRect(34 + 0.5, 104 + 0.5, 62 - 1, 8 - 1);
      // Lightning jag — zigzag across face (signature shock line)
      g.strokeStyle = '#fff2a8'; g.lineWidth = 4;
      g.beginPath();
      g.moveTo(34, 52); g.lineTo(50, 44); g.lineTo(44, 64); g.lineTo(64, 56); g.lineTo(58, 76); g.lineTo(80, 68);
      g.stroke();
      // Eyes (two big circle eyes)
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(48, 36, 9, 0, Math.PI*2); g.fill();
      g.beginPath(); g.arc(76, 36, 9, 0, Math.PI*2); g.fill();
      g.strokeStyle = '#0e1e26'; g.lineWidth = 2;
      g.beginPath(); g.arc(48, 36, 9, 0, Math.PI*2); g.stroke();
      g.beginPath(); g.arc(76, 36, 9, 0, Math.PI*2); g.stroke();
      g.fillStyle = '#0e1e26';
      const pupX = angry ? 2 : 0;
      g.beginPath(); g.arc(48 + pupX, 37, 4, 0, Math.PI*2); g.fill();
      g.beginPath(); g.arc(76 + pupX, 37, 4, 0, Math.PI*2); g.fill();
      // Mouth — zigzag showing teeth
      g.strokeStyle = '#0e1e26'; g.lineWidth = 2.5;
      g.fillStyle = '#2a0c14';
      g.beginPath();
      g.moveTo(40, 84);
      g.lineTo(48, 78); g.lineTo(54, 88); g.lineTo(62, 78);
      g.lineTo(70, 88); g.lineTo(78, 78); g.lineTo(86, 84);
      g.lineTo(82, 94); g.lineTo(44, 94);
      g.closePath(); g.fill(); g.stroke();
      // Angry eyebrows
      if (angry) {
        g.strokeStyle = '#0e1e26'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(40, 22); g.lineTo(58, 30); g.stroke();
        g.beginPath(); g.moveTo(90, 22); g.lineTo(72, 30); g.stroke();
      }
    });
  }

  function buildPlugSprite() {
    return spriteCache('plug', 32, 40, (g) => {
      g.lineJoin = 'round';
      // Cord loop on top
      g.strokeStyle = '#141414'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(16, 0); g.quadraticCurveTo(6, 6, 10, 14); g.stroke();
      // Plug body
      g.fillStyle = '#1a1a1a';
      g.beginPath();
      g.moveTo(4, 12); g.lineTo(28, 12); g.lineTo(28, 32); g.lineTo(4, 32); g.closePath();
      g.fill();
      g.strokeStyle = '#0e0e0e'; g.lineWidth = 2;
      g.stroke();
      // Prongs
      g.fillStyle = '#c8c8c8';
      g.fillRect(10, 32, 3, 7);
      g.fillRect(19, 32, 3, 7);
      // Highlight
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(6, 14, 20, 3);
    });
  }

  function buildSocketSprite() {
    return spriteCache('socket', 72, 52, (g) => {
      g.fillStyle = '#e8e1d4';
      g.beginPath();
      g.moveTo(6, 0); g.lineTo(66, 0); g.lineTo(72, 6); g.lineTo(72, 46); g.lineTo(66, 52);
      g.lineTo(6, 52); g.lineTo(0, 46); g.lineTo(0, 6); g.closePath(); g.fill();
      g.strokeStyle = '#1a1410'; g.lineWidth = 2; g.stroke();
      // Three plug holes (pairs of prong slits)
      for (let i = 0; i < 3; i++) {
        const cx = 14 + i * 22, cy = 26;
        g.fillStyle = '#2a1810';
        g.beginPath(); g.arc(cx, cy, 7, 0, Math.PI*2); g.fill();
        g.fillStyle = '#000';
        g.fillRect(cx - 3, cy - 4, 1.5, 8);
        g.fillRect(cx + 1.5, cy - 4, 1.5, 8);
      }
    });
  }

  function buildPlayerSprite(facing) {
    return spriteCache('player_' + facing, 32, 48, (g) => {
      g.lineJoin = 'round'; g.lineCap = 'round';
      const cx = 16, cy = 46;
      const f = facing; const s = 1;
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.beginPath(); g.ellipse(cx, cy + 2, 12, 3, 0, 0, Math.PI*2); g.fill();
      g.strokeStyle = '#141414'; g.lineWidth = 2;
      g.fillStyle = '#3b2a6e';
      g.fillRect(cx - 7, cy - 6, 5, 8); g.fillRect(cx + 2, cy - 6, 5, 8);
      g.strokeRect(cx - 7 + 0.5, cy - 6 + 0.5, 4, 7); g.strokeRect(cx + 2 + 0.5, cy - 6 + 0.5, 4, 7);
      g.fillStyle = '#f6d854';
      g.beginPath(); g.moveTo(cx-10, cy-6); g.lineTo(cx-11, cy-22); g.lineTo(cx+11, cy-22); g.lineTo(cx+10, cy-6); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#c49a2a'; g.beginPath(); g.arc(cx, cy-14, 1.5, 0, Math.PI*2); g.fill();
      g.fillStyle = '#f6d854'; g.beginPath(); g.arc(cx, cy-26, 9, 0, Math.PI*2); g.fill(); g.stroke();
      g.fillStyle = '#f5d2aa'; g.beginPath(); g.arc(cx, cy-26, 6, 0, Math.PI*2); g.fill();
      g.fillStyle = '#141414';
      g.beginPath(); g.arc(cx - 2 + f*0.5, cy-26, 0.9, 0, Math.PI*2); g.fill();
      g.beginPath(); g.arc(cx + 2 + f*0.5, cy-26, 0.9, 0, Math.PI*2); g.fill();
      g.strokeStyle = '#141414'; g.lineWidth = 1.2;
      g.beginPath(); g.arc(cx, cy-23, 1.4, 0.1*Math.PI, 0.9*Math.PI); g.stroke();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(cx + f*10, cy-20, 1.8, 0, Math.PI*2); g.fill();
    });
  }

  function buildThistleSprite() {
    return spriteCache('thistle', 40, 70, (g) => {
      const cx = 20, cy = 66; const s = 0.9;
      g.lineJoin = 'round'; g.lineCap = 'round';
      g.fillStyle = 'rgba(0,0,0,0.2)';
      g.beginPath(); g.ellipse(cx, cy + 2, 14, 3, 0, 0, Math.PI*2); g.fill();
      g.strokeStyle = '#141414'; g.lineWidth = 2;
      g.fillStyle = '#fbd34a';
      g.beginPath(); g.ellipse(cx, cy - 18*s, 12*s, 12*s, 0, 0, Math.PI*2); g.fill(); g.stroke();
      g.beginPath(); g.ellipse(cx, cy - 36*s, 12*s, 12*s, 0, 0, Math.PI*2); g.fill(); g.stroke();
      // Ears
      g.beginPath(); g.moveTo(cx - 8*s, cy - 45*s); g.lineTo(cx - 14*s, cy - 58*s); g.lineTo(cx - 4*s, cy - 47*s); g.closePath(); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(cx + 4*s, cy - 47*s); g.lineTo(cx + 12*s, cy - 58*s); g.lineTo(cx + 8*s, cy - 45*s); g.closePath(); g.fill(); g.stroke();
      // Hat
      g.fillStyle = '#f7c7d8'; g.fillRect(cx - 10*s, cy - 46*s, 20*s, 3*s);
      g.fillStyle = '#fbd34a';
      g.beginPath(); g.moveTo(cx - 8*s, cy - 46*s); g.lineTo(cx - 6*s, cy - 55*s); g.lineTo(cx + 6*s, cy - 55*s); g.lineTo(cx + 8*s, cy - 46*s); g.closePath(); g.fill(); g.stroke();
      // Star on hat
      g.fillStyle = '#ffd84a'; g.strokeStyle = '#141414';
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI/2 + i * Math.PI/5;
        const r = (i%2===0)?3*s:1.3*s;
        const px = cx + Math.cos(a)*r, py = cy - 53*s + Math.sin(a)*r;
        if (i===0) g.moveTo(px,py); else g.lineTo(px,py);
      }
      g.closePath(); g.fill(); g.stroke();
      // Eyes + smile
      g.fillStyle = '#fff';
      g.beginPath(); g.ellipse(cx-5*s, cy-37*s, 3*s, 3.5*s, 0, 0, Math.PI*2); g.fill();
      g.beginPath(); g.ellipse(cx+5*s, cy-37*s, 3*s, 3.5*s, 0, 0, Math.PI*2); g.fill();
      g.fillStyle = '#141414';
      g.beginPath(); g.arc(cx-5*s, cy-37*s, 1.3*s, 0, Math.PI*2); g.fill();
      g.beginPath(); g.arc(cx+5*s, cy-37*s, 1.3*s, 0, Math.PI*2); g.fill();
      g.strokeStyle = '#141414'; g.lineWidth = 1.6;
      g.beginPath(); g.arc(cx, cy-32*s, 4*s, 0.2*Math.PI, 0.8*Math.PI); g.stroke();
      // Chest star
      g.fillStyle = '#fff08a';
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI/2 + i * Math.PI/5;
        const r = (i%2===0)?5*s:2*s;
        const px = cx + Math.cos(a)*r, py = cy - 18*s + Math.sin(a)*r;
        if (i===0) g.moveTo(px,py); else g.lineTo(px,py);
      }
      g.closePath(); g.fill(); g.stroke();
    });
  }

  // ---------- Puzzle / combat ----------
  function fireZap() {
    if (state.socky.defeated) return;
    const sx = state.socky.x + state.socky.w / 2;
    const sy = state.socky.y + state.socky.h / 2;
    const tx = player.x + player.w/2 + (Math.random() - 0.5) * 60;
    const ty = player.y + player.h/2;
    const dx = tx - sx, dy = ty - sy;
    const d = Math.hypot(dx, dy) || 1;
    const _dL6 = (window.__difficulty && window.__difficulty.get()) || { speedMul: 1 };
    const spd = 210 * _dL6.speedMul;
    zaps.push({ x: sx, y: sy, vx: dx/d * spd, vy: dy/d * spd, life: 4, r: 10 });
    sfx('zap');
  }

  function rectIntersect(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

  function tryPickPlug() {
    if (player.carrying) return;
    for (const p of state.plugs) {
      if (p.collected) continue;
      if (rectIntersect(player, { x: p.x - 6, y: p.y - 6, w: p.w + 12, h: p.h + 12 })) {
        player.carrying = p;
        sfx('plug');
        speak("Plug in hand. Run it to the socket!", 2400);
        return;
      }
    }
  }
  function tryPlugInSocket() {
    if (!player.carrying) return;
    if (rectIntersect(player, { x: SOCKET.x - 10, y: SOCKET.y - 10, w: SOCKET.w + 20, h: SOCKET.h + 20 })) {
      const p = player.carrying;
      p.collected = true;
      player.carrying = null;
      state.pluggedCount++;
      sfx('unplug');
      state.socky.shake = 1.2;
      state.screenFlash = 0.6;
      if (state.pluggedCount >= 3) {
        state.objectives.find(o => o.id === 'plugs').done = true;
        speak("ONE TO GO! Unplug Socky now (E) at the socket!", 3200);
      } else {
        speak(`Plug ${state.pluggedCount}/3 in. Get the next!`, 2200);
      }
      if (window.HorridorsTasks) window.HorridorsTasks.refresh();
    }
  }
  function tryFinalUnplug() {
    if (state.pluggedCount < 3 || state.socky.defeated) return;
    if (rectIntersect(player, { x: SOCKET.x - 12, y: SOCKET.y - 12, w: SOCKET.w + 24, h: SOCKET.h + 24 })) {
      state.socky.defeated = true;
      state.objectives.find(o => o.id === 'unplug').done = true;
      sfx('win');
      speak("ZZZZt... Socky Shok powers down. We did it.", 2600);
      setTimeout(() => {
        speak("He was never a friend. The Horridors just made him that way.", 2800);
      }, 2600);
      setTimeout(() => {
        speak("Come on, Chester — one more door. One more monster.", 2600);
      }, 5400);
      setTimeout(() => {
        state.ending = true;
        state.scene = 'end';
        document.getElementById('overlay-l6-end')?.classList.remove('hidden');
      }, 8200);
    }
  }

  // ---------- Movement / collisions ----------
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
    if (state.speakerT > 0) state.speakerT -= dt;
    if (state.hitCd > 0) state.hitCd -= dt;
    if (state.socky.shake > 0) state.socky.shake -= dt;
    if (state.screenFlash > 0) state.screenFlash -= dt;

    // Socky bobbing + zap fire
    state.socky.bob = Math.sin(performance.now() / 400) * 6;
    state.socky.zapCd -= dt;
    if (state.socky.zapCd <= 0 && !state.socky.defeated) {
      fireZap();
      // Faster as more plugs pulled (he's angrier) — min 0.8s, scaled by aggression
      const _dAgg = (window.__difficulty && window.__difficulty.get()) || { aggroMul: 1 };
      const baseCd = Math.max(0.75, 2.1 - state.pluggedCount * 0.35);
      state.socky.zapCd = baseCd / Math.max(0.5, _dAgg.aggroMul);
    }

    // Input — move
    let dx = 0, dy = 0;
    if (keys.has('arrowleft') || keys.has('a')) { dx -= 1; player.facing = -1; }
    if (keys.has('arrowright') || keys.has('d')) { dx += 1; player.facing = 1; }
    if (keys.has('arrowup') || keys.has('w')) dy -= 1;
    if (keys.has('arrowdown') || keys.has('s')) dy += 1;
    if (dx && dy) { dx *= 0.707; dy *= 0.707; }
    const SPEED = player.carrying ? 150 : 200;
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

    // Interact
    if (wasPressed('e')) {
      if (state.pluggedCount >= 3) { tryFinalUnplug(); }
      else if (player.carrying) { tryPlugInSocket(); }
      else { tryPickPlug(); }
    }

    // Coin pickups
    if (window.HorridorsWallet) {
      const pcx = player.x + player.w/2, pcy = player.y + player.h/2;
      for (const c of coins) {
        if (c.got) continue;
        if (Math.hypot(pcx - c.x, pcy - c.y) < 22) {
          c.got = true;
          window.HorridorsWallet.addCoins(c.v);
          sfx('plug');
        }
      }
    }

    // Update zaps
    for (const z of zaps) {
      z.x += z.vx * dt; z.y += z.vy * dt; z.life -= dt;
      // Hit player
      const dxp = (z.x) - (player.x + player.w/2);
      const dyp = (z.y) - (player.y + player.h/2);
      if (state.hitCd <= 0 && Math.hypot(dxp, dyp) < z.r + 14) {
        z.life = 0;
        state.hitCd = 1.3;
        state.hp--;
        state.screenFlash = 0.8;
        sfx('hit');
        if (state.hp <= 0) {
          // Reset arena
          speak("Too many shocks! Try again.", 2400);
          state.hp = 3;
          state.pluggedCount = 0;
          player.x = 200; player.y = 700; player.carrying = null;
          state.plugs.forEach(p => { p.collected = false; p.x = p.homeX; p.y = p.homeY; });
          state.objectives.forEach(o => o.done = false);
          zaps.length = 0;
        } else {
          speak(`Ouch! ${state.hp} hits left.`, 1800);
        }
      }
      // Hit walls — kill zap
      if (z.x < ARENA.x1 || z.x > ARENA.x2 || z.y < ARENA.y1 || z.y > ARENA.y2) z.life = 0;
    }
    for (let i = zaps.length - 1; i >= 0; i--) if (zaps[i].life <= 0) zaps.splice(i, 1);

    // Camera follows player
    let tCamX = player.x + player.w/2 - VIEW_W/2;
    let tCamY = player.y + player.h/2 - VIEW_H/2;
    tCamX = Math.max(0, Math.min(WORLD_W - VIEW_W, tCamX));
    tCamY = Math.max(0, Math.min(WORLD_H - VIEW_H, tCamY));
    cam.x += (tCamX - cam.x) * Math.min(1, dt * 6);
    cam.y += (tCamY - cam.y) * Math.min(1, dt * 6);

    if (window.HorridorsTasks) window.HorridorsTasks.refresh('l6', l6DoneIds);
    justPressed.clear();
  }

  function l6DoneIds() {
    const done = new Set();
    if (state.pluggedCount >= 3) done.add('plugs');
    if (state.socky.defeated) done.add('unplug');
    return done;
  }
  function registerTasks() {
    if (!window.HorridorsTasks) return;
    window.HorridorsTasks.setLevel('l6', 'Level 6 — Tasks', [
      { id: 'plugs', label: 'Pull 3 of Socky\'s power plugs' },
      { id: 'unplug', label: 'Unplug Socky at the main socket' },
    ], l6DoneIds);
  }

  // ---------- Render ----------
  function drawFloor() {
    const grad = ctx.createLinearGradient(0, ARENA.y1, 0, ARENA.y2);
    grad.addColorStop(0, '#2a1040');
    grad.addColorStop(1, '#120820');
    ctx.fillStyle = grad;
    ctx.fillRect(ARENA.x1, ARENA.y1, ARENA.x2 - ARENA.x1, ARENA.y2 - ARENA.y1);
    // Rug in the middle
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#6a2530';
    ctx.fillRect(WORLD_W/2 - 180, 380, 360, 220);
    ctx.strokeStyle = '#3a0f18'; ctx.lineWidth = 3;
    ctx.strokeRect(WORLD_W/2 - 180, 380, 360, 220);
    ctx.fillStyle = '#8a3040';
    for (let i = 0; i < 6; i++) {
      ctx.fillRect(WORLD_W/2 - 170 + i*60, 398, 40, 8);
      ctx.fillRect(WORLD_W/2 - 170 + i*60, 578, 40, 8);
    }
    ctx.restore();
    // Checker tiles hint
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1;
    for (let x = ARENA.x1; x < ARENA.x2; x += 80) { ctx.beginPath(); ctx.moveTo(x, ARENA.y1); ctx.lineTo(x, ARENA.y2); ctx.stroke(); }
    for (let y = ARENA.y1; y < ARENA.y2; y += 80) { ctx.beginPath(); ctx.moveTo(ARENA.x1, y); ctx.lineTo(ARENA.x2, y); ctx.stroke(); }
  }
  function drawWalls() {
    ctx.fillStyle = '#0e0716';
    ctx.fillRect(0, 0, WORLD_W, ARENA.y1);
    ctx.fillRect(0, ARENA.y2, WORLD_W, WORLD_H - ARENA.y2);
    ctx.fillRect(0, 0, ARENA.x1, WORLD_H);
    ctx.fillRect(ARENA.x2, 0, WORLD_W - ARENA.x2, WORLD_H);
    // Speakers
    ctx.fillStyle = '#221822';
    ctx.fillRect(180, ARENA.y2 - 60, 60, 60);
    ctx.fillRect(WORLD_W - 240, ARENA.y2 - 60, 60, 60);
    ctx.fillStyle = '#0a060f';
    ctx.beginPath(); ctx.arc(210, ARENA.y2 - 30, 18, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(WORLD_W - 210, ARENA.y2 - 30, 18, 0, Math.PI*2); ctx.fill();
    // Wires coming out of ceiling near Socky
    ctx.strokeStyle = '#2a1a2a'; ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      const x = 640 + i * 50;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + 10, 60, x - 20, 120, state.socky.x + state.socky.w/2 + (i-3)*8, state.socky.y + 30);
      ctx.stroke();
    }
  }
  function drawSocket() {
    const sprite = buildSocketSprite();
    ctx.drawImage(sprite, SOCKET.x, SOCKET.y);
    // Plug counter on socket
    for (let i = 0; i < 3; i++) {
      const filled = i < state.pluggedCount;
      ctx.fillStyle = filled ? '#7aff8a' : '#222';
      ctx.fillRect(SOCKET.x + 12 + i*22, SOCKET.y + 10, 10, 4);
    }
    // Hint
    const near = rectIntersect(player, { x: SOCKET.x - 10, y: SOCKET.y - 10, w: SOCKET.w + 20, h: SOCKET.h + 20 });
    if (near) {
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.font = '700 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      let hint = 'E: pick plug';
      if (player.carrying) hint = 'E: plug in';
      else if (state.pluggedCount >= 3) hint = 'E: PULL THE MAIN PLUG';
      ctx.fillText(hint, SOCKET.x + SOCKET.w/2, SOCKET.y - 10);
    }
  }
  function drawPlugs() {
    const sprite = buildPlugSprite();
    for (const p of state.plugs) {
      if (p.collected) continue;
      // Floating bob
      const bob = Math.sin(performance.now() / 300 + p.id) * 3;
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#ffd84a';
      ctx.beginPath(); ctx.arc(p.x + p.w/2, p.y + p.h/2 + bob, 22, 0, Math.PI*2); ctx.fill();
      ctx.restore();
      ctx.drawImage(sprite, p.x, p.y + bob);
    }
    if (player.carrying) {
      // Draw carried plug above player
      ctx.drawImage(sprite, player.x - 3, player.y - 30);
    }
  }
  function drawSocky() {
    if (window.HorridorsSprites && window.HorridorsSprites.drawCharacter) {
      window.HorridorsSprites.drawCharacter(ctx, 'sockyshok', socky.x + socky.w/2, socky.y + socky.h + 6, 1, 72);
      return;
    }
}
  function drawZaps() {
    for (const z of zaps) {
      ctx.save();
      const a = 0.6 + 0.4 * Math.sin(performance.now() / 80);
      ctx.globalAlpha = a;
      const g = ctx.createRadialGradient(z.x, z.y, 2, z.x, z.y, z.r * 2.5);
      g.addColorStop(0, '#aef0ff');
      g.addColorStop(0.5, '#4ab8ff');
      g.addColorStop(1, 'rgba(70,60,160,0)');
      ctx.fillStyle = g;
      ctx.fillRect(z.x - z.r*2.5, z.y - z.r*2.5, z.r*5, z.r*5);
      ctx.globalAlpha = 1;
      // Core
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(z.x, z.y, z.r * 0.5, 0, Math.PI*2); ctx.fill();
      // Jagged outline
      ctx.strokeStyle = '#e0f6ff'; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a2 = i / 6 * Math.PI * 2 + performance.now() / 300;
        const r = z.r + (i % 2 === 0 ? 3 : -2);
        const px = z.x + Math.cos(a2) * r, py = z.y + Math.sin(a2) * r;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.stroke();
      ctx.restore();
    }
  }
  function drawPlayerSprite() {
    if (window.HorridorsSprites && window.HorridorsSprites.drawCharacter) {
      window.HorridorsSprites.drawCharacter(ctx, 'chester', player.x + player.w/2, player.y + player.h + 8, (player.facing !== undefined ? (Math.cos(player.facing) >= 0 ? 1 : -1) : 1), 56);
      return;
    }
}
  function drawThistleFollower() {
    if (window.HorridorsSprites && window.HorridorsSprites.drawCharacter) {
      window.HorridorsSprites.drawCharacter(ctx, 'thistle', thistle.x, thistle.y + 8, 1, 56);
      return;
    }
}
  function drawHUD() {
    ctx.save();
    ctx.resetTransform && ctx.resetTransform();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, VIEW_W, 30);
    ctx.fillStyle = '#6fe0c5';
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText("LEVEL 6 — SOCKY SHOK'S ROOM", 10, 15);
    // HP hearts
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
    // Plug counter
    ctx.fillStyle = '#fff';
    ctx.font = '700 12px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(`Plugs pulled: ${state.pluggedCount}/3`, 10, 48);
    // Speaker line
    if (state.speakerLine && state.speakerT > 0) {
      const line = state.speakerLine;
      const w = Math.min(VIEW_W - 60, 700);
      const x = (VIEW_W - w) / 2, y = VIEW_H - 70;
      ctx.fillStyle = 'rgba(0,0,0,0.78)';
      ctx.fillRect(x, y, w, 48);
      ctx.strokeStyle = '#6fe0c5'; ctx.lineWidth = 2;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 48 - 1);
      ctx.fillStyle = '#fff';
      ctx.font = '600 14px system-ui';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(line, VIEW_W/2, y + 24);
    }
    // Flash
    if (state.screenFlash > 0) {
      ctx.fillStyle = `rgba(255, 120, 120, ${Math.min(0.4, state.screenFlash)})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
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
    drawSocket();
    drawPlugs();
    drawSocky();
    drawZaps();
    // Coins
    if (window.HorridorsSprites) {
      const t = performance.now();
      for (const c of coins) if (!c.got) window.HorridorsSprites.drawCoin(ctx, c.x, c.y, t, 7);
    }
    drawThistleFollower();
    drawPlayerSprite();
    ctx.restore();
    drawHUD();
  }

  // ---------- Loop ----------
  let running = false; let lastT = 0;
  function loop(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    update(dt); render();
    requestAnimationFrame(loop);
  }

  // ---------- Cutscene ----------
  function showCutscene() {
    cutscene.active = true; cutscene.page = 0;
    const ov = document.getElementById('overlay-l6-intro');
    if (ov) { ov.classList.remove('hidden'); renderCutscenePage(); }
  }
  function renderCutscenePage() {
    const p = cutscene.pages[cutscene.page];
    document.getElementById('l6-intro-title').textContent = p.title;
    document.getElementById('l6-intro-text').textContent = p.text;
    document.getElementById('btn-l6-intro-next').textContent = (cutscene.page === cutscene.pages.length - 1) ? 'Begin' : 'Next →';
  }
  function advanceCutscene() {
    if (cutscene.page < cutscene.pages.length - 1) { cutscene.page++; renderCutscenePage(); }
    else { cutscene.active = false; document.getElementById('overlay-l6-intro').classList.add('hidden'); actuallyBegin(); }
  }

  function resetL6State() {
    state.scene = 'play';
    state.socky.defeated = false;
    state.pluggedCount = 0; state.hp = 3;
    state.ending = false; state.hitCd = 0;
    state.speakerLine = null; state.speakerT = 0;
    state.screenFlash = 0; state.socky.shake = 0;
    state.objectives.forEach(o => o.done = false);
    player.x = 200; player.y = 700; player.carrying = null; player.facing = 1;
    thistle.x = 240; thistle.y = 720; thistle.trail = [];
    zaps.length = 0;
    spawnPlugs();
    buildWorld();
  }

  function start() {
    const toHide = [
      'overlay-title','overlay-end','overlay-caught','overlay-notes',
      'overlay-l2-title','overlay-l2-end',
      'overlay-l3-title','overlay-l3-end',
      'overlay-l4-title','overlay-l4-end',
      'overlay-l5-intro','overlay-l5-end',
      'overlay-l6-end','overlay-l7-intro','overlay-l7-end',
      'overlay-l8-intro','overlay-l8-end','overlay-credits',
    ];
    for (const id of toHide) document.getElementById(id)?.classList.add('hidden');
    const hud = document.getElementById('hud'); if (hud) hud.classList.add('hidden');
    showCutscene();
  }

  function actuallyBegin() {
    ensureAudio();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    startAmbient();
    resetL6State();
    if (!running) {
      running = true;
      window.addEventListener('keydown', keydown);
      window.addEventListener('keyup', keyup);
      window.addEventListener('blur', blur);
      lastT = performance.now();
      requestAnimationFrame(loop);
    }
    registerTasks();
    setTimeout(() => speak("Socky: \"Hehehe... surprise, kid!\"", 2800), 600);
    setTimeout(() => sfx('laugh'), 700);
  }

  // Buttons
  document.getElementById('btn-l6-intro-next')?.addEventListener('click', advanceCutscene);
  document.getElementById('btn-l6-intro-skip')?.addEventListener('click', () => {
    cutscene.active = false;
    document.getElementById('overlay-l6-intro').classList.add('hidden');
    actuallyBegin();
  });
  document.getElementById('btn-l6-replay')?.addEventListener('click', () => {
    document.getElementById('overlay-l6-end').classList.add('hidden');
    resetL6State();
    speak('Again. Stay moving!', 2000);
  });
  document.getElementById('btn-l6-home')?.addEventListener('click', () => {
    running = false; stopAmbient();
    window.removeEventListener('keydown', keydown);
    window.removeEventListener('keyup', keyup);
    window.removeEventListener('blur', blur);
    window.location.reload();
  });
  document.getElementById('btn-l6-next')?.addEventListener('click', () => {
    document.getElementById('overlay-l6-end').classList.add('hidden');
    running = false; stopAmbient();
    window.removeEventListener('keydown', keydown);
    window.removeEventListener('keyup', keyup);
    window.removeEventListener('blur', blur);
    if (window.__startLevel7) window.__startLevel7();
  });

  function resumeLevel6() {
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
    ['overlay-l6-intro','overlay-l6-end','overlay-caught']
      .forEach(id => { const el = document.getElementById(id); if (el) el.classList.add('hidden'); });
  }

  window.__startLevel6 = start;
  window.__horridorsL6 = {
    audioCtx: () => audioCtx,
    masterGain: () => masterGain,
    resume: resumeLevel6,
    isRunning: () => running,
    stop: () => {
      running = false; stopAmbient();
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', blur);
    },
  };
  console.log('[Level 6] Loaded. Call window.__startLevel6() to begin.');
})();
