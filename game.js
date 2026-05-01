// =====================================================================
// HORRIDORS — Level 1: The Red Keycard Hall (v2)
// Top-down 2D Canvas game. All art drawn programmatically.
// Audio via Web Audio API (procedural).
// =====================================================================

// ---------- Canvas & viewport ----------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const VIEW_W = canvas.width;   // 960
const VIEW_H = canvas.height;  // 600

// ---------- World ----------
const WORLD_W = 2400;
const WORLD_H = 1400;

const camera = { x: 0, y: 0 };

// ---------- Input ----------
const keys = new Set();
const justPressed = new Set();
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k)) e.preventDefault();
  if (!keys.has(k)) justPressed.add(k);
  keys.add(k);
});
window.addEventListener('keyup', (e) => { keys.delete(e.key.toLowerCase()); });
window.addEventListener('blur', () => keys.clear());

const isDown = (...ks) => ks.some(k => keys.has(k));
const wasPressed = (...ks) => ks.some(k => justPressed.has(k));

// ---------- State ----------
const state = {
  scene: 'title',          // 'title' | 'play' | 'puzzle' | 'combo' | 'note' | 'caught' | 'end'
  hasFlashlight: true,     // start with flashlight (so player can see)
  flashlightOn: true,
  batteryCount: 0,         // NEW: need 2 batteries to power the Puzzle Room door
  hasBattery: false,       // legacy alias: true when batteryCount >= 1 (for panel prompts)
  hasToyKey: false,        // unlocks Toy Room (reward for solving Picture Puzzle)
  hasLibKey: false,        // unlocks Library (found in Supply Room)
  hasKeycard: false,
  comboCode: null,         // '731' set on init
  comboSolved: false,
  puzzleSolved: false,
  coins: (window.__horridorsProgress && window.__horridorsProgress.coins) || 0,
  notes: [],               // {title, text}
  rewards: [],
  doorsOpen: { toy: false, puzzle: false, supply: false, lib: false, scanner: false },
  searched: new Set(),     // ids of furniture searched
  chase: { active: false, t: 0, duration: 22, expired: false },
  caughtBy: null,
  alarmFlash: 0,
  hidden: false,
  speakerLine: null,
  speakerT: 0,
  muted: false,
  motherTriggered: false,  // NEW: has the mid-corridor Mother glimpse been shown?
};

// Helper: bump persistent coins — syncs to the global wallet (survives level jumps)
function addCoin(n) {
  n = n || 1;
  state.coins += n;
  if (window.HorridorsWallet) window.HorridorsWallet.addCoins(n);
  if (window.HorridorsStory) window.HorridorsStory.addCoins(n);
  updateCoinHud();
}

// ---------- Audio (procedural) ----------
let audioCtx = null;
let masterGain = null;
let ambientNodes = null;

function ensureAudio() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.5;
    masterGain.connect(audioCtx.destination);
  } catch (e) { /* audio unsupported */ }
}
function setMuted(m) {
  state.muted = m;
  if (masterGain) masterGain.gain.value = m ? 0 : 0.5;
  document.getElementById('btn-mute').textContent = m ? '🔇' : '🔊';
}
function tone(freq, dur=0.15, type='sine', gain=0.2, slideTo=null) {
  if (!audioCtx || state.muted) return;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, audioCtx.currentTime);
  if (slideTo) o.frequency.linearRampToValueAtTime(slideTo, audioCtx.currentTime + dur);
  g.gain.setValueAtTime(gain, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
  o.connect(g); g.connect(masterGain);
  o.start(); o.stop(audioCtx.currentTime + dur + 0.02);
}
function noiseBurst(dur=0.1, gain=0.15, filterFreq=800) {
  if (!audioCtx || state.muted) return;
  const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * dur, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1);
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  const f = audioCtx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = filterFreq;
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(gain, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
  src.connect(f); f.connect(g); g.connect(masterGain);
  src.start(); src.stop(audioCtx.currentTime + dur + 0.02);
}
function sfx(name) {
  switch (name) {
    case 'beep':       tone(880, 0.08, 'square', 0.15); break;
    case 'beep_low':   tone(220, 0.1, 'square', 0.15); break;
    case 'pickup':     tone(600, 0.08, 'triangle', 0.18); setTimeout(()=>tone(900, 0.1, 'triangle', 0.18), 70); break;
    case 'unlock':     tone(440, 0.1, 'sine', 0.2); setTimeout(()=>tone(660, 0.1, 'sine', 0.2), 100); setTimeout(()=>tone(880, 0.18, 'sine', 0.2), 200); break;
    case 'door':       noiseBurst(0.18, 0.12, 600); break;
    case 'rummage':    noiseBurst(0.25, 0.08, 1200); break;
    case 'note':       tone(320, 0.06, 'triangle', 0.12); break;
    case 'wrong':      tone(180, 0.18, 'sawtooth', 0.18, 100); break;
    case 'puzzle_seq': tone(540, 0.18, 'sine', 0.18); break;
    case 'alarm':      tone(880, 0.18, 'square', 0.22); setTimeout(()=>tone(660, 0.18, 'square', 0.22), 200); break;
    case 'whisper':    noiseBurst(0.45, 0.06, 350); break;
    case 'scream':     tone(220, 0.5, 'sawtooth', 0.25, 90); noiseBurst(0.5, 0.12, 600); break;
    case 'jingle':     [523, 659, 784, 1046].forEach((f,i) => setTimeout(()=>tone(f, 0.18, 'triangle', 0.2), i*120)); break;
    case 'hide':       tone(140, 0.4, 'sine', 0.1, 90); break;
  }
}
function startAmbient() {
  if (!audioCtx || state.muted) return;
  if (!ambientNodes && window.HorridorsAmbient) {
    ambientNodes = window.HorridorsAmbient.start(audioCtx, masterGain, { mood: 'corridor' });
  }
  if (window.HorridorsMusic) {
    window.HorridorsMusic.setTheme(audioCtx, masterGain, 'l1');
  }
}

// ---------- Speaker (subtitle) ----------
const subEl = document.getElementById('subtitle');
function _kl(t) { return (window.HorridorsTouch && window.HorridorsTouch.keyLabel) ? window.HorridorsTouch.keyLabel(t) : t; }
function speak(line, ms = 4000) {
  const L = _kl(line);
  state.speakerLine = L;
  state.speakerT = ms / 1000;
  subEl.textContent = L;
  subEl.classList.add('show');
  subEl.classList.add('dismissible');
}
function tickSpeaker(dt) {
  if (state.speakerT > 0) {
    state.speakerT -= dt;
    if (state.speakerT <= 0) {
      state.speakerLine = null;
      subEl.classList.remove('show');
      subEl.classList.remove('dismissible');
    }
  }
}
// Tap or swipe to dismiss subtitle early — reduces screen clutter.
function _dismissSubtitle() {
  if (state.speakerT > 0) {
    state.speakerT = 0;
    state.speakerLine = null;
    subEl.classList.remove('show');
    subEl.classList.remove('dismissible');
  }
}
subEl.addEventListener('click', _dismissSubtitle);
subEl.addEventListener('touchstart', (e) => { e.stopPropagation(); _dismissSubtitle(); }, { passive: true });

// ---------- Geometry: walls, rooms, doors ----------
// Corridor runs horizontally near y=900..1080, x=200..2240.
// Rooms hang off the corridor at the top (y < 900).
//
//   Toy Room        Puzzle Room       Supply Room       Library
//   x:240..640      x:760..1160       x:1280..1680      x:1800..2200
//   y:200..820      y:200..820        y:200..820        y:200..820
//
// At end of corridor (right): scanner door -> treasure room (x:2280..2400)
//
// Each room has a door (gap in wall) on its bottom edge.

const CORR_TOP = 900;
const CORR_BOT = 1080;
const CORR_LEFT = 200;
const CORR_RIGHT = 2240;

const ROOM_TOP = 200;
const ROOM_BOT = 820;

const ROOMS = {
  toy:    { id: 'toy',    name: 'Toy Room',    x: 240,  w: 400, doorX: 440 },
  puzzle: { id: 'puzzle', name: 'Puzzle Room', x: 760,  w: 400, doorX: 960 },
  supply: { id: 'supply', name: 'Supply Room', x: 1280, w: 400, doorX: 1480 },
  lib:    { id: 'lib',    name: 'Library',     x: 1800, w: 400, doorX: 2000 },
};

// Generate walls as solid axis-aligned rectangles.
const walls = [];
function addWall(x, y, w, h) { walls.push({ x, y, w, h }); }

// World bounds (thick walls outside view)
addWall(-200, -200, WORLD_W + 400, 200);                       // top
addWall(-200, WORLD_H, WORLD_W + 400, 200);                    // bottom
addWall(-200, -200, 200, WORLD_H + 400);                       // left
addWall(WORLD_W, -200, 200, WORLD_H + 400);                    // right

// Seal the void ABOVE the corridor, outside the rooms.
// Rooms span CORR_LEFT..CORR_RIGHT horizontally and ROOM_TOP..ROOM_BOT vertically.
// The strip between ROOM_BOT and CORR_TOP (y=820..900), and anything left of the leftmost
// room or right of the rightmost room above corridor y, is empty walkable void.
// Block it with tall walls on each side of the rooms row.
const LEFTMOST_ROOM_LEFT  = Math.min(...Object.values(ROOMS).map(r => r.x));
const RIGHTMOST_ROOM_RIGHT = Math.max(...Object.values(ROOMS).map(r => r.x + r.w));
// Strip between rooms row bottom and corridor top, full world width
addWall(0, ROOM_BOT, LEFTMOST_ROOM_LEFT, CORR_TOP - ROOM_BOT);
addWall(RIGHTMOST_ROOM_RIGHT, ROOM_BOT, WORLD_W - RIGHTMOST_ROOM_RIGHT, CORR_TOP - ROOM_BOT);
// Also seal the strips BETWEEN adjacent rooms so the player can't slip into the
// gap that separates Toy↔Puzzle, Puzzle↔Supply, or Supply↔Library (the area
// above the corridor where two rooms' side walls face each other).
{
  const sorted = Object.values(ROOMS).slice().sort((a, b) => a.x - b.x);
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    const gapLeft  = a.x + a.w;
    const gapRight = b.x;
    if (gapRight > gapLeft) {
      addWall(gapLeft, ROOM_BOT, gapRight - gapLeft, CORR_TOP - ROOM_BOT);
    }
  }
}
// Strip above rooms (y=0..ROOM_TOP), full world width — keep player out of the sky
addWall(0, 0, WORLD_W, ROOM_TOP);

// Corridor north and south walls (with gaps for room doors)
function addCorridorTopWall() {
  // Top wall of corridor — gap at each room's doorX (width 80)
  let x = CORR_LEFT;
  const gaps = Object.values(ROOMS).map(r => ({ a: r.doorX - 40, b: r.doorX + 40 })).sort((a,b)=>a.a-b.a);
  for (const g of gaps) {
    if (g.a > x) addWall(x, CORR_TOP - 12, g.a - x, 12);
    x = g.b;
  }
  if (CORR_RIGHT > x) addWall(x, CORR_TOP - 12, CORR_RIGHT - x, 12);
}
function addCorridorBottomWall() {
  // Full-width bottom seal so player cannot slip off the corridor into the void.
  // Covers everything below y=CORR_BOT across the entire world width.
  addWall(0, CORR_BOT, WORLD_W, WORLD_H - CORR_BOT);
}
addCorridorTopWall();
addCorridorBottomWall();

// Corridor end walls (left dead-end + right scanner wall)
addWall(CORR_LEFT - 12, CORR_TOP, 12, CORR_BOT - CORR_TOP);
// Right wall has a doorway gap (scanner) when open. We model it as wall but allow pass-through when scanner solved.
const scannerWall = { x: CORR_RIGHT, y: CORR_TOP, w: 12, h: CORR_BOT - CORR_TOP };
walls.push(scannerWall);

// Room walls (each room is an enclosed rect with a door gap on bottom)
for (const room of Object.values(ROOMS)) {
  const left = room.x;
  const right = room.x + room.w;
  // top wall
  addWall(left, ROOM_TOP - 12, room.w, 12);
  // left wall
  addWall(left - 12, ROOM_TOP, 12, ROOM_BOT - ROOM_TOP);
  // right wall
  addWall(right, ROOM_TOP, 12, ROOM_BOT - ROOM_TOP);
  // bottom wall: split around door (gap 80 wide)
  const doorA = room.doorX - 40;
  const doorB = room.doorX + 40;
  if (doorA > left) addWall(left, ROOM_BOT, doorA - left, 12);
  if (right > doorB) addWall(doorB, ROOM_BOT, right - doorB, 12);
  room.left = left; room.right = right; room.top = ROOM_TOP; room.bottom = ROOM_BOT;
  room.doorY = ROOM_BOT;
}

// Treasure room beyond scanner (small, off the right edge of corridor)
const TREASURE = { x: 2260, y: CORR_TOP - 60, w: 140, h: 300 };
addWall(TREASURE.x + TREASURE.w, TREASURE.y, 12, TREASURE.h); // right wall (closed)
addWall(TREASURE.x, TREASURE.y - 12, TREASURE.w + 12, 12);    // top
addWall(TREASURE.x, TREASURE.y + TREASURE.h, TREASURE.w + 12, 12); // bottom

// ---------- Doors (locked walls) ----------
// Doors are virtual walls placed in the room's bottom gap until unlocked/open.
// NOTE (Apr 2026): All non-entry doors now start LOCKED. Supply Room is the
// entry point and opens without a key (see interact handler below — it checks
// id==='supply' and bypasses lock). Puzzle requires both batteries (power).
// Library requires brass key (found in Supply). Toy requires Toy Key (reward
// for solving the Picture Puzzle).
const doors = [
  { id: 'toy',     room: ROOMS.toy,     locked: true,  open: false, label: 'Toy Room' },
  { id: 'puzzle',  room: ROOMS.puzzle,  locked: true,  open: false, label: 'Puzzle Room' },
  { id: 'supply',  room: ROOMS.supply,  locked: false, open: false, label: 'Supply Room' },
  { id: 'lib',     room: ROOMS.lib,     locked: true,  open: false, label: 'Library' },
];

function doorRect(d) {
  return { x: d.room.doorX - 40, y: d.room.bottom - 4, w: 80, h: 16 };
}

// ---------- Furniture (searchable + decorative) ----------
// Each piece blocks movement (AABB). Some are searchable -> reveal items/notes when interacted.
//
// id, room, x, y, w, h, kind, label, search? -> {prompt, onSearch()}
const furniture = [];

function addFurn(props) { furniture.push(Object.assign({ search: null, decoration: false }, props)); }

