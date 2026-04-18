// Horridors — canonical character sprites
// Single source of truth for Chester, Thistle, Inky Bin colors + shapes.
// Levels may call these OR draw inline using the CANONICAL palette below.
// Exposed as window.HorridorsSprites.

(function(){
  // CANONICAL PALETTE (do not diverge)
  const PAL = {
    chester: {
      shirt: '#f6d854',   // yellow
      shoes: '#3b2a6e',   // purple
      face:  '#f5d2aa',   // peach
      hair:  '#6a4a2a',
      strap: '#4aa86b',   // grabpack strap
      nozzle:'#ffd84a',
      ink:   '#141414',
    },
    thistle: {
      body:  '#fbd34a',   // yellow-gold
      star:  '#fff08a',
      trim:  '#f7c7d8',   // pink hat band
      ink:   '#141414',
    },
    inky: {
      body:  '#1a1a22',
      rim:   '#5aa0ff',   // cyan edge glow
      eye:   '#ffd84a',
    },
  };

  // Draw canonical Chester centered at (cx,cy) feet position
  // facing: +1 right, -1 left. size scale defaults 1.
  function drawChester(ctx, cx, cy, facing = 1, s = 1) {
    const f = facing;
    const P = PAL.chester;
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(cx, cy + 2*s, 11*s, 3*s, 0, 0, Math.PI*2); ctx.fill();
    // Legs / shoes
    ctx.fillStyle = P.shoes;
    ctx.fillRect(cx - 7*s, cy - 10*s, 5*s, 10*s);
    ctx.fillRect(cx + 2*s, cy - 10*s, 5*s, 10*s);
    // Body shirt
    ctx.fillStyle = P.shirt;
    ctx.beginPath();
    ctx.moveTo(cx - 9*s, cy - 10*s);
    ctx.lineTo(cx + 9*s, cy - 10*s);
    ctx.lineTo(cx + 8*s, cy - 22*s);
    ctx.lineTo(cx - 8*s, cy - 22*s);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = P.ink; ctx.lineWidth = 1*s; ctx.stroke();
    // Grabpack strap (diagonal)
    ctx.strokeStyle = P.strap; ctx.lineWidth = 2*s;
    ctx.beginPath();
    ctx.moveTo(cx - 8*s, cy - 20*s); ctx.lineTo(cx + 8*s, cy - 12*s);
    ctx.stroke();
    // Nozzle (little box on hip, facing direction)
    ctx.fillStyle = P.nozzle;
    ctx.fillRect(cx + f*6*s - 2*s, cy - 14*s, 4*s, 3*s);
    // Head
    ctx.fillStyle = P.face;
    ctx.beginPath(); ctx.arc(cx, cy - 26*s, 9*s, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = P.ink; ctx.lineWidth = 1*s; ctx.stroke();
    // Hair tuft
    ctx.fillStyle = P.hair;
    ctx.beginPath();
    ctx.arc(cx, cy - 32*s, 6*s, Math.PI, 0);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // Eyes (pupils follow facing)
    ctx.fillStyle = P.ink;
    ctx.beginPath(); ctx.arc(cx - 3*s + f*0.5*s, cy - 26*s, 0.9*s, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 3*s + f*0.5*s, cy - 26*s, 0.9*s, 0, Math.PI*2); ctx.fill();
    // Smile
    ctx.strokeStyle = P.ink; ctx.lineWidth = 0.9*s;
    ctx.beginPath(); ctx.arc(cx, cy - 23*s, 2*s, 0, Math.PI); ctx.stroke();
    ctx.restore();
  }

  // Draw canonical Thistle (forty-ish px tall yellow pear creature)
  function drawThistle(ctx, cx, cy, s = 1) {
    const P = PAL.thistle;
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(cx, cy + 2*s, 16*s, 3*s, 0, 0, Math.PI*2); ctx.fill();
    // Legs
    ctx.strokeStyle = P.ink; ctx.lineWidth = 2*s;
    ctx.fillStyle = P.body;
    ctx.beginPath();
    ctx.moveTo(cx - 8*s, cy - 8*s); ctx.lineTo(cx - 8*s, cy);
    ctx.moveTo(cx + 8*s, cy - 8*s); ctx.lineTo(cx + 8*s, cy);
    ctx.stroke();
    // Body
    ctx.beginPath();
    ctx.ellipse(cx, cy - 18*s, 14*s, 14*s, 0, 0, Math.PI*2);
    ctx.fill(); ctx.stroke();
    // Star on chest
    ctx.fillStyle = P.star; ctx.strokeStyle = P.ink; ctx.lineWidth = 1.2*s;
    const sx = cx, sy = cy - 18*s, r = 6*s;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI) / 5 - Math.PI / 2;
      const rad = i % 2 === 0 ? r : r * 0.45;
      const x = sx + Math.cos(a) * rad, y = sy + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // Arms up
    ctx.strokeStyle = P.ink; ctx.lineWidth = 2*s;
    ctx.beginPath();
    ctx.moveTo(cx - 14*s, cy - 22*s); ctx.lineTo(cx - 20*s, cy - 30*s);
    ctx.moveTo(cx + 14*s, cy - 22*s); ctx.lineTo(cx + 20*s, cy - 30*s);
    ctx.stroke();
    // Hands
    ctx.fillStyle = P.body;
    ctx.beginPath(); ctx.arc(cx - 20*s, cy - 30*s, 2.5*s, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx + 20*s, cy - 30*s, 2.5*s, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    // Head
    ctx.fillStyle = P.body;
    ctx.beginPath(); ctx.ellipse(cx, cy - 40*s, 14*s, 13*s, 0, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    // Ears (pointy, yellow)
    ctx.beginPath();
    ctx.moveTo(cx - 10*s, cy - 50*s); ctx.lineTo(cx - 16*s, cy - 66*s); ctx.lineTo(cx - 6*s, cy - 52*s);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + 6*s, cy - 52*s); ctx.lineTo(cx + 14*s, cy - 66*s); ctx.lineTo(cx + 10*s, cy - 50*s);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // Eyes
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(cx - 4*s, cy - 40*s, 3.2*s, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx + 4*s, cy - 40*s, 3.2*s, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = P.ink;
    ctx.beginPath(); ctx.arc(cx - 4*s, cy - 40*s, 1.4*s, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 4*s, cy - 40*s, 1.4*s, 0, Math.PI*2); ctx.fill();
    // Smile
    ctx.strokeStyle = P.ink; ctx.lineWidth = 1.3*s;
    ctx.beginPath(); ctx.arc(cx, cy - 37*s, 3.5*s, 0.1, Math.PI - 0.1); ctx.stroke();
    ctx.restore();
  }

  // Coin sprite: gold circle with ₵ glyph, small bob
  function drawCoin(ctx, cx, cy, t = 0, size = 8) {
    const bob = Math.sin(t * 0.006) * 1.5;
    const y = cy + bob;
    ctx.save();
    // glow
    ctx.shadowColor = '#ffd84a'; ctx.shadowBlur = 6;
    ctx.fillStyle = '#ffd84a';
    ctx.beginPath(); ctx.arc(cx, y, size, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#c79512';
    ctx.beginPath(); ctx.arc(cx, y, size * 0.65, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#1a1024';
    ctx.font = '700 ' + Math.round(size * 1.2) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('¢', cx, y + 1);
    ctx.restore();
  }

  window.HorridorsSprites = {
    PAL,
    drawChester,
    drawThistle,
    drawCoin,
  };
})();
