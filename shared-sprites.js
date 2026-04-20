// Horridors — canonical character sprites (v22)
// Bitmap sprites from rendered 3D-cartoon character portraits.
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
  // opts: { walk: boolean, t: number } — when walk is true, apply a subtle walk-cycle
  //       animation (vertical bob + squash/stretch + tilt sway). t is a phase value in
  //       seconds (typically performance.now()/1000). When idle, a very gentle breathing.
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
    const t = (opts && typeof opts.t === 'number') ? opts.t : performance.now() / 1000;
    let bob = 0, sx = 1, sy = 1, tilt = 0;
    if (walking) {
      // ~5 steps per second — fast pitter-patter for a kid running
      const ph = t * 11; // ~1.75 Hz full cycle
      // Body bob: noticeable up/down — ~9% of sprite height (about 5px on a 56px sprite)
      bob = -Math.abs(Math.sin(ph)) * h * 0.09;
      // Landing squash — when foot plants, slight vertical compress + horizontal stretch
      const plant = 1 - Math.abs(Math.sin(ph)); // 0 at apex, 1 at plant
      sy = 1 - plant * 0.06;
      sx = 1 + plant * 0.06;
      // Side-to-side tilt sway — more pronounced, matches step rhythm
      tilt = Math.sin(ph) * 0.09; // radians (~5 deg)
    } else {
      // Idle breathing: slow, small vertical oscillation
      bob = Math.sin(t * 1.8) * h * 0.008;
      sy = 1 + Math.sin(t * 1.8) * 0.006;
    }

    ctx.save();
    // Soft ground shadow — stays on the floor (no bob)
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(cx, cy - 1, w * 0.32 * (walking ? (1 - Math.abs(Math.sin(t * 8)) * 0.08) : 1), h * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();

    // Transform for body: pivot at feet, apply tilt + squash + bob, then mirror if facing left
    ctx.translate(cx, cy);
    if (tilt) ctx.rotate(tilt * facing);
    if (facing < 0) ctx.scale(-1, 1);
    if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
    ctx.drawImage(img, -w / 2, -h + bob, w, h);
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
  // (sprint parameter kept for signature compatibility — currently unused.)
  function drawChesterWalk(ctx, cx, cy, facing = 1, sizePx = 56, vx, vy, id = 'player' /*, sprint */) {
    let walking;
    if (typeof vx === 'number' || typeof vy === 'number') {
      walking = Math.abs(vx || 0) > 4 || Math.abs(vy || 0) > 4;
    } else {
      walking = _detectMotion(id, cx, cy);
    }
    drawCharacter(ctx, 'chester', cx, cy, facing, sizePx, { walk: walking, t: performance.now() / 1000 });
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
