// Horridors — Certificate, Progression & Player Name module (v21)
// =====================================================================
// Responsibilities (all in-memory — no localStorage/sessionStorage):
//   1. Player name input on the title screen (default: "Chester").
//   2. Level progression: L1 is always unlocked; L(n+1) unlocks when L(n) is
//      completed. Locked jump buttons show a padlock and a tooltip.
//   3. Deterministic certificate keys of the form
//        HOR1-{TIER}-{HASH1}-{HASH2}
//      where TIER is one of EASY / MEDM / HARD / XTRM and the hashes are a
//      deterministic function of (NAME.toUpperCase() + TIER + SECRET_SALT).
//   4. "Have a key? Unlock" modal: enter a valid key to restore player name,
//      set difficulty and unlock all 8 levels. (Cache-drop recovery.)
//   5. Completion overlay after L8: certificate card with name, difficulty
//      colour, cert number and Print / Save PNG buttons.
//
// Exposes:
//   window.__playerName          — current player name (string)
//   window.__progress            — { 1..8: bool }  level-complete flags
//   window.__markLevelComplete(n)
//   window.__isLevelUnlocked(n)
//   window.__generateCertKey(name, tierId)
//   window.__verifyCertKey(key)  -> null | { name, tierId, tierName }
//   window.__showCertificate()   — opens the completion overlay for current run
(function () {
  'use strict';

  // ---------- Player name --------------------------------------------------
  const DEFAULT_NAME = 'Chester';
  let playerName = DEFAULT_NAME;
  Object.defineProperty(window, '__playerName', {
    get() { return playerName; },
    set(v) { playerName = sanitizeName(v); refreshNameEverywhere(); },
    configurable: true,
  });

  function sanitizeName(raw) {
    if (!raw) return DEFAULT_NAME;
    // Keep letters / digits / spaces / simple punctuation. Trim + cap length.
    const clean = String(raw).replace(/[^\p{L}\p{N} .,'\-]/gu, '').trim();
    const final = clean.slice(0, 18) || DEFAULT_NAME;
    return final;
  }

  function refreshNameEverywhere() {
    // Credits banner, certificate preview, any element marked with data-player-name.
    document.querySelectorAll('[data-player-name]').forEach((el) => {
      el.textContent = playerName;
    });
  }

  // ---------- Progression --------------------------------------------------
  // Per-difficulty-tier progression: switching to a harder tier does NOT inherit
  // easier-tier progress. This prevents a 7-year-old from hopping into L8 on
  // Extreme just because they cleared L7 on Easy.
  const TIERS_LIST = ['easy', 'medium', 'hard', 'extreme'];
  const progressByTier = {
    easy:    { 1:false,2:false,3:false,4:false,5:false,6:false,7:false,8:false },
    medium:  { 1:false,2:false,3:false,4:false,5:false,6:false,7:false,8:false },
    hard:    { 1:false,2:false,3:false,4:false,5:false,6:false,7:false,8:false },
    extreme: { 1:false,2:false,3:false,4:false,5:false,6:false,7:false,8:false },
  };
  function currentTierId() {
    try { return (window.__difficulty && window.__difficulty.id && window.__difficulty.id()) || 'easy'; }
    catch (e) { return 'easy'; }
  }
  function currentProgress() {
    return progressByTier[currentTierId()] || progressByTier.easy;
  }
  // Back-compat: __progress still points at the ACTIVE tier's progress object.
  Object.defineProperty(window, '__progress', {
    get() { return currentProgress(); },
    configurable: true,
  });

  function isUnlocked(n) {
    if (n <= 1) return true;
    return !!currentProgress()[n - 1];
  }
  window.__isLevelUnlocked = isUnlocked;

  function markComplete(n) {
    if (n >= 1 && n <= 8) {
      currentProgress()[n] = true;
      refreshJumpButtonLocks();
      // L8 completion → show the certificate.
      if (n === 8) {
        try { setTimeout(showCertificateOverlay, 400); } catch (e) {}
      }
    }
  }
  window.__markLevelComplete = markComplete;

  function unlockAll() {
    // Unlock every tier — used by dev helpers and by the cert-key recovery flow.
    for (const t of TIERS_LIST) {
      for (let i = 1; i <= 8; i++) progressByTier[t][i] = true;
    }
    refreshJumpButtonLocks();
  }
  window.__unlockAllLevels = unlockAll;

  // Re-render jump-button locks whenever difficulty changes.
  setTimeout(() => {
    try {
      if (window.__difficulty && window.__difficulty.onChange) {
        window.__difficulty.onChange(() => { refreshJumpButtonLocks(); });
      }
    } catch (e) {}
  }, 100);

  function refreshJumpButtonLocks() {
    for (let n = 1; n <= 8; n++) {
      const btn = document.getElementById('btn-jump-l' + n);
      if (!btn) continue;
      const unlocked = isUnlocked(n);
      btn.classList.toggle('locked', !unlocked);
      btn.setAttribute('aria-disabled', unlocked ? 'false' : 'true');
      const lockedLabel = '🔒 Level ' + n;
      const openLabel = '▶ Level ' + n;
      // Only overwrite text if we own it (don't clobber custom markup)
      btn.textContent = unlocked ? openLabel : lockedLabel;
      btn.title = unlocked ? '' : 'Clear Level ' + (n - 1) + ' first';
    }
  }

  // Intercept clicks on locked jump buttons at capture phase so we can block
  // the existing click handler installed by game.js.
  function installLockInterceptor() {
    for (let n = 1; n <= 8; n++) {
      const btn = document.getElementById('btn-jump-l' + n);
      if (!btn || btn.__lockWired) continue;
      btn.__lockWired = true;
      btn.addEventListener('click', (ev) => {
        if (!isUnlocked(n)) {
          ev.stopImmediatePropagation();
          ev.preventDefault();
          showLockedToast(n);
        }
      }, true); // capture → runs before game.js's bubble handler
    }
  }

  let lockToastT = null;
  function showLockedToast(n) {
    let t = document.getElementById('locked-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'locked-toast';
      t.className = 'locked-toast';
      document.body.appendChild(t);
    }
    t.textContent = 'Clear Level ' + (n - 1) + ' first';
    t.classList.add('show');
    clearTimeout(lockToastT);
    lockToastT = setTimeout(() => t.classList.remove('show'), 1800);
  }

  // ---------- Certificate keys --------------------------------------------
  const SECRET_SALT = 'horridors-2026-chapter1';
  const TIER_CODE = { easy: 'EASY', medium: 'MEDM', hard: 'HARD', extreme: 'XTRM' };
  const CODE_TIER = { EASY: 'easy', MEDM: 'medium', HARD: 'hard', XTRM: 'extreme' };
  const TIER_NAME = { easy: 'Easy', medium: 'Medium', hard: 'Hard', extreme: 'Extreme' };

  // 32-bit djb2 → 8 hex chars
  function djb2Hex(str) {
    let h = 5381 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h = (((h << 5) + h) + str.charCodeAt(i)) >>> 0;
    }
    return h.toString(16).toUpperCase().padStart(8, '0');
  }
  // Second independent hash (sdbm variant) → 8 hex chars
  function sdbmHex(str) {
    let h = 0 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h = (str.charCodeAt(i) + (h << 6) + (h << 16) - h) >>> 0;
    }
    return h.toString(16).toUpperCase().padStart(8, '0');
  }
  // 4-char base32-ish: map hex → letters+digits, no ambiguous chars (0/O, 1/I)
  const B32 = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  function toBase32Group(hex) {
    // Take 20 bits (5 hex chars -> 4 base32 chars)
    const n = parseInt(hex.slice(0, 5), 16);
    let s = '';
    let v = n;
    for (let i = 0; i < 4; i++) {
      s = B32[v & 31] + s;
      v >>>= 5;
    }
    return s;
  }

  function normalizeName(name) {
    // Uppercase, strip everything that isn't A-Z / 0-9 so "chester" == "CHESTER".
    return String(name || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function hashParts(name, tierId) {
    const body = normalizeName(name) + '|' + tierId + '|' + SECRET_SALT;
    return { g1: toBase32Group(djb2Hex(body)), g2: toBase32Group(sdbmHex(body)) };
  }

  function generateCertKey(name, tierId) {
    if (!TIER_CODE[tierId]) return '';
    const { g1, g2 } = hashParts(name, tierId);
    return 'HOR1-' + TIER_CODE[tierId] + '-' + g1 + '-' + g2;
  }
  window.__generateCertKey = generateCertKey;

  function verifyCertKey(raw) {
    if (!raw) return null;
    const key = String(raw).toUpperCase().replace(/\s+/g, '').trim();
    const m = key.match(/^HOR1-(EASY|MEDM|HARD|XTRM)-([A-Z2-9]{4})-([A-Z2-9]{4})$/);
    if (!m) return null;
    const tierId = CODE_TIER[m[1]];
    // The key alone doesn't contain the name — we can't recover it from the
    // key. Instead, verify that the currently-entered player name generates
    // the same hash pair. This is the "unlock with your own key next time"
    // flow (user types name + key together).
    const name = playerName;
    const { g1, g2 } = hashParts(name, tierId);
    if (g1 !== m[2] || g2 !== m[3]) return null;
    return { name, tierId, tierName: TIER_NAME[tierId] };
  }
  window.__verifyCertKey = verifyCertKey;

  // ---------- UI: name input on title screen -------------------------------
  function renderNameInput() {
    const title = document.getElementById('overlay-title');
    if (!title) return;
    if (document.getElementById('name-field')) return;

    const wrap = document.createElement('div');
    wrap.id = 'name-field';
    wrap.className = 'name-field';
    wrap.innerHTML = `
      <label for="player-name-input" class="name-label">Your name</label>
      <input type="text" id="player-name-input" class="name-input"
             maxlength="18" autocomplete="off" spellcheck="false"
             placeholder="Chester" value="${playerName.replace(/"/g, '&quot;')}" />
    `;
    // Insert the name field BEFORE the difficulty picker (above it in the flow)
    const diffPicker = document.getElementById('difficulty-picker');
    const startBtn = document.getElementById('btn-start');
    if (diffPicker && diffPicker.parentNode) {
      diffPicker.parentNode.insertBefore(wrap, diffPicker);
    } else if (startBtn && startBtn.parentNode) {
      startBtn.parentNode.insertBefore(wrap, startBtn);
    } else {
      title.appendChild(wrap);
    }

    const input = wrap.querySelector('#player-name-input');
    const commit = () => { window.__playerName = input.value; input.value = playerName; };
    input.addEventListener('change', commit);
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); input.blur(); } });
  }

  // ---------- UI: "Have a key?" modal --------------------------------------
  function renderKeyLink() {
    const title = document.getElementById('overlay-title');
    if (!title) return;
    if (document.getElementById('key-unlock-link')) return;
    const jump = title.querySelector('.level-jump');
    if (!jump) return;

    const link = document.createElement('button');
    link.type = 'button';
    link.id = 'key-unlock-link';
    link.className = 'key-unlock-link';
    link.textContent = 'Have a key? Unlock all levels';
    jump.appendChild(link);

    link.addEventListener('click', openKeyModal);
  }

  function ensureKeyModal() {
    let m = document.getElementById('overlay-key');
    if (m) return m;
    m = document.createElement('div');
    m.id = 'overlay-key';
    m.className = 'overlay hidden';
    m.innerHTML = `
      <div class="overlay-content key-modal">
        <div class="key-title">Enter Certificate Key</div>
        <div class="key-sub">Type your name above, then paste the key you got last time.</div>
        <input type="text" id="key-input" class="key-input"
               placeholder="HOR1-EASY-XXXX-XXXX" maxlength="22" autocomplete="off"
               spellcheck="false" />
        <div id="key-result" class="key-result"></div>
        <div class="key-buttons">
          <button type="button" id="btn-key-unlock" class="btn-primary">Unlock</button>
          <button type="button" id="btn-key-cancel" class="btn-ghost">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(m);
    m.querySelector('#btn-key-cancel').addEventListener('click', closeKeyModal);
    m.querySelector('#btn-key-unlock').addEventListener('click', tryUnlockFromModal);
    m.querySelector('#key-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); tryUnlockFromModal(); }
    });
    return m;
  }

  function openKeyModal() {
    const m = ensureKeyModal();
    const input = m.querySelector('#key-input');
    const result = m.querySelector('#key-result');
    input.value = '';
    result.textContent = '';
    result.classList.remove('ok', 'err');
    m.classList.remove('hidden');
    setTimeout(() => input.focus(), 50);
  }

  function closeKeyModal() {
    const m = document.getElementById('overlay-key');
    if (m) m.classList.add('hidden');
  }

  function tryUnlockFromModal() {
    const m = ensureKeyModal();
    const input = m.querySelector('#key-input');
    const result = m.querySelector('#key-result');
    const res = verifyCertKey(input.value);
    if (!res) {
      result.textContent = 'That key doesn\'t match this name. Check spelling.';
      result.classList.remove('ok'); result.classList.add('err');
      return;
    }
    // Apply: set difficulty, unlock all, close.
    try { window.__difficulty && window.__difficulty.set(res.tierId); } catch (e) {}
    unlockAll();
    result.textContent = 'Unlocked — welcome back, ' + res.name + '.';
    result.classList.remove('err'); result.classList.add('ok');
    setTimeout(closeKeyModal, 900);
  }

  // ---------- UI: Completion certificate overlay ---------------------------
  function ensureCertOverlay() {
    let ov = document.getElementById('overlay-certificate');
    if (ov) return ov;
    ov = document.createElement('div');
    ov.id = 'overlay-certificate';
    ov.className = 'overlay hidden';
    ov.innerHTML = `
      <div class="overlay-content cert-wrap">
        <div id="certificate-card" class="cert-card" data-tier="easy">
          <div class="cert-inner">
            <div class="cert-corner tl"></div>
            <div class="cert-corner tr"></div>
            <div class="cert-corner bl"></div>
            <div class="cert-corner br"></div>
            <div class="cert-brand">HORRIDORS</div>
            <div class="cert-subbrand">Certificate of Bravery</div>
            <div class="cert-line">This certifies that</div>
            <div class="cert-name" id="cert-name">Chester</div>
            <div class="cert-line">has completed</div>
            <div class="cert-title">Horridors — Chapter 1</div>
            <div class="cert-diffrow">
              <span class="cert-diff-badge" id="cert-diff-badge">Easy</span>
              <span class="cert-diff-label">difficulty</span>
            </div>
            <div class="cert-sig">
              <div class="cert-sig-line">
                <div class="cert-sig-stroke"></div>
                <div class="cert-sig-caption">Grinpatch, Head Custodian</div>
              </div>
              <div class="cert-sig-line">
                <div class="cert-sig-stroke"></div>
                <div class="cert-sig-caption">Mum, Official Witness</div>
              </div>
            </div>
            <div class="cert-keyrow">
              <div class="cert-keylabel">Certificate Key</div>
              <div class="cert-key" id="cert-key">HOR1-EASY-XXXX-XXXX</div>
              <div class="cert-keyhint">Keep this — it unlocks all levels on this device next time.</div>
            </div>
          </div>
        </div>
        <div class="cert-actions">
          <button type="button" id="btn-cert-print" class="btn-primary">Print</button>
          <button type="button" id="btn-cert-save" class="btn-ghost">Save as image</button>
          <button type="button" id="btn-cert-close" class="btn-ghost">Back to Title</button>
        </div>
      </div>
    `;
    document.body.appendChild(ov);
    ov.querySelector('#btn-cert-close').addEventListener('click', () => {
      ov.classList.add('hidden');
      if (window.__returnToTitle) window.__returnToTitle();
    });
    ov.querySelector('#btn-cert-print').addEventListener('click', printCertificate);
    ov.querySelector('#btn-cert-save').addEventListener('click', saveCertificatePng);
    return ov;
  }

  function showCertificateOverlay() {
    const ov = ensureCertOverlay();
    const diff = (window.__difficulty && window.__difficulty.get()) || { id: 'easy', name: 'Easy' };
    const key = generateCertKey(playerName, diff.id);
    ov.querySelector('#cert-name').textContent = playerName;
    ov.querySelector('#cert-diff-badge').textContent = diff.name;
    ov.querySelector('#cert-key').textContent = key;
    const card = ov.querySelector('#certificate-card');
    card.setAttribute('data-tier', diff.id);
    ov.querySelector('#cert-diff-badge').setAttribute('data-tier', diff.id);
    ov.classList.remove('hidden');
  }
  window.__showCertificate = showCertificateOverlay;

  function printCertificate() {
    document.body.classList.add('printing-cert');
    // Let the browser repaint with the print-only layout, then fire print.
    setTimeout(() => {
      try { window.print(); } catch (e) {}
      // Cleanup runs whether or not print dialog was shown.
      setTimeout(() => document.body.classList.remove('printing-cert'), 500);
    }, 50);
  }

  // Save PNG by rasterising the certificate card into a canvas via SVG
  // foreignObject — this keeps the exact HTML/CSS look without needing an
  // external library (html2canvas etc.).
  function saveCertificatePng() {
    const card = document.getElementById('certificate-card');
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const w = Math.max(600, Math.round(rect.width));
    const h = Math.max(420, Math.round(rect.height));

    // Clone the card and inline all computed styles so the rendered SVG
    // doesn't depend on external stylesheets.
    const clone = card.cloneNode(true);
    inlineComputedStyles(card, clone);

    const xml = new XMLSerializer().serializeToString(clone);
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
      `<foreignObject width="100%" height="100%">` +
      `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${w}px;height:${h}px;">` +
      xml +
      `</div></foreignObject></svg>`;

    const img = new Image();
    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = w * 2; canvas.height = h * 2; // retina-ish
      const ctx = canvas.getContext('2d');
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement('a');
        a.download = 'horridors-certificate-' + normalizeName(playerName).toLowerCase() + '.png';
        a.href = URL.createObjectURL(blob);
        document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      alert('Could not save image. Please use Print instead.');
    };
    img.src = url;
  }

  function inlineComputedStyles(src, dst) {
    const srcStyle = window.getComputedStyle(src);
    let css = '';
    for (let i = 0; i < srcStyle.length; i++) {
      const name = srcStyle[i];
      css += name + ':' + srcStyle.getPropertyValue(name) + ';';
    }
    dst.setAttribute('style', css);
    const sChildren = src.children;
    const dChildren = dst.children;
    for (let i = 0; i < sChildren.length; i++) {
      inlineComputedStyles(sChildren[i], dChildren[i]);
    }
  }

  // ---------- Auto-wire level transitions for progression ----------------
  // When __startLevelN is called for N>=2, mark level (N-1) complete.
  function wireStartLevelHooks() {
    for (let n = 2; n <= 8; n++) {
      const key = '__startLevel' + n;
      if (window[key] && !window[key].__certWrapped) {
        const orig = window[key];
        const prev = n - 1;
        const wrapped = function () {
          try { markComplete(prev); } catch (e) {}
          return orig.apply(this, arguments);
        };
        wrapped.__certWrapped = true;
        wrapped.__orig = orig;
        try { window[key] = wrapped; } catch (e) {}
      }
    }
    // Also wrap __showCredits / __startCredits if exposed (end of L8 path).
    if (window.__startCredits && !window.__startCredits.__certWrapped) {
      const origC = window.__startCredits;
      const wrappedC = function () {
        try { markComplete(8); } catch (e) {}
        return origC.apply(this, arguments);
      };
      wrappedC.__certWrapped = true;
      try { window.__startCredits = wrappedC; } catch (e) {}
    }
  }

  // ---------- Boot ---------------------------------------------------------
  function init() {
    renderNameInput();
    renderKeyLink();
    installLockInterceptor();
    refreshJumpButtonLocks();
    refreshNameEverywhere();
    wireStartLevelHooks();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  // Re-run after all other scripts have wired their handlers.
  setTimeout(init, 300);
  setTimeout(init, 900);
})();
