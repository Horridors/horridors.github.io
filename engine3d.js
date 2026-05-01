// =====================================================================
// HORRIDORS 3D — Engine + Level 2 (Flooded Sublevel)
// Three.js · low-poly stylized · third-person follow cam
// =====================================================================

import * as THREE from 'https://esm.sh/three@0.160.0';

// ---------------------------------------------------------------
// 0. Global DOM refs
// ---------------------------------------------------------------
const canvas = document.getElementById('gl');
const titleScreen = document.getElementById('title-screen');
const stubOverlay = document.getElementById('overlay-stub');
const stubTitle = document.getElementById('stub-title');
const stubBody = document.getElementById('stub-body');
const stubBack = document.getElementById('stub-back');
const tasksOverlay = document.getElementById('overlay-tasks');
const taskList = document.getElementById('task-list');
const closeTasksBtn = document.getElementById('close-tasks');
const btnTasks = document.getElementById('btn-tasks');
const btnMenu = document.getElementById('btn-menu');
const promptEl = document.getElementById('prompt');
const promptText = document.getElementById('prompt-text');
const subtitleEl = document.getElementById('subtitle');
const subSpeaker = document.getElementById('sub-speaker');
const subText = document.getElementById('sub-text');
const toastEl = document.getElementById('toast');
const objectiveEl = document.getElementById('objective');
const toolReadout = document.getElementById('tool-readout');
const coinReadout = document.getElementById('coin-readout').querySelector('.num');
const elemBar = document.getElementById('elem-bar');
const zapFlashEl = document.getElementById('zap-flash');
const debugEl = document.getElementById('debug');

// ---------------------------------------------------------------
// 1. Renderer / scene / camera
// ---------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#1a2a45');
scene.fog = new THREE.Fog('#1a2a45', 38, 90);

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);

// ---------------------------------------------------------------
// 2. Lighting — low-poly stylized (3-light setup)
// ---------------------------------------------------------------
const hemi = new THREE.HemisphereLight('#d8e4f0', '#3a4458', 1.8);
scene.add(hemi);

const ambient = new THREE.AmbientLight('#5a6478', 0.6);
scene.add(ambient);

const keyLight = new THREE.DirectionalLight('#fff4d8', 2.0);
keyLight.position.set(12, 22, 8);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
keyLight.shadow.camera.left = -30;
keyLight.shadow.camera.right = 30;
keyLight.shadow.camera.top = 30;
keyLight.shadow.camera.bottom = -30;
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 80;
keyLight.shadow.bias = -0.0008;
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight('#4aa8c8', 0.6);
rimLight.position.set(-14, 10, -10);
scene.add(rimLight);

// Fill light from behind camera (south)
const fillLight = new THREE.DirectionalLight('#c8b8a0', 0.4);
fillLight.position.set(0, 8, 18);
scene.add(fillLight);

// Atmospheric flicker (subtle)
let flickerT = 0;

// ---------------------------------------------------------------
// 3. Material helpers — flat-shaded low-poly look
// ---------------------------------------------------------------
function flatMat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    flatShading: true,
    roughness: opts.rough ?? 0.85,
    metalness: opts.metal ?? 0.02,
    emissive: opts.emissive ?? '#000',
    emissiveIntensity: opts.emissiveIntensity ?? 0,
  });
}

// ---------------------------------------------------------------
// Shared billboard-sprite helper — L1 bitmap characters in 3D
// ---------------------------------------------------------------
// Loads a character PNG from ./characters/ and builds a camera-facing
// textured plane (billboard). Returned group.userData.__billboard is set
// so the render loop can rotate it to face the camera each frame.
// The plane is anchored at feet (y = 0 at group origin).
const __charTexLoader = new THREE.TextureLoader();
__charTexLoader.setCrossOrigin('anonymous');
const __charTexCache = {};
function loadCharTex(name) {
  if (__charTexCache[name]) return __charTexCache[name];
  const tex = __charTexLoader.load('./characters/' + name + '.png');
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  __charTexCache[name] = tex;
  return tex;
}
// aspect = naturalWidth / naturalHeight. Since textures load async, we use
// a sane default aspect per character (measured from the real PNGs).
const CHAR_ASPECT = {
  chester: 0.69, mum: 0.69, thistle: 0.67, grinpatch: 0.69, hollow: 0.69,
  drip: 0.67, inkybin: 0.69, expreshon: 0.69, exlena: 0.69, sockyshok: 0.68, blacky: 0.69,
};
function makeCharacterBillboard(charName, heightMeters = 1.8) {
  const g = new THREE.Group();
  const tex = loadCharTex(charName);
  const aspect = CHAR_ASPECT[charName] || 0.7;
  const w = heightMeters * aspect;
  const h = heightMeters;
  const geo = new THREE.PlaneGeometry(w, h);
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    transparent: true,
    alphaTest: 0.35,
    side: THREE.DoubleSide,
    roughness: 0.85,
    metalness: 0,
    emissive: '#000',
  });
  const plane = new THREE.Mesh(geo, mat);
  // Feet at group y=0 — plane centered on h/2 up
  plane.position.y = h / 2;
  plane.castShadow = false; // transparent PNGs render odd shadows
  plane.receiveShadow = false;
  // Update correct size once the texture actually loads (aspect may differ)
  tex.__onUpdate = () => {
    if (tex.image && tex.image.naturalWidth) {
      const realAspect = tex.image.naturalWidth / tex.image.naturalHeight;
      plane.geometry.dispose();
      plane.geometry = new THREE.PlaneGeometry(h * realAspect, h);
    }
  };
  if (tex.image && tex.image.complete) tex.__onUpdate();
  else tex.addEventListener && tex.addEventListener('update', tex.__onUpdate);
  // Fallback: poll once after a beat
  setTimeout(() => tex.__onUpdate && tex.__onUpdate(), 400);

  // Ground shadow — a flat dark ellipse on y=0.02
  const shadowGeo = new THREE.CircleGeometry(w * 0.35, 20);
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false,
  });
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  shadow.scale.y = 0.5; // squash into oval

  g.add(shadow);
  g.add(plane);
  plane.userData.__isBillboardPlane = true;
  g.userData.__billboard = plane;
  g.userData.__sprite = plane;
  g.userData.__billboardGroup = true;
  return g;
}

