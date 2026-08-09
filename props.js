// Horridors — L1 Prop Atlas Loader (v1.2.5)
// Pre-loads painterly 3D-cartoon prop PNGs so game.js can drawImage() them
// with 3/4 isometric perspective instead of procedural rects.
//
// Style anchor: red locker v2, muted horror-cartoon palette, cel-shaded,
// 30-degree tilt, dim ambient floor shadow. Kid-appropriate.
(function () {
  'use strict';

  // Map furniture kind -> prop image filename (in ./props/)
  // Per-id overrides live in KIND_BY_ID below.
  const KIND_MAP = {
    // Toy room
    bed:       'toy_bed.png',
    chest:     'toy_chest.png',
    shelf:     'toy_shelf.png',      // toy shelf (tall)
    blocks:    'toy_blocks.png',
    horse:     'toy_horse.png',
    doll:      'toy_dollhse.png',
    drawer:    'toy_drawer.png',
    rug:       'toy_rug.png',

    // Puzzle room
    panel:     'pz_panel.png',
    table:     'pz_table.png',
    chair:     'pz_chair.png',
    cabinet:   'pz_cab1.png',
    basket:    'pz_basket.png',
    clock:     'pz_clock.png',

    // Supply room
    locker:    'sp_locker1_red.png',
    locker_g:  'sp_locker2_green.png',
    locker_b:  'sp_locker3_blue.png',
    crate:     'sp_crate1.png',
    shelf2:    'sp_shelf.png',       // supply-room wall shelf
    barrel:    'sp_barrel.png',
    mop:       'sp_mop.png',
    box:       'sp_box.png',
    workbench: 'sp_table.png',       // supply-room workbench

    // Library
    bookcase:  'lb_shelf.png',
    desk:      'lb_desk.png',
    globe:     'lb_globe.png',
    bin:       'lb_bin.png',

    // Treasure
    tchest:    'tr_chest.png',
  };

  // Per-id overrides (for kinds where two ids share a kind but want different art)
  // Currently none — both cabinets share pz_cab1.png intentionally.
  const KIND_BY_ID = {};

  const cache = {};       // key -> HTMLImageElement (loaded or loading)
  const status = {};      // key -> 'loading' | 'ready' | 'error'
  let readyCount = 0;
  let totalCount = 0;

  function loadOne(key, filename) {
    if (cache[key]) return cache[key];
    totalCount++;
    const img = new Image();
    img.decoding = 'async';
    status[key] = 'loading';
    img.onload = () => {
      status[key] = 'ready';
      readyCount++;
    };
    img.onerror = () => {
      status[key] = 'error';
      readyCount++;
    };
    img.src = './props/' + filename;
    cache[key] = img;
    return img;
  }

  // Kick off all loads immediately
  function preloadAll() {
    for (const k in KIND_MAP) loadOne(k, KIND_MAP[k]);
    for (const id in KIND_BY_ID) loadOne('id:' + id, KIND_BY_ID[id]);
  }

  // Get the image for a furniture item, or null if not ready / not mapped.
  // Callers use the return value with drawImage(); if null, fall back to procedural draw.
  function getImage(f) {
    if (!f) return null;
    // Per-id override first
    if (f.id && KIND_BY_ID[f.id]) {
      const img = cache['id:' + f.id];
      if (img && status['id:' + f.id] === 'ready' && img.naturalWidth > 0) return img;
    }
    const img = cache[f.kind];
    if (img && status[f.kind] === 'ready' && img.naturalWidth > 0) return img;
    return null;
  }

  function isReady() { return totalCount > 0 && readyCount >= totalCount; }
  function progress() { return totalCount === 0 ? 0 : readyCount / totalCount; }

  preloadAll();

  window.HorridorsProps = {
    getImage: getImage,
    isReady: isReady,
    progress: progress,
    KIND_MAP: KIND_MAP,
  };
})();
