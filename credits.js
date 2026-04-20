// =====================================================================
// HORRIDORS - CREDITS SCROLL
// Rolls the "Creator - Chester Edmunds" credits over a black background
// with twinkling stars. Exits back to the title.
// Standalone module; boots via window.__startCredits().
// =====================================================================
(() => {
  const SECTIONS = [
    { kind: 'blank' },
    { kind: 'blank' },
    { kind: 'hero', title: '★ HORRIDORS ★', sub: 'Chapter 1 Complete' },
    { kind: 'blank' },
    { kind: 'hero', title: 'Designed by', name: 'Chester Edmunds' },
    { kind: 'blank' },
    { kind: 'hero', title: 'Built by Dad using AI', name: 'Dan Edmunds' },
    { kind: 'blank' },
    { kind: 'block', title: 'Story & Game Design', items: ['Chester Edmunds'] },
    { kind: 'block', title: 'Levels Design', items: [
      'Level 1 — The Corridors',
      'Level 2 — Mrs Horrid\'s Office',
      'Level 3 — The Flooded Tunnels',
      'Level 4 — Meeting Inky Bin',
      'Level 5 — Thistle\'s Rescue',
      'Level 6 — Socky Shok\'s Room',
      'Level 7 — Blacky Pants',
      'Level 8 — The Final Match',
    ]},
    { kind: 'block', title: 'Characters', items: [
      'Chester — the brave one',
      'Mum — waiting, unbroken',
      'Mrs Horrid — headmistress',
      'Inky Bin — ally with a splash',
      'Thistle — rescued, fearless',
      'Ex Preshon — sad and heavy',
      'Exlena — spiky pink fury',
      'Socky Shok — the betrayer',
      'Blacky Pants — mossy and asleep',
      'Drip — droplet scouts',
    ]},
    { kind: 'block', title: 'Reference Drawings by', items: ['Chester Edmunds'] },
    { kind: 'block', title: 'Music & Sound', items: [
      'Web Audio — original score',
      'Ambient moods — corridor / flooded / abyss',
      'Procedural SFX',
    ]},
    { kind: 'block', title: 'Code & Engine', items: [
      'HTML5 Canvas',
      'Procedural sprites & sprite caches',
      'Code built by Dan with Perplexity AI',
      'from Chester\'s designs',
    ]},
    { kind: 'block', title: 'Special Thanks', items: [
      'To everyone who believed in Chester',
      'To Mum',
      'To the end of a long corridor',
    ]},
    { kind: 'blank' },
    { kind: 'blank' },
    { kind: 'hero', title: 'Chapter 1', sub: 'Complete' },
    { kind: 'blank' },
    { kind: 'hero', sub: 'Chapter 2 — Coming Soon' },
    { kind: 'blank' },
    { kind: 'blank' },
    { kind: 'hero', title: '— The End —' },
    { kind: 'blank' },
    { kind: 'block', title: '', items: ['Press "Back to Title" to play again.'] },
  ];

  let overlay, scroll, closeBtn, skipBtn, canvasBg, ctx;
  let animId = null;
  let audioCtx = null, masterGain = null;
  let musicNodes = [];
  let stars = [];

  function buildHTML() {
    // Reuse existing overlay
    overlay = document.getElementById('overlay-credits');
    scroll = document.getElementById('credits-scroll');
    closeBtn = document.getElementById('btn-credits-close');
    skipBtn = document.getElementById('btn-credits-skip');
    if (!overlay || !scroll) return;

    // Star canvas
    let starCanvas = document.getElementById('credits-stars');
    if (!starCanvas) {
      starCanvas = document.createElement('canvas');
      starCanvas.id = 'credits-stars';
      starCanvas.style.cssText = 'position:absolute;inset:0;z-index:0;pointer-events:none;';
      const root = document.getElementById('credits-root');
      if (root) root.insertBefore(starCanvas, root.firstChild);
    }
    canvasBg = starCanvas;
    ctx = canvasBg.getContext('2d');

    // Build inner HTML
    scroll.style.zIndex = '1';
    scroll.innerHTML = SECTIONS.map(s => {
      if (s.kind === 'blank') return `<div style="height:120px;"></div>`;
      if (s.kind === 'hero') {
        const title = s.title ? `<div style="font-family:system-ui;font-weight:900;font-size:clamp(36px,6vw,72px);color:#ffd84a;letter-spacing:0.04em;line-height:1.05;text-shadow:0 0 24px rgba(255,216,74,0.4);">${s.title}</div>` : '';
        const name  = s.name  ? `<div style="font-family:Georgia,serif;font-weight:700;font-size:clamp(28px,5vw,56px);color:#fff;margin-top:10px;letter-spacing:0.02em;">${s.name}</div>` : '';
        const sub   = s.sub   ? `<div style="font-family:system-ui;font-weight:500;font-size:clamp(16px,2vw,22px);color:#e28bb6;margin-top:12px;letter-spacing:0.08em;text-transform:uppercase;">${s.sub}</div>` : '';
        return `<div style="margin:40px auto;max-width:800px;">${title}${name}${sub}</div>`;
      }
      if (s.kind === 'block') {
        const title = s.title ? `<div style="font-family:system-ui;font-weight:700;font-size:clamp(16px,1.6vw,20px);color:#b07ed9;letter-spacing:0.14em;text-transform:uppercase;margin-bottom:14px;">${s.title}</div>` : '';
        const items = s.items.map(i => `<div style="font-family:system-ui;font-weight:500;font-size:clamp(15px,1.5vw,19px);color:#f2e6d0;line-height:1.7;">${i}</div>`).join('');
        return `<div style="margin:28px auto;max-width:640px;">${title}${items}</div>`;
      }
      return '';
    }).join('');
  }

  // ---------- Audio ----------
  function ensureAudio() {
    if (audioCtx) return;
    const prev = window.__horridorsL8 || window.__horridorsL7 || window.__horridorsL6 || window.__horridorsL5 || window.__horridorsL4 || window.__horridorsL3 || window.__horridorsL2 || window.__horridorsL1;
    if (prev && prev.audioCtx && prev.audioCtx()) { audioCtx = prev.audioCtx(); masterGain = prev.masterGain(); return; }
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.4;
      masterGain.connect(audioCtx.destination);
    } catch {}
  }

  function startMusic() {
    if (!audioCtx) return;
    // Warm victory pad chord
    stopMusic();
    const now = audioCtx.currentTime;
    const chord = [220, 277.18, 329.63, 440]; // A minor → gentle
    for (const f of chord) {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.04, now + 2);
      osc.connect(g).connect(masterGain);
      osc.start(now);
      musicNodes.push({ osc, g });
    }
    // Simple melody over top
    const melody = [523, 659, 784, 988, 784, 659, 523, 659];
    let t = now + 1.2;
    for (const mn of melody) {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'triangle';
      o.frequency.value = mn;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.06, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
      o.connect(g).connect(masterGain);
      o.start(t); o.stop(t + 1.1);
      t += 0.9;
    }
    // Layer: victory theme from shared-music
    if (window.HorridorsMusic && audioCtx && masterGain) {
      try { window.HorridorsMusic.setTheme(audioCtx, masterGain, 'victory'); } catch(e){}
    }
  }

  function stopMusic() {
    const now = audioCtx ? audioCtx.currentTime : 0;
    for (const n of musicNodes) {
      try { n.g.gain.cancelScheduledValues(now); n.g.gain.linearRampToValueAtTime(0, now + 0.4); n.osc.stop(now + 0.5); } catch {}
    }
    musicNodes = [];
    if (window.HorridorsMusic) { try { window.HorridorsMusic.stop(); } catch(e){} }
  }

  // ---------- Stars ----------
  function buildStars() {
    stars = [];
    // Size to overlay bounds (overlay-credits is full-viewport)
    const rect = canvasBg.getBoundingClientRect();
    const W = Math.max(rect.width, window.innerWidth);
    const H = Math.max(rect.height, window.innerHeight);
    canvasBg.width = W; canvasBg.height = H;
    canvasBg.style.width = '100%';
    canvasBg.style.height = '100%';
    const count = Math.min(140, Math.max(60, Math.floor(W * H / 14000)));
    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.6 + 0.3,
        ph: Math.random() * Math.PI * 2,
        spd: 0.6 + Math.random() * 1.4,
      });
    }
  }

  function drawStars() {
    if (!ctx) return;
    const W = canvasBg.width, H = canvasBg.height;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    // Soft radial glow center
    const grad = ctx.createRadialGradient(W/2, H/2, 10, W/2, H/2, Math.max(W, H) * 0.6);
    grad.addColorStop(0, 'rgba(60, 20, 80, 0.4)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    // Stars
    const t = performance.now() / 800;
    for (const s of stars) {
      const a = 0.35 + 0.65 * (Math.sin(t * s.spd + s.ph) * 0.5 + 0.5);
      ctx.fillStyle = `rgba(255, 240, 200, ${a})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI*2); ctx.fill();
    }
  }

  // ---------- Scroll ----------
  let scrollY = 0;
  let lastT = 0;
  let running = false;
  const SCROLL_SPEED = 60; // px per second
  function loop(now) {
    if (!running) return;
    const dt = Math.min(0.06, (now - lastT) / 1000); lastT = now;
    scrollY += SCROLL_SPEED * dt;
    if (scroll) {
      scroll.style.bottom = `calc(-100% + ${scrollY}px)`;
    }
    drawStars();
    // End when the scroll has moved past the top by content height
    const contentH = scroll ? scroll.scrollHeight : 0;
    const vpH = overlay ? overlay.clientHeight : window.innerHeight;
    if (scrollY > contentH + vpH + 200) {
      // Loop back or finish — we finish and show "Back to Title" prompt
      running = false;
    }
    animId = requestAnimationFrame(loop);
  }

  function start() {
    buildHTML();
    if (!overlay) return;
    // Hide any residual game UI
    const hud = document.getElementById('hud');
    if (hud) hud.classList.add('hidden');
    const subtitle = document.getElementById('subtitle');
    if (subtitle) subtitle.style.display = 'none';
    const prompt = document.getElementById('prompt');
    if (prompt) prompt.style.display = 'none';
    const btnTasks = document.getElementById('btn-tasks');
    if (btnTasks) btnTasks.style.display = 'none';
    const btnNotes = document.getElementById('btn-notes');
    if (btnNotes) btnNotes.style.display = 'none';
    const btnGems = document.getElementById('btn-gems');
    if (btnGems) btnGems.style.display = 'none';
    overlay.classList.remove('hidden');
    // Init audio
    ensureAudio();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    startMusic();
    // Init stars
    buildStars();
    // Reset scroll
    scrollY = 0;
    if (scroll) scroll.style.bottom = '-100%';
    // Start loop
    running = true;
    lastT = performance.now();
    animId = requestAnimationFrame(loop);
    window.addEventListener('resize', buildStars);
  }

  function stopAll() {
    running = false;
    if (animId) cancelAnimationFrame(animId);
    animId = null;
    stopMusic();
    window.removeEventListener('resize', buildStars);
  }

  function finish() {
    stopAll();
    if (overlay) overlay.classList.add('hidden');
    window.location.reload();
  }

  // Wire buttons (defer until DOM ready since this module loads early)
  function wireButtons() {
    document.getElementById('btn-credits-close')?.addEventListener('click', finish);
    document.getElementById('btn-credits-skip')?.addEventListener('click', finish);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireButtons);
  } else {
    wireButtons();
  }

  window.__startCredits = start;
  console.log('[Credits] Loaded. Call window.__startCredits() to begin.');
})();