// Called each frame — rotate every billboard plane to face the camera.
// Y-axis-only rotation so sprites stay upright (no pitch/roll).
function updateBillboards(cam) {
  scene.traverse((obj) => {
    if (obj.userData && obj.userData.__isBillboardPlane) {
      // Work in world space: face the camera horizontally
      const worldPos = new THREE.Vector3();
      obj.getWorldPosition(worldPos);
      const dx = cam.position.x - worldPos.x;
      const dz = cam.position.z - worldPos.z;
      const yaw = Math.atan2(dx, dz);
      // Undo parent rotation so plane faces camera regardless of group rotation
      const parentYaw = obj.parent ? obj.parent.rotation.y : 0;
      obj.rotation.y = yaw - parentYaw;
    }
  });
}

const PALETTE = {
  floor:     '#1f2a3a',
  floorEdge: '#2a3850',
  wall:      '#2c374a',
  wallDark:  '#1c2434',
  hubFloor:  '#152033',
  water:     '#1a5a6e',
  waterFoam: '#2a8aa0',
  pipeBrass: '#8a6a2a',
  pipeGrey:  '#485060',
  accentT:   '#2fc6b8',   // teal (Socky)
  accentR:   '#c8443a',   // red
  accentB:   '#3a72c8',   // blue
  accentY:   '#d4a43a',   // yellow
  chesterBody:  '#e8d8b0',
  chesterHair:  '#4a3020',
  chesterPants: '#2a3a5a',
  squidleyInk:  '#1a0f2a',
  squidleyGlow: '#6a3ea0',
  lightningY:   '#ffdd3a',
  bolt:         '#111111',
  coin:         '#ffd65a',
  coinDark:     '#d4a228',
};

// ---------------------------------------------------------------
// 4. World / level definitions
// ---------------------------------------------------------------
// World coordinates: X = east/west, Z = north/south, Y = up.
// L2 plus-shaped layout — scaled down from the 2D version.
// 2D was 2400×1600 with rooms of 400×400. We use 1 world unit = ~3.7 2D px.
// Final dims in world units: ~40 × 32. Rooms ~12×12, hub corridors ~6 wide.

const L2 = {
  // Rooms: each an axis-aligned box on the floor plane
  rooms: {
    aquarium: { name: 'Aquarium Room',  minX: -18, maxX: -7,  minZ: -3.5, maxZ: 7.5, floor: '#1a2e3a', accent: PALETTE.accentB },
    pipe:     { name: 'Pipe Room',      minX: -4,  maxX: 5,   minZ: -14,  maxZ: -4,  floor: '#2a2a2e', accent: PALETTE.pipeBrass },
    control:  { name: 'Control Room',   minX: 7,   maxX: 18,  minZ: -3.5, maxZ: 7.5, floor: '#1a2830', accent: PALETTE.accentT },
  },
  // Hub (cross-shaped flooded corridor)
  hub: [
    // Horizontal strip
    { minX: -18, maxX: 18,  minZ: -0.5, maxZ: 4.5 },
    // Vertical strip connecting pipe room (north) to exit (south)
    { minX: -1,  maxX: 3,   minZ: -14,  maxZ: 10  },
  ],
  // Room door openings (connect room to hub): each is a gap in the wall
  doors: [
    { name: 'aq_door',   room: 'aquarium', side: 'east',  axis: 'z', center: 2,   width: 2.6 },
    { name: 'pipe_door', room: 'pipe',     side: 'south', axis: 'x', center: 1,   width: 2.6 },
    { name: 'ctrl_door', room: 'control',  side: 'west',  axis: 'z', center: 2,   width: 2.6 },
  ],
  // Spawn — in the hub, south of center, facing north toward pipe room door
  spawn: { x: 1, z: 7 },
  // Exit (future: stairs up — marked but not wired)
};

// ---------------------------------------------------------------
// 5. Input
// ---------------------------------------------------------------
const keys = new Set();
const justPressed = new Set();

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
  if (!keys.has(k)) justPressed.add(k);
  keys.add(k);
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());

const isDown = (...ks) => ks.some(k => keys.has(k));
const wasPressed = (...ks) => ks.some(k => justPressed.has(k));

// Mouse for camera orbit
const mouse = {
  down: false,
  dragX: 0,
  dragY: 0,
  yaw: 0,   // camera behind Chester (south side) looking north toward rooms
  pitch: 0.6,
};
canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  mouse.down = true;
  mouse.dragX = e.clientX;
  mouse.dragY = e.clientY;
});
window.addEventListener('mouseup', () => { mouse.down = false; });
window.addEventListener('mousemove', (e) => {
  if (!mouse.down) return;
  const dx = e.clientX - mouse.dragX;
  const dy = e.clientY - mouse.dragY;
  mouse.dragX = e.clientX;
  mouse.dragY = e.clientY;
  mouse.yaw -= dx * 0.006;
  mouse.pitch = Math.max(0.15, Math.min(1.2, mouse.pitch + dy * 0.004));
});

