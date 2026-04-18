// ==========================================================
// Horridors — Catchy procedural theme music (per level)
// Each theme is a short looping melody + bassline + beat.
// Procedural via Web Audio API — no external files needed.
// Exposes window.HorridorsMusic.start(audioCtx, masterGain, themeName)
//   themes: 'title', 'l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7', 'l8', 'victory'
// ==========================================================
(function(){
  if (window.HorridorsMusic) return;

  // ---- Note helpers ----
  // MIDI-ish: A4 = 69 → 440Hz. f = 440 * 2^((n-69)/12)
  function midi(n) { return 440 * Math.pow(2, (n - 69) / 12); }
  const N = {}; // name → midi
  const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  for (let oct = 0; oct <= 8; oct++) {
    for (let i = 0; i < 12; i++) {
      N[names[i] + oct] = (oct + 1) * 12 + i;
    }
  }

  // ---- Themes: each is 16 steps at a given tempo ----
  // Each step ~1/8 note. Notes are MIDI numbers (or 0 for rest).
  // Each theme has: bpm, lead (melody), bass, style (synth timbre)
  const THEMES = {
    title: {
      // Bold, mysterious minor motif in A minor — main theme
      bpm: 104,
      lead: [
        ['A4', 0.5], ['C5', 0.25], ['E5', 0.25], ['D5', 0.5], ['C5', 0.5],
        ['B4', 0.5], ['A4', 0.25], ['G4', 0.25], ['A4', 1.0],
        ['A4', 0.5], ['C5', 0.25], ['E5', 0.25], ['F5', 0.5], ['E5', 0.5],
        ['D5', 0.5], ['C5', 0.25], ['B4', 0.25], ['A4', 1.0],
      ],
      bass: [
        ['A2', 1], ['A2', 1], ['E2', 1], ['E2', 1],
        ['F2', 1], ['F2', 1], ['G2', 1], ['G2', 1],
      ],
      lead_type: 'square', bass_type: 'triangle', accent: 'pluck',
    },
    l1: {
      // L1 "Red Keycard Hall" — cautious, tiptoeing minor
      bpm: 92,
      lead: [
        ['A4', 0.5], ['B4', 0.5], ['C5', 1],
        ['B4', 0.5], ['A4', 0.5], ['G4', 1],
        ['A4', 0.5], ['C5', 0.5], ['E5', 0.5], ['D5', 0.5],
        ['C5', 1], ['A4', 1],
      ],
      bass: [
        ['A2', 2], ['F2', 2], ['G2', 2], ['A2', 2],
      ],
      lead_type: 'triangle', bass_type: 'sine', accent: 'muted',
    },
    l2: {
      // L2 Aquarium — bubbly, quirky, mixolydian feel
      bpm: 108,
      lead: [
        ['D5', 0.25], ['F5', 0.25], ['A5', 0.5], ['G5', 0.5], ['F5', 0.5],
        ['E5', 0.5], ['D5', 0.5], ['E5', 0.5], ['F5', 0.5],
        ['D5', 0.25], ['F5', 0.25], ['A5', 0.5], ['C6', 0.5], ['A5', 0.5],
        ['G5', 0.5], ['F5', 0.5], ['E5', 0.5], ['D5', 0.5],
      ],
      bass: [
        ['D3', 1], ['D3', 1], ['G2', 1], ['G2', 1],
        ['A2', 1], ['A2', 1], ['D3', 1], ['D3', 1],
      ],
      lead_type: 'square', bass_type: 'triangle', accent: 'bubble',
    },
    l3: {
      // L3 Toy/Library — creepy music-box, eerie waltz 3/4 feel
      bpm: 96,
      lead: [
        ['E5', 0.5], ['G5', 0.5], ['A5', 0.5], ['B5', 0.5], ['A5', 0.5], ['G5', 0.5],
        ['E5', 0.5], ['G5', 0.5], ['E5', 0.5], ['D5', 1.5],
        ['E5', 0.5], ['G5', 0.5], ['A5', 0.5], ['C6', 0.5], ['B5', 0.5], ['A5', 0.5],
        ['G5', 0.5], ['E5', 0.5], ['D5', 0.5], ['E5', 1.5],
      ],
      bass: [
        ['E3', 3], ['A2', 3], ['D3', 3], ['E3', 3],
      ],
      lead_type: 'sine', bass_type: 'triangle', accent: 'bell',
    },
    l4: {
      // L4 Basement — dark descending minor, more urgency
      bpm: 100,
      lead: [
        ['D5', 0.5], ['C5', 0.5], ['Bb4', 0.5], ['A4', 0.5],
        ['G4', 0.5], ['A4', 0.5], ['Bb4', 1],
        ['D5', 0.5], ['E5', 0.5], ['F5', 0.5], ['E5', 0.5],
        ['D5', 1], ['A4', 1],
      ],
      bass: [
        ['D2', 1], ['D2', 1], ['Bb1', 1], ['Bb1', 1],
        ['G2', 1], ['G2', 1], ['A2', 1], ['A2', 1],
      ],
      lead_type: 'sawtooth', bass_type: 'sawtooth', accent: 'buzz',
    },
    l5: {
      // L5 Prison corridor — tense, rhythmic minimal
      bpm: 116,
      lead: [
        ['G4', 0.25], ['G4', 0.25], ['A4', 0.5], ['C5', 0.5], ['G4', 0.5],
        ['G4', 0.25], ['G4', 0.25], ['Bb4', 0.5], ['C5', 1.0],
        ['G4', 0.25], ['A4', 0.25], ['C5', 0.5], ['D5', 0.5], ['Eb5', 0.5],
        ['D5', 0.5], ['C5', 0.5], ['G4', 1.0],
      ],
      bass: [
        ['C3', 1], ['C3', 1], ['G2', 1], ['G2', 1],
        ['Ab2', 1], ['Ab2', 1], ['G2', 1], ['G2', 1],
      ],
      lead_type: 'square', bass_type: 'square', accent: 'blip',
    },
    l6: {
      // L6 Socky Shok arena — electric, driving
      bpm: 124,
      lead: [
        ['E5', 0.25], ['B4', 0.25], ['E5', 0.25], ['G5', 0.25],
        ['F#5', 0.5], ['E5', 0.5], ['D5', 0.5], ['B4', 0.5],
        ['E5', 0.25], ['B4', 0.25], ['E5', 0.25], ['A5', 0.25],
        ['G5', 0.5], ['E5', 0.5], ['F#5', 0.5], ['E5', 0.5],
      ],
      bass: [
        ['E2', 0.5], ['E2', 0.5], ['E2', 0.5], ['E2', 0.5],
        ['B2', 0.5], ['B2', 0.5], ['B2', 0.5], ['B2', 0.5],
        ['A2', 0.5], ['A2', 0.5], ['A2', 0.5], ['A2', 0.5],
        ['E2', 0.5], ['E2', 0.5], ['G2', 0.5], ['B2', 0.5],
      ],
      lead_type: 'sawtooth', bass_type: 'square', accent: 'zap',
    },
    l7: {
      // L7 Blacky Pants boss — heavy, 6/8 ominous march
      bpm: 108,
      lead: [
        ['A4', 0.5], ['E5', 0.5], ['F5', 0.5], ['E5', 0.5], ['D5', 0.5], ['C5', 0.5],
        ['B4', 0.5], ['A4', 0.5], ['G#4', 0.5], ['A4', 1.5],
        ['C5', 0.5], ['E5', 0.5], ['G5', 0.5], ['F5', 0.5], ['E5', 0.5], ['D5', 0.5],
        ['C5', 0.5], ['B4', 0.5], ['A4', 1.0],
      ],
      bass: [
        ['A2', 1.5], ['A2', 1.5], ['F2', 1.5], ['E2', 1.5],
        ['F2', 1.5], ['G2', 1.5], ['A2', 1.5], ['E2', 1.5],
      ],
      lead_type: 'sawtooth', bass_type: 'triangle', accent: 'stab',
    },
    l8: {
      // L8 Final battle — epic, fast, heroic-but-minor
      bpm: 138,
      lead: [
        ['A4', 0.25], ['C5', 0.25], ['E5', 0.5], ['A5', 0.5], ['G5', 0.25], ['E5', 0.25],
        ['F5', 0.5], ['D5', 0.5], ['E5', 1.0],
        ['A4', 0.25], ['C5', 0.25], ['E5', 0.5], ['A5', 0.5], ['B5', 0.25], ['C6', 0.25],
        ['B5', 0.5], ['A5', 0.5], ['G5', 0.5], ['E5', 0.5],
      ],
      bass: [
        ['A2', 0.5], ['A2', 0.5], ['A2', 0.5], ['A2', 0.5],
        ['F2', 0.5], ['F2', 0.5], ['G2', 0.5], ['G2', 0.5],
        ['A2', 0.5], ['A2', 0.5], ['A2', 0.5], ['A2', 0.5],
        ['F2', 0.5], ['G2', 0.5], ['A2', 0.5], ['E2', 0.5],
      ],
      lead_type: 'sawtooth', bass_type: 'sawtooth', accent: 'hero',
    },
    victory: {
      // End-credits major key triumphant
      bpm: 108,
      lead: [
        ['C5', 0.5], ['E5', 0.5], ['G5', 0.5], ['C6', 0.5],
        ['B5', 0.5], ['G5', 0.5], ['A5', 1],
        ['C5', 0.5], ['F5', 0.5], ['A5', 0.5], ['C6', 0.5],
        ['B5', 0.5], ['G5', 0.5], ['C6', 1],
      ],
      bass: [
        ['C3', 2], ['G2', 2], ['F2', 2], ['C3', 2],
      ],
      lead_type: 'triangle', bass_type: 'sine', accent: 'bell',
    },
  };

  function scheduleTheme(ac, destGain, theme, startT) {
    const stepLen = 60 / theme.bpm / 2; // 1/8 note in seconds
    let lt = startT;
    // Schedule lead melody
    for (const [noteName, beats] of theme.lead) {
      if (noteName && N[noteName] !== undefined) {
        playNote(ac, destGain, midi(N[noteName]), beats * stepLen * 2, lt, theme.lead_type, 0.08);
      }
      lt += beats * stepLen * 2;
    }
    const leadDur = lt - startT;
    // Schedule bass (loop to fill leadDur)
    let bt = startT;
    const bassTotalBeats = theme.bass.reduce((s, b) => s + b[1], 0);
    while (bt < startT + leadDur - 0.001) {
      for (const [noteName, beats] of theme.bass) {
        if (bt >= startT + leadDur) break;
        if (noteName && N[noteName] !== undefined) {
          playNote(ac, destGain, midi(N[noteName]), beats * stepLen * 2, bt, theme.bass_type, 0.06);
        }
        bt += beats * stepLen * 2;
      }
    }
    // Simple 4-on-floor kick on accent tracks (except bell/muted types)
    if (theme.accent !== 'bell' && theme.accent !== 'muted') {
      let kt = startT;
      while (kt < startT + leadDur - 0.001) {
        playKick(ac, destGain, kt);
        kt += stepLen * 2; // every quarter
      }
    }
    return leadDur;
  }

  function playNote(ac, dest, freq, dur, when, type, vol) {
    if (!freq || dur <= 0) return;
    const o = ac.createOscillator();
    o.type = type || 'square';
    o.frequency.value = freq;
    const g = ac.createGain();
    g.gain.value = 0;
    // ADSR-ish envelope
    const attack = 0.015;
    const release = Math.min(0.25, dur * 0.5);
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(vol, when + attack);
    g.gain.setValueAtTime(vol, when + Math.max(attack, dur - release));
    g.gain.linearRampToValueAtTime(0, when + dur);
    o.connect(g); g.connect(dest);
    o.start(when);
    o.stop(when + dur + 0.02);
  }

  function playKick(ac, dest, when) {
    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, when);
    o.frequency.exponentialRampToValueAtTime(40, when + 0.12);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.12, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.15);
    o.connect(g); g.connect(dest);
    o.start(when); o.stop(when + 0.18);
  }

  // ---- Public API ----
  let activeNodes = [];
  let loopTimer = null;
  let currentTheme = null;
  let busGain = null;
  let acRef = null;

  function start(ac, masterGain, themeName) {
    if (!ac || !masterGain) return { stop(){} };
    const theme = THEMES[themeName] || THEMES.title;
    // Stop any previous theme
    stop();
    acRef = ac;
    currentTheme = themeName;

    // Dedicated bus for music (separate from ambient)
    busGain = ac.createGain();
    busGain.gain.value = 0;
    // Fade in
    busGain.gain.linearRampToValueAtTime(0.55, ac.currentTime + 2.0);
    busGain.connect(masterGain);

    // Schedule loop: at every loop point, schedule the next iteration ~100ms ahead
    function scheduleNext() {
      if (!busGain) return;
      const now = ac.currentTime;
      const startT = Math.max(now + 0.05, (scheduleNext.nextStart || now));
      const dur = scheduleTheme(ac, busGain, theme, startT);
      scheduleNext.nextStart = startT + dur;
      // Schedule the next iteration slightly before the current one ends
      const msUntilEnd = (scheduleNext.nextStart - now - 0.3) * 1000;
      loopTimer = setTimeout(scheduleNext, Math.max(100, msUntilEnd));
    }
    scheduleNext();

    return {
      stop() { stop(); },
      setVolume(v) { if (busGain) busGain.gain.setValueAtTime(v, ac.currentTime); },
    };
  }

  function stop() {
    if (loopTimer) { clearTimeout(loopTimer); loopTimer = null; }
    if (busGain && acRef) {
      try {
        busGain.gain.cancelScheduledValues(acRef.currentTime);
        busGain.gain.setValueAtTime(busGain.gain.value, acRef.currentTime);
        busGain.gain.linearRampToValueAtTime(0, acRef.currentTime + 0.6);
        const old = busGain;
        setTimeout(() => { try { old.disconnect(); } catch(e){} }, 800);
      } catch(e) {
        try { busGain.disconnect(); } catch(ee){}
      }
    }
    busGain = null;
    currentTheme = null;
  }

  function setTheme(ac, masterGain, themeName) {
    if (currentTheme === themeName) return;
    start(ac, masterGain, themeName);
  }

  window.HorridorsMusic = {
    start,
    stop,
    setTheme,
    getCurrentTheme: () => currentTheme,
    listThemes: () => Object.keys(THEMES),
  };
})();