// === TOY ROOM (cluttered playroom — find Toy Room key in corridor first) ===
const TR = ROOMS.toy;
addFurn({ id: 'toy_bed',     room: TR.id, x: TR.left + 30,  y: TR.top + 40,  w: 120, h: 80, kind: 'bed',     label: 'small bed',     prompt: 'Look under the bed' });
addFurn({ id: 'toy_chest',   room: TR.id, x: TR.left + 200, y: TR.top + 60,  w: 90,  h: 60, kind: 'chest',   label: 'toy chest',     prompt: 'Open the toy chest' });
addFurn({ id: 'toy_shelf',   room: TR.id, x: TR.left + 320, y: TR.top + 30,  w: 60,  h: 200, kind: 'shelf',   label: 'shelf',         prompt: 'Search the shelf' });
addFurn({ id: 'toy_blocks',  room: TR.id, x: TR.left + 60,  y: TR.top + 180, w: 60,  h: 60,  kind: 'blocks',  label: 'block tower',   decoration: true });
addFurn({ id: 'toy_horse',   room: TR.id, x: TR.left + 220, y: TR.top + 200, w: 80,  h: 60,  kind: 'horse',   label: 'rocking horse', decoration: true });
addFurn({ id: 'toy_dollhse', room: TR.id, x: TR.left + 40,  y: TR.top + 320, w: 100, h: 90,  kind: 'doll',    label: 'doll house',    prompt: 'Peek inside doll house' });
addFurn({ id: 'toy_drawer',  room: TR.id, x: TR.left + 220, y: TR.top + 350, w: 80,  h: 70,  kind: 'drawer',  label: 'crayon drawer', prompt: 'Open crayon drawer' });
addFurn({ id: 'toy_rug',     room: TR.id, x: TR.left + 100, y: TR.top + 480, w: 200, h: 100, kind: 'rug',     label: 'rug',           decoration: true });

// === PUZZLE ROOM (the picture lock) ===
const PR = ROOMS.puzzle;
addFurn({ id: 'pz_panel',  room: PR.id, x: PR.left + 160, y: PR.top + 30,  w: 80,  h: 40,  kind: 'panel',  label: 'picture panel', prompt: 'Use picture lock' });
addFurn({ id: 'pz_table',  room: PR.id, x: PR.left + 140, y: PR.top + 220, w: 120, h: 60,  kind: 'table',  label: 'table',         decoration: true });
addFurn({ id: 'pz_chair1', room: PR.id, x: PR.left + 90,  y: PR.top + 240, w: 40,  h: 40,  kind: 'chair',  label: 'chair',         decoration: true });
addFurn({ id: 'pz_chair2', room: PR.id, x: PR.left + 270, y: PR.top + 240, w: 40,  h: 40,  kind: 'chair',  label: 'chair',         decoration: true });
addFurn({ id: 'pz_cab1',   room: PR.id, x: PR.left + 30,  y: PR.top + 30,  w: 80,  h: 60,  kind: 'cabinet',label: 'cabinet',       prompt: 'Search cabinet' });
addFurn({ id: 'pz_cab2',   room: PR.id, x: PR.left + 290, y: PR.top + 30,  w: 80,  h: 60,  kind: 'cabinet',label: 'cabinet',       prompt: 'Search cabinet' });
addFurn({ id: 'pz_basket', room: PR.id, x: PR.left + 50,  y: PR.top + 460, w: 60,  h: 60,  kind: 'basket', label: 'wicker basket', prompt: 'Look in basket' });
addFurn({ id: 'pz_clock',  room: PR.id, x: PR.left + 320, y: PR.top + 460, w: 60,  h: 80,  kind: 'clock',  label: 'tall clock',    prompt: 'Inspect clock' });

// === SUPPLY ROOM (combo locker) ===
const SR = ROOMS.supply;
addFurn({ id: 'sp_locker1', room: SR.id, x: SR.left + 30,  y: SR.top + 30,  w: 60,  h: 110, kind: 'locker', label: 'red locker',   prompt: 'Open red locker (combo)' });
addFurn({ id: 'sp_locker2', room: SR.id, x: SR.left + 110, y: SR.top + 30,  w: 60,  h: 110, kind: 'locker_g', label: 'green locker', prompt: 'Open green locker' });
addFurn({ id: 'sp_locker3', room: SR.id, x: SR.left + 190, y: SR.top + 30,  w: 60,  h: 110, kind: 'locker_b', label: 'blue locker',  prompt: 'Open blue locker' });
addFurn({ id: 'sp_crate1',  room: SR.id, x: SR.left + 290, y: SR.top + 50,  w: 80,  h: 70,  kind: 'crate',  label: 'wooden crate', prompt: 'Open crate' });
addFurn({ id: 'sp_shelf',   room: SR.id, x: SR.left + 30,  y: SR.top + 200, w: 340, h: 30,  kind: 'shelf2', label: 'shelf',        prompt: 'Search shelf' });
addFurn({ id: 'sp_barrel',  room: SR.id, x: SR.left + 60,  y: SR.top + 320, w: 60,  h: 60,  kind: 'barrel', label: 'barrel',       prompt: 'Look in barrel' });
addFurn({ id: 'sp_mop',     room: SR.id, x: SR.left + 200, y: SR.top + 320, w: 30,  h: 100, kind: 'mop',    label: 'mop',          decoration: true });
addFurn({ id: 'sp_box',     room: SR.id, x: SR.left + 270, y: SR.top + 360, w: 100, h: 80,  kind: 'box',    label: 'cardboard box',prompt: 'Search box' });
addFurn({ id: 'sp_table',   room: SR.id, x: SR.left + 50,  y: SR.top + 470, w: 200, h: 80,  kind: 'workbench',label: 'workbench',  prompt: 'Look on workbench' });

// === LIBRARY (where Hollow lurks) ===
const LR = ROOMS.lib;
addFurn({ id: 'lb_shelf1', room: LR.id, x: LR.left + 20,  y: LR.top + 30,  w: 50, h: 250, kind: 'bookcase', label: 'bookcase', prompt: 'Browse books' });
addFurn({ id: 'lb_shelf2', room: LR.id, x: LR.left + 90,  y: LR.top + 30,  w: 50, h: 250, kind: 'bookcase', label: 'bookcase', prompt: 'Browse books' });
addFurn({ id: 'lb_shelf3', room: LR.id, x: LR.left + 280, y: LR.top + 30,  w: 50, h: 250, kind: 'bookcase', label: 'bookcase', prompt: 'Browse books' });
addFurn({ id: 'lb_shelf4', room: LR.id, x: LR.left + 350, y: LR.top + 30,  w: 50, h: 250, kind: 'bookcase', label: 'bookcase', prompt: 'Browse books' });
addFurn({ id: 'lb_desk',   room: LR.id, x: LR.left + 150, y: LR.top + 380, w: 120, h: 70, kind: 'desk',   label: 'reading desk', prompt: 'Search desk' });
addFurn({ id: 'lb_chair',  room: LR.id, x: LR.left + 190, y: LR.top + 460, w: 40,  h: 40, kind: 'chair',  label: 'chair', decoration: true });
addFurn({ id: 'lb_globe',  room: LR.id, x: LR.left + 50,  y: LR.top + 400, w: 50,  h: 60, kind: 'globe',  label: 'globe', prompt: 'Spin globe' });
addFurn({ id: 'lb_bin',    room: LR.id, x: LR.left + 320, y: LR.top + 420, w: 40,  h: 50, kind: 'bin',    label: 'wastebin', prompt: 'Look in wastebin' });

// === Treasure chest in treasure room
addFurn({ id: 'tr_chest',  room: 'treasure', x: TREASURE.x + 40, y: TREASURE.y + 110, w: 70, h: 60, kind: 'tchest', label: 'treasure chest', prompt: 'Open the chest!' });

// All furniture also pushes a wall (collision rect) unless decoration is "rug" type
const NON_BLOCKING = new Set(['rug']);
for (const f of furniture) {
  if (NON_BLOCKING.has(f.kind)) continue;
  const wall = { x: f.x, y: f.y, w: f.w, h: f.h, _isFurn: true };
  walls.push(wall);
  f.blocks = true;
}

// ---------- Items (loose pickups in world) ----------
// These are not behind furniture — they're visible on the floor. Items hidden in furniture spawn on search.
const items = [];
function addItem(props) { items.push(Object.assign({ collected: false }, props)); }

// --- Corridor collectibles (coins only now; Toy Key moved to Picture Puzzle reward) ---
// These are Mum's coins — every one counts for the vending machine (later level).
addItem({ id: 'corr_coin',   x: 1200, y: 1020, label: "Mum's coin", icon: 'coin', prompt: "Pick up Mum's coin", onPickup(){ addCoin(1); sfx('pickup'); }});
addItem({ id: 'corr_coin2',  x: 340,  y: 990,  label: "Mum's coin", icon: 'coin', prompt: "Pick up Mum's coin", onPickup(){ addCoin(1); sfx('pickup'); }});
addItem({ id: 'corr_coin3',  x: 820,  y: 1040, label: "Mum's coin", icon: 'coin', prompt: "Pick up Mum's coin", onPickup(){ addCoin(1); sfx('pickup'); }});
addItem({ id: 'corr_coin4',  x: 1080, y: 995,  label: "Mum's coin", icon: 'coin', prompt: "Pick up Mum's coin", onPickup(){ addCoin(1); sfx('pickup'); }});
addItem({ id: 'corr_coin5',  x: 1420, y: 1030, label: "Mum's coin", icon: 'coin', prompt: "Pick up Mum's coin", onPickup(){ addCoin(1); sfx('pickup'); }});
addItem({ id: 'corr_coin6',  x: 1640, y: 990,  label: "Mum's coin", icon: 'coin', prompt: "Pick up Mum's coin", onPickup(){ addCoin(1); sfx('pickup'); }});
addItem({ id: 'corr_coin7',  x: 1860, y: 1035, label: "Mum's coin", icon: 'coin', prompt: "Pick up Mum's coin", onPickup(){ addCoin(1); sfx('pickup'); }});
addItem({ id: 'corr_coin8',  x: 2040, y: 985,  label: "Mum's coin", icon: 'coin', prompt: "Pick up Mum's coin", onPickup(){ addCoin(1); sfx('pickup'); }});
addItem({ id: 'corr_coin9',  x: 2170, y: 1030, label: "Mum's coin", icon: 'coin', prompt: "Pick up Mum's coin", onPickup(){ addCoin(1); sfx('pickup'); }});
addItem({ id: 'corr_coin10', x: 480,  y: 1035, label: "Mum's coin", icon: 'coin', prompt: "Pick up Mum's coin", onPickup(){ addCoin(1); sfx('pickup'); }});

// Hidden GEM (Level 1) — tucked behind the radiator near the right dead-end of the corridor
addItem({
  id: 'l1_gem', x: 2360, y: 1040,
  label: '💎 ?', icon: 'gem', gemColor: '#ffb347',
  prompt: 'Pick up a mysterious gem',
  onPickup() { sfx('jingle'); if (window.HorridorsStory) window.HorridorsStory.unlockGem('l1_diary'); },
});

// ---------- Hidden item spawn helper ----------
function spawnAt(x, y, props) { addItem(Object.assign({ x, y }, props)); }

// ---------- Searchable: define onSearch handlers per furniture ----------
// Use note creation, item spawns, key drops, etc.
const SEARCH = {
  // TOY ROOM (final prize room — needs Toy Key which is won at Picture Puzzle)
  toy_bed: (f) => {
    addNote('Crayon drawing', "A child drew a tall man with a smile. Underneath:\n  'do not look at the fourth picture.'");
    return 'A folded crayon drawing.';
  },
  toy_chest: (f) => {
    // Toy chest is where the RED KEYCARD hides now.
    spawnAt(f.x + f.w/2, f.y + f.h + 10, {
      id: 'keycard', label: 'RED KEYCARD', icon: 'keycard', prompt: 'Pick up RED keycard', onPickup() {
        state.hasKeycard = true;
        try { window.HorridorsHints && window.HorridorsHints.setProgressKey('l1-keycard'); } catch(e) {}
        document.getElementById('hud-keycard').classList.add('has');
        speak('RED KEYCARD. Something woke up.', 3200);
        sfx('pickup');
        setObjective('Run. The scanner is at the end of the corridor.');
        refreshChecklist();
        startChase();
      }
    });
    return 'Under blankets: the RED KEYCARD glints.';
  },
  toy_shelf: () => {
    addNote('Picture book — torn page', 'A page is torn out.');
    return 'A torn page from a picture book.';
  },
  toy_dollhse: () => {
    addCoin(2); sfx('pickup');
    return 'Two coins were tucked in the doll bedroom.';
  },
  toy_drawer: () => {
    addCoin(2); sfx('pickup');
    return 'Two crayon-coloured coins.';
  },
  // PUZZLE ROOM (needs BOTH batteries to power the picture lock)
  pz_panel: () => {
    if (state.batteryCount < 2) return `The panel is dead. Batteries: ${state.batteryCount}/2.`;
    if (state.puzzleSolved) return 'Already solved. The Toy Room is yours.';
    Puzzle.open();
    return null; // overlay opens
  },
  pz_cab1: () => {
    addNote('Speaker memo', '"If a door asks you a question, lie. The doors prefer it."');
    return 'A typed memo, smudged with red.';
  },
  pz_cab2: () => {
    addCoin(1); sfx('pickup');
    return 'One coin and a button shaped like an eye.';
  },
  pz_basket: () => {
    addNote('Knitting tag', "Made by mother. For the smile child.");
    return 'A knitting tag. The wool is patchwork.';
  },
  pz_clock: () => {
    addNote('Clock face', "Every hand points at SEVEN.\nAll three of them.");
    return 'The clock has three hands. They all point at 7.';
  },
  // SUPPLY ROOM
  sp_locker1: () => {
    if (state.comboSolved) return 'Already empty.';
    Combo.open();
    return null;
  },
  sp_locker2: () => 'Empty except for a sour smell.',
  sp_locker3: () => {
    // Clue difficulty scales with the selected tier:
    //   easy   → the literal code (7-3-1) plus the riddle
    //   normal → the riddle only (as originally designed)
    //   hard   → a one-line cryptic nudge, player must work it all out
    const tier = (window.__difficulty && window.__difficulty.id && window.__difficulty.id()) || 'normal';
    if (tier === 'easy') {
      addNote(
        'Janitor scribble',
        "Code on the red locker:  7 — 3 — 1\n\n(the janitor wrote it big so even HE could remember)\n\nhighest hour  \u2192 7\ncount of doors \u2192 3\nsmiles he wears \u2192 1"
      );
    } else if (tier === 'hard') {
      addNote('Janitor scribble', 'Code on the red locker:\n  highest hour // count of doors // smiles he wears');
    } else {
      addNote('Janitor scribble', "Code on the red locker:\n  first: highest hour\n  second: count of doors\n  third: smiles he wears");
    }
    return 'A scrap stuck inside the door.';
  },
  sp_crate: () => 'Just packing peanuts.',
  sp_crate1: () => {
    // BATTERY #1 + a note revealing where the library key is
    spawnAt(SR.left + 330, SR.top + 130, {
      id: 'battery1', label: 'square battery (1/2)', icon: 'battery', prompt: 'Pick up battery', onPickup() {
        state.batteryCount += 1;
        state.hasBattery = true;
        document.getElementById('hud-battery').classList.add('has');
        speak(`Battery ${state.batteryCount} of 2.`, 2600);
        sfx('pickup');
        if (state.batteryCount >= 2) {
          // Unlock the Puzzle Room now that both batteries are in hand
          const pz = doors.find(d=>d.id==='puzzle'); if (pz) pz.locked = false;
          setObjective('Something hums. A door changed.');
        }
        refreshChecklist();
      }
    });
    return 'A battery! One of two needed for the picture panel.';
  },
  sp_shelf: () => {
    addCoin(1); sfx('pickup');
    return 'A coin on the top shelf.';
  },
  sp_barrel: () => {
    addCoin(1); sfx('pickup');
    return 'A coin clinks at the bottom.';
  },
  sp_box: () => {
    addNote('Wax-sealed letter', "Dear Smile,\nThe boy can have the corridor.\nI will keep the rooms.\n— H.");
    return 'A letter sealed with red wax.';
  },
  sp_table: () => {
    // WORKBENCH holds the brass LIBRARY KEY now.
    if (state.hasLibKey) return 'Nothing else of use.';
    spawnAt(SR.left + 120, SR.top + 510, {
      id: 'lib_key', label: 'BRASS KEY (Library)', icon: 'key_brass', prompt: 'Pick up BRASS KEY', onPickup() {
        state.hasLibKey = true;
        try { window.HorridorsHints && window.HorridorsHints.setProgressKey('l1-libkey'); } catch(e) {}
        doors.find(d=>d.id==='lib').locked = false;
        document.getElementById('hud-key2').classList.add('has');
        speak('A brass key. Heavy.', 2400);
        sfx('pickup');
        refreshChecklist();
      }
    });
    return 'A brass key behind a tool.';
  },
  // LIBRARY
  lb_shelf1: () => 'Books about polite ghosts.',
  lb_shelf2: () => {
    addCoin(1); sfx('pickup');
    return 'A coin fell out from between pages.';
  },
  lb_shelf3: () => {
    addNote('Bookmark', "If the air gets cold, do not turn around.\nSit very still.");
    return 'A bookmark.';
  },
  lb_shelf4: () => 'A row of identical red spines. None will open.',
  lb_desk: () => {
    // BATTERY #2 is here now
    spawnAt(LR.left + 210, LR.top + 430, {
      id: 'battery2', label: 'square battery (2/2)', icon: 'battery', prompt: 'Pick up battery', onPickup() {
        state.batteryCount += 1;
        state.hasBattery = true;
        document.getElementById('hud-battery').classList.add('has');
        speak(`Battery ${state.batteryCount} of 2.`, 2600);
        sfx('pickup');
        if (state.batteryCount >= 2) {
          const pz = doors.find(d=>d.id==='puzzle'); if (pz) pz.locked = false;
          setObjective('Something hums. A door changed.');
        }
        refreshChecklist();
      }
    });
    addNote('Librarian\'s bookmark', 'Drawings in the margin:\n  ☽   👁️   🗝   ☺');
    return 'A battery on the log — and a bookmark with four small sketches.';
  },
  lb_globe: () => 'The globe has only one country on it. It has no name.',
  lb_bin: () => {
    addCoin(1); sfx('pickup');
    return 'A coin and many crumpled drawings of eyes.';
  },
  // Treasure chest
  tr_chest: () => {
    if (state.scene === 'end') return null;
    endLevel();
    return null;
  },
};