// ---------------------------------------------------------------
// 6. Chester — low-poly player model
// ---------------------------------------------------------------
function makeChester() {
  // Billboard sprite — same artwork as L1 bitmap Chester
  const g = makeCharacterBillboard('chester', 1.9);

  // Flashlight (small cylinder) — held to the right of Chester
  const flash = new THREE.Group();
  const flashBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 0.28, 8),
    flatMat('#444b5a', { metal: 0.5, rough: 0.4 }),
  );
  flashBody.rotation.z = Math.PI / 2;
  flash.add(flashBody);
  const flashBulb = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.06, 0.05, 8),
    flatMat('#fff8c8', { emissive: '#fff8c8', emissiveIntensity: 1.2 }),
  );
  flashBulb.rotation.z = Math.PI / 2;
  flashBulb.position.x = 0.17;
  flash.add(flashBulb);
  flash.position.set(0.42, 0.9, 0.15);
  g.add(flash);

  // Spotlight beam from flashlight
  const spot = new THREE.SpotLight('#fff6c8', 2.0, 12, Math.PI / 6, 0.5, 1.2);
  spot.position.set(0.42, 0.9, 0.18);
  const spotTarget = new THREE.Object3D();
  spotTarget.position.set(0.42, 0.9, 5);
  g.add(spot);
  g.add(spotTarget);
  spot.target = spotTarget;

  // No-op limb stubs so the existing animation loop keeps working
  const stubArmL = new THREE.Object3D();
  const stubArmR = new THREE.Object3D();
  const stubLegL = new THREE.Object3D();
  const stubLegR = new THREE.Object3D();
  g.add(stubArmL, stubArmR, stubLegL, stubLegR);

  // Grabpack glow (hidden initially)
  const grabGlow = new THREE.PointLight(PALETTE.accentT, 0, 3.5);
  grabGlow.position.set(0.37, 0.9, 0.2);
  g.add(grabGlow);

  g.userData.animT = 0;
  g.userData.armL = stubArmL;
  g.userData.armR = stubArmR;
  g.userData.legL = stubLegL;
  g.userData.legR = stubLegR;
  g.userData.flash = flash;
  g.userData.spot = spot;
  g.userData.spotTarget = spotTarget;
  g.userData.grabGlow = grabGlow;

  g.userData.setGrabpack = (on) => {
    grabGlow.intensity = on ? 0.8 : 0;
    flash.visible = !on;
  };

  return g;
}

// ---------------------------------------------------------------
// 7. Socky Shok — low-poly 3D version
// (teal, tall capsule, single bolt, no ears, T-arms, tiny feet)
// ---------------------------------------------------------------
function makeSocky() {
  // Billboard sprite — same artwork as L1 Socky Shok
  const g = makeCharacterBillboard('sockyshok', 1.9);
  const sprite = g.userData.__sprite;
  const baseSpriteY = sprite.position.y;

  // Soft teal glow
  const glow = new THREE.PointLight(PALETTE.accentT, 0.7, 6);
  glow.position.y = 1.2;
  g.add(glow);

  // Proxy "body/topCap/botCap" to the sprite so the bob anim nudges the sprite.
  // The animation sets `.position.y` to values like `0.85 + sin*0.04`; we treat
  // the delta off the original 0.85 as bob offset and apply it to the sprite.
  const bobBody = {
    position: {
      get y() { return 0.85; },
      set y(v) { sprite.position.y = baseSpriteY + (v - 0.85); },
    },
  };
  const noop = { position: { get y() { return 0; }, set y(v) {} } };
  const stubArmL = new THREE.Object3D();
  const stubArmR = new THREE.Object3D();
  const stubBolt = new THREE.Object3D();
  g.add(stubArmL, stubArmR, stubBolt);

  g.userData.body = bobBody;
  g.userData.topCap = noop;
  g.userData.botCap = noop;
  g.userData.armL = stubArmL;
  g.userData.armR = stubArmR;
  g.userData.bolt = stubBolt;
  g.userData.glow = glow;
  g.userData.bob = 0;
  return g;
}

// ---------------------------------------------------------------
// 8. Squidley (Inky Bin ally) — small floating inky creature
// ---------------------------------------------------------------
function makeSquidley() {
  // Billboard sprite — Inky Bin bitmap from L1. Small floating ally.
  const g = makeCharacterBillboard('inkybin', 1.1);

  // Halo
  const halo = new THREE.PointLight(PALETTE.squidleyGlow, 0.6, 3.5);
  halo.position.y = 0.5;
  g.add(halo);

  g.userData.bob = Math.random() * 10;
  g.userData.body = g.userData.__sprite; // reference kept for compatibility
  return g;
}

// ---------------------------------------------------------------
// 9. Drip (tentacle threat in hub water) — distant slow creature
// ---------------------------------------------------------------
function makeDrip() {
  // Billboard sprite — Drip bitmap from L1. Slow distant threat.
  const g = makeCharacterBillboard('drip', 1.8);
  // Menacing purple underglow
  const ominous = new THREE.PointLight('#6a1a8a', 0.5, 5);
  ominous.position.y = 0.3;
  g.add(ominous);
  return g;
}

// ---------------------------------------------------------------
// 10. Helpers for building rooms / walls
// ---------------------------------------------------------------
const walls = []; // { minX, maxX, minZ, maxZ } AABBs that block player
const interactables = []; // { pos: Vec3, radius, id, label, action, group }

function addFloor(minX, maxX, minZ, maxZ, color) {
  const w = maxX - minX, d = maxZ - minZ;
  const geo = new THREE.PlaneGeometry(w, d, 1, 1);
  const m = new THREE.Mesh(geo, flatMat(color, { rough: 0.95 }));
  m.rotation.x = -Math.PI / 2;
  m.position.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
  m.receiveShadow = true;
  scene.add(m);
  return m;
}

function addWall(minX, maxX, minZ, maxZ, height, color) {
  const w = maxX - minX, d = maxZ - minZ;
  const geo = new THREE.BoxGeometry(w, height, d);
  const m = new THREE.Mesh(geo, flatMat(color, { rough: 0.9 }));
  m.position.set((minX + maxX) / 2, height / 2, (minZ + maxZ) / 2);
  m.castShadow = true;
  m.receiveShadow = true;
  scene.add(m);
  walls.push({ minX, maxX, minZ, maxZ });
  return m;
}

// Wall with a door gap — splits into two segments
function addWallWithGap(axis, fixed, min, max, gapCenter, gapWidth, thickness, height, color) {
  // axis 'x': wall runs along X; fixed is Z coord. min/max are X range. gap at X = gapCenter ± gapWidth/2.
  // axis 'z': wall runs along Z; fixed is X coord. min/max are Z range. gap at Z = gapCenter ± gapWidth/2.
  const halfGap = gapWidth / 2;
  const halfT = thickness / 2;
  if (axis === 'x') {
    if (min < gapCenter - halfGap) {
      addWall(min, gapCenter - halfGap, fixed - halfT, fixed + halfT, height, color);
    }
    if (gapCenter + halfGap < max) {
      addWall(gapCenter + halfGap, max, fixed - halfT, fixed + halfT, height, color);
    }
  } else {
    if (min < gapCenter - halfGap) {
      addWall(fixed - halfT, fixed + halfT, min, gapCenter - halfGap, height, color);
    }
    if (gapCenter + halfGap < max) {
      addWall(fixed - halfT, fixed + halfT, gapCenter + halfGap, max, height, color);
    }
  }
}

