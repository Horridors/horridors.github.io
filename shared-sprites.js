// Horridors — canonical character sprites (v22)
// Bitmap sprites from rendered Pixar-style character portraits.
// Backwards-compatible API: drawChester, drawThistle, drawCoin still work.
// New API: drawCharacter(ctx, name, cx, cy, facing, sizePx)
// Exposes window.HorridorsSprites.

(function () {
  // CANONICAL PALETTE (kept for legacy callers that use color references)
  const PAL = {
    chester: { shirt: '#f6d854', shoes: '#3b2a6e', face: '#f5d2aa', hair: '#d68a4a', strap: '#4aa86b', nozzle: '#ffd84a', ink: '#141414' },
    thistle: { body: '#fbd34a', star: '#fff08a', trim: '#a06438', ink: '#141414' },
    inky:    { body: '#2a9d9a', rim: '#8de4da', eye: '#1a1a22' },
  };

  // Character image registry
  const CHARACTER_FILES = {
    chester:   './characters/chester.png',
    mum:       './characters/mum.png',
    mother:    './characters/mum.png',       // alias — "Mother" glimpses use Mum image
    thistle:   './characters/thistle.png',
    grinpatch: './characters/grinpatch.png',
    hollow:    './characters/hollow.png',
    drip:      './characters/drip.png',
    inkybin:   './characters/inkybin.png',
    inky:      './characters/inkybin.png',   // alias
    expreshon: './characters/expreshon.png',
    expression:'./characters/expreshon.png', // legacy alias
    exlena:    './characters/exlena.png',
    sockyshok: './characters/sockyshok.png',
    socky:     './characters/sockyshok.png', // alias
    blacky:    './characters/blacky.png',
    blackypants:'./characters/blacky.png',   // alias
  };

  const images = {};
  const loadState = {}; // name -> 'loading' | 'ready' | 'error'
  let readyCount = 0;
  const totalImages = new Set(Object.values(CHARACTER_FILES)).size;

  function loadAll() {
    const seen = new Set();
    for (const [name, path] of Object.entries(CHARACTER_FILES)) {
      if (seen.has(path)) { images[name] = findImageByPath(path); continue; }
      seen.add(path);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      loadState[name] = 'loading';
      img.onload = () => {
        loadState[name] = 'ready';
        readyCount++;
      };
      img.onerror = () => { loadState[name] = 'error'; };
      img.src = path;
      images[name] = img;
    }
    // Wire aliases to the same Image instance
    for (const [name, path] of Object.entries(CHARACTER_FILES)) {
      if (!images[name]) images[name] = findImageByPath(path);
    }
  }
  function findImageByPath(path) {
    for (const [n, p] of Object.entries(CHARACTER_FILES)) {
      if (p === path && images[n]) return images[n];
    }
    return null;
  }

  function isReady(name) {
    const img = images[name];
    return !!(img && img.complete && img.naturalWidth > 0);
  }

  // Unified bitmap character drawing.
  // cx, cy = bottom-center anchor (feet). facing: +1 right, -1 left.
  // sizePx = desired rendered height in pixels (default 72 — roughly matches old procedural size).
  // opts: { walk: boolean, t: number, sprint: boolean } — when walk is true, apply a walk-cycle
  //       animation (body bob + squash/stretch + tilt sway) AND for Chester, draw alternating
  //       legs + swinging arms as procedural overlays synced to the same phase. When sprint is
  //       true, the cycle doubles in rate. t is a phase value in seconds. When idle, gentle
  //       breathing only.
  function drawCharacter(ctx, name, cx, cy, facing = 1, sizePx = 72, opts) {
    const key = String(name || '').toLowerCase().replace(/[^a-z]/g, '');
    const img = images[key];
    if (!img || !img.complete || img.naturalWidth === 0) {
      // Fallback to legacy procedural sprites while images are still loading
      if (key === 'chester') return drawChesterProcedural(ctx, cx, cy, facing, sizePx / 72);
      if (key === 'thistle') return drawThistleProcedural(ctx, cx, cy, sizePx / 72);
      // Fallback: placeholder ellipse shadow
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(cx, cy, sizePx * 0.3, sizePx * 0.08, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      return;
    }
    const aspect = img.naturalWidth / img.naturalHeight;
    const h = sizePx;
    const w = sizePx * aspect;

    // Walk-cycle animation parameters
    const walking = !!(opts && opts.walk);
    const sprinting = !!(opts && opts.sprint);
    const t = (opts && typeof opts.t === 'number') ? opts.t : performance.now() / 1000;
    // Cycle frequency: walk ~1.75 Hz, sprint doubles it to ~3.5 Hz.
    const cycleRate = sprinting ? 22 : 11;
    let bob = 0, sx = 1, sy = 1, tilt = 0;
    let ph = 0;
    if (walking) {
      ph = t * cycleRate;
      // Body bob: stronger when sprinting (more urgent gait)
      const bobAmp = sprinting ? 0.11 : 0.09;
      bob = -Math.abs(Math.sin(ph)) * h * bobAmp;
      // Landing squash — when foot plants, slight vertical compress + horizontal stretch
      const plant = 1 - Math.abs(Math.sin(ph)); // 0 at apex, 1 at plant
      sy = 1 - plant * (sprinting ? 0.08 : 0.06);
      sx = 1 + plant * (sprinting ? 0.08 : 0.06);
      // Side-to-side tilt sway
      tilt = Math.sin(ph) * (sprinting ? 0.12 : 0.09);
    } else {
      // Idle breathing: slow, small vertical oscillation
      bob = Math.sin(t * 1.8) * h * 0.008;
      sy = 1 + Math.sin(t * 1.8) * 0.006;
    }

    ctx.save();
    // Soft ground shadow — stays on the floor (no bob)
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(cx, cy - 1, w * 0.32 * (walking ? (1 - Math.abs(Math.sin(ph)) * 0.08) : 1), h * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();

    // Transform for body: pivot at feet, apply tilt + squash + bob, then mirror if facing left
    ctx.translate(cx, cy);
    if (tilt) ctx.rotate(tilt * facing);
    if (facing < 0) ctx.scale(-1, 1);
    if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);

    // For Chester while walking: clip the bitmap above the hip line so the static
    // legs/feet from the image don't show through. Procedural animated legs are
    // drawn below that line. For arms, we use source-over — they visually blend
    // with the bitmap's natural hanging arms by swinging at the shoulder.
    if (walking && key === 'chester') {
      // Hip line: ~55% down from top of bitmap (waist of the jeans)
      const hipClipY = -h + h * 0.55 + bob;
      ctx.save();
      ctx.beginPath();
      ctx.rect(-w/2 - 4, -h + bob - 4, w + 8, hipClipY - (-h + bob) + 4);
      ctx.clip();
      ctx.drawImage(img, -w / 2, -h + bob, w, h);
      ctx.restore();
      // Draw animated legs below the clipped torso
      drawChesterLimbs(ctx, w, h, bob, ph, sprinting);
    } else {
      ctx.drawImage(img, -w / 2, -h + bob, w, h);
    }
    ctx.restore();
  }

  // Draw alternating legs + swinging arms for Chester. Called inside the character
  // transform (origin at feet-center, +x = forward direction after facing mirror).
  // w/h are the rendered bitmap dimensions; bob is the vertical offset; ph is the
  // walk phase (radians). Legs alternate at sin(ph) polarity; arms swing opposite
  // to their adjacent leg (standard contralateral gait).
  function drawChesterLimbs(ctx, w, h, bob, ph, sprinting) {
    // Scale everything relative to sprite height so limbs match bitmap proportions
    const s = h / 56;                        // reference size = 56px Chester
    const P = PAL.chester;
    // Hip line is where we clipped the bitmap (~45% up from feet).
    // Procedural legs run from there down to 0 (the feet baseline).
    const hipY = -h * 0.45 + bob;
    // Leg length = distance from hip down to feet baseline
    const legLen = -bob + h * 0.45;          // ~h*0.45 minus body bob (negative)
    // Leg cycle: left leg forward when sin(ph) > 0, right leg forward when < 0
    const legPhase = Math.sin(ph);
    // Step amplitude: sprinting has longer strides + higher knee lift
    const stride   = sprinting ? 7.5 * s : 5.5 * s;
    const lift     = sprinting ? 4 * s : 2 * s;
    const armSwing = sprinting ? 9 * s : 5.5 * s;
    // Leg geometry
    const legW = 4 * s;
    const footW = 6 * s, footH = 3.2 * s;
    const hipOffset = 3 * s;                 // half hip width
    // Left leg (leads on +sin phase), contralateral arm is opposite
    const leftLeg = legPhase;
    const rightLeg = -legPhase;
    drawOneLeg(ctx, -hipOffset, hipY, legW, legLen, leftLeg,  stride, lift, footW, footH, P);
    drawOneLeg(ctx,  hipOffset, hipY, legW, legLen, rightLeg, stride, lift, footW, footH, P);
    // Arms — drawn from shoulder, swing over torso. Keep subtle so they don't
    // overpower the bitmap's natural silhouette. Anchor at ~68% up the sprite.
    const shoulderY = -h * 0.68 + bob;
    const shoulderOffset = 4.5 * s;
    const armLen = 10 * s;
    const leftArm  = -leftLeg;
    const rightArm = -rightLeg;
    drawOneArm(ctx, -shoulderOffset, shoulderY, 3 * s, armLen, leftArm,  armSwing, P, sprinting);
    drawOneArm(ctx,  shoulderOffset, shoulderY, 3 * s, armLen, rightArm, armSwing, P, sprinting);
  }

  // Leg: rotates forward (+x) when phase > 0, back when < 0. Lift raises heel at apex.
  // Chester palette: blue jeans + white sneakers with dark laces.
  function drawOneLeg(ctx, hipX, hipY, legW, legLen, phase, stride, lift, footW, footH, P) {
    const kneeX = hipX + phase * stride * 0.55;
    const footX = hipX + phase * stride;
    // Apex lift raises leg mid-swing. Use a smooth arc on the swinging direction.
    const footY = hipY + legLen - Math.abs(phase) * lift * 0.5;
    ctx.save();
    ctx.lineJoin = 'round';
    // Denim jeans — tapered from hip to ankle
    ctx.fillStyle = '#2b4a7a';
    ctx.strokeStyle = '#1a2e4d';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(hipX - legW/2, hipY);
    ctx.lineTo(hipX + legW/2, hipY);
    ctx.quadraticCurveTo(kneeX + legW/2 * 0.85, (hipY + footY) / 2, footX + legW/2 * 0.75, footY - footH/2);
    ctx.lineTo(footX - legW/2 * 0.75, footY - footH/2);
    ctx.quadraticCurveTo(kneeX - legW/2 * 0.85, (hipY + footY) / 2, hipX - legW/2, hipY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // White sneaker with dark sole
    ctx.fillStyle = '#f4f2ee';
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.ellipse(footX, footY - footH * 0.2, footW/2, footH * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Sole line
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.ellipse(footX, footY + footH * 0.15, footW/2, footH * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Arm: shoulder at (shoulderX, shoulderY), swings forward/back with phase.
  // Chester palette: red T-shirt sleeve (short) + skin-tone forearm.
  function drawOneArm(ctx, shoulderX, shoulderY, armW, armLen, phase, swing, P, sprinting) {
    // Arms swing fore/aft. We draw them OUTSIDE the body silhouette by offsetting
    // horizontally so they don't cross the torso even at sprint amplitudes.
    // sign: positive means arm stays on the outside of its shoulder
    const outward = shoulderX > 0 ? 1 : -1;
    // Base away-from-body offset so arms don't visually cross the torso
    const baseOut = Math.abs(shoulderX) * 0.15;
    const elbowX = shoulderX + outward * baseOut + phase * swing * 0.45;
    const handX  = shoulderX + outward * baseOut + phase * swing * 0.8;
    // Gentle forward elbow bend — keep subtle so arms don't fold into the body
    const bendY = sprinting ? Math.abs(phase) * 1.6 : Math.abs(phase) * 0.8;
    const elbowY = shoulderY + armLen * 0.5 - bendY;
    const handY = shoulderY + armLen - bendY * 0.2;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Short red sleeve at shoulder (top ~35% of arm)
    ctx.strokeStyle = '#c8232c';
    ctx.lineWidth = armW * 1.25;
    ctx.beginPath();
    ctx.moveTo(shoulderX, shoulderY);
    ctx.lineTo(shoulderX + (elbowX - shoulderX) * 0.35, shoulderY + (elbowY - shoulderY) * 0.35);
    ctx.stroke();
    // Skin forearm (remaining length)
    ctx.strokeStyle = '#f5c9a6';
    ctx.lineWidth = armW;
    ctx.beginPath();
    ctx.moveTo(shoulderX + (elbowX - shoulderX) * 0.3, shoulderY + (elbowY - shoulderY) * 0.3);
    ctx.quadraticCurveTo(elbowX, elbowY, handX, handY - armW * 0.3);
    ctx.stroke();
    // Hand (skin-tone rounded end — slightly larger than forearm)
    ctx.fillStyle = '#f0bd96';
    ctx.beginPath();
    ctx.arc(handX, handY, armW * 0.75, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Per-entity motion tracker for auto-detecting walk animation.
  // Keyed by a stable id (e.g. 'player'). Call each frame; returns true if moving.
  const _motionCache = new Map();
  function _detectMotion(id, x, y) {
    const now = performance.now();
    const prev = _motionCache.get(id);
    _motionCache.set(id, { x, y, t: now });
    if (!prev) return false;
    const dt = now - prev.t;
    if (dt <= 0) return false;
    const dx = x - prev.x, dy = y - prev.y;
    const distSq = dx * dx + dy * dy;
    // Moving if displacement > ~0.3 px in this frame (works for any dt)
    return distSq > 0.09;
  }

  // Player-specific wrapper with automatic walk detection.
  // id lets multiple characters track motion independently ('player' by default).
  // sprint: optional boolean — when true, doubles the walk cycle rate (running from Ex Preshon).
  function drawChesterWalk(ctx, cx, cy, facing = 1, sizePx = 56, vx, vy, id = 'player', sprint = false) {
    let walking;
    if (typeof vx === 'number' || typeof vy === 'number') {
      walking = Math.abs(vx || 0) > 4 || Math.abs(vy || 0) > 4;
    } else {
      walking = _detectMotion(id, cx, cy);
    }
    drawCharacter(ctx, 'chester', cx, cy, facing, sizePx, { walk: walking, t: performance.now() / 1000, sprint: !!sprint });
  }

  // Kept for legacy callers — now uses bitmap if available, else procedural fallback
  function drawChester(ctx, cx, cy, facing = 1, s = 1) {
    if (isReady('chester')) return drawCharacter(ctx, 'chester', cx, cy, facing, 72 * s);
    return drawChesterProcedural(ctx, cx, cy, facing, s);
  }
  function drawThistle(ctx, cx, cy, s = 1) {
    if (isReady('thistle')) return drawCharacter(ctx, 'thistle', cx, cy, 1, 84 * s);
    return drawThistleProcedural(ctx, cx, cy, s);
  }

  // --- Legacy procedural fallbacks (kept as a safety net) ---
  function drawChesterProcedural(ctx, cx, cy, facing = 1, s = 1) {
    const f = facing; const P = PAL.chester;
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(cx, cy + 2 * s, 11 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = P.shoes;
    ctx.fillRect(cx - 7 * s, cy - 10 * s, 5 * s, 10 * s);
    ctx.fillRect(cx + 2 * s, cy - 10 * s, 5 * s, 10 * s);
    ctx.fillStyle = P.shirt;
    ctx.beginPath();
    ctx.moveTo(cx - 9 * s, cy - 10 * s);
    ctx.lineTo(cx + 9 * s, cy - 10 * s);
    ctx.lineTo(cx + 8 * s, cy - 22 * s);
    ctx.lineTo(cx - 8 * s, cy - 22 * s);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = P.ink; ctx.lineWidth = 1 * s; ctx.stroke();
    ctx.strokeStyle = P.strap; ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.moveTo(cx - 8 * s, cy - 20 * s); ctx.lineTo(cx + 8 * s, cy - 12 * s);
    ctx.stroke();
    ctx.fillStyle = P.nozzle;
    ctx.fillRect(cx + f * 6 * s - 2 * s, cy - 14 * s, 4 * s, 3 * s);
    ctx.fillStyle = P.face;
    ctx.beginPath(); ctx.arc(cx, cy - 26 * s, 9 * s, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = P.ink; ctx.lineWidth = 1 * s; ctx.stroke();
    ctx.fillStyle = P.hair;
    ctx.beginPath();
    ctx.arc(cx, cy - 32 * s, 6 * s, Math.PI, 0);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = P.ink;
    ctx.beginPath(); ctx.arc(cx - 3 * s + f * 0.5 * s, cy - 26 * s, 0.9 * s, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 3 * s + f * 0.5 * s, cy - 26 * s, 0.9 * s, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = P.ink; ctx.lineWidth = 0.9 * s;
    ctx.beginPath(); ctx.arc(cx, cy - 23 * s, 2 * s, 0, Math.PI); ctx.stroke();
    ctx.restore();
  }

  function drawThistleProcedural(ctx, cx, cy, s = 1) {
    const P = PAL.thistle;
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(cx, cy + 2 * s, 16 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = P.ink; ctx.lineWidth = 2 * s;
    ctx.fillStyle = P.body;
    ctx.beginPath();
    ctx.moveTo(cx - 8 * s, cy - 8 * s); ctx.lineTo(cx - 8 * s, cy);
    ctx.moveTo(cx + 8 * s, cy - 8 * s); ctx.lineTo(cx + 8 * s, cy);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx, cy - 18 * s, 14 * s, 14 * s, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = P.star; ctx.strokeStyle = P.ink; ctx.lineWidth = 1.2 * s;
    const sx = cx, sy = cy - 18 * s, r = 6 * s;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI) / 5 - Math.PI / 2;
      const rad = i % 2 === 0 ? r : r * 0.45;
      const x = sx + Math.cos(a) * rad, y = sy + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = P.body;
    ctx.beginPath(); ctx.ellipse(cx, cy - 40 * s, 14 * s, 13 * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 10 * s, cy - 50 * s); ctx.lineTo(cx - 16 * s, cy - 66 * s); ctx.lineTo(cx - 6 * s, cy - 52 * s);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + 6 * s, cy - 52 * s); ctx.lineTo(cx + 14 * s, cy - 66 * s); ctx.lineTo(cx + 10 * s, cy - 50 * s);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(cx - 4 * s, cy - 40 * s, 3.2 * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx + 4 * s, cy - 40 * s, 3.2 * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = P.ink;
    ctx.beginPath(); ctx.arc(cx - 4 * s, cy - 40 * s, 1.4 * s, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 4 * s, cy - 40 * s, 1.4 * s, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = P.ink; ctx.lineWidth = 1.3 * s;
    ctx.beginPath(); ctx.arc(cx, cy - 37 * s, 3.5 * s, 0.1, Math.PI - 0.1); ctx.stroke();
    ctx.restore();
  }

  // Coin unchanged
  function drawCoin(ctx, cx, cy, t = 0, size = 8) {
    const bob = Math.sin(t * 0.006) * 1.5;
    const y = cy + bob;
    ctx.save();
    ctx.shadowColor = '#ffd84a'; ctx.shadowBlur = 6;
    ctx.fillStyle = '#ffd84a';
    ctx.beginPath(); ctx.arc(cx, y, size, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#c79512';
    ctx.beginPath(); ctx.arc(cx, y, size * 0.65, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a1024';
    ctx.font = '700 ' + Math.round(size * 1.2) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('¢', cx, y + 1);
    ctx.restore();
  }

  // Preload portrait at full size for menus/cutscenes
  function getCharacterImage(name) {
    const key = String(name || '').toLowerCase().replace(/[^a-z]/g, '');
    return images[key] || null;
  }

  loadAll();

  window.HorridorsSprites = {
    PAL,
    drawChester,
    drawChesterWalk,
    drawThistle,
    drawCoin,
    drawCharacter,
    getCharacterImage,
    isReady,
    CHARACTER_FILES,
  };
})();