// ---------- Notes / Objectives HUD ----------
function addNote(title, text) {
  state.notes.push({ title, text });
  showNote(title, text);
  sfx('note');
}
const noteTitleEl = document.getElementById('note-title');
const noteTextEl = document.getElementById('note-text');
const overlayNote = document.getElementById('overlay-note');
function showNote(title, text) {
  noteTitleEl.textContent = title;
  noteTextEl.textContent = text;
  overlayNote.classList.remove('hidden');
  state._prevScene = state.scene;
  state.scene = 'note';
}
document.getElementById('btn-note-close').addEventListener('click', () => { if (l1Running) closeNote(); });
function closeNote() {
  overlayNote.classList.add('hidden');
  if (state.scene === 'note') state.scene = state._prevScene || 'play';
}

const objEl = document.getElementById('hud-objective');
function setObjective(text) { objEl.textContent = _kl(text); }

// Notes drawer
const notesListEl = document.getElementById('notes-list');
const overlayNotes = document.getElementById('overlay-notes');
document.getElementById('btn-notes').addEventListener('click', () => { if (l1Running) toggleNotes(); });
document.getElementById('btn-notes-close').addEventListener('click', () => { if (l1Running) toggleNotes(); });
function toggleNotes() {
  if (overlayNotes.classList.contains('hidden')) {
    notesListEl.innerHTML = '';
    if (state.notes.length === 0) {
      notesListEl.innerHTML = '<div class="notes-empty">No clues yet. Search drawers, shelves, and beds.</div>';
    } else {
      for (const n of state.notes) {
        const row = document.createElement('div');
        row.className = 'note-row';
        row.innerHTML = `<div class="note-row-title">${escapeHtml(n.title)}</div><div class="note-row-text">${escapeHtml(n.text)}</div>`;
        notesListEl.appendChild(row);
      }
    }
    overlayNotes.classList.remove('hidden');
    state._prevScene = state.scene;
    state.scene = 'note';
  } else {
    overlayNotes.classList.add('hidden');
    if (state.scene === 'note') state.scene = state._prevScene || 'play';
  }
}
function escapeHtml(s) { return s.replace(/[&<>]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;'})[c]); }

function updateCoinHud() {
  // Prefer the canonical wallet (survives level jumps). Fall back to story module.
  let shared;
  if (window.HorridorsWallet) shared = window.HorridorsWallet.getCoins();
  else if (window.HorridorsStory) shared = window.HorridorsStory.getCoins();
  else shared = state.coins;
  state.coins = shared;
  const el = document.querySelector('#hud-coins .hud-label');
  if (el) el.textContent = `Coins ${shared}`;
}

// ---------- Player ----------
const player = {
  x: 260, y: 990, w: 22, h: 22, vx: 0, vy: 0, facing: 0, // radians; 0 = right
  walkPhase: 0,
};

const MONSTER_BASE_SPEED = 117;
const HOLLOW_BASE_SPEED = 70;

const monster = {
  active: false, x: 0, y: 0, w: 26, h: 26, speed: MONSTER_BASE_SPEED, kind: 'grin',
};

// Hollow (library lurker) — appears once player has been in library for >3s without moving much
const hollow = {
  active: false, x: 0, y: 0, w: 24, h: 28, speed: HOLLOW_BASE_SPEED, alertness: 0,
};

// Read difficulty multipliers at runtime (difficulty may change between runs).
function _diff() {
  try { return window.__difficulty && window.__difficulty.get(); } catch (e) {}
  return { speedMul: 1, aggroMul: 1, oneHit: false };
}

// ---------- Collision ----------
function aabb(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function collidesWalls(rect, ignoreScannerOpen=true) {
  for (const w of walls) {
    if (ignoreScannerOpen && state.doorsOpen.scanner && w === scannerWall) continue;
    if (aabb(rect, w)) return true;
  }
  for (const d of doors) {
    if (d.open) continue;
    if (aabb(rect, doorRect(d))) return true;
  }
  return false;
}
function moveWithCollisions(entity, dx, dy) {
  // X
  let test = { x: entity.x + dx, y: entity.y, w: entity.w, h: entity.h };
  if (!collidesWalls(test)) entity.x += dx;
  // Y
  test = { x: entity.x, y: entity.y + dy, w: entity.w, h: entity.h };
  if (!collidesWalls(test)) entity.y += dy;
}

// ---------- Camera ----------
function updateCamera() {
  const tx = player.x + player.w/2 - VIEW_W/2;
  const ty = player.y + player.h/2 - VIEW_H/2;
  camera.x += (tx - camera.x) * 0.18;
  camera.y += (ty - camera.y) * 0.18;
  camera.x = Math.max(-40, Math.min(WORLD_W - VIEW_W + 40, camera.x));
  camera.y = Math.max(-40, Math.min(WORLD_H - VIEW_H + 40, camera.y));
}

// ---------- Interaction ----------
function nearestInteractable() {
  const cx = player.x + player.w/2, cy = player.y + player.h/2;
  let best = null, bestD = 110 * 110; // search radius²

  // Items
  for (const it of items) {
    if (it.collected) continue;
    const dx = (it.x) - cx, dy = (it.y) - cy;
    const d = dx*dx + dy*dy;
    if (d < bestD) { bestD = d; best = { kind: 'item', ref: it }; }
  }
  // Furniture (only searchable, only if not yet searched OR repeatable like panel/locker)
  for (const f of furniture) {
    if (!f.prompt) continue;
    const repeatable = (f.id === 'pz_panel' || f.id === 'sp_locker1' || f.id === 'tr_chest');
    if (state.searched.has(f.id) && !repeatable) continue;
    if (f.id === 'pz_panel' && state.puzzleSolved) continue;
    if (f.id === 'sp_locker1' && state.comboSolved) continue;
    const fx = f.x + f.w/2, fy = f.y + f.h/2;
    const dx = fx - cx, dy = fy - cy;
    const d = dx*dx + dy*dy;
    if (d < bestD) { bestD = d; best = { kind: 'furn', ref: f }; }
  }
  // Doors
  for (const d of doors) {
    const dr = doorRect(d);
    const fx = dr.x + dr.w/2, fy = dr.y + dr.h/2;
    const dx = fx - cx, dy = fy - cy;
    const dist = dx*dx + dy*dy;
    if (dist < bestD) { bestD = dist; best = { kind: 'door', ref: d }; }
  }
  // Scanner door at corridor end
  const scanner = { x: CORR_RIGHT - 10, y: CORR_TOP + 50, w: 30, h: 80 };
  const sx = scanner.x + scanner.w/2, sy = scanner.y + scanner.h/2;
  const sdx = sx - cx, sdy = sy - cy;
  const sd = sdx*sdx + sdy*sdy;
  if (sd < bestD) { bestD = sd; best = { kind: 'scanner', ref: scanner }; }

  return best;
}

const promptEl = document.getElementById('prompt');
function showPrompt(text) { promptEl.textContent = _kl(text); promptEl.classList.add('show'); }
function hidePrompt() { promptEl.classList.remove('show'); }

function interact(target) {
  if (!target) return;
  if (target.kind === 'item') {
    const it = target.ref;
    it.collected = true;
    if (it.onPickup) it.onPickup();
    return;
  }
  if (target.kind === 'door') {
    const d = target.ref;
    if (d.locked) {
      sfx('beep_low');
      speak('Locked.', 1600);
      return;
    }
    d.open = true;
    state.doorsOpen[d.id] = true;
    sfx('door');
    speak(`${d.room.name} opens.`, 2200);
    return;
  }
  if (target.kind === 'furn') {
    const f = target.ref;
    const handler = SEARCH[f.id];
    if (!handler) return;
    const result = handler(f);
    if (result !== null) {
      state.searched.add(f.id);
      try { window.HorridorsHints && window.HorridorsHints.setProgressKey('l1-search'); } catch(e) {}
      sfx('rummage');
      if (result) speak(result, 3500);
    }
    return;
  }
  if (target.kind === 'scanner') {
    if (state.chase.expired && !state.doorsOpen.scanner) {
      sfx('beep_low');
      speak('Scanner: DEAD. Too late.', 2500);
      return;
    }
    if (!state.hasKeycard) {
      sfx('beep_low');
      speak('Scanner needs the RED keycard.', 2500);
      return;
    }
    if (!state.doorsOpen.scanner) {
      state.doorsOpen.scanner = true;
      try { window.HorridorsHints && window.HorridorsHints.setProgressKey('l1-escape'); } catch(e) {}
      sfx('unlock');
      speak('Scanner: ACCESS GRANTED. Run.', 3500);
      setObjective('Reach the chest in the treasure room.');
      refreshChecklist();
    }
    return;
  }
}

// ---------- Picture Puzzle ----------
const Puzzle = {
  solution: ['moon', 'eye', 'key', 'smile'],
  input: [],
  isOpen: false,
  showingDemo: false,
  open() {
    this.isOpen = true;
    this.input = [];
    state._prevScene = state.scene;
    state.scene = 'puzzle';
    document.getElementById('overlay-puzzle').classList.remove('hidden');
    document.getElementById('puzzle-status').textContent = '';
    document.getElementById('puzzle-sub').textContent = 'Watch carefully…';
    this.demo();
  },
  close() {
    this.isOpen = false;
    document.getElementById('overlay-puzzle').classList.add('hidden');
    if (state.scene === 'puzzle') state.scene = 'play';
  },
  demo() {
    this.showingDemo = true;
    document.querySelectorAll('.frame-btn').forEach(b => b.classList.remove('active'));
    // Easy mode: show the sequence SLOWER and TWICE so a 7-year-old has a fair
    // chance to learn it. Normal/hard: one pass at the original speed.
    const tier = (window.__difficulty && window.__difficulty.id && window.__difficulty.id()) || 'normal';
    const slow = tier === 'easy';
    const passes = slow ? 2 : 1;
    const litMs = slow ? 520 : 380;
    const gapMs = slow ? 820 : 600;
    let pass = 0;
    const runPass = () => {
      let i = 0;
      const flash = () => {
        if (i >= this.solution.length) {
          pass += 1;
          if (pass < passes) {
            const sub = document.getElementById('puzzle-sub');
            if (sub) sub.textContent = 'Once more…';
            setTimeout(runPass, 700);
          } else {
            this.showingDemo = false;
            document.getElementById('puzzle-sub').textContent = 'Now repeat it.';
          }
          return;
        }
        const sym = this.solution[i];
        const btn = document.querySelector(`.frame-btn[data-symbol="${sym}"]`);
        btn.classList.add('active');
        sfx('puzzle_seq');
        setTimeout(() => btn.classList.remove('active'), litMs);
        i++;
        setTimeout(flash, gapMs);
      };
      setTimeout(flash, 300);
    };
    runPass();
  },
  press(sym) {
    if (this.showingDemo) return;
    this.input.push(sym);
    sfx('beep');
    const i = this.input.length - 1;
    const expected = this.solution[i];
    document.querySelectorAll('.seq-dot').forEach((d, k) => {
      d.classList.toggle('on', k < this.input.length);
    });
    if (sym !== expected) {
      sfx('wrong');
      document.getElementById('puzzle-status').textContent = 'WRONG. Try again.';
      this.input = [];
      document.querySelectorAll('.seq-dot').forEach(d => d.classList.remove('on'));
      setTimeout(()=>this.demo(), 800);
      return;
    }
    if (this.input.length === this.solution.length) {
      this.solved();
    }
  },
  solved() {
    state.puzzleSolved = true;
    try { window.HorridorsHints && window.HorridorsHints.setProgressKey('l1-puzzle'); } catch(e) {}
    document.getElementById('puzzle-status').textContent = 'CORRECT.';
    sfx('unlock');
    if (typeof refreshChecklist === 'function') refreshChecklist();
    setTimeout(()=> {
      this.close();
      // Spawn TOY ROOM KEY in front of panel (unlocks toy room where RED keycard hides)
      spawnAt(PR.left + 200, PR.top + 100, {
        id: 'toykey', label: 'TOY KEY', icon: 'key', prompt: 'Pick up TOY KEY', onPickup() {
          state.hasToyKey = true;
          const toyDoor = doors.find(d => d.id === 'toy');
          if (toyDoor) toyDoor.locked = false;
          speak('A toy key. It will fit somewhere close.', 2800);
          sfx('pickup');
          setObjective('A small key. Try the other locked doors.');
        }
      });
      speak('A compartment slides open. A small key rests inside.', 3500);
      setObjective('The panel clicks. Something unlocked.');
    }, 700);
  }
};
document.querySelectorAll('.frame-btn').forEach(btn => {
  btn.addEventListener('click', () => Puzzle.press(btn.dataset.symbol));
});
document.getElementById('btn-puzzle-close').addEventListener('click', () => Puzzle.close());

// ---------- Combo Lock ----------
const Combo = {
  isOpen: false,
  dials: [0, 0, 0],
  open() {
    this.isOpen = true;
    this.dials = [0, 0, 0];
    state._prevScene = state.scene;
    state.scene = 'combo';
    document.getElementById('overlay-combo').classList.remove('hidden');
    document.getElementById('combo-status').textContent = '';

    // Easy-mode helper: write the literal code above the dials so a 7-year-old
    // can solve without the lateral-thinking riddle.
    const tier = (window.__difficulty && window.__difficulty.id && window.__difficulty.id()) || 'normal';
    const sub = document.getElementById('combo-sub');
    if (sub) {
      if (tier === 'easy') {
        sub.innerHTML = 'Easy-mode hint: the code is <b style="color:#ffd84a;letter-spacing:0.15em;">' + state.comboCode.split('').join(' — ') + '</b>';
      } else if (tier === 'hard') {
        sub.textContent = 'Find the 3-digit code. No hints.';
      } else {
        sub.textContent = 'Find the 3-digit code somewhere in the rooms.';
      }
    }
    this.render();
  },
  close() {
    this.isOpen = false;
    document.getElementById('overlay-combo').classList.add('hidden');
    if (state.scene === 'combo') state.scene = 'play';
  },
  bump(i, dir) {
    this.dials[i] = (this.dials[i] + dir + 10) % 10;
    sfx('beep');
    this.render();
  },
  render() {
    for (let i = 0; i < 3; i++) {
      document.getElementById(`d${i}`).textContent = this.dials[i];
    }
  },
  try() {
    const code = this.dials.join('');
    const status = document.getElementById('combo-status');
    if (code === state.comboCode) {
      status.textContent = 'CLICK. The locker opens.';
      status.className = 'combo-status good';
      sfx('unlock');
      state.comboSolved = true;
      try { window.HorridorsHints && window.HorridorsHints.setProgressKey('l1-combo'); } catch(e) {}
      setTimeout(()=> {
        this.close();
        // Spawn coins + a flashlight battery + a sticker
        spawnAt(SR.left + 60, SR.top + 160, {
          id: 'reward_coins', label: '5 coins', icon: 'coin', prompt: 'Take coins', onPickup() {
            addCoin(5); sfx('pickup');
          }
        });
        addNote('Inside the red locker', 'Three coins and a polaroid: a child standing\nbeside something tall and patchwork. Both smiling.');
        speak('Inside: coins and a polaroid.', 3000);
      }, 700);
    } else {
      status.textContent = 'No click.';
      status.className = 'combo-status bad';
      sfx('wrong');
    }
  }
};
document.querySelectorAll('.dial-btn').forEach(b => {
  b.addEventListener('click', () => Combo.bump(parseInt(b.dataset.d), parseInt(b.dataset.dir)));
});
document.getElementById('btn-combo-try').addEventListener('click', () => Combo.try());
document.getElementById('btn-combo-close').addEventListener('click', () => Combo.close());

// Set combo from notes:
// "highest hour" = 7 (clock note)
// "count of doors" = 3 (the three room doors before scanner — visible in corridor design)
// "smiles he wears" = 1 (only one painted smile)
state.comboCode = '731';

// ---------- Chase ----------
function startChase() {
  state.chase.active = true;
  state.chase.t = state.chase.duration;
  monster.active = true;
  monster.x = 400; monster.y = 990; // far behind player initially
  monster.kind = 'grin';
  monster.speed = MONSTER_BASE_SPEED * _diff().speedMul;
  document.getElementById('chase-bar').classList.remove('hidden');
  sfx('alarm');
  setTimeout(()=>sfx('scream'), 400);
  setTimeout(()=>speak('"Found you."', 2500), 800);
}
function endChase() {
  state.chase.active = false;
  monster.active = false;
  document.getElementById('chase-bar').classList.add('hidden');
}
function tickChase(dt) {
  if (!state.chase.active) return;
  const prevT = state.chase.t;
  state.chase.t -= dt;
  document.querySelector('.chase-bar-fill').style.width = `${Math.max(0, state.chase.t / state.chase.duration) * 100}%`;
  state.alarmFlash = (state.alarmFlash + dt) % 0.8;

  // Time's up — scanner dies, monster surges. If the door is still shut, it stays shut forever.
  if (prevT > 0 && state.chase.t <= 0 && !state.doorsOpen.scanner && !state.chase.expired) {
    state.chase.expired = true;
    monster.speed = (monster.speed || 140) * 1.6;
    sfx('beep_low');
    speak('The scanner goes dark. The door locks.', 2800);
    setObjective('Too late. Hide or run.');
  }

  // Move monster: chase player. Stay in corridor.
  const px = player.x + player.w/2, py = player.y + player.h/2;
  const mx = monster.x + monster.w/2, my = monster.y + monster.h/2;
  let dx = px - mx, dy = py - my;
  const d = Math.hypot(dx, dy) || 1;
  dx /= d; dy /= d;
  const speed = monster.speed;
  const moveX = dx * speed * dt, moveY = dy * speed * dt;

  // Hide check: if player is hiding, monster slows to a crawl and may give up
  if (state.hidden && d > 60) {
    monster.x += moveX * 0.2;
    monster.y += moveY * 0.2;
  } else {
    let prev = { x: monster.x, y: monster.y };
    moveWithCollisions(monster, moveX, moveY);
    if (monster.x === prev.x) moveWithCollisions(monster, 0, dy * speed * dt * 1.5);
    if (monster.y === prev.y) moveWithCollisions(monster, dx * speed * dt * 1.5, 0);
  }

  // Catch?
  if (!state.hidden && aabb(player, monster)) {
    caught('grin');
  }

  // Win condition: player inside treasure room
  if (player.x >= TREASURE.x + 10 && player.y >= TREASURE.y + 10 && player.y <= TREASURE.y + TREASURE.h - 10) {
    endChase();
    speak('Safe.', 2000);
  }

  // Whisper at random
  if (Math.random() < 0.01) sfx('whisper');
}

function caught(by) {
  state.scene = 'caught';
  state.caughtBy = by;
  endChase();
  document.getElementById('caught-whisper').textContent = by === 'hollow' ? '"Quietly."' : '"Found you."';
  document.getElementById('overlay-caught').classList.remove('hidden');
  sfx('scream');
}

// ---------- Hollow (Library lurker) ----------
let libraryEnterT = 0;
function tickHollow(dt) {
  // Activate hollow if player has been in library for some time
  const inLib = player.x > LR.left && player.x < LR.right && player.y > LR.top && player.y < LR.bottom;
  if (inLib) {
    libraryEnterT += dt;
    // Aggression shortens the activation time; Extreme triggers nearly immediately.
    const actDelay = 4 / Math.max(0.5, _diff().aggroMul);
    if (!hollow.active && libraryEnterT > actDelay) {
      hollow.active = true;
      hollow.x = LR.left + 60; hollow.y = LR.top + 60;
      hollow.speed = HOLLOW_BASE_SPEED * _diff().speedMul;
      sfx('whisper');
      speak('Something is in here with you.', 3000);
    }
  } else {
    libraryEnterT = Math.max(0, libraryEnterT - dt);
    if (hollow.active && !inLib) {
      hollow.active = false;
    }
  }
  if (!hollow.active) return;

  const px = player.x + player.w/2, py = player.y + player.h/2;
  const hx = hollow.x + hollow.w/2, hy = hollow.y + hollow.h/2;

  // Hollow: doesn't move when player is moving (looking at it). Moves when player is still.
  const moving = Math.abs(player.vx) > 5 || Math.abs(player.vy) > 5;
  if (!moving) {
    let dx = px - hx, dy = py - hy;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    const sp = hollow.speed;
    moveWithCollisions(hollow, dx * sp * dt, dy * sp * dt);
    hollow.alertness = Math.min(1, hollow.alertness + dt * 0.5);
  } else {
    hollow.alertness = Math.max(0, hollow.alertness - dt * 0.3);
  }

  // Catch
  if (aabb(player, hollow)) caught('hollow');
}

// ---------- Hide mechanic (under bed in Toy Room) ----------
const hideSpot = { x: TR.left + 30, y: TR.top + 40, w: 120, h: 80, name: 'bed' };
function tickHide() {
  // If player overlapping hideSpot AND holding shift -> hidden
  const overlap = aabb(player, hideSpot);
  const wantHide = overlap && isDown('shift');
  if (wantHide && !state.hidden) {
    state.hidden = true;
    document.getElementById('hide-indicator').classList.remove('hidden');
    sfx('hide');
  } else if (!wantHide && state.hidden) {
    state.hidden = false;
    document.getElementById('hide-indicator').classList.add('hidden');
  }
}

// ---------- End level ----------
function endLevel() {
  state.scene = 'end';
  endChase();
  // L1 completed — clear in-progress so re-entry starts fresh, and bake in
  // the coins earned this run so a later death on L2 can't roll them back.
  if (window.__levelInProgress) window.__levelInProgress[1] = false;
  if (window.__walletCommitLevelRun) window.__walletCommitLevelRun();
  const rewards = [];
  rewards.push('🪙 ' + state.coins + ' Corridor Tokens');
  if (state.notes.length > 0) rewards.push('📜 ' + state.notes.length + ' Clues Found');
  rewards.push('🎖️ Door One Survivor');
  rewards.push('🧷 Grinpatch Sticker');
  if (state.searched.size >= 10) rewards.push('🏅 Thorough Searcher');
  if (state.searched.size >= 18) rewards.push('🌟 Curious Cat');
  document.getElementById('reward-chest').innerHTML = rewards.map(r => `<div class="reward-item">${r}</div>`).join('');
  document.getElementById('overlay-end').classList.remove('hidden');
  sfx('jingle');
}

// ---------- Title screen ----------
const overlayTitle = document.getElementById('overlay-title');
function startPlay() {
  ensureAudio();
  startAmbient();
  // Snapshot coins at the very start of L1 so a death resets to this baseline.
  if (window.__walletBeginLevelRun) window.__walletBeginLevelRun(1);
  overlayTitle.classList.add('hidden');
  state.scene = 'play';
  // If L1 was previously stopped (user left & came back), re-arm the loop.
  if (!l1Running) {
    l1Running = true;
    lastT = performance.now();
    requestAnimationFrame(loop);
  }
  // Ensure L1's own HUD is visible again on re-entry.
  const hud = document.getElementById('hud');
  if (hud) hud.classList.remove('hidden');
  // Mark L1 as in-progress (used by Continue/Restart prompt)
  if (window.__levelInProgress) window.__levelInProgress[1] = true;
  // Per-level body class for CSS color grading / atmosphere.
  try { if (window.__setActiveLevelClass) window.__setActiveLevelClass(1); } catch (e) {}
  speak('Welcome, little wanderer. Search every drawer.', 4000);
  setObjective('Explore. Something here opens other rooms.');
  registerL1Tasks();
  // Hint system: register active level, show first-time tutorial on easy/normal
  try {
    if (window.HorridorsHints) {
      window.HorridorsHints.setLevel(1);
      // Reset any stale 'done' keys when L1 starts fresh
    }
    if (window.HorridorsTutorial) {
      // Slight delay so the tutorial appears AFTER the title overlay finishes hiding
      setTimeout(() => { try { window.HorridorsTutorial.maybeShow(); } catch(e) {} }, 350);
    }
  } catch (e) {}
}

// ---------- Checklist (Tasks panel) ----------
function l1DoneIds() {
  const done = new Set();
  if (state.batteryCount >= 1) done.add('battery1');
  if (state.batteryCount >= 2) done.add('battery2');
  if (state.hasLibKey) done.add('libkey');
  if (state.puzzleSolved) done.add('puzzle');
  if (state.hasToyKey) done.add('toykey');
  if (state.hasKeycard) done.add('keycard');
  if (state.doorsOpen && state.doorsOpen.scanner) done.add('escape');
  return done;
}
function registerL1Tasks() {
  if (!window.HorridorsTasks) return;
  window.HorridorsTasks.setLevel('l1', 'Level 1 — Tasks', [
    { id: 'battery1', label: 'Find the first battery' },
    { id: 'libkey',   label: 'Find a brass key' },
    { id: 'battery2', label: 'Find the second battery' },
    { id: 'puzzle',   label: 'Solve the picture panel' },
    { id: 'toykey',   label: 'Claim the small key' },
    { id: 'keycard',  label: 'Find the red keycard' },
    { id: 'escape',   label: 'Reach the Scanner door' },
  ], l1DoneIds);
}
document.getElementById('btn-start').addEventListener('click', () => {
  // Show comic intro on first play, then begin
  if (window.HorridorsStory && !window.HorridorsStory.hasSeenIntro()) {
    ensureAudio();
    overlayTitle.classList.add('hidden');
    state.scene = 'intro';
    window.HorridorsStory.showIntro({ onClose: () => startPlay() });
  } else {
    startPlay();
  }
});

// ---------- Level-select jump buttons (testing aid) ----------
// Per-level progress map — flipped to true when real play begins, cleared on reset/complete.
window.__levelInProgress = window.__levelInProgress || {1:false,2:false,3:false,4:false,5:false,6:false,7:false,8:false};

// ---------- Wallet run-snapshot wiring (coins only stick on level complete) ----------
// Snapshot coins when a level begins, restore them on death/retry, commit on complete.
// The wallet module (shared-wallet.js) owns the state — we just fire the hooks here.
function __walletBeginLevelRun(n) {
  if (window.HorridorsWallet && window.HorridorsWallet.beginLevelRun) {
    try { window.HorridorsWallet.beginLevelRun(n); } catch (e) {}
  }
}
function __walletRestoreLevelRun() {
  if (window.HorridorsWallet && window.HorridorsWallet.restoreLevelRun) {
    try { window.HorridorsWallet.restoreLevelRun(); } catch (e) {}
  }
}
function __walletCommitLevelRun() {
  if (window.HorridorsWallet && window.HorridorsWallet.commitLevelRun) {
    try { window.HorridorsWallet.commitLevelRun(); } catch (e) {}
  }
}
window.__walletBeginLevelRun = __walletBeginLevelRun;
window.__walletRestoreLevelRun = __walletRestoreLevelRun;
window.__walletCommitLevelRun = __walletCommitLevelRun;

// Global #btn-retry click — every level's "caught" overlay uses this same
// button. Fires on capture phase so we restore BEFORE any level's own retry
// handler runs resetLevelNState() (those don't touch the wallet anyway, but
// order is predictable this way).
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btn-retry');
  if (btn && !btn.__walletWired) {
    btn.__walletWired = true;
    btn.addEventListener('click', __walletRestoreLevelRun, true);
  }
});

// Stop every running level (used before switching or restarting)
function __stopAllLevels() {
  if (window.__horridorsL1 && window.__horridorsL1.stop) { try { window.__horridorsL1.stop(); } catch(e) {} }
  for (const k of ['__horridorsL2','__horridorsL3','__horridorsL4','__horridorsL5','__horridorsL6','__horridorsL7','__horridorsL8']) {
    const L = window[k]; if (L && L.stop) { try { L.stop(); } catch(e) {} }
  }
}

function __hideGameplayOverlays() {
  ['overlay-title','overlay-end','overlay-caught','overlay-intro','overlay-mother',
   'overlay-l2-title','overlay-l2-end','overlay-l3-title','overlay-l3-end',
   'overlay-l4-title','overlay-l4-end','overlay-l5-intro','overlay-l5-end',
   'overlay-l6-intro','overlay-l6-end','overlay-l7-intro','overlay-l7-end',
   'overlay-l8-intro','overlay-l8-end','overlay-credits',
   'overlay-note','overlay-notes','overlay-resume'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
}

// Tag the <body> with the active level so CSS can tune per-level color grading,
// atmosphere, and lighting. Cheap, fully reversible, no render-side work.
function __setActiveLevelClass(n) {
  const b = document.body;
  for (let i = 1; i <= 8; i++) b.classList.remove('level-' + i);
  if (n >= 1 && n <= 8) b.classList.add('level-' + n);
}

// Actually launch a level fresh (reset — shows intro/title, resets state).
function __launchFresh(n) {
  __hideGameplayOverlays();
  __stopAllLevels();
  const hud = document.getElementById('hud'); if (hud) hud.classList.add('hidden');
  window.__levelInProgress[n] = true;
  __setActiveLevelClass(n);
  // Snapshot coins for this level — any deaths will roll back here.
  if (window.__walletBeginLevelRun) window.__walletBeginLevelRun(n);
  if (n === 1) {
    ensureAudio();
    // Full L1 reset so "Restart" truly starts fresh.
    try { resetGame(); } catch(e) {}
    startPlay();
    return;
  }
  if (n === 2 && window.__startLevel2) window.__startLevel2();
  else if (n === 3 && window.__startLevel3) window.__startLevel3();
  else if (n === 4 && window.__startLevel4) window.__startLevel4();
  else if (n === 5 && window.__startLevel5) window.__startLevel5();
  else if (n === 6 && window.__startLevel6) window.__startLevel6();
  else if (n === 7 && window.__startLevel7) window.__startLevel7();
  else if (n === 8 && window.__startLevel8) window.__startLevel8();
}

// Resume: pick up where player left off, skipping title/intro + keeping state.
function __launchResume(n) {
  __hideGameplayOverlays();
  // Stop OTHER levels, not the one we're resuming
  for (let i = 1; i <= 8; i++) {
    if (i === n) continue;
    const L = window['__horridorsL' + i];
    if (L && L.stop) { try { L.stop(); } catch(e) {} }
  }
  window.__levelInProgress[n] = true;
  __setActiveLevelClass(n);
  if (n === 1) {
    ensureAudio();
    // L1's startPlay now handles re-arming the loop if stopped
    startPlay();
    return;
  }
  const L = window['__horridorsL' + n];
  if (L && L.resume) { L.resume(); return; }
  // Fallback — no resume available, start fresh
  __launchFresh(n);
}

function jumpToLevel(n) {
  // Extreme difficulty: no checkpoints — every entry launches fresh. Clear any
  // progress flag so the Continue prompt never appears.
  if (_diff().oneHit) {
    window.__levelInProgress[n] = false;
    __launchFresh(n);
    return;
  }
  // Otherwise, if the level was already started AND not yet completed, offer Continue/Restart
  if (window.__levelInProgress[n]) {
    __showResumePrompt(n);
    return;
  }
  __launchFresh(n);
}
// Expose for tests / external triggers.
window.__jumpToLevel = jumpToLevel;
window.__launchFresh = __launchFresh;
window.__setActiveLevelClass = __setActiveLevelClass;

function __showResumePrompt(n) {
  __hideGameplayOverlays();
  const overlay = document.getElementById('overlay-resume');
  const titleEl = document.getElementById('resume-title');
  if (titleEl) titleEl.textContent = 'LEVEL ' + n + ' — IN PROGRESS';
  if (overlay) overlay.classList.remove('hidden');
  const btnC = document.getElementById('btn-resume-continue');
  const btnR = document.getElementById('btn-resume-restart');
  const btnX = document.getElementById('btn-resume-cancel');
  // Replace handlers cleanly by cloning nodes
  const rebind = (id, handler) => {
    const old = document.getElementById(id);
    if (!old) return;
    const fresh = old.cloneNode(true);
    old.parentNode.replaceChild(fresh, old);
    fresh.addEventListener('click', handler);
  };
  rebind('btn-resume-continue', () => { overlay.classList.add('hidden'); __launchResume(n); });
  rebind('btn-resume-restart', () => { overlay.classList.add('hidden'); window.__levelInProgress[n] = false; __launchFresh(n); });
  rebind('btn-resume-cancel', () => { overlay.classList.add('hidden'); window.__returnToTitle(); });
}

['btn-jump-l1','btn-jump-l2','btn-jump-l3','btn-jump-l4','btn-jump-l5','btn-jump-l6','btn-jump-l7','btn-jump-l8'].forEach((id, i) => {
  const btn = document.getElementById(id);
  if (btn) btn.addEventListener('click', () => jumpToLevel(i + 1));
});

// Hook into play-start buttons so we know when real play (not just title/intro) begins.
// This runs after the page loads so all level scripts have attached their own handlers.
setTimeout(() => {
  const hookBtn = (id, n) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('click', () => {
      window.__levelInProgress[n] = true;
      try { __setActiveLevelClass(n); } catch (e) {}
    });
  };
  // Also tag L1 when the main Enter-the-Corridor button is clicked.
  const btnStart = document.getElementById('btn-start');
  if (btnStart) btnStart.addEventListener('click', () => {
    try { __setActiveLevelClass(1); } catch (e) {}
  });
  hookBtn('btn-l2-start', 2);
  hookBtn('btn-l3-start', 3);
  hookBtn('btn-l4-start', 4);
  hookBtn('btn-l5-start', 5);
  hookBtn('btn-l5-begin', 5);
  hookBtn('btn-l6-start', 6);
  hookBtn('btn-l6-begin', 6);
  hookBtn('btn-l7-start', 7);
  hookBtn('btn-l7-begin', 7);
  hookBtn('btn-l8-start', 8);
  hookBtn('btn-l8-begin', 8);

  // Clear the in-progress flag when a level's end overlay becomes visible.
  // Uses MutationObserver on each overlay-lN-end element.
  for (let n = 2; n <= 8; n++) {
    const endEl = document.getElementById('overlay-l' + n + '-end');
    if (!endEl) continue;
    const mo = new MutationObserver(() => {
      if (!endEl.classList.contains('hidden')) {
        window.__levelInProgress[n] = false;
      }
    });
    mo.observe(endEl, { attributes: true, attributeFilter: ['class'] });
  }
}, 0);

// ---------- Return to title / level selection ----------
// Exposed globally so any level, the X/menu touch button, or Escape key can call it.
window.__returnToTitle = function returnToTitle() {
  // Stop every running level
  if (window.__horridorsL1 && window.__horridorsL1.stop) {
    try { window.__horridorsL1.stop(); } catch(e) {}
  }
  for (const k of ['__horridorsL2','__horridorsL3','__horridorsL4','__horridorsL5','__horridorsL6','__horridorsL7','__horridorsL8']) {
    const L = window[k]; if (L && L.stop) { try { L.stop(); } catch(e) {} }
  }
  // Hide every in-game overlay
  ['overlay-end','overlay-caught','overlay-intro','overlay-mother',
   'overlay-l2-title','overlay-l2-end','overlay-l3-title','overlay-l3-end',
   'overlay-l4-title','overlay-l4-end','overlay-l5-intro','overlay-l5-end',
   'overlay-l6-intro','overlay-l6-end','overlay-l7-intro','overlay-l7-end',
   'overlay-l8-intro','overlay-l8-end','overlay-credits',
   'overlay-note','overlay-notes','overlay-puzzle'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
  const hud = document.getElementById('hud'); if (hud) hud.classList.add('hidden');
  // Clear per-level body class so title screen isn't tinted by a level's palette
  try { __setActiveLevelClass(0); } catch (e) {}
  // Show the title / level-select
  const title = document.getElementById('overlay-title');
  if (title) title.classList.remove('hidden');
};

// Top-level Escape handler — works even when a level module hasn't consumed it.
// Triggered by keyboard Escape and by the touch X button (which sends 'Escape').
window.addEventListener('keydown', (e) => {
  const k = (e.key || '').toLowerCase();
  if (k !== 'escape') return;
  // Only trigger when actually playing (title visible means we're already there)
  const title = document.getElementById('overlay-title');
  if (title && !title.classList.contains('hidden')) return;
  window.__returnToTitle();
});
document.getElementById('btn-retry').addEventListener('click', () => {
  // Only L1 should handle this when L1 is actually running. L2 and L3 attach their own guarded handlers.
  if (l1Running) resetGame();
});
document.getElementById('btn-replay').addEventListener('click', () => {
  document.getElementById('overlay-end').classList.add('hidden');
  resetGame();
});
document.getElementById('btn-mute').addEventListener('click', () => setMuted(!state.muted));

// Hand off to Level 2
const btnL2 = document.getElementById('btn-level2');
if (btnL2) {
  btnL2.addEventListener('click', () => {
    document.getElementById('overlay-end').classList.add('hidden');
    // Hide L1 HUD — Level 2 will draw its own
    const hud = document.getElementById('hud');
    if (hud) hud.classList.add('hidden');
    // Stop L1 loop & audio, then start L2
    window.__horridorsL1.stop();
    if (window.__startLevel2) window.__startLevel2();
  });
}

function resetGame() {
  // Reset state
  state.scene = 'play';
  state.hasBattery = false; state.hasToyKey = false; state.hasLibKey = false; state.hasKeycard = false;
  state.batteryCount = 0; state.motherTriggered = false;
  state.puzzleSolved = false; state.comboSolved = false; state.notes = [];
  state.searched.clear(); state.chase.active = false; state.chase.expired = false; state.alarmFlash = 0; state.hidden = false;
  // New puzzle chain defaults: supply is entry (unlocked). Library/Puzzle/Toy all locked.
  state.doorsOpen = { toy: false, puzzle: false, supply: true, lib: false, scanner: false };
  for (const d of doors) {
    if (d.id === 'supply') { d.locked = false; d.open = false; }
    else { d.locked = true; d.open = false; }
  }
  // Restore items
  items.length = 0;
  // Corridor: 10 coins only (Mum's coins). No toy key here anymore — it's won at Picture Puzzle.
  const corridorCoins = [
    [340,990],[480,1035],[600,1010],[820,1040],[1080,995],
    [1200,1020],[1420,1030],[1640,990],[1860,1035],[2170,1030]
  ];
  corridorCoins.forEach((p, i) => {
    addItem({ id: 'corr_coin'+(i+1), x: p[0], y: p[1], label: "Mum's coin", icon: 'coin', prompt: 'Pick up coin', onPickup(){ addCoin(1); sfx('pickup'); }});
  });
  // HUD
  ['hud-battery','hud-key1','hud-key2','hud-keycard'].forEach(id => document.getElementById(id).classList.remove('has'));
  updateCoinHud();
  document.getElementById('overlay-end').classList.add('hidden');
  document.getElementById('overlay-caught').classList.add('hidden');
  document.getElementById('overlay-puzzle').classList.add('hidden');
  document.getElementById('overlay-combo').classList.add('hidden');
  document.getElementById('chase-bar').classList.add('hidden');
  setObjective('Explore. Something here opens other rooms.');
  player.x = 260; player.y = 990;
  monster.active = false; hollow.active = false;
}

// ---------- Update loop ----------
let lastT = performance.now();
let l1Running = true;
let _l1TaskTick = 0;
function loop(now) {
  if (!l1Running) return;
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  update(dt);
  render();
  justPressed.clear();
  _l1TaskTick += dt;
  if (_l1TaskTick >= 0.5) { _l1TaskTick = 0; if (window.refreshChecklist) window.refreshChecklist(); }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// Expose a handoff hook so Level 2 can take over
window.__horridorsL1 = {
  stop() {
    l1Running = false;
    endChase();
    if (ambientNodes) {
      try { ambientNodes.stop && ambientNodes.stop(); } catch(e) {}
      ambientNodes = null;
    }
  },
  resume() {
    l1Running = true;
    lastT = performance.now();
    requestAnimationFrame(loop);
  },
  audioCtx: () => audioCtx,
  masterGain: () => masterGain,
  sfx: (n) => { try { sfx(n); } catch(e){} },
};

function update(dt) {
  tickSpeaker(dt);

  if (state.scene !== 'play') {
    player.vx = 0; player.vy = 0;
    return;
  }

  // Input
  let dx = 0, dy = 0;
  if (isDown('w','arrowup')) dy -= 1;
  if (isDown('s','arrowdown')) dy += 1;
  if (isDown('a','arrowleft')) dx -= 1;
  if (isDown('d','arrowright')) dx += 1;
  if (dx && dy) { dx *= 0.7071; dy *= 0.7071; }
  let speed = 180;
  if (state.chase.active) speed = 215;
  player.vx = dx * speed; player.vy = dy * speed;
  if (dx || dy) player.facing = Math.atan2(dy, dx);
  if (dx || dy) player.walkPhase += dt * 9;

  moveWithCollisions(player, player.vx * dt, player.vy * dt);

  // Mother glimpse — plays once mid-corridor to set the stakes
  if (!state.motherTriggered && player.x > 1380 && player.x < 1460 && player.y > 960 && player.y < 1060) {
    state.motherTriggered = true;
    state.scene = 'note';
    player.vx = 0; player.vy = 0;
    if (window.HorridorsStory) {
      window.HorridorsStory.showMother({ onClose: () => {
        state.scene = 'play';
        setObjective('Rescue Mother. Find the RED keycard.');
      }});
    } else {
      state.scene = 'play';
    }
  }

  // Mute toggle
  if (wasPressed('m')) setMuted(!state.muted);
  // Notes drawer
  if (wasPressed('n')) toggleNotes();
  // Flashlight toggle
  if (wasPressed('f')) state.flashlightOn = !state.flashlightOn;

  // Interact
  const target = nearestInteractable();
  if (target) {
    const label = target.kind === 'item' ? target.ref.prompt
      : target.kind === 'furn' ? target.ref.prompt
      : target.kind === 'door' ? (target.ref.locked ? `Locked: ${target.ref.room.name}` : (target.ref.open ? 'Walk through' : `Open ${target.ref.room.name}`))
      : target.kind === 'scanner' ? (state.chase.expired && !state.doorsOpen.scanner ? 'Scanner DEAD — door sealed' : (state.hasKeycard ? 'Scan keycard' : 'Locked — needs RED keycard'))
      : '';
    showPrompt(`[E] ${label}`);
    if (wasPressed('e',' ')) interact(target);
  } else {
    hidePrompt();
  }

  tickHide();
  tickChase(dt);
  tickHollow(dt);
  updateCamera();

  // Trigger chase if player has keycard and not yet started
  // (already triggered on pickup)

  // Win when entering treasure room with chest
  // (handled in tr_chest interact)
}

// ---------- Rendering ----------
const TILE = 32;

function render() {
  // Clear
  ctx.fillStyle = '#06060a';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  ctx.save();
  ctx.translate(-camera.x, -camera.y);

  drawFloors();
  drawWalls();
  drawDoors();
  drawFurniture();
  drawItems();
  drawTreasureRoom();
  drawScannerDoor();
  // Overlay pass: halo + ENTER arrow + room labels go ON TOP of furniture
  // so they're never hidden by shelves/workbenches/etc inside the room.
  drawDoorOverlays();
  drawScannerDoorOverlay();
  drawPlayer();
  if (monster.active) drawMonster();
  if (hollow.active) drawHollow();

  ctx.restore();

  // Lighting overlay (in screen space)
  drawLighting();

  // Chase red overlay
  if (state.chase.active) {
    const a = 0.18 + Math.sin(state.alarmFlash * Math.PI * 2 / 0.8) * 0.07;
    ctx.fillStyle = `rgba(255, 30, 50, ${a})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  // Vignette
  const vg = ctx.createRadialGradient(VIEW_W/2, VIEW_H/2, VIEW_H*0.4, VIEW_W/2, VIEW_H/2, VIEW_H*0.85);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.7)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

function drawFloors() {
  // Corridor floor (brighter so it's readable through dark overlay)
  drawFloorRect(CORR_LEFT, CORR_TOP, CORR_RIGHT - CORR_LEFT, CORR_BOT - CORR_TOP, '#4a3f55', '#5a4d68');
  // Rooms
  for (const room of Object.values(ROOMS)) {
    let base = '#48405a', stripe = '#564b6c';
    if (room.id === 'toy') { base = '#6a4a7a'; stripe = '#7c5a8c'; }       // playful purple
    if (room.id === 'puzzle') { base = '#3e4a6a'; stripe = '#4e5a7e'; }    // cool blue
    if (room.id === 'supply') { base = '#5a5040'; stripe = '#6c6050'; }    // warm tan
    if (room.id === 'lib') { base = '#3e4a44'; stripe = '#4e5a52'; }       // mossy green
    drawFloorRect(room.left, room.top, room.w, room.bottom - room.top, base, stripe);
  }
  // Treasure room
  drawFloorRect(TREASURE.x, TREASURE.y, TREASURE.w, TREASURE.h, '#7a5a18', '#a0782a');
}

function drawFloorRect(x, y, w, h, base, stripe) {
  ctx.fillStyle = base;
  ctx.fillRect(x, y, w, h);
  // Tile lines (subtle)
  ctx.strokeStyle = stripe;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.7;
  for (let tx = x; tx < x + w; tx += TILE) {
    ctx.beginPath(); ctx.moveTo(tx, y); ctx.lineTo(tx, y + h); ctx.stroke();
  }
  for (let ty = y; ty < y + h; ty += TILE) {
    ctx.beginPath(); ctx.moveTo(x, ty); ctx.lineTo(x + w, ty); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawWalls() {
  // Only draw outer-room walls and corridor walls; furniture rectangles (also in walls[]) draw themselves.
  ctx.fillStyle = '#2a2538';
  ctx.strokeStyle = '#5a5070';
  ctx.lineWidth = 1;
  for (const w of walls) {
    if (w === scannerWall && state.doorsOpen.scanner) continue;
    // Skip furniture-derived walls (they have matching furniture entries that draw)
    if (w._isFurn) continue;
    ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.strokeRect(w.x + 0.5, w.y + 0.5, w.w - 1, w.h - 1);
  }
  // Seal off the visual "holes" in the room bottom / corridor top where the
  // door gaps used to leave an open threshold. The actual door-leaf is
  // drawn on top of these fills by drawDoors(), so the result is a
  // continuous wall broken only by the door itself. These are purely
  // cosmetic — collisions are still handled by the door entries.
  for (const room of Object.values(ROOMS)) {
    const gx = room.doorX - 40;
    const gw = 80;
    // Room's bottom wall gap
    ctx.fillRect(gx, ROOM_BOT, gw, 12);
    ctx.strokeRect(gx + 0.5, ROOM_BOT + 0.5, gw - 1, 11);
    // Corridor's top wall gap
    ctx.fillRect(gx, CORR_TOP - 12, gw, 12);
    ctx.strokeRect(gx + 0.5, CORR_TOP - 12 + 0.5, gw - 1, 11);
  }
}

// Per-room palettes used by both the door body and the overlay pass.
function _doorPalette(d) {
  let frameColor = '#3a2418';
  let panelColor = '#6a4628';
  let accentColor = '#ffd94a';
  if (d.id === 'toy')    { frameColor = '#5a3010'; panelColor = d.locked ? '#7a4a18' : '#d68a30'; accentColor = '#ffe070'; }
  if (d.id === 'puzzle') { frameColor = '#1a2440'; panelColor = d.locked ? '#2a3856' : '#5078b8';  accentColor = '#a8d4ff'; }
  if (d.id === 'supply') { frameColor = '#3a3018'; panelColor = d.locked ? '#4a4030' : '#a87838';  accentColor = '#ffd06a'; }
  if (d.id === 'lib')    { frameColor = '#102818'; panelColor = d.locked ? '#1f3a2a' : '#4a8e5a';  accentColor = '#a0ffb8'; }
  return { frameColor, panelColor, accentColor };
}

function drawDoors() {
  // First pass: door body (frame + panel + knob). Halo, arrow, lock badge
  // and room name are drawn LATER in drawDoorOverlays() so they sit ON TOP
  // of any furniture (shelves, workbenches) inside the room.
  for (const d of doors) {
    const r = doorRect(d);
    const { frameColor, panelColor, accentColor } = _doorPalette(d);

    // ---- OPEN: dark threshold + faint glow so they still see entry point ----
    if (d.open) {
      ctx.save();
      ctx.shadowColor = accentColor;
      ctx.shadowBlur = 14;
      ctx.fillStyle = '#0a0a10';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.restore();
      continue;
    }

    // ---- Door frame (outer, taller, with shadow) ----
    const frameTop = r.y - 60;
    const frameH = 70;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowOffsetY = 4;
    ctx.shadowBlur = 8;
    ctx.fillStyle = frameColor;
    ctx.fillRect(r.x - 4, frameTop - 4, r.w + 8, frameH + 4);
    ctx.restore();

    // ---- Door panel ----
    ctx.fillStyle = panelColor;
    ctx.fillRect(r.x, frameTop, r.w, frameH);

    // Wood grain / panel divider
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x + 0.5, frameTop + 0.5, r.w - 1, frameH - 1);
    ctx.beginPath();
    ctx.moveTo(r.x + 8, frameTop + 12);
    ctx.lineTo(r.x + r.w - 8, frameTop + 12);
    ctx.moveTo(r.x + 8, frameTop + frameH - 14);
    ctx.lineTo(r.x + r.w - 8, frameTop + frameH - 14);
    ctx.stroke();

    // ---- Knob (gold) ----
    ctx.fillStyle = accentColor;
    ctx.shadowColor = accentColor;
    ctx.shadowBlur = d.locked ? 0 : 8;
    ctx.beginPath();
    ctx.arc(r.x + r.w - 12, frameTop + frameH - 22, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

function drawDoorOverlays() {
  // Second pass: halo, ↓ arrow, lock badge, and room label.
  // Drawn AFTER furniture/items so nothing inside the room can hide them.
  const t = performance.now() / 1000;
  for (const d of doors) {
    if (d.open) continue;
    const r = doorRect(d);
    const cx = r.x + r.w / 2;
    const frameTop = r.y - 60;
    const frameH = 70;
    const { accentColor } = _doorPalette(d);

    // ---- Glow halo (only for unlocked doors — "come over here") ----
    if (!d.locked) {
      const pulse = 0.6 + 0.4 * Math.sin(t * 3);
      ctx.save();
      ctx.shadowColor = accentColor;
      ctx.shadowBlur = 20 + pulse * 10;
      ctx.fillStyle = accentColor;
      ctx.globalAlpha = 0.22 + pulse * 0.18;
      ctx.fillRect(r.x - 8, r.y - 70, r.w + 16, 80);
      ctx.restore();
    }

    // ---- Lock badge (locked) OR ↓ arrow (unlocked) ----
    if (d.locked) {
      // Red disk + padlock
      ctx.save();
      ctx.fillStyle = '#ff4a5a';
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(cx, frameTop + 22, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Tiny padlock body
      ctx.fillStyle = '#fff';
      ctx.fillRect(cx - 4, frameTop + 20, 8, 6);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(cx, frameTop + 18, 3, Math.PI, 0);
      ctx.stroke();
      ctx.restore();
    } else {
      // Bouncing ↓ ENTER arrow above the door
      const bounce = Math.sin(t * 4) * 4;
      ctx.save();
      ctx.fillStyle = accentColor;
      ctx.shadowColor = accentColor;
      ctx.shadowBlur = 10;
      ctx.font = 'bold 22px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('↓', cx, frameTop - 18 + bounce);
      ctx.restore();
    }

    // ---- Room name above the door (with halo for legibility) ----
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 13px Inter, sans-serif';
    ctx.shadowColor = 'rgba(0,0,0,0.95)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = d.locked ? '#cfcfd8' : '#ffffff';
    ctx.fillText(d.room.name.toUpperCase(), cx, frameTop - 36);
    if (d.locked) {
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillStyle = '#ff8090';
      ctx.fillText('LOCKED', cx, frameTop - 24);
    }
    ctx.restore();
  }
}

function drawScannerDoor() {
  // The exit door — made dramatic and obvious for kids.
  const t = performance.now() / 1000;
  const r = { x: CORR_RIGHT - 10, y: CORR_TOP + 24, w: 26, h: 132 };
  const open = state.doorsOpen.scanner;
  const expired = state.chase.expired;
  const ready = state.hasKeycard && !open;

  // Outer frame
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 8;
  ctx.fillStyle = open ? '#1a3a4a' : (expired ? '#1a0a10' : '#2a1418');
  ctx.fillRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8);
  ctx.restore();

  // Door body
  ctx.fillStyle = open ? '#0a0a10' : (expired ? '#1a0a10' : '#3a1a1a');
  ctx.fillRect(r.x, r.y, r.w, r.h);

  if (!open) {
    // Pulsing keycard reader — green when ready, red when not
    const pulse = 0.6 + 0.4 * Math.sin(t * 4);
    const readerColor = ready ? '#5cff8a' : (expired ? '#2a0a10' : '#ff4a5a');
    ctx.save();
    ctx.shadowColor = readerColor;
    ctx.shadowBlur = 8 + (ready || !expired ? pulse * 12 : 0);
    ctx.fillStyle = readerColor;
    ctx.fillRect(r.x + 7, r.y + 50, 12, 24);
    ctx.restore();
    // Slot for the card
    ctx.fillStyle = '#100';
    ctx.fillRect(r.x + 9, r.y + 58, 8, 8);
  }
}

function drawScannerDoorOverlay() {
  // Halo + arrow + labels for the scanner door, drawn AFTER furniture/items.
  const t = performance.now() / 1000;
  const r = { x: CORR_RIGHT - 10, y: CORR_TOP + 24, w: 26, h: 132 };
  const open = state.doorsOpen.scanner;
  const ready = state.hasKeycard && !open;

  if (!open && ready) {
    // Big halo + bouncing arrow + "USE KEYCARD" prompt
    const bounce = Math.sin(t * 5) * 6;
    ctx.save();
    ctx.shadowColor = '#5cff8a';
    ctx.shadowBlur = 28;
    ctx.fillStyle = 'rgba(92,255,138,0.18)';
    ctx.fillRect(r.x - 30, r.y - 40, r.w + 60, r.h + 60);
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#5cff8a';
    ctx.font = 'bold 28px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('→', r.x - 28 + bounce, r.y + 70);
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.fillStyle = '#bdffce';
    ctx.shadowBlur = 6;
    ctx.fillText('USE KEYCARD', r.x + r.w/2, r.y + r.h + 18);
    ctx.restore();
  }

  // SCANNER label
  ctx.save();
  ctx.fillStyle = open ? '#5cff8a' : '#cfcfe0';
  ctx.font = 'bold 11px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 4;
  ctx.fillText('SCANNER', r.x + r.w/2, r.y - 10);
  if (open) {
    ctx.fillStyle = '#5cff8a';
    ctx.font = 'bold 9px Inter, sans-serif';
    ctx.fillText('OPEN →', r.x + r.w/2, r.y + r.h + 14);
  }
  ctx.restore();
}

function drawTreasureRoom() {
  // Decorative gold trim
  ctx.strokeStyle = '#ffd94a';
  ctx.lineWidth = 2;
  ctx.strokeRect(TREASURE.x + 4, TREASURE.y + 4, TREASURE.w - 8, TREASURE.h - 8);
  ctx.fillStyle = '#ffd94a';
  ctx.font = 'bold 14px Inter';
  ctx.textAlign = 'center';
  ctx.fillText('TREASURE', TREASURE.x + TREASURE.w/2, TREASURE.y + 30);
}

function drawFurniture() {
  for (const f of furniture) drawFurn(f);
}

function drawFurn(f) {
  const x = f.x, y = f.y, w = f.w, h = f.h;
  const searched = state.searched.has(f.id);
  switch (f.kind) {
    case 'bed': {
      ctx.fillStyle = '#5a4a6a'; rect(x, y, w, h);
      ctx.fillStyle = '#8a8aff'; rect(x + 6, y + 6, w - 12, h - 18);   // sheet
      ctx.fillStyle = '#ffd1d1'; rect(x + 10, y + 10, 28, 16);         // pillow
      outline(x, y, w, h);
      label(f.label, x + w/2, y - 4);
      break;
    }
    case 'chest': {
      ctx.fillStyle = '#7a4a18'; rect(x, y, w, h);
      ctx.fillStyle = '#ffd94a'; rect(x + 4, y + h/2 - 2, w - 8, 4);
      outline(x, y, w, h);
      if (searched) tinyOpen(x + w/2, y); else label('toy chest', x + w/2, y - 4);
      break;
    }
    case 'shelf': case 'shelf2': {
      ctx.fillStyle = '#6a4a30'; rect(x, y, w, h);
      ctx.fillStyle = '#a07050';
      for (let sy = y + 6; sy < y + h - 6; sy += 32) ctx.fillRect(x + 4, sy, w - 8, 4);
      // Books
      for (let sy = y + 10; sy < y + h - 10; sy += 32) {
        for (let bx = x + 6; bx < x + w - 12; bx += 8) {
          ctx.fillStyle = ['#5a2a2a','#2a3a5a','#3a5a2a','#5a4a2a'][(bx + sy) % 4];
          ctx.fillRect(bx, sy, 6, 22);
        }
      }
      outline(x, y, w, h);
      break;
    }
    case 'bookcase': {
      ctx.fillStyle = '#3a2a1a'; rect(x, y, w, h);
      for (let sy = y + 6; sy < y + h - 6; sy += 30) {
        ctx.fillStyle = '#5a4030';
        ctx.fillRect(x + 2, sy, w - 4, 3);
        for (let bx = x + 4; bx < x + w - 6; bx += 7) {
          ctx.fillStyle = ['#7a2a2a','#2a3a7a','#3a7a2a','#7a6a2a','#5a3a7a'][(bx + sy) % 5];
          ctx.fillRect(bx, sy + 4, 5, 22);
        }
      }
      outline(x, y, w, h);
      break;
    }
    case 'doll': {
      ctx.fillStyle = '#a86a8a'; rect(x, y, w, h);
      ctx.fillStyle = '#5a2a4a'; ctx.fillRect(x + 8, y + 8, w - 16, 30);
      ctx.fillStyle = '#ffd94a'; ctx.fillRect(x + w/2 - 4, y + h - 16, 8, 12);
      ctx.strokeStyle = '#1a1a1a'; ctx.strokeRect(x + 8, y + 8, w - 16, 30);
      outline(x, y, w, h);
      label('doll house', x + w/2, y - 4);
      break;
    }
    case 'drawer': {
      ctx.fillStyle = '#5a4030'; rect(x, y, w, h);
      ctx.fillStyle = '#7a5040'; ctx.fillRect(x + 4, y + 4, w - 8, h/2 - 6);
      ctx.fillStyle = '#7a5040'; ctx.fillRect(x + 4, y + h/2 + 2, w - 8, h/2 - 6);
      ctx.fillStyle = '#ffd94a'; ctx.fillRect(x + w/2 - 4, y + 14, 8, 4);
      ctx.fillStyle = '#ffd94a'; ctx.fillRect(x + w/2 - 4, y + h - 16, 8, 4);
      outline(x, y, w, h);
      break;
    }
    case 'blocks': {
      const cols = ['#ff6666','#ffd94a','#66aaff','#66cc66'];
      ctx.fillStyle = cols[0]; rect(x + 6, y + 30, 18, 18);
      ctx.fillStyle = cols[1]; rect(x + 26, y + 30, 18, 18);
      ctx.fillStyle = cols[2]; rect(x + 16, y + 12, 18, 18);
      break;
    }
    case 'horse': {
      ctx.fillStyle = '#a05a3a'; rect(x + 10, y + 14, w - 20, 30);
      ctx.fillStyle = '#7a3a2a'; ctx.fillRect(x + 6, y + 18, 10, 18);   // head
      ctx.fillStyle = '#1a1a1a'; ctx.fillRect(x + 8, y + 22, 4, 4);     // eye
      // rocker
      ctx.strokeStyle = '#5a3a2a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x + 4, y + h - 4); ctx.quadraticCurveTo(x + w/2, y + h + 6, x + w - 4, y + h - 4); ctx.stroke();
      break;
    }
    case 'rug': {
      ctx.fillStyle = '#5a2a4a'; rect(x, y, w, h);
      ctx.strokeStyle = '#a04a8a'; ctx.lineWidth = 2;
      ctx.strokeRect(x + 6, y + 6, w - 12, h - 12);
      break;
    }
    case 'panel': {
      ctx.fillStyle = state.puzzleSolved ? '#3a6a4a' : (state.hasBattery ? '#3a4a6a' : '#4a3a3a');
      rect(x, y, w, h);
      // 4 mini frames
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = '#1a1a22';
        ctx.fillRect(x + 4 + i * 18, y + 8, 14, 14);
      }
      outline(x, y, w, h);
      label('PICTURE PANEL', x + w/2, y - 4);
      break;
    }
    case 'table': {
      ctx.fillStyle = '#7a5430'; rect(x, y, w, h);
      ctx.strokeStyle = '#3a2a1a'; ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);
      break;
    }
    case 'chair': {
      ctx.fillStyle = '#5a4030'; rect(x, y, w, h);
      ctx.fillStyle = '#3a2a1a'; ctx.fillRect(x + 4, y + 4, w - 8, 6);
      break;
    }
    case 'cabinet': {
      ctx.fillStyle = '#4a3a5a'; rect(x, y, w, h);
      ctx.fillStyle = '#3a2a4a'; ctx.fillRect(x + 4, y + 4, w/2 - 6, h - 8);
      ctx.fillStyle = '#3a2a4a'; ctx.fillRect(x + w/2 + 2, y + 4, w/2 - 6, h - 8);
      ctx.fillStyle = '#ffd94a';
      ctx.beginPath(); ctx.arc(x + w/2 - 3, y + h/2, 2, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + w/2 + 3, y + h/2, 2, 0, Math.PI*2); ctx.fill();
      outline(x, y, w, h);
      break;
    }
    case 'basket': {
      ctx.fillStyle = '#a07a3a'; rect(x, y, w, h);
      ctx.strokeStyle = '#5a3a1a';
      for (let i = 0; i < 4; i++) ctx.strokeRect(x + 2, y + 2 + i*14, w - 4, 12);
      break;
    }
    case 'clock': {
      ctx.fillStyle = '#5a3a2a'; rect(x, y, w, h);
      ctx.fillStyle = '#f4ecd0'; ctx.beginPath(); ctx.arc(x + w/2, y + 24, 16, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 2;
      // 7 o'clock marker on all hands
      ctx.beginPath(); ctx.moveTo(x + w/2, y + 24); ctx.lineTo(x + w/2 - 8, y + 32); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + w/2, y + 24); ctx.lineTo(x + w/2 - 6, y + 30); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + w/2, y + 24); ctx.lineTo(x + w/2 - 4, y + 28); ctx.stroke();
      // Pendulum
      ctx.fillStyle = '#ffd94a'; ctx.beginPath(); ctx.arc(x + w/2, y + h - 12, 6, 0, Math.PI*2); ctx.fill();
      outline(x, y, w, h);
      break;
    }
    case 'locker': case 'locker_g': case 'locker_b': {
      const col = f.kind === 'locker' ? '#7a2a2a' : f.kind === 'locker_g' ? '#2a5a3a' : '#2a3a6a';
      ctx.fillStyle = col; rect(x, y, w, h);
      ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + 4, y + 30); ctx.lineTo(x + w - 4, y + 30); ctx.stroke();
      // Vents
      for (let vy = y + 8; vy < y + 26; vy += 4) ctx.fillRect(x + 12, vy, w - 24, 1);
      // Combo dial on red locker
      if (f.kind === 'locker') {
        ctx.fillStyle = '#ffd94a'; ctx.beginPath(); ctx.arc(x + w/2, y + 56, 5, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#1a1a1a'; ctx.fillRect(x + w/2 - 1, y + 52, 2, 6);
      } else {
        ctx.fillStyle = '#ffd94a'; ctx.fillRect(x + w/2 - 4, y + 54, 8, 4);
      }
      outline(x, y, w, h);
      label(f.label.split(' ')[0].toUpperCase(), x + w/2, y - 4);
      break;
    }
    case 'crate': case 'box': {
      ctx.fillStyle = f.kind === 'crate' ? '#6a4a2a' : '#a07a4a';
      rect(x, y, w, h);
      ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1;
      ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);
      ctx.beginPath(); ctx.moveTo(x + 4, y + 4); ctx.lineTo(x + w - 4, y + h - 4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + w - 4, y + 4); ctx.lineTo(x + 4, y + h - 4); ctx.stroke();
      break;
    }
    case 'barrel': {
      ctx.fillStyle = '#5a4030'; ctx.beginPath();
      ctx.ellipse(x + w/2, y + h/2, w/2, h/2, 0, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(x + w/2, y + h/2 - 8, w/2, 4, 0, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(x + w/2, y + h/2 + 8, w/2, 4, 0, 0, Math.PI*2); ctx.stroke();
      break;
    }
    case 'mop': {
      ctx.strokeStyle = '#a08050'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(x + w/2, y); ctx.lineTo(x + w/2, y + h - 14); ctx.stroke();
      ctx.fillStyle = '#dadada'; ctx.fillRect(x, y + h - 14, w, 14);
      break;
    }
    case 'workbench': {
      ctx.fillStyle = '#5a4a2a'; rect(x, y, w, h);
      ctx.fillStyle = '#7a6a4a'; ctx.fillRect(x + 4, y + 4, w - 8, h/3);
      // Tools
      ctx.fillStyle = '#a0a0a0'; ctx.fillRect(x + 12, y + 30, 24, 4);
      ctx.fillStyle = '#dadada'; ctx.fillRect(x + 60, y + 30, 16, 8);
      outline(x, y, w, h);
      break;
    }
    case 'desk': {
      ctx.fillStyle = '#5a3a2a'; rect(x, y, w, h);
      ctx.fillStyle = '#3a2a1a'; ctx.fillRect(x + 4, y + 4, w - 8, h - 18);
      // Lamp
      ctx.fillStyle = '#ffd94a'; ctx.beginPath(); ctx.arc(x + 16, y + 14, 6, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#3a2a1a'; ctx.fillRect(x + 14, y + 14, 4, 18);
      // Book
      ctx.fillStyle = '#7a2a2a'; ctx.fillRect(x + w - 32, y + 18, 24, 16);
      outline(x, y, w, h);
      break;
    }
    case 'globe': {
      ctx.fillStyle = '#3a2a1a'; ctx.fillRect(x + w/2 - 2, y + h/2, 4, h/2);
      ctx.fillStyle = '#3a4a8a'; ctx.beginPath(); ctx.arc(x + w/2, y + h/2 - 4, w/2 - 4, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#3a7a4a';
      ctx.beginPath(); ctx.arc(x + w/2 - 4, y + h/2 - 8, 4, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + w/2 + 4, y + h/2 - 2, 5, 0, Math.PI*2); ctx.fill();
      break;
    }
    case 'bin': {
      ctx.fillStyle = '#3a3a3a'; rect(x, y, w, h);
      ctx.strokeStyle = '#1a1a1a'; ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
      ctx.fillStyle = '#a0a0a0'; ctx.fillRect(x + 6, y - 2, w - 12, 4);
      break;
    }
    case 'tchest': {
      ctx.fillStyle = '#7a4a18'; rect(x, y, w, h);
      ctx.fillStyle = '#ffd94a'; ctx.fillRect(x + 6, y + 4, w - 12, 6);
      ctx.fillStyle = '#ffd94a'; ctx.fillRect(x + w/2 - 6, y + h/2, 12, 12);
      // Glow
      ctx.shadowColor = '#ffd94a'; ctx.shadowBlur = 20;
      ctx.strokeStyle = '#ffe070'; ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
      ctx.shadowBlur = 0;
      label('TREASURE!', x + w/2, y - 6);
      break;
    }
    default:
      ctx.fillStyle = '#5a4a3a'; rect(x, y, w, h); outline(x, y, w, h);
  }

  // Searched indicator (✓)
  if (searched && f.prompt && !['pz_panel','sp_locker1','tr_chest'].includes(f.id)) {
    ctx.fillStyle = '#4af0a0';
    ctx.font = 'bold 14px Inter';
    ctx.textAlign = 'center';
    ctx.fillText('✓', f.x + f.w - 6, f.y + 12);
  }
}

function rect(x, y, w, h) { ctx.fillRect(x, y, w, h); }
function outline(x, y, w, h) { ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); }
function label(text, x, y) { ctx.fillStyle = '#cfcfe0'; ctx.font = '9px Inter'; ctx.textAlign = 'center'; ctx.fillText(text, x, y); }
function tinyOpen(x, y) { ctx.fillStyle = '#4af0a0'; ctx.font = 'bold 10px Inter'; ctx.textAlign = 'center'; ctx.fillText('✓ searched', x, y - 4); }

function drawItems() {
  for (const it of items) {
    if (it.collected) continue;
    drawItem(it);
  }
}
function drawItem(it) {
  const x = it.x, y = it.y;
  // Float bob
  const bob = Math.sin(performance.now() / 300 + x) * 2;
  // Glow
  ctx.shadowColor = '#ffd94a'; ctx.shadowBlur = 12;
  switch (it.icon) {
    case 'key_small':
      ctx.fillStyle = '#dadada';
      ctx.beginPath(); ctx.arc(x - 4, y + bob, 4, 0, Math.PI*2); ctx.fill();
      ctx.fillRect(x - 1, y - 1 + bob, 12, 2);
      break;
    case 'key_brass':
      ctx.fillStyle = '#c08030';
      ctx.beginPath(); ctx.arc(x - 4, y + bob, 4, 0, Math.PI*2); ctx.fill();
      ctx.fillRect(x - 1, y - 1 + bob, 10, 2);
      break;
    case 'battery':
      ctx.fillStyle = '#3a3a3a'; ctx.fillRect(x - 6, y - 4 + bob, 12, 8);
      ctx.fillStyle = '#ffd94a'; ctx.fillRect(x - 5, y - 3 + bob, 10, 2);
      ctx.fillStyle = '#dadada'; ctx.fillRect(x - 1, y - 6 + bob, 2, 2);
      break;
    case 'coin':
      ctx.fillStyle = '#ffd94a'; ctx.beginPath(); ctx.arc(x, y + bob, 5, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#a07a18'; ctx.font = 'bold 7px Inter'; ctx.textAlign='center'; ctx.fillText('$', x, y + 2 + bob);
      break;
    case 'gem': {
      const col = it.gemColor || '#ffb347';
      ctx.save();
      ctx.shadowColor = col; ctx.shadowBlur = 18;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(x, y - 7 + bob);
      ctx.lineTo(x + 5, y - 1 + bob);
      ctx.lineTo(x + 3, y + 6 + bob);
      ctx.lineTo(x - 3, y + 6 + bob);
      ctx.lineTo(x - 5, y - 1 + bob);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.6; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.moveTo(x - 1, y - 5 + bob);
      ctx.lineTo(x + 1, y - 3 + bob);
      ctx.lineTo(x - 1, y + 0 + bob);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'keycard':
      ctx.fillStyle = '#ff3a4a'; ctx.fillRect(x - 8, y - 5 + bob, 16, 10);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 6, y - 3 + bob, 6, 4);
      ctx.fillStyle = '#1a1a1a'; ctx.fillRect(x + 2, y - 2 + bob, 4, 2);
      ctx.fillRect(x + 2, y + 1 + bob, 4, 1);
      break;
    default:
      ctx.fillStyle = '#dadada'; ctx.fillRect(x - 4, y - 4 + bob, 8, 8);
  }
  ctx.shadowBlur = 0;
  // Tiny label
  ctx.fillStyle = '#ffd94a';
  ctx.font = '9px Inter';
  ctx.textAlign = 'center';
  ctx.fillText(it.label, x, y - 12 + bob);
}

function drawPlayer() {
  if (window.HorridorsSprites && window.HorridorsSprites.drawCharacter) {
    window.HorridorsSprites.drawChesterWalk(ctx, player.x + player.w/2, player.y + player.h + 8, Math.cos(player.facing) >= 0 ? 1 : -1, 56, player.vx, player.vy);
    return;
  }
}

function drawMonster() {
  if (window.HorridorsSprites && window.HorridorsSprites.drawCharacter) {
    window.HorridorsSprites.drawCharacter(ctx, 'grinpatch', monster.x + monster.w/2, monster.y + monster.h + 8, 1, 72);
    return;
  }
}

function drawHollow() {
  if (window.HorridorsSprites && window.HorridorsSprites.drawCharacter) {
    window.HorridorsSprites.drawCharacter(ctx, 'hollow', hollow.x + hollow.w/2, hollow.y + hollow.h + 8, 1, 60);
    return;
  }
}

// ---------- Lighting ----------
function drawLighting() {
  // Ambient darkness — kid-safe horror: dim, but everything is readable.
  // We use an off-screen mask: paint white where lights are, then use the inverse as dark overlay.
  const darkAlpha = state.chase.active ? 0.65 : 0.55;

  // Build light mask
  if (!drawLighting._mask) {
    drawLighting._mask = document.createElement('canvas');
    drawLighting._mask.width = VIEW_W;
    drawLighting._mask.height = VIEW_H;
  }
  const mc = drawLighting._mask;
  const mctx = mc.getContext('2d');
  // Start fully dark (black = darkness will be applied)
  mctx.globalCompositeOperation = 'source-over';
  mctx.fillStyle = '#000';
  mctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // Lights: draw white where light reaches
  mctx.globalCompositeOperation = 'lighter';
  const lights = [];
  // Corridor ceiling lights (flickering)
  for (let lx = 280; lx <= 2200; lx += 200) {
    const flicker = Math.sin(performance.now() / 200 + lx) > -0.85 ? 1 : 0.5;
    lights.push({ x: lx, y: CORR_TOP + 90, r: 180, intensity: 1.0 * flicker, color: [255, 240, 200] });
  }
  // Each room: ceiling lights spread across the room
  for (const room of Object.values(ROOMS)) {
    const cx = room.left + room.w/2;
    let color = [255, 235, 200];
    if (room.id === 'lib') color = [200, 220, 255];
    if (room.id === 'puzzle') color = [220, 200, 255];
    if (room.id === 'supply') color = [255, 230, 180];
    lights.push({ x: cx, y: room.top + 120,  r: 200, intensity: 0.95, color });
    lights.push({ x: cx, y: room.top + 320, r: 200, intensity: 0.95, color });
    lights.push({ x: cx, y: room.bottom - 100, r: 180, intensity: 0.85, color });
  }
  // Treasure room
  if (state.doorsOpen.scanner) {
    lights.push({ x: TREASURE.x + TREASURE.w/2, y: TREASURE.y + TREASURE.h/2, r: 220, intensity: 1.2, color: [255, 217, 74] });
  }
  // Player ambient halo (so you can always see yourself)
  const px = player.x + player.w/2 - camera.x;
  const py = player.y + player.h/2 - camera.y;
  lights.push({ sx: px, sy: py, r: 120, intensity: 0.9, color: [220, 220, 240] });

  for (const L of lights) {
    const sx = (L.sx !== undefined) ? L.sx : (L.x - camera.x);
    const sy = (L.sy !== undefined) ? L.sy : (L.y - camera.y);
    if (sx < -300 || sx > VIEW_W + 300 || sy < -300 || sy > VIEW_H + 300) continue;
    const grad = mctx.createRadialGradient(sx, sy, 0, sx, sy, L.r);
    const [r, g, b] = L.color;
    const a = Math.min(1, L.intensity);
    grad.addColorStop(0, `rgba(${r},${g},${b},${a})`);
    grad.addColorStop(0.6, `rgba(${r},${g},${b},${a*0.5})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    mctx.fillStyle = grad;
    mctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  // Flashlight cone (additive)
  if (state.flashlightOn && state.hasFlashlight) {
    const fx = px, fy = py;
    const angle = player.facing || 0;
    const reach = 240;
    const half = Math.PI / 4.5;
    mctx.save();
    mctx.beginPath();
    mctx.moveTo(fx, fy);
    const steps = 28;
    for (let i = 0; i <= steps; i++) {
      const a = angle - half + (half * 2 * i / steps);
      mctx.lineTo(fx + Math.cos(a) * reach, fy + Math.sin(a) * reach);
    }
    mctx.closePath();
    const grad = mctx.createRadialGradient(fx, fy, 10, fx, fy, reach);
    grad.addColorStop(0, 'rgba(255,250,220,1.0)');
    grad.addColorStop(0.5, 'rgba(255,240,200,0.6)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    mctx.fillStyle = grad;
    mctx.fill();
    mctx.restore();
  }

  // Build the dark overlay on a second canvas: dark everywhere, then erase using the light mask.
  if (!drawLighting._dark) {
    drawLighting._dark = document.createElement('canvas');
    drawLighting._dark.width = VIEW_W;
    drawLighting._dark.height = VIEW_H;
  }
  const dc = drawLighting._dark;
  const dctx = dc.getContext('2d');
  dctx.globalCompositeOperation = 'source-over';
  dctx.fillStyle = `rgba(8, 6, 14, ${darkAlpha})`;
  dctx.clearRect(0, 0, VIEW_W, VIEW_H);
  dctx.fillRect(0, 0, VIEW_W, VIEW_H);
  // Erase the dark where the mask is bright
  dctx.globalCompositeOperation = 'destination-out';
  dctx.drawImage(mc, 0, 0);
  dctx.globalCompositeOperation = 'source-over';

  // Composite the dark overlay onto the main canvas (normal blending, preserves world below)
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(dc, 0, 0);
  // Light tint on top: subtle warm glow where lights are
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.12;
  ctx.drawImage(mc, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}

// ---------- Init ----------
setObjective('Explore. Something here opens other rooms.');
updateCoinHud();

// Speaker intro after a beat
setTimeout(() => {
  if (state.scene === 'title') {
    // wait for click
  }
}, 100);

// Esc / E / Space / Enter / N close overlays (only when an overlay is actually open)
window.addEventListener('keydown', (e) => {
  // Bail out if Level 1 isn't the active level. L2/L3/L4 attach their own close handlers
  // that own the shared overlay DOM (#overlay-note, #overlay-notes, etc.). Running L1's
  // handler while another level is active caused the shared modal to close without
  // resetting that level's state.scene — freezing the player mid-game.
  if (!l1Running) return;
  const k = (e.key || '').toLowerCase();
  const isClose = k === 'escape' || k === 'e' || k === ' ' || k === 'enter' || k === 'spacebar';
  const noteOpen = !overlayNote.classList.contains('hidden');
  const notesOpen = !overlayNotes.classList.contains('hidden');
  if (noteOpen && isClose) {
    closeNote();
    // Clear from justPressed so the interact loop doesn't re-trigger on same key
    justPressed.delete('e'); justPressed.delete(' '); justPressed.delete('enter'); justPressed.delete('escape');
    e.preventDefault();
    return;
  }
  if (notesOpen && (isClose || k === 'n')) {
    toggleNotes();
    justPressed.delete('n'); justPressed.delete('e'); justPressed.delete(' '); justPressed.delete('enter'); justPressed.delete('escape');
    e.preventDefault();
    return;
  }
  if (k === 'escape') {
    if (Puzzle.isOpen) Puzzle.close();
    if (Combo.isOpen) Combo.close();
  }
});

// Debug
window.__game = { state, player, monster, hollow, items, furniture, walls, doors, ROOMS, TREASURE, Puzzle, Combo };

// =========================================================================
// AUTO-SAVE WIRING (added after Ellie's feedback — game now persists progress)
// =========================================================================
// HorridorsSave already auto-loads on page boot and applies progress + wallet
// state. Here we connect the title-screen Continue button + save triggers.
function __setupContinueButton() {
  const Save = window.HorridorsSave;
  if (!Save) return;
  const btnC = document.getElementById('btn-continue');
  const btnLbl = document.getElementById('btn-continue-label');
  const btnNew = document.getElementById('btn-newgame');
  if (!btnC || !btnNew) return;

  function refresh() {
    if (!Save.hasSave()) {
      btnC.style.display = 'none';
      btnNew.style.display = 'none';
      return;
    }
    const snap = Save.load();
    if (!snap) { btnC.style.display = 'none'; btnNew.style.display = 'none'; return; }
    // Pick the level to resume: highest in-progress, else highest completed+1
    let resumeN = 1;
    for (let n = 8; n >= 1; n--) {
      if (snap.levelInProgress && snap.levelInProgress[n]) { resumeN = n; break; }
    }
    if (resumeN === 1 && snap.levelsCompleted) {
      let best = 0;
      for (let n = 1; n <= 8; n++) if (snap.levelsCompleted[n]) best = n;
      if (best > 0 && best < 8) resumeN = best + 1;
    }
    btnC.dataset.resumeLevel = String(resumeN);
    if (btnLbl) btnLbl.textContent = '\u2014 Level ' + resumeN;
    btnC.style.display = '';
    btnNew.style.display = '';
  }

  btnC.addEventListener('click', () => {
    const n = parseInt(btnC.dataset.resumeLevel || '1', 10);
    // Use the existing jumpToLevel — it'll show resume prompt or launch fresh
    if (window.__jumpToLevel) window.__jumpToLevel(n);
  });

  btnNew.addEventListener('click', () => {
    if (!confirm('Start a brand-new game? This will erase your saved progress.')) return;
    Save.clear();
    // Reset in-memory progress + wallet so a fresh L1 truly starts clean
    window.__levelInProgress = {1:false,2:false,3:false,4:false,5:false,6:false,7:false,8:false};
    window.__levelsCompleted = {};
    if (window.HorridorsWallet && window.HorridorsWallet.reset) {
      try { window.HorridorsWallet.reset(); } catch(e) {}
    }
    refresh();
    // Trigger the start button as if they tapped "Enter the Corridor" fresh
    const btnStart = document.getElementById('btn-start');
    if (btnStart) btnStart.click();
  });

  refresh();
  // Re-check whenever the title overlay is shown (e.g. after returning to menu)
  const titleEl = document.getElementById('overlay-title');
  if (titleEl) {
    const mo = new MutationObserver(() => {
      if (!titleEl.classList.contains('hidden')) refresh();
    });
    mo.observe(titleEl, { attributes: true, attributeFilter: ['class'] });
  }
}

// Save triggers: anything that meaningfully changes progress
// 1) Whenever __levelInProgress[n] flips to true (level actually started)
// 2) When a level's end overlay shows (level completed)
// 3) On combo lock solved, picture puzzle solved, keycard found (mid-L1 milestones)
function __setupSaveTriggers() {
  const Save = window.HorridorsSave;
  if (!Save) return;

  // Wrap __launchFresh and __launchResume to save right after they fire
  const origFresh = window.__launchFresh;
  if (origFresh && !origFresh.__savePatched) {
    const wrapped = function(n) {
      origFresh(n);
      try { Save.save(); } catch(e) {}
    };
    wrapped.__savePatched = true;
    window.__launchFresh = wrapped;
  }

  // L1 mid-level milestones — wallet HUD coin pickups already trigger updateHUD;
  // we hook addCoins so any coin pickup writes a save (cheap, debounced).
  const W = window.HorridorsWallet;
  if (W && W.addCoins && !W.__saveWrapped) {
    const origAdd = W.addCoins;
    let pending = null;
    W.addCoins = function(n) {
      origAdd.call(W, n);
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => { try { Save.save(); } catch(e) {} pending = null; }, 400);
    };
    W.__saveWrapped = true;
  }

  // Each end overlay: when shown, mark complete + save
  const endOverlays = [
    { id: 'overlay-end',     n: 1 },
    { id: 'overlay-l2-end',  n: 2 },
    { id: 'overlay-l3-end',  n: 3 },
    { id: 'overlay-l4-end',  n: 4 },
    { id: 'overlay-l5-end',  n: 5 },
    { id: 'overlay-l6-end',  n: 6 },
    { id: 'overlay-l7-end',  n: 7 },
    { id: 'overlay-l8-end',  n: 8 },
  ];
  for (const { id, n } of endOverlays) {
    const el = document.getElementById(id);
    if (!el) continue;
    const mo = new MutationObserver(() => {
      if (!el.classList.contains('hidden')) {
        try { Save.markCompleted(n); } catch(e) {}
      }
    });
    mo.observe(el, { attributes: true, attributeFilter: ['class'] });
  }
}

// Run setup after the DOM and other modules are ready.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => { __setupContinueButton(); __setupSaveTriggers(); }, 50);
  });
} else {
  setTimeout(() => { __setupContinueButton(); __setupSaveTriggers(); }, 50);
}