// ---------------------------------------------------------------
// 11. Build Level 2 geometry
// ---------------------------------------------------------------
const worldRoot = new THREE.Group();
scene.add(worldRoot);

// Water hub — big flat floor
addFloor(-20, 20, -15, 12, PALETTE.hubFloor);

// Hub water overlay — slightly raised, translucent teal
{
  const waterMat = new THREE.MeshStandardMaterial({
    color: PALETTE.water,
    flatShading: true,
    transparent: true,
    opacity: 0.75,
    roughness: 0.4,
    metalness: 0.1,
    emissive: PALETTE.water,
    emissiveIntensity: 0.15,
  });
  const w1 = new THREE.Mesh(new THREE.PlaneGeometry(36, 4), waterMat);
  w1.rotation.x = -Math.PI / 2;
  w1.position.set(0, 0.02, 2);
  scene.add(w1);
  const w2 = new THREE.Mesh(new THREE.PlaneGeometry(4, 24), waterMat);
  w2.rotation.x = -Math.PI / 2;
  w2.position.set(1, 0.02, -2);
  scene.add(w2);
}

// Room floors
for (const [, r] of Object.entries(L2.rooms)) {
  addFloor(r.minX, r.maxX, r.minZ, r.maxZ, r.floor);
}

// Room walls — each room has 4 walls; doors cut a gap
const WH = 2.6; // wall height (slightly shorter so we can see over them in top-down-ish view)
const WT = 0.35; // wall thickness
// Aquarium room (door on east wall)
{
  const r = L2.rooms.aquarium;
  addWall(r.minX - WT, r.minX, r.minZ - WT, r.maxZ + WT, WH, PALETTE.wallDark); // west
  addWallWithGap('z', r.maxX, r.minZ, r.maxZ, 2, 3.5, WT, WH, PALETTE.wallDark); // east (door at z=2)
  addWall(r.minX, r.maxX, r.minZ - WT, r.minZ, WH, PALETTE.wallDark); // south
  addWall(r.minX, r.maxX, r.maxZ, r.maxZ + WT, WH, PALETTE.wallDark); // north
}
// Pipe room (door on south wall)
{
  const r = L2.rooms.pipe;
  addWall(r.minX - WT, r.minX, r.minZ - WT, r.maxZ + WT, WH, PALETTE.wall); // west
  addWall(r.maxX, r.maxX + WT, r.minZ - WT, r.maxZ + WT, WH, PALETTE.wall); // east
  addWall(r.minX, r.maxX, r.minZ - WT, r.minZ, WH, PALETTE.wall); // north
  addWallWithGap('x', r.maxZ, r.minX, r.maxX, 1, 3.5, WT, WH, PALETTE.wall); // south (door at x=1)
}
// Control room (door on west wall)
{
  const r = L2.rooms.control;
  addWallWithGap('z', r.minX, r.minZ, r.maxZ, 2, 3.5, WT, WH, PALETTE.wall); // west (door at z=2)
  addWall(r.maxX, r.maxX + WT, r.minZ - WT, r.maxZ + WT, WH, PALETTE.wall); // east
  addWall(r.minX, r.maxX, r.minZ - WT, r.minZ, WH, PALETTE.wall); // south
  addWall(r.minX, r.maxX, r.maxZ, r.maxZ + WT, WH, PALETTE.wall); // north
}

// Hub boundary walls (ring around the plus-shape) — only where rooms do NOT already have walls.
// Horizontal hub runs z=-0.5 to 4.5 on x=-20 to 20 (with room doors around x=-7..7 via aquarium/control west/east walls).
// South edge of horizontal hub
addWall(-20, -7, -0.5 - WT, -0.5, WH, PALETTE.wall);      // hub south, west of aquarium room
addWall(-7, -1, -0.5 - WT, -0.5, WH, PALETTE.wall);      // hub south, east of aquarium, west of vertical strip opening
// GAP from x=-1..3 for vertical strip (opens into Pipe Room corridor going south)
addWall(3, 7, -0.5 - WT, -0.5, WH, PALETTE.wall);        // hub south, east of vertical strip opening, west of control room
addWall(7, 20, -0.5 - WT, -0.5, WH, PALETTE.wall);       // hub south, east of control room

// North edge of horizontal hub (cap)
addWall(-20, -1, 4.5, 4.5 + WT, WH, PALETTE.wall);
addWall(3, 20, 4.5, 4.5 + WT, WH, PALETTE.wall);
// Vertical strip extends UP past the horizontal hub from z=4.5 to z=10, with walls on x=-1 (west) and x=3 (east)
// Vertical strip walls (west and east) — full length -14 to 10, but we must not block the aquarium/control room doors.
// Aquarium door is at x=-7 (room east wall), z=2. Not relevant to vertical strip x=-1 or x=3.
// Control door is at x=7 (room west wall), z=2. Not relevant either.
// Vertical strip walls — split into 2 segments each to leave hub open (z=-0.5 to z=4.5)
addWall(-1 - WT, -1, -4, -0.5, WH, PALETTE.wall);  // west wall of vertical strip (south segment, pipe corridor)
addWall(-1 - WT, -1, 4.5, 10, WH, PALETTE.wall);   // west wall of vertical strip (north segment, hub extension)
addWall(3, 3 + WT, -4, -0.5, WH, PALETTE.wall);    // east wall of vertical strip (south segment)
addWall(3, 3 + WT, 4.5, 10, WH, PALETTE.wall);     // east wall of vertical strip (north segment)
// Cap at north end of vertical strip (z=10)
addWall(-1, 3, 10, 10 + WT, WH, PALETTE.wall);
// West/East end caps of horizontal hub
addWall(-20 - WT, -20, -0.5, 4.5, WH, PALETTE.wall);
addWall(20, 20 + WT, -0.5, 4.5, WH, PALETTE.wall);

// Remove the "south of pipe room extension" wall — the pipe room's own south wall with gap already covers this

// Pipe Room furniture: tool locker + blue valve console + pipe maze
const furnitureGroup = new THREE.Group();
worldRoot.add(furnitureGroup);

