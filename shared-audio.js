// ==========================================================
// Horridors — Shared creepy ambient music
// Dark drone + minor-third pad + slow LFO + distant stings.
// Exposes window.HorridorsAmbient.start(audioCtx, masterGain, opts)
// opts.mood: 'corridor' | 'flooded' | 'abyss' (default 'corridor')
// ==========================================================
(function() {
  if (window.HorridorsAmbient) return;

  // Simple minor-key drone chord (A minor-ish, low register)
  // A1=55, E2=82.4, C2=65.4 — but we use 2-3 semitone frequencies in different registers
  const MOODS = {
    corridor: {
      // Unsettling but not attacking — a held minor chord with very slow pulses.
      drones: [
        { freq: 55,     type: 'sine',     gain: 0.055 }, // deep A (root)
        { freq: 82.4,   type: 'sine',     gain: 0.04  }, // E (fifth)
        { freq: 98.0,   type: 'sine',     gain: 0.03  }, // G (minor 7th for tension)
      ],
      padFreq: 220, // A3 soft pad
      padGain: 0.022,
      filterStart: 500,
      filterEnd: 1100,
      filterLfoHz: 0.05,
      stingInterval: [6, 14], // seconds between creaks
      stingVolume: 0.05,
      noiseVolume: 0.006, // very faint room tone
    },
    flooded: {
      // Wet, deeper, more water-drip cadence; slightly warmer.
      drones: [
        { freq: 49,     type: 'sine',     gain: 0.06  },
        { freq: 73.4,   type: 'sine',     gain: 0.04  },
        { freq: 87.3,   type: 'triangle', gain: 0.022 },
      ],
      padFreq: 196,
      padGain: 0.02,
      filterStart: 400,
      filterEnd: 900,
      filterLfoHz: 0.04,
      stingInterval: [5, 11],
      stingVolume: 0.045,
      noiseVolume: 0.008,
    },
    abyss: {
      // Deepest — bigger minor cluster, more tension.
      drones: [
        { freq: 41.2,   type: 'sine',     gain: 0.07 },  // low E
        { freq: 61.7,   type: 'sine',     gain: 0.042 }, // B
        { freq: 77.8,   type: 'sine',     gain: 0.036 }, // D#
        { freq: 92.5,   type: 'triangle', gain: 0.022 }, // F# — half-dim
      ],
      padFreq: 246.9,
      padGain: 0.024,
      filterStart: 350,
      filterEnd: 800,
      filterLfoHz: 0.035,
      stingInterval: [4, 9],
      stingVolume: 0.06,
      noiseVolume: 0.01,
    },
  };

  function makeNoiseBuffer(ac, seconds) {
    const len = Math.floor(ac.sampleRate * seconds);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    // Pink-ish noise (low-pass filtered white)
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      d[i] = last * 3.5;
    }
    return buf;
  }

  function start(ac, masterGain, opts) {
    if (!ac || !masterGain) return { stop() {} };
    opts = opts || {};
    const mood = MOODS[opts.mood] || MOODS.corridor;

    const nodes = [];
    const stings = [];
    let stopped = false;
    let stingTimer = null;

    // Master bus for ambient
    const bus = ac.createGain();
    bus.gain.value = 0;
    // Fade in over 2.5s
    bus.gain.linearRampToValueAtTime(1, ac.currentTime + 2.5);
    // Slow filter that gently breathes
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 2;
    filter.frequency.value = mood.filterStart;
    // LFO sweeps the filter
    const filterLfo = ac.createOscillator();
    filterLfo.type = 'sine';
    filterLfo.frequency.value = mood.filterLfoHz;
    const filterLfoGain = ac.createGain();
    filterLfoGain.gain.value = (mood.filterEnd - mood.filterStart) / 2;
    filterLfo.connect(filterLfoGain); filterLfoGain.connect(filter.frequency);
    filterLfo.start();

    bus.connect(masterGain);
    filter.connect(bus);

    // Drone voices
    for (const d of mood.drones) {
      const o = ac.createOscillator();
      o.type = d.type;
      o.frequency.value = d.freq;
      const g = ac.createGain();
      g.gain.value = d.gain;
      // Very slow amplitude LFO per drone so they phase in/out
      const ampLfo = ac.createOscillator();
      ampLfo.type = 'sine';
      ampLfo.frequency.value = 0.02 + Math.random() * 0.04;
      const ampLfoGain = ac.createGain();
      ampLfoGain.gain.value = d.gain * 0.4;
      ampLfo.connect(ampLfoGain); ampLfoGain.connect(g.gain);
      ampLfo.start();
      // Slight detune for thickness
      o.detune.value = (Math.random() - 0.5) * 8;
      o.connect(g); g.connect(filter);
      o.start();
      nodes.push(o, ampLfo);
    }

    // Soft pad — chord on top
    const pad = ac.createOscillator();
    pad.type = 'triangle';
    pad.frequency.value = mood.padFreq;
    const padG = ac.createGain();
    padG.gain.value = 0;
    // Fade pad in slowly
    padG.gain.linearRampToValueAtTime(mood.padGain, ac.currentTime + 6);
    pad.detune.value = 4;
    pad.connect(padG); padG.connect(filter);
    pad.start();
    nodes.push(pad);

    // Subtle noise room-tone
    const noiseBuf = makeNoiseBuffer(ac, 6);
    const noiseSrc = ac.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    noiseSrc.loop = true;
    const noiseG = ac.createGain();
    noiseG.gain.value = mood.noiseVolume;
    const noiseFilter = ac.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.value = 600;
    noiseSrc.connect(noiseFilter); noiseFilter.connect(noiseG); noiseG.connect(bus);
    noiseSrc.start();
    nodes.push(noiseSrc);

    // Occasional far-away creaks/stings
    function scheduleSting() {
      if (stopped) return;
      const delay = (mood.stingInterval[0] + Math.random() * (mood.stingInterval[1] - mood.stingInterval[0])) * 1000;
      stingTimer = setTimeout(() => {
        if (stopped) return;
        playSting(ac, filter, mood);
        scheduleSting();
      }, delay);
    }
    scheduleSting();

    return {
      stop() {
        stopped = true;
        if (stingTimer) clearTimeout(stingTimer);
        // Fade out to avoid pops
        try {
          bus.gain.cancelScheduledValues(ac.currentTime);
          bus.gain.setValueAtTime(bus.gain.value, ac.currentTime);
          bus.gain.linearRampToValueAtTime(0, ac.currentTime + 0.8);
          setTimeout(() => {
            for (const n of nodes) { try { n.stop(); } catch(e) {} }
            try { filterLfo.stop(); } catch(e) {}
          }, 900);
        } catch(e) {
          for (const n of nodes) { try { n.stop(); } catch(e) {} }
        }
      },
    };
  }

  function playSting(ac, dest, mood) {
    // A short, breathy minor-chord stab or low creak
    const choice = Math.random();
    if (choice < 0.5) {
      // Low creak — noise burst through a tight bandpass
      const len = 0.8 + Math.random() * 0.6;
      const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * len), ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (d.length * 0.3));
      }
      const src = ac.createBufferSource();
      src.buffer = buf;
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 180 + Math.random() * 300;
      bp.Q.value = 8;
      const g = ac.createGain();
      g.gain.value = mood.stingVolume;
      g.gain.linearRampToValueAtTime(0, ac.currentTime + len);
      src.connect(bp); bp.connect(g); g.connect(dest);
      src.start();
      src.stop(ac.currentTime + len + 0.05);
    } else {
      // Minor-third bell-like tone, slow fade
      const base = 180 + Math.random() * 120;
      const pair = [base, base * 1.189]; // minor third
      for (const f of pair) {
        const o = ac.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        const g = ac.createGain();
        g.gain.value = 0;
        g.gain.linearRampToValueAtTime(mood.stingVolume * 0.7, ac.currentTime + 0.05);
        g.gain.linearRampToValueAtTime(0, ac.currentTime + 1.6);
        o.connect(g); g.connect(dest);
        o.start();
        o.stop(ac.currentTime + 1.7);
      }
    }
  }

  window.HorridorsAmbient = { start };
})();