// Pipe Room tool locker (tall teal metal cabinet)
{
  const r = L2.rooms.pipe;
  const locker = new THREE.Group();
  const cabinet = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 1.8, 0.5),
    flatMat('#4a5a6a', { rough: 0.6, metal: 0.3 }),
  );
  cabinet.position.y = 0.9;
  cabinet.castShadow = true;
  locker.add(cabinet);
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(0.85, 1.7, 0.05),
    flatMat('#5a6a7a', { rough: 0.5, metal: 0.4 }),
  );
  door.position.set(0, 0.9, 0.27);
  locker.add(door);
  const handle = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.15, 0.05),
    flatMat('#d4a228', { metal: 0.7, rough: 0.3 }),
  );
  handle.position.set(0.3, 0.9, 0.32);
  locker.add(handle);

  locker.position.set(r.minX + 1.3, 0, r.minZ + 1.5);
  furnitureGroup.add(locker);
  walls.push({ minX: locker.position.x - 0.5, maxX: locker.position.x + 0.5, minZ: locker.position.z - 0.3, maxZ: locker.position.z + 0.3 });

  interactables.push({
    pos: new THREE.Vector3(locker.position.x, 0.9, locker.position.z + 0.5),
    radius: 1.4,
    id: 'pr_locker',
    label: 'Search tool locker',
    group: locker,
    action: searchLocker,
  });
}

// Pipe Room pipes (aesthetic) — a maze of brass cylinders
{
  const r = L2.rooms.pipe;
  const pipeMat = flatMat(PALETTE.pipeBrass, { metal: 0.6, rough: 0.4 });
  for (let i = 0; i < 6; i++) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.5, 10), pipeMat);
    p.position.set(r.minX + 1 + Math.random() * 6, 1.5 + Math.random() * 0.5, r.minZ + 1 + Math.random() * 7);
    p.rotation.z = Math.random() * Math.PI;
    p.castShadow = true;
    furnitureGroup.add(p);
  }
  // Big horizontal brass pipe running along north wall
  const bigPipe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, r.maxX - r.minX - 1, 12),
    pipeMat,
  );
  bigPipe.rotation.z = Math.PI / 2;
  bigPipe.position.set((r.minX + r.maxX) / 2, 2.4, r.minZ + 0.8);
  furnitureGroup.add(bigPipe);
}

// Control Room: control panel (pr_panel) + status board
{
  const r = L2.rooms.control;
  // Panel — big slanted console
  const panel = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 1.0, 1.1),
    flatMat('#3a4252', { metal: 0.3, rough: 0.5 }),
  );
  base.position.y = 0.5;
  panel.add(base);
  const slant = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 0.15, 0.9),
    flatMat('#4a5262'),
  );
  slant.position.set(0, 1.05, 0);
  slant.rotation.x = -0.3;
  panel.add(slant);
  // Buttons — glowing dots
  for (let i = 0; i < 5; i++) {
    const btn = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 0.06, 8),
      flatMat(['#c8443a', '#d4a43a', '#3a72c8', '#2fc6b8', '#fff'][i], {
        emissive: ['#c8443a', '#d4a43a', '#3a72c8', '#2fc6b8', '#fff'][i],
        emissiveIntensity: 0.7,
      }),
    );
    btn.rotation.x = -0.3;
    btn.position.set(-0.7 + i * 0.35, 1.14, 0.08);
    panel.add(btn);
  }
  panel.position.set(r.minX + 2.5, 0, r.minZ + 4);
  panel.rotation.y = Math.PI / 2;
  furnitureGroup.add(panel);
  walls.push({
    minX: panel.position.x - 0.7, maxX: panel.position.x + 0.7,
    minZ: panel.position.z - 1.2, maxZ: panel.position.z + 1.2,
  });
  interactables.push({
    pos: new THREE.Vector3(panel.position.x + 0.9, 1, panel.position.z),
    radius: 1.6,
    id: 'pr_panel',
    label: 'Inspect control panel',
    group: panel,
    action: inspectPanel,
  });
}

// Aquarium room: cracked tank with Inky Bin / Squidley egg
{
  const r = L2.rooms.aquarium;
  const tank = new THREE.Group();
  // Glass walls (translucent teal)
  const glassMat = new THREE.MeshStandardMaterial({
    color: '#4ea0b8',
    transparent: true,
    opacity: 0.35,
    roughness: 0.2,
    metalness: 0.1,
    emissive: '#4ea0b8',
    emissiveIntensity: 0.1,
    flatShading: true,
  });
  const tankGeo = new THREE.BoxGeometry(2.8, 1.6, 1.8);
  const tMesh = new THREE.Mesh(tankGeo, glassMat);
  tMesh.position.y = 0.8;
  tank.add(tMesh);
  // Dark water inside
  const inner = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 1.2, 1.6),
    flatMat('#0a2a3a', { emissive: '#0a2a3a', emissiveIntensity: 0.3 }),
  );
  inner.position.y = 0.8;
  tank.add(inner);
  // Frame
  const frameMat = flatMat('#1a2028', { metal: 0.4 });
  [-1.4, 1.4].forEach((x) => {
    [-0.9, 0.9].forEach((z) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.7, 0.1), frameMat);
      post.position.set(x, 0.85, z);
      tank.add(post);
    });
  });
  tank.position.set(r.minX + 3, 0, r.minZ + 6);
  furnitureGroup.add(tank);
  walls.push({
    minX: tank.position.x - 1.5, maxX: tank.position.x + 1.5,
    minZ: tank.position.z - 1, maxZ: tank.position.z + 1,
  });
  interactables.push({
    pos: new THREE.Vector3(tank.position.x, 0.9, tank.position.z + 1.2),
    radius: 1.5,
    id: 'aq_tank',
    label: 'Examine the tank',
    group: tank,
    action: examineTank,
  });

  // Some decorative chairs
  const chairMat = flatMat('#3a2a1a');
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), chairMat);
    c.position.set(r.minX + 1 + i * 0.7, 0.2, r.maxZ - 1.5);
    furnitureGroup.add(c);
  }
}

// Dripping tentacle threat in hub water (atmospheric)
{
  const drip = makeDrip();
  drip.position.set(-12, 0.2, 2);
  furnitureGroup.add(drip);
}

// Coins scattered around (collectibles) — 3 floating teal coins
const coins = [];
const coinPositions = [
  { x: -14, z: 2 }, // hub west
  { x: 11, z: 6 }, // control room
  { x: 2, z: -10 }, // pipe room
];
for (const cp of coinPositions) {
  const coinMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.22, 0.07, 12),
    flatMat(PALETTE.coin, { metal: 0.6, rough: 0.3, emissive: PALETTE.coin, emissiveIntensity: 0.35 }),
  );
  coinMesh.rotation.x = Math.PI / 2;
  coinMesh.position.set(cp.x, 1.0, cp.z);
  coinMesh.castShadow = true;
  worldRoot.add(coinMesh);
  coins.push({ mesh: coinMesh, collected: false, baseY: 1.0 });
}

// Spawn Socky in Control Room
const socky = makeSocky();
{
  const r = L2.rooms.control;
  socky.position.set(r.maxX - 2, 0, r.maxZ - 2);
  socky.rotation.y = -Math.PI / 2;
  worldRoot.add(socky);
}
interactables.push({
  pos: socky.position.clone().add(new THREE.Vector3(0, 1, 0)),
  radius: 2.0,
  id: 'socky',
  label: 'Say hi to Socky Shok',
  group: socky,
  action: interactSocky,
  dynamic: true,
});

// Chester (player)
const chester = makeChester();
chester.position.set(L2.spawn.x, 0, L2.spawn.z);
worldRoot.add(chester);

// Squidley (Inky Bin ally) — appears after tank examined
const squidley = makeSquidley();
squidley.visible = false;
squidley.position.set(0, 0, 0);
worldRoot.add(squidley);

// ---------------------------------------------------------------
// 12. State
// ---------------------------------------------------------------
const state = {
  scene: 'title',       // 'title' | 'play' | 'stub'
  coins: 0,
  hasGrabpack: false,
  elements: { fire: false, thunder: false, earth: false, water: false, air: false },
  selectedElem: null,
  hasSquidley: false,
  hasValve: false,
  panelZapped: false,
  lockerSearched: false,  // first search yields hint
  metSocky: false,
  gotThunder: false,
  objective: 'Explore the flooded sublevel.',
  tasks: [
    { id: 'explore',  label: 'Step into the flooded hub', done: false },
    { id: 'tank',     label: 'Examine the aquarium tank', done: false },
    { id: 'squidley', label: 'Free Squidley (Inky Bin)',  done: false },
    { id: 'locker',   label: 'Search the Pipe Room tool locker', done: false },
    { id: 'grabpack', label: 'Pick up the Grabpack',      done: false },
    { id: 'socky',    label: 'Meet Socky Shok',           done: false },
    { id: 'thunder',  label: 'Receive the thunder crystal', done: false },
    { id: 'zap',      label: 'Zap the control panel with ⚡', done: false },
    { id: 'coins',    label: 'Collect 3 coins',           done: false },
  ],
};

function markTask(id) {
  const t = state.tasks.find(x => x.id === id);
  if (t && !t.done) {
    t.done = true;
    renderTasks();
  }
}

function renderTasks() {
  taskList.innerHTML = '';
  for (const t of state.tasks) {
    const li = document.createElement('li');
    li.textContent = t.label;
    if (t.done) li.classList.add('done');
    taskList.appendChild(li);
  }
}
renderTasks();

// ---------------------------------------------------------------
// 13. Interaction actions
// ---------------------------------------------------------------
function _kl(t) { return (window.HorridorsTouch && window.HorridorsTouch.keyLabel) ? window.HorridorsTouch.keyLabel(t) : t; }

function toast(text, ms = 2400) {
  toastEl.textContent = _kl(text);
  toastEl.classList.add('show');
  toastEl.classList.add('dismissible');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    toastEl.classList.remove('show');
    toastEl.classList.remove('dismissible');
  }, ms);
}

function speak(speaker, text, ms = 3400) {
  subSpeaker.textContent = speaker || '';
  subText.textContent = _kl(text);
  subtitleEl.classList.add('show');
  subtitleEl.classList.add('dismissible');
  clearTimeout(speak._t);
  speak._t = setTimeout(() => {
    subtitleEl.classList.remove('show');
    subtitleEl.classList.remove('dismissible');
  }, ms);
}

// Tap-to-dismiss for transient overlays (toast and subtitle).
if (toastEl) {
  const dismissToast = () => {
    clearTimeout(toast._t);
    toastEl.classList.remove('show');
    toastEl.classList.remove('dismissible');
  };
  toastEl.addEventListener('click', dismissToast);
  toastEl.addEventListener('touchstart', (e) => { e.stopPropagation(); dismissToast(); }, { passive: true });
}
if (subtitleEl) {
  const dismissSub = () => {
    clearTimeout(speak._t);
    subtitleEl.classList.remove('show');
    subtitleEl.classList.remove('dismissible');
  };
  subtitleEl.addEventListener('click', dismissSub);
  subtitleEl.addEventListener('touchstart', (e) => { e.stopPropagation(); dismissSub(); }, { passive: true });
}

function setObjective(text) {
  const t = (window.HorridorsTouch && window.HorridorsTouch.keyLabel) ? window.HorridorsTouch.keyLabel(text) : text;
  state.objective = t;
  objectiveEl.textContent = t;
}

function searchLocker() {
  if (!state.lockerSearched) {
    state.lockerSearched = true;
    toast('You find an old blue valve. Rusty. Might still turn.');
    speak('Chester', 'Huh — a valve. And… something glowing further back. Search it again.');
    state.hasValve = true;
    setObjective('Search the tool locker again.');
    return;
  }
  if (!state.hasGrabpack) {
    state.hasGrabpack = true;
    markTask('locker');
    markTask('grabpack');
    chester.userData.setGrabpack(true);
    toolReadout.textContent = '🧤 Grabpack';
    elemBar.style.display = 'flex';
    toast('You picked up the GRABPACK! Five element slots. All locked.');
    speak('Note', 'The Grabpack — it has a hand named ELEMENTAL HAND. Fire, thunder, earth, water, air. Flashlight turns into it.');
    setObjective('Find an element crystal. Talk to Socky in the Control Room.');
  } else {
    toast('The locker is empty now.');
  }
}

function inspectPanel() {
  if (state.panelZapped) {
    toast('The panel is cracked open. Sparking.');
    return;
  }
  if (state.selectedElem === 'thunder' && state.elements.thunder) {
    // ZAP!
    state.panelZapped = true;
    triggerZap();
    state.coins += 5;
    coinReadout.textContent = String(state.coins);
    markTask('zap');
    toast('⚡ ZAP! The panel cracks open. +5 coins!');
    speak('Chester', 'Whoa! The grabpack thundered the panel right open.');
    setObjective('Great job! Collect any remaining coins.');
  } else if (state.hasGrabpack) {
    toast('The panel is shielded. Try a different element?');
    speak('Chester', 'Maybe if I had the right element...');
  } else {
    toast('A locked control panel. Needs a special tool.');
  }
}

function examineTank() {
  if (!state.hasSquidley) {
    state.hasSquidley = true;
    markTask('tank');
    markTask('squidley');
    squidley.visible = true;
    squidley.position.set(chester.position.x, 1.4, chester.position.z + 0.8);
    toast('Inky Bin floats out of the tank and joins you!');
    speak('Inky Bin', '… blurp ✨');
  } else {
    toast('The tank is empty now. Glass glints.');
  }
}

function interactSocky() {
  if (!state.metSocky) {
    state.metSocky = true;
    markTask('socky');
    toast('SOCKY SHOK: a friendly teal guy with a lightning bolt on his head.');
    speak('Socky Shok', 'Bzzzt! Hi there. Got a grabpack yet?');
    setObjective(state.hasGrabpack ? 'Talk to Socky again about the element.' : 'Get the Grabpack from the Pipe Room first.');
    return;
  }
  if (!state.gotThunder && state.hasGrabpack) {
    state.gotThunder = true;
    state.elements.thunder = true;
    state.selectedElem = 'thunder';
    markTask('thunder');
    updateElemBar();
    toast('⚡ THUNDER crystal unlocked! Press 2 to select.');
    speak('Socky Shok', 'Take this thunder. Zap something neat. Bzzzt.');
    setObjective('Find something to zap. Press E near the control panel with ⚡ selected.');
    return;
  }
  const lines = [
    'Bzzzt. Nice day for flooded corridors.',
    'Mother? Dunno. Barely remember.',
    'I mostly vibe. Sometimes I buzz.',
    'Try zapping that panel in the corner.',
  ];
  speak('Socky Shok', lines[Math.floor(Math.random() * lines.length)]);
}

function triggerZap() {
  zapFlashEl.style.opacity = '0.85';
  setTimeout(() => { zapFlashEl.style.opacity = '0'; }, 160);
}

function updateElemBar() {
  const chips = elemBar.querySelectorAll('.elem-chip');
  chips.forEach((chip) => {
    const e = chip.dataset.e;
    chip.classList.toggle('locked', !state.elements[e]);
    chip.classList.toggle('active', state.selectedElem === e);
  });
}

// ---------------------------------------------------------------
// 14. Collision (AABB)
// ---------------------------------------------------------------
const PLAYER_R = 0.35;
function collideAndMove(pos, dx, dz) {
  // X axis
  let nx = pos.x + dx;
  for (const w of walls) {
    if (nx + PLAYER_R > w.minX && nx - PLAYER_R < w.maxX &&
        pos.z + PLAYER_R > w.minZ && pos.z - PLAYER_R < w.maxZ) {
      if (dx > 0) nx = w.minX - PLAYER_R;
      else if (dx < 0) nx = w.maxX + PLAYER_R;
    }
  }
  pos.x = nx;
  // Z axis
  let nz = pos.z + dz;
  for (const w of walls) {
    if (pos.x + PLAYER_R > w.minX && pos.x - PLAYER_R < w.maxX &&
        nz + PLAYER_R > w.minZ && nz - PLAYER_R < w.maxZ) {
      if (dz > 0) nz = w.minZ - PLAYER_R;
      else if (dz < 0) nz = w.maxZ + PLAYER_R;
    }
  }
  pos.z = nz;
  // World bounds (stay within map)
  pos.x = Math.max(-22, Math.min(22, pos.x));
  pos.z = Math.max(-16, Math.min(14, pos.z));
}

// ---------------------------------------------------------------
// 15. Update / game loop
// ---------------------------------------------------------------
const clock = new THREE.Clock();
let nearestIx = null;

function update(dt) {
  if (state.scene !== 'play') return;

  flickerT += dt;
  // Subtle light flicker
  keyLight.intensity = 1.1 + Math.sin(flickerT * 1.7) * 0.03;

  // --- Input: movement (camera-relative) ---
  let mx = 0, mz = 0;
  if (isDown('w', 'arrowup')) mz -= 1;
  if (isDown('s', 'arrowdown')) mz += 1;
  if (isDown('a', 'arrowleft')) mx -= 1;
  if (isDown('d', 'arrowright')) mx += 1;

  const len = Math.hypot(mx, mz);
  if (len > 0) {
    mx /= len; mz /= len;
    // Rotate input by camera yaw so W is "forward from camera view"
    const forwardX = -Math.sin(mouse.yaw);
    const forwardZ = -Math.cos(mouse.yaw);
    const rightX = Math.cos(mouse.yaw);
    const rightZ = -Math.sin(mouse.yaw);
    const wx = mx * rightX + (-mz) * forwardX;
    const wz = mx * rightZ + (-mz) * forwardZ;
    const SPEED = 5.5;
    collideAndMove(chester.position, wx * SPEED * dt, wz * SPEED * dt);
    // Face direction
    chester.rotation.y = Math.atan2(wx, wz);

    // Explore trigger
    if (!state.tasks[0].done && (chester.position.z < 5 && chester.position.x > -18 && chester.position.x < 18)) {
      markTask('explore');
    }

    // Animate limbs walking
    chester.userData.animT += dt * 9;
    const sw = Math.sin(chester.userData.animT) * 0.5;
    chester.userData.armL.rotation.x = sw;
    chester.userData.armR.rotation.x = -sw;
    chester.userData.legL.rotation.x = -sw;
    chester.userData.legR.rotation.x = sw;
  } else {
    // Ease back to idle
    chester.userData.animT *= 0.92;
    const sw = Math.sin(chester.userData.animT) * 0.5;
    chester.userData.armL.rotation.x = sw * 0.3;
    chester.userData.armR.rotation.x = -sw * 0.3;
    chester.userData.legL.rotation.x = 0;
    chester.userData.legR.rotation.x = 0;
  }

  // --- Squidley follows Chester (loose follow) ---
  if (state.hasSquidley && squidley.visible) {
    const target = new THREE.Vector3(
      chester.position.x - Math.sin(chester.rotation.y) * 1.2,
      1.6 + Math.sin(performance.now() / 400) * 0.15,
      chester.position.z - Math.cos(chester.rotation.y) * 1.2,
    );
    squidley.position.lerp(target, 0.07);
  }

  // --- Socky bob/sway ---
  socky.userData.bob += dt * 1.4;
  socky.userData.body.position.y = 0.85 + Math.sin(socky.userData.bob) * 0.04;
  socky.userData.topCap.position.y = 1.6 + Math.sin(socky.userData.bob) * 0.04;
  socky.userData.armL.rotation.z = Math.sin(socky.userData.bob * 1.3) * 0.15;
  socky.userData.armR.rotation.z = -Math.sin(socky.userData.bob * 1.3) * 0.15;
  socky.userData.bolt.rotation.y += dt * 1.2;

  // --- Coins spin + collect ---
  for (const c of coins) {
    if (c.collected) continue;
    c.mesh.rotation.z += dt * 2;
    c.mesh.position.y = c.baseY + Math.sin(performance.now() / 400 + c.mesh.position.x) * 0.08;
    const dx = c.mesh.position.x - chester.position.x;
    const dz = c.mesh.position.z - chester.position.z;
    if (dx * dx + dz * dz < 0.9) {
      c.collected = true;
      c.mesh.visible = false;
      state.coins++;
      coinReadout.textContent = String(state.coins);
      toast(`+1 coin (${state.coins})`);
      if (state.coins >= 3) markTask('coins');
    }
  }

  // --- Interactables: find nearest ---
  const px = chester.position.x, pz = chester.position.z;
  let best = null, bestD = Infinity;
  for (const it of interactables) {
    const tpos = it.dynamic ? it.group.position : it.pos;
    const dx = tpos.x - px, dz = tpos.z - pz;
    const d2 = dx * dx + dz * dz;
    if (d2 < it.radius * it.radius && d2 < bestD) {
      best = it; bestD = d2;
    }
  }
  nearestIx = best;
  if (best) {
    // Custom label updates
    let label = best.label;
    if (best.id === 'socky' && state.metSocky && !state.gotThunder) label = 'Chat with Socky Shok';
    if (best.id === 'socky' && state.gotThunder) label = 'Chat with Socky';
    if (best.id === 'pr_locker' && state.hasGrabpack) label = 'The locker (empty)';
    if (best.id === 'aq_tank' && state.hasSquidley) label = 'Look at the empty tank';
    if (best.id === 'pr_panel' && state.panelZapped) label = 'The cracked panel';
    promptText.textContent = label;
    promptEl.classList.add('show');
  } else {
    promptEl.classList.remove('show');
  }

  // --- Element select keys 1-5 ---
  const elemKeys = [
    ['1', 'fire'], ['2', 'thunder'], ['3', 'earth'], ['4', 'water'], ['5', 'air'],
  ];
  for (const [k, e] of elemKeys) {
    if (wasPressed(k) && state.elements[e]) {
      state.selectedElem = state.selectedElem === e ? null : e;
      updateElemBar();
      toast(state.selectedElem ? `${e.toUpperCase()} selected` : 'Element deselected');
    }
  }

  // --- Interact key ---
  if (wasPressed('e', 'enter') && nearestIx) {
    nearestIx.action();
  }

  // --- Tasks toggle ---
  if (wasPressed('t')) toggleTasks();
  if (wasPressed('escape')) {
    if (!tasksOverlay.classList.contains('hidden')) toggleTasks();
  }

  // --- Third-person follow camera ---
  const camDist = 9.5;
  const camHeight = 4.5 + mouse.pitch * 4;
  const targetX = chester.position.x + Math.sin(mouse.yaw) * camDist;
  const targetY = chester.position.y + camHeight;
  const targetZ = chester.position.z + Math.cos(mouse.yaw) * camDist;
  camera.position.lerp(new THREE.Vector3(targetX, targetY, targetZ), 0.12);
  camera.lookAt(chester.position.x, chester.position.y + 1, chester.position.z);

  // Clear justPressed at end of frame
  justPressed.clear();
}

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.1);
  update(dt);
  updateBillboards(camera);
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------
// 16. Title / menu wiring
// ---------------------------------------------------------------
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

function toggleTasks() {
  tasksOverlay.classList.toggle('hidden');
}
closeTasksBtn.addEventListener('click', toggleTasks);
btnTasks.addEventListener('click', toggleTasks);

btnMenu.addEventListener('click', () => {
  state.scene = 'title';
  titleScreen.classList.remove('hidden');
});

// Level picker buttons
document.querySelectorAll('.level-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const lvl = parseInt(btn.dataset.level, 10);
    if (lvl === 2) {
      state.scene = 'play';
      titleScreen.classList.add('hidden');
      speak('Chester', 'Back in the flooded hub. Remember: find the Grabpack and say hi to Socky.');
      setObjective('Wade into the hub and look around.');
    } else {
      // Stub
      stubTitle.textContent = `Level ${lvl} — coming soon in 3D`;
      stubBody.innerHTML = `The 3D version of this level is still in the works. Only <strong>Level 2</strong> is currently playable in the 3D engine. You can still play Levels 1, 3, and 4 in the <a href="./index-2d.html" style="color:var(--color-primary);">original 2D version</a>.`;
      stubOverlay.classList.remove('hidden');
      state.scene = 'stub';
    }
  });
});
stubBack.addEventListener('click', () => {
  stubOverlay.classList.add('hidden');
  state.scene = 'title';
});

// Debug overlay (D key)
window.addEventListener('keydown', (e) => {
  if (e.key === 'F3') debugEl.classList.toggle('show');
});

// Start
tick();

// Expose for console debugging
window.__h3d = { state, chester, socky, scene, camera, walls, interactables };
