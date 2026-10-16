/* ============================================================
   Critter — hand-drawn (canvas) portraits and the live "scope" scene.
   The scene is driven by real values at the animal's position: sun altitude, moon phase,
   sea or land, terrain kind, season, and how fast it is moving.
   ============================================================ */
const Critter = (() => {
  const TAU = Math.PI * 2;
  const mix = (a, b, t) => { const pa = hex(a), pb = hex(b); return `rgb(${pa.map((v, i) => Math.round(lerp(v, pb[i], t))).join(",")})`; };
  function hex(c) { if (c.startsWith("rgb")) return c.match(/\d+/g).slice(0, 3).map(Number); const h = c.replace("#", ""); return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)); }
  function ell(g, x, y, rx, ry, rot = 0) { g.beginPath(); g.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, TAU); }
  function eye(g, x, y, r, closed = false, color = "#14161c") {
    if (closed) { g.strokeStyle = color; g.lineWidth = r * 0.55; g.lineCap = "round"; g.beginPath(); g.arc(x, y - r * 0.2, r * 0.9, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); return; }
    ell(g, x, y, r, r); g.fillStyle = color; g.fill();
    ell(g, x + r * 0.35, y - r * 0.35, r * 0.38, r * 0.38); g.fillStyle = "#fff"; g.fill();
    ell(g, x - r * 0.3, y + r * 0.35, r * 0.15, r * 0.15); g.fillStyle = "rgba(255,255,255,.7)"; g.fill();
  }
  function blush(g, x, y, r) { ell(g, x, y, r * 1.3, r * 0.8); g.fillStyle = "rgba(255,140,150,.35)"; g.fill(); }

  /* ---------------- birds ---------------- */
  const BIRD = {
    gull: { body: "#f4f5f7", belly: "#ffffff", back: "#2b2f36", head: "#f7f8fa", wing: "#30353d", tip: "#0d0f12", beak: "#f2c94c", spot: "#d93a2b", leg: "#f2c94c", tail: "#f4f5f7", tailL: .13, fork: 0, wingL: 1.0, beakL: .15, headR: .105, flap: 3.2 },
    cuckoo: { body: "#8f98a6", belly: "#f1efe9", back: "#7a8391", head: "#8f98a6", wing: "#6b7482", tip: "#4d5562", beak: "#2f2f2f", leg: "#f0c33c", tail: "#5f6774", tailL: .34, fork: 0, wingL: .85, beakL: .1, headR: .095, bars: true, ring: "#f3c623", flap: 4.2, tailSpots: true },
    snipe: { body: "#8a6a45", belly: "#efe6d4", back: "#6b4f31", head: "#8a6a45", wing: "#76583a", tip: "#4b3826", beak: "#6d5a45", leg: "#9aa27a", tail: "#6b4f31", tailL: .1, fork: 0, wingL: .75, beakL: .34, headR: .085, stripes: true, flap: 5.5 },
    dove: { body: "#d6aaa2", belly: "#efd9d2", back: "#b8763f", head: "#a9b1bd", wing: "#b8763f", tip: "#5d4a3a", beak: "#3b3330", leg: "#c9566a", tail: "#5d5550", tailL: .2, fork: 0, wingL: .82, beakL: .07, headR: .095, scallop: true, neck: true, ring: "#d9523e", flap: 5 },
    tern: { body: "#ffffff", belly: "#ffffff", back: "#1d2026", head: "#ffffff", wing: "#1d2026", tip: "#0b0c0e", beak: "#111", leg: "#111", tail: "#1d2026", tailL: .3, fork: .14, wingL: 1.18, beakL: .16, headR: .085, cap: true, flap: 3.4 },
    frigate: { body: "#17191f", belly: "#22252c", back: "#17191f", head: "#17191f", wing: "#17191f", tip: "#0a0b0e", beak: "#8c939e", leg: "#2a2d33", tail: "#17191f", tailL: .36, fork: .2, wingL: 1.45, beakL: .24, headR: .085, hook: true, glide: true, flap: 1.4 },
    booby: { body: "#fafafa", belly: "#ffffff", back: "#f2f2f2", head: "#ffffff", wing: "#f5f5f5", tip: "#1b1b1f", beak: "#f2d14b", leg: "#5f6b78", tail: "#1b1b1f", tailL: .17, fork: 0, wingL: 1.1, beakL: .2, headR: .1, mask: true, trailing: true, flap: 3.4 },
    albatross: { body: "#fbfbfa", belly: "#ffffff", back: "#f4f3f0", head: "#ffffff", wing: "#f2f0ec", tip: "#2d2a28", beak: "#f3b3a8", leg: "#e9c3bd", tail: "#fbfbfa", tailL: .1, fork: 0, wingL: 1.75, beakL: .22, headR: .1, hook: true, trailing: true, glide: true, flap: 1.1 },
    stork: { body: "#fbfbfb", belly: "#ffffff", back: "#f1f1f1", head: "#ffffff", wing: "#f4f4f4", tip: "#141416", beak: "#e0452f", leg: "#e0452f", tail: "#f4f4f4", tailL: .12, fork: 0, wingL: 1.35, beakL: .34, headR: .08, trailing: true, glide: true, flap: 2.2 },
    spoonbill: { body: "#fcfcfa", belly: "#ffffff", back: "#f6f5f0", head: "#ffffff", wing: "#f8f7f3", tip: "#e9e6de", beak: "#2c2b2a", spot: "#f2c94c", leg: "#2c2b2a", tail: "#f8f7f3", tailL: .1, fork: 0, wingL: 1.2, beakL: .36, headR: .085, flap: 2.8 },
    curlew: { body: "#9c7f5c", belly: "#efe4d0", back: "#7d6346", head: "#9c7f5c", wing: "#856a4c", tip: "#4d3b29", beak: "#4a3a2e", leg: "#7c8a8f", tail: "#7d6346", tailL: .12, fork: 0, wingL: .95, beakL: .4, headR: .085, stripes: true, flap: 4.2 },
    vulture: { body: "#2b2623", belly: "#35302c", back: "#231f1c", head: "#cf4b3d", wing: "#2c2724", tip: "#a7a19a", beak: "#efe6d6", leg: "#d8c8b3", tail: "#2b2623", tailL: .2, fork: 0, wingL: 1.5, beakL: .1, headR: .07, hook: true, glide: true, flap: 1.2 },
    griffon: { body: "#b88d5c", belly: "#c99f6c", back: "#9e7649", head: "#efe7db", wing: "#906843", tip: "#2b211a", beak: "#cfc6b8", leg: "#9d968a", tail: "#2b211a", tailL: .12, fork: 0, wingL: 1.6, beakL: .13, headR: .085, hook: true, trailing: true, glide: true, flap: 1.1 },
    eagle: { body: "#3d2b1f", belly: "#3a291d", back: "#33241a", head: "#fbfbf7", wing: "#3b291d", tip: "#22170f", beak: "#f2c230", leg: "#f2c230", tail: "#fbfbf7", tailL: .16, fork: 0, wingL: 1.4, beakL: .13, headR: .1, hook: true, glide: true, flap: 1.8 },
    hawk: { body: "#9a6a45", belly: "#efe2cd", back: "#5f3e28", head: "#6e4a31", wing: "#62412a", tip: "#2b1d13", beak: "#3d3b39", leg: "#f0c24a", tail: "#3b2b1f", tailL: .16, fork: 0, wingL: 1.15, beakL: .1, headR: .095, hook: true, bars: true, flap: 2.6 },
    pelican: { body: "#8a7a68", belly: "#7b6b5a", back: "#6d5f51", head: "#f1e7c6", wing: "#6d5f51", tip: "#3e352e", beak: "#a89a78", leg: "#3a3631", tail: "#6d5f51", tailL: .1, fork: 0, wingL: 1.15, beakL: .42, headR: .1, pouch: true, neckC: "#5a3a2a", flap: 2.6 },
  };
  function bird(g, P, t, mode, sleep) {
    // mode: "fly" | "stand" | "float"
    const flying = mode === "fly";
    const ph = t * P.flap * (flying ? 1 : 0);
    const e = flying ? (P.glide ? 0.35 + 0.18 * Math.sin(ph) : Math.sin(ph)) : 0;
    const bob = flying ? -e * 0.025 : 0;
    g.save(); g.translate(0, bob);
    // legs
    if (mode === "stand") { g.strokeStyle = P.leg; g.lineWidth = .022; g.lineCap = "round"; g.beginPath(); g.moveTo(.0, .1); g.lineTo(-.02, .27); g.moveTo(.06, .1); g.lineTo(.07, .27); g.stroke(); }
    // far wing
    if (flying) wing(g, P, e * 0.9, true);
    // tail
    g.fillStyle = P.tail; g.beginPath();
    const tl = P.tailL, tf = P.fork;
    g.moveTo(-.2, -.06); g.lineTo(-.24 - tl, -.06 - tf * .55); g.lineTo(-.21 - tl + tf * .9, -.02); g.lineTo(-.24 - tl, .02 + tf * .55); g.lineTo(-.2, .03); g.closePath(); g.fill();
    if (P.tailSpots) { g.fillStyle = "#e8e8e8"; for (let i = 0; i < 3; i++) { ell(g, -.27 - i * .08, -.01, .012, .008); g.fill(); } }
    // body
    const grd = g.createLinearGradient(0, -.16, 0, .14); grd.addColorStop(0, P.back); grd.addColorStop(.45, P.body); grd.addColorStop(1, P.belly);
    ell(g, 0, 0, .3, .135, -.06); g.fillStyle = grd; g.fill();
    if (P.bars) { g.save(); ell(g, 0, 0, .3, .135, -.06); g.clip(); g.strokeStyle = "rgba(60,64,72,.55)"; g.lineWidth = .011; for (let x = -.18; x < .24; x += .035) { g.beginPath(); g.moveTo(x, .02); g.quadraticCurveTo(x + .02, .06, x + .01, .13); g.stroke(); } g.restore(); }
    if (P.stripes) { g.save(); ell(g, 0, 0, .3, .135, -.06); g.clip(); g.strokeStyle = "rgba(235,210,160,.75)"; g.lineWidth = .016; for (let y = -.11; y < .0; y += .04) { g.beginPath(); g.moveTo(-.28, y + .02); g.lineTo(.22, y - .02); g.stroke(); } g.restore(); }
    // neck / head
    if (P.pouch) { g.fillStyle = P.neckC; g.beginPath(); g.moveTo(.16, -.06); g.quadraticCurveTo(.3, -.12, .3, -.2); g.lineTo(.36, -.18); g.quadraticCurveTo(.34, -.06, .22, .03); g.closePath(); g.fill(); }
    const hx = P.pouch ? .33 : .27, hy = P.pouch ? -.2 : -.075, hr = P.headR;
    ell(g, hx, hy, hr, hr * .95); g.fillStyle = P.head; g.fill();
    if (P.cap) { g.save(); ell(g, hx, hy, hr, hr * .95); g.clip(); g.fillStyle = "#16181d"; g.fillRect(hx - hr * 1.2, hy - hr * 1.2, hr * 2.4, hr * 1.0); g.fillStyle = "#fff"; ell(g, hx + hr * .55, hy - hr * .35, hr * .45, hr * .22); g.fill(); g.restore(); }
    if (P.mask) { ell(g, hx + hr * .4, hy, hr * .55, hr * .45); g.fillStyle = "#1f2733"; g.fill(); }
    if (P.neck) { g.fillStyle = "#1b1b1b"; for (let i = 0; i < 3; i++) { g.fillRect(hx - hr * 1.0 + i * .012, hy + hr * .5, .007, .04); } g.fillStyle = "#fff"; for (let i = 0; i < 3; i++) g.fillRect(hx - hr * .95 + i * .012 + .004, hy + hr * .5, .003, .04); }
    // beak
    const bx = hx + hr * .85, by = hy + hr * .1, bl = P.beakL;
    g.fillStyle = P.beak; g.beginPath();
    if (P.pouch) { g.moveTo(bx - .01, by - .025); g.lineTo(bx + bl, by - .005); g.lineTo(bx + bl - .02, by + .02); g.quadraticCurveTo(bx + bl * .5, by + .1, bx - .01, by + .03); g.closePath(); g.fill(); g.strokeStyle = "rgba(60,50,40,.5)"; g.lineWidth = .006; g.beginPath(); g.moveTo(bx, by + .005); g.lineTo(bx + bl - .02, by + .01); g.stroke(); }
    else { g.moveTo(bx - .015, by - .028); g.lineTo(bx + bl, by + (P.hook ? .004 : 0)); if (P.hook) g.quadraticCurveTo(bx + bl + .012, by + .02, bx + bl - .012, by + .022); g.lineTo(bx - .015, by + .02); g.closePath(); g.fill(); }
    if (P.spot) { ell(g, bx + bl * .72, by + .012, .011, .008); g.fillStyle = P.spot; g.fill(); }
    // eye
    if (P.ring) { ell(g, hx + hr * .38, hy - hr * .12, hr * .32, hr * .32); g.fillStyle = P.ring; g.fill(); }
    eye(g, hx + hr * .38, hy - hr * .12, hr * .22, sleep);
    blush(g, hx + hr * .2, hy + hr * .45, hr * .22);
    // near wing
    if (flying) wing(g, P, e, false);
    else { // folded wing
      g.fillStyle = P.wing; g.beginPath(); g.moveTo(.18, -.08); g.quadraticCurveTo(.02, -.15, -.28, -.04); g.quadraticCurveTo(-.02, .04, .18, -.03); g.closePath(); g.fill();
      if (P.scallop) scallops(g);
      g.fillStyle = P.tip; g.beginPath(); g.moveTo(-.12, -.05); g.quadraticCurveTo(-.22, -.07, -.3, -.04); g.quadraticCurveTo(-.2, -.01, -.12, -.02); g.closePath(); g.fill();
    }
    g.restore();
  }
  function scallops(g) { g.fillStyle = "rgba(40,28,20,.75)"; for (let i = 0; i < 6; i++) { ell(g, .1 - i * .05, -.07 + (i % 2) * .02, .014, .01); g.fill(); } }
  function wing(g, P, e, far) {
    const L = P.wingL * .52, sx = .04, sy = -.07;
    const tipX = sx - L * .62, tipY = sy - L * e;
    const midX = sx - L * .18, midY = sy - L * e * .62 - .04;
    g.save();
    if (far) g.globalAlpha = .8;
    g.fillStyle = far ? mix(P.wing, "#000000", .25) : P.wing;
    g.beginPath(); g.moveTo(sx + .07, sy + .01);
    g.quadraticCurveTo(midX + .05, midY - .05 * Math.sign(e || 1), tipX, tipY);
    g.quadraticCurveTo(midX - .04, midY + .08 * (e >= 0 ? 1 : -.4), sx - .14, sy + .04);
    g.closePath(); g.fill();
    // primaries
    g.fillStyle = P.tip; g.beginPath();
    const kx = lerp(midX, tipX, .55), ky = lerp(midY, tipY, .55);
    g.moveTo(kx + .02, ky - .015); g.lineTo(tipX, tipY); g.lineTo(kx - .03, ky + .03); g.closePath(); g.fill();
    if (P.trailing) { g.strokeStyle = P.tip; g.lineWidth = .016; g.beginPath(); g.moveTo(sx - .12, sy + .04); g.quadraticCurveTo(midX - .04, midY + .08 * (e >= 0 ? 1 : -.4), tipX, tipY); g.stroke(); }
    if (P.scallop && !far) { g.save(); g.translate((midX - sx) * .3, (midY - sy) * .3); scallops(g); g.restore(); }
    g.restore();
  }

  /* ---------------- marine mammals ---------------- */
  const SEAL = {
    eseal: { c: "#7b7268", c2: "#a99f92", belly: "#b8ad9f", len: 1, fat: 1.15, wh: .06, nose: true },
    furseal: { c: "#4a3a2e", c2: "#6b5545", belly: "#7c6450", len: .9, fat: .9, wh: .09, ear: true, pup: true },
    ringed: { c: "#5c6670", c2: "#8b949c", belly: "#b9c0c4", len: .9, fat: 1.05, wh: .07, rings: true },
    bearded: { c: "#80705f", c2: "#a3927d", belly: "#b4a58f", len: 1, fat: 1, wh: .2, beard: true },
  };
  function seal(g, P, t, swim, sleep) {
    const sw = swim ? Math.sin(t * 2.4) : Math.sin(t * .8) * .25;
    g.save(); g.scale(P.len, 1); g.rotate(swim ? sw * .04 : 0);
    const f = P.fat;
    // rear flippers
    g.fillStyle = P.c; g.save(); g.translate(-.42, 0); g.rotate(sw * .35);
    g.beginPath(); g.moveTo(0, -.02); g.lineTo(-.14, -.09); g.quadraticCurveTo(-.1, 0, -.14, .07); g.closePath(); g.fill(); g.restore();
    // body
    const grd = g.createLinearGradient(0, -.17 * f, 0, .15 * f); grd.addColorStop(0, P.c); grd.addColorStop(.55, P.c2); grd.addColorStop(1, P.belly);
    g.fillStyle = grd; g.beginPath();
    g.moveTo(.47, .0); g.bezierCurveTo(.47, -.1 * f, .38, -.15 * f, .26, -.15 * f); g.bezierCurveTo(.05, -.17 * f, -.25, -.12 * f, -.43, -.02);
    g.bezierCurveTo(-.3, .07 * f, -.05, .15 * f, .18, .12 * f); g.bezierCurveTo(.36, .1 * f, .47, .07, .47, .0); g.closePath(); g.fill();
    if (P.rings) { g.save(); g.clip(); g.strokeStyle = "rgba(220,226,230,.55)"; g.lineWidth = .012; const r = rng(7); for (let i = 0; i < 16; i++) { const x = -.35 + r() * .62, y = -.12 + r() * .1; ell(g, x, y, .022 + r() * .012, .015); g.stroke(); } g.restore(); }
    // fore flipper
    g.fillStyle = mix(P.c, "#000000", .15); g.save(); g.translate(.14, .08 * f); g.rotate(swim ? .6 + sw * .4 : 1.1);
    g.beginPath(); ell(g, .05, 0, .07, .028); g.fill(); g.restore();
    if (P.ear) { ell(g, .3, -.115, .012, .02, -.4); g.fillStyle = P.c; g.fill(); }
    // face
    eye(g, .35, -.055, .04, sleep);
    blush(g, .36, .015, .03);
    ell(g, .462, -.008, .014, .011); g.fillStyle = "#1a1512"; g.fill();
    if (P.nose) { ell(g, .45, -.03, .03, .022); g.fillStyle = mix(P.c, "#000000", .1); g.fill(); ell(g, .462, -.008, .012, .01); g.fillStyle = "#1a1512"; g.fill(); }
    g.strokeStyle = P.beard ? "rgba(250,248,240,.95)" : "rgba(240,236,228,.8)"; g.lineWidth = .006; g.lineCap = "round";
    for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(.45, .02); g.quadraticCurveTo(.45 + P.wh * .6, .03 + i * .02, .45 + P.wh, .05 + i * .035 + (P.beard ? .03 : 0)); g.stroke(); }
    g.restore();
  }
  function whale(g, t) {
    const s = Math.sin(t * 1.3);
    g.save();
    g.fillStyle = "#1b222c";
    g.save(); g.translate(-.46, -.01); g.rotate(s * .25);
    g.beginPath(); g.moveTo(.02, 0); g.quadraticCurveTo(-.08, -.04, -.16, -.15); g.quadraticCurveTo(-.1, -.02, -.04, 0); g.quadraticCurveTo(-.1, .02, -.16, .15); g.quadraticCurveTo(-.08, .04, .02, 0); g.fill(); g.restore();
    const grd = g.createLinearGradient(0, -.2, 0, .18); grd.addColorStop(0, "#232c38"); grd.addColorStop(.7, "#1b222c"); grd.addColorStop(1, "#3a4452");
    g.fillStyle = grd; g.beginPath();
    g.moveTo(.5, -.02); g.bezierCurveTo(.5, -.16, .35, -.2, .18, -.19); g.bezierCurveTo(-.05, -.18, -.3, -.1, -.47, -.01);
    g.bezierCurveTo(-.3, .08, -.05, .17, .15, .16); g.bezierCurveTo(.38, .15, .5, .1, .5, -.02); g.closePath(); g.fill();
    // belly patch & mouth
    ell(g, .05, .12, .12, .03); g.fillStyle = "rgba(230,230,235,.18)"; g.fill();
    g.strokeStyle = "#0e1218"; g.lineWidth = .012; g.beginPath(); g.moveTo(.49, .0); g.quadraticCurveTo(.33, -.06, .14, .05); g.stroke();
    // callosities
    g.fillStyle = "#e9e3d6"; const r = rng(11);
    for (const [x, y, rr] of [[.42, -.15, .022], [.47, -.11, .016], [.36, -.17, .014], [.45, .05, .016], [.41, .08, .012]]) { ell(g, x, y, rr * (1 + r() * .4), rr * .8); g.fill(); }
    // flipper
    g.fillStyle = "#151b23"; g.save(); g.translate(.17, .12); g.rotate(.7 + s * .15); ell(g, .06, 0, .09, .035); g.fill(); g.restore();
    eye(g, .2, .02, .025, false, "#0b0d10");
    g.restore();
  }
  function marlin(g, t, swim) {
    const s = Math.sin(t * (swim ? 6 : 2));
    g.save();
    // tail
    g.fillStyle = "#16315f"; g.save(); g.translate(-.38, 0); g.rotate(s * .18);
    g.beginPath(); g.moveTo(.02, 0); g.quadraticCurveTo(-.05, -.08, -.12, -.17); g.quadraticCurveTo(-.06, -.03, -.04, 0); g.quadraticCurveTo(-.06, .03, -.12, .17); g.quadraticCurveTo(-.05, .08, .02, 0); g.fill(); g.restore();
    // sail
    g.fillStyle = "#1d4a8f"; g.beginPath(); g.moveTo(.2, -.06); g.quadraticCurveTo(.17, -.26, .08, -.25); g.quadraticCurveTo(-.05, -.16, -.17, -.06); g.closePath(); g.fill();
    g.strokeStyle = "rgba(120,170,240,.5)"; g.lineWidth = .006; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(.16 - i * .055, -.06); g.lineTo(.13 - i * .05, -.22 + i * .025); g.stroke(); }
    // body
    const grd = g.createLinearGradient(0, -.09, 0, .08); grd.addColorStop(0, "#14306a"); grd.addColorStop(.5, "#3e78c4"); grd.addColorStop(.75, "#c6d4e6"); grd.addColorStop(1, "#e9eef5");
    g.fillStyle = grd; g.beginPath(); g.moveTo(.34, -.01); g.bezierCurveTo(.3, -.09, .05, -.08, -.38, -.012); g.bezierCurveTo(.0, .08, .3, .07, .34, -.01); g.closePath(); g.fill();
    g.strokeStyle = "rgba(160,200,255,.6)"; g.lineWidth = .008; for (let i = 0; i < 7; i++) { const x = .2 - i * .07; g.beginPath(); g.moveTo(x, -.06); g.lineTo(x - .01, .03); g.stroke(); }
    // bill
    g.fillStyle = "#1a2c4e"; g.beginPath(); g.moveTo(.33, -.025); g.lineTo(.66, -.012); g.lineTo(.33, .005); g.closePath(); g.fill();
    // pectoral
    g.fillStyle = "#2c5aa0"; g.beginPath(); g.moveTo(.18, .02); g.lineTo(.06, .1); g.lineTo(.12, .025); g.closePath(); g.fill();
    eye(g, .27, -.02, .022, false);
    g.restore();
  }
  function turtle(g, t, swim) {
    const s = Math.sin(t * (swim ? 2.2 : .9));
    g.save();
    const fl = (x, y, len, w, ang, c) => { g.save(); g.translate(x, y); g.rotate(ang); g.fillStyle = c; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(len * .45, -w, len, 0); g.quadraticCurveTo(len * .45, w * .6, 0, 0); g.fill(); g.restore(); };
    fl(-.2, .05, .16, .06, 2.4 + s * .25, "#6e7f55");      // rear flipper
    fl(.12, .05, .3, .08, 2.1 + s * .55, "#7d8f5f");       // front flipper (far)
    // head
    g.fillStyle = "#80915f"; ell(g, .36, .0, .09, .065, -.1); g.fill();
    g.fillStyle = "#5b6a42"; for (const [x, y] of [[.34, -.03], [.38, -.04], [.31, .02], [.39, .02]]) { ell(g, x, y, .012, .009); g.fill(); }
    eye(g, .39, -.015, .02, false);
    blush(g, .4, .025, .015);
    g.strokeStyle = "#3b4528"; g.lineWidth = .007; g.beginPath(); g.moveTo(.42, .03); g.quadraticCurveTo(.44, .03, .45, .01); g.stroke();
    // shell
    const grd = g.createLinearGradient(0, -.2, 0, .1); grd.addColorStop(0, "#7a6538"); grd.addColorStop(1, "#4d3e22");
    g.fillStyle = grd; g.beginPath(); g.moveTo(.3, .05); g.bezierCurveTo(.28, -.16, -.24, -.2, -.32, .06); g.closePath(); g.fill();
    g.fillStyle = "#d8cba0"; g.beginPath(); g.moveTo(.3, .05); g.quadraticCurveTo(0, .12, -.32, .06); g.closePath(); g.fill();
    g.strokeStyle = "rgba(230,205,140,.6)"; g.lineWidth = .009;
    for (const [x, y, r] of [[-.02, -.09, .07], [.15, -.06, .06], [-.18, -.05, .06]]) { g.beginPath(); for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + .5; const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r * .6; k ? g.lineTo(px, py) : g.moveTo(px, py); } g.closePath(); g.stroke(); }
    fl(.14, .07, .3, .08, 2.35 - s * .55, "#90a26c");     // front flipper (near)
    g.restore();
  }
  function caribou(g, t, walk, sleep) {
    const ph = t * (walk ? 4 : 0);
    g.save();
    const leg = (x, a, c) => { g.save(); g.translate(x, .05); g.rotate(a); g.fillStyle = c; g.fillRect(-.018, 0, .036, .2); g.fillStyle = "#2a2420"; g.fillRect(-.022, .19, .044, .03); g.restore(); };
    leg(-.18, Math.sin(ph + Math.PI) * .35, "#4e3826"); leg(.17, Math.sin(ph) * .35, "#4e3826");
    // body
    const grd = g.createLinearGradient(0, -.2, 0, .1); grd.addColorStop(0, "#6e4d33"); grd.addColorStop(.7, "#8a6747"); grd.addColorStop(1, "#c9b9a2");
    g.fillStyle = grd; ell(g, 0, -.04, .3, .14); g.fill();
    leg(-.22, Math.sin(ph) * .35, "#5e4430"); leg(.13, Math.sin(ph + Math.PI) * .35, "#5e4430");
    // tail
    g.fillStyle = "#f2ede4"; ell(g, -.3, -.1, .03, .02, .4); g.fill();
    // neck & mane
    g.fillStyle = "#e9e2d4"; g.beginPath(); g.moveTo(.18, -.12); g.quadraticCurveTo(.3, -.3, .36, -.3); g.lineTo(.4, -.2); g.quadraticCurveTo(.33, -.04, .2, .04); g.closePath(); g.fill();
    // head
    g.fillStyle = "#7a5a3e"; g.beginPath(); g.moveTo(.33, -.33); g.quadraticCurveTo(.47, -.31, .5, -.24); g.quadraticCurveTo(.47, -.2, .4, -.21); g.quadraticCurveTo(.33, -.22, .32, -.28); g.closePath(); g.fill();
    ell(g, .49, -.245, .018, .014); g.fillStyle = "#2b221d"; g.fill();
    g.fillStyle = "#6a4c34"; ell(g, .33, -.33, .025, .012, -.6); g.fill();
    eye(g, .4, -.29, .016, sleep);
    // antlers
    g.strokeStyle = "#d9c7a6"; g.lineWidth = .016; g.lineCap = "round";
    g.beginPath(); g.moveTo(.37, -.33); g.quadraticCurveTo(.3, -.48, .38, -.58); g.moveTo(.34, -.45); g.lineTo(.27, -.5); g.moveTo(.36, -.53); g.lineTo(.43, -.6);
    g.moveTo(.39, -.33); g.quadraticCurveTo(.45, -.45, .42, -.55); g.moveTo(.41, -.38); g.lineTo(.47, -.4); g.stroke();
    g.restore();
  }

  function drawAnimal(g, look, t, mode, sleep) {
    if (BIRD[look]) return bird(g, BIRD[look], t, mode, sleep);
    if (SEAL[look]) return seal(g, SEAL[look], t, mode === "swim", sleep);
    if (look === "whale") return whale(g, t);
    if (look === "marlin") return marlin(g, t, mode === "swim");
    if (look === "turtle") return turtle(g, t, mode === "swim");
    if (look === "caribou") return caribou(g, t, mode === "walk", sleep);
  }

  /* ---------------- scene ---------------- */
  const SKY = [[-18, "#03050c", "#070c1c"], [-9, "#060b1f", "#16214a"], [-4, "#121c42", "#6a4b62"], [-1, "#1f2e62", "#d47e5e"], [3, "#33508e", "#f2a874"], [8, "#3f6cb2", "#f5cf9f"], [18, "#3b78c8", "#b4d6f2"], [50, "#2c6fca", "#9fcbef"]];
  function skyAt(alt) {
    alt = clamp(alt, -18, 50);
    for (let i = 1; i < SKY.length; i++) if (alt <= SKY[i][0]) { const [a, t0, b0] = SKY[i - 1], [b, t1, b1] = SKY[i], f = (alt - a) / (b - a); return [mix(t0, t1, f), mix(b0, b1, f)]; }
    return [SKY[SKY.length - 1][1], SKY[SKY.length - 1][2]];
  }
  function moon(g, x, y, r, phase) {
    g.save();
    const glow = g.createRadialGradient(x, y, r * .5, x, y, r * 3.2); glow.addColorStop(0, "rgba(230,235,255,.22)"); glow.addColorStop(1, "rgba(230,235,255,0)");
    g.fillStyle = glow; g.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = "rgba(40,45,60,.55)"; g.fill();
    // lit part: phase 0 new → .5 full → 1 new; waxing lit on the right (northern-hemisphere view)
    const k = Math.cos(phase * TAU), right = phase < .5;
    g.beginPath(); g.arc(x, y, r, -Math.PI / 2, Math.PI / 2, !right);
    g.ellipse(x, y, Math.abs(k) * r, r, 0, Math.PI / 2, -Math.PI / 2, right ? k > 0 : k < 0);
    g.fillStyle = "#f3f0e2"; g.fill();
    g.restore();
  }
  function stars(g, W, H, a, seed) {
    if (a <= 0) return; const r = rng(seed);
    for (let i = 0; i < 70; i++) { const x = r() * W, y = r() * H * .6, s = r() * 1.6 + .4; g.globalAlpha = a * (.35 + r() * .65); g.fillStyle = "#fff"; g.fillRect(x, y, s, s); }
    g.globalAlpha = 1;
  }

  // o: { look, cls, t, alt, moon, env: 'sea'|'lake'|'land', terrain, snow, ice, mode, heading, sleep, under }
  function scene(cv, o) {
    const g = cv.getContext("2d"), W = cv.width, H = cv.height;
    g.setTransform(1, 0, 0, 1, 0, 0);
    const under = o.under, horizon = under ? H * .2 : H * .62;
    const [top, bot] = skyAt(o.alt);
    let grd = g.createLinearGradient(0, 0, 0, horizon); grd.addColorStop(0, top); grd.addColorStop(1, bot);
    g.fillStyle = grd; g.fillRect(0, 0, W, horizon + 2);
    const dark = smoothstep(-2, -12, o.alt);
    stars(g, W, horizon, dark, 3);
    if (o.alt < 2 && o.moon != null) moon(g, W * .24, horizon * (under ? .5 : .28), W * .045, o.moon);
    if (o.alt > -3) {
      const sy = horizon - clamp(o.alt, -3, 60) / 60 * (horizon * .85), sx = W * .76;
      const sg = g.createRadialGradient(sx, sy, 0, sx, sy, W * .22); sg.addColorStop(0, "rgba(255,246,220,.95)"); sg.addColorStop(.12, "rgba(255,230,180,.6)"); sg.addColorStop(1, "rgba(255,200,140,0)");
      g.fillStyle = sg; g.fillRect(0, 0, W, horizon);
      g.beginPath(); g.arc(sx, sy, W * .035, 0, TAU); g.fillStyle = o.alt < 6 ? "#ffd6a0" : "#fffaf0"; g.fill();
    }
    const day = 1 - dark * .85;
    if (under) {
      grd = g.createLinearGradient(0, horizon, 0, H);
      grd.addColorStop(0, mix("#2a86b8", "#0b2440", 1 - day)); grd.addColorStop(1, mix("#06213e", "#020812", 1 - day));
      g.fillStyle = grd; g.fillRect(0, horizon, W, H - horizon);
      g.save(); g.globalAlpha = .12 * day; g.fillStyle = "#e8fbff";
      for (let i = 0; i < 5; i++) { const x = W * (.1 + i * .22) + Math.sin(o.t * .3 + i) * 20; g.beginPath(); g.moveTo(x, horizon); g.lineTo(x + 50, horizon); g.lineTo(x - 40 + i * 10, H); g.lineTo(x - 90 + i * 10, H); g.closePath(); g.fill(); }
      g.restore();
      g.strokeStyle = `rgba(220,245,255,${.55 * day + .15})`; g.lineWidth = 2; g.beginPath();
      for (let x = 0; x <= W; x += 8) { const y = horizon + Math.sin(x * .04 + o.t * 1.6) * 3; x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
      const r = rng(5); g.fillStyle = "rgba(220,240,255,.35)";
      for (let i = 0; i < 26; i++) { const x = r() * W, y = horizon + ((r() * (H - horizon) - o.t * 12 * (.5 + r())) % (H - horizon) + (H - horizon)) % (H - horizon); g.fillRect(x, y, 2, 2); }
      if (o.floor) { g.fillStyle = mix("#3d4a3a", "#0b1210", 1 - day); g.beginPath(); g.moveTo(0, H * .9); for (let x = 0; x <= W; x += 20) g.lineTo(x, H * .9 + Math.sin(x * .05) * 6); g.lineTo(W, H); g.lineTo(0, H); g.fill(); }
    } else if (o.env === "sea" || o.env === "lake") {
      grd = g.createLinearGradient(0, horizon, 0, H);
      grd.addColorStop(0, mix(o.env === "lake" ? "#5b8fa6" : "#3f79a8", "#0b1424", 1 - day)); grd.addColorStop(1, mix("#0d3558", "#03070f", 1 - day));
      g.fillStyle = grd; g.fillRect(0, horizon, W, H - horizon);
      g.strokeStyle = `rgba(230,245,255,${.18 + .2 * day})`; g.lineWidth = 1.6;
      for (let k = 0; k < 7; k++) { const y0 = horizon + 10 + k * k * 6; g.beginPath(); for (let x = -10; x <= W + 10; x += 10) { const y = y0 + Math.sin(x * (.03 - k * .002) + o.t * (1 + k * .15) + k) * (1.5 + k * .8); x > -10 ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
      if (o.ice) { g.fillStyle = mix("#eef4f8", "#4a5a6e", 1 - day); for (const [x, w] of [[.08, .3], [.62, .26]]) { g.beginPath(); g.ellipse(W * x + W * w / 2, horizon + 24, W * w / 2, 8, 0, 0, TAU); g.fill(); } }
    } else {
      // land: layered hills tinted by terrain
      const pal = { desert: ["#d9b77d", "#c49a5c"], snow: ["#e9eef3", "#cfd8e2"], mountain: ["#6f7d6a", "#4d5d48"], forest: ["#3d6a43", "#2c5232"], grass: ["#7da35a", "#5f8a44"], wetland: ["#6f9a6a", "#557d55"], tundra: ["#9aa58a", "#7b8a6c"] }[o.terrain] || ["#7da35a", "#5f8a44"];
      const far = mix(pal[0], top, .45), near = pal[1];
      for (const [col, base, amp, fr] of [[mix(far, "#0a0f1c", 1 - day), horizon - 18, 26, .012], [mix(pal[0], "#0a0f1c", 1 - day), horizon + 4, 16, .02], [mix(near, "#05080f", 1 - day), horizon + 40, 10, .03]]) {
        g.fillStyle = col; g.beginPath(); g.moveTo(0, H);
        for (let x = 0; x <= W; x += 6) { const y = base - (o.terrain === "mountain" || o.terrain === "snow" ? Math.abs(Math.sin(x * fr * .8)) * amp * 2.2 : Math.sin(x * fr) * amp); g.lineTo(x, y); }
        g.lineTo(W, H); g.closePath(); g.fill();
      }
      if (o.terrain === "forest" || o.look === "caribou") { const r = rng(9); g.fillStyle = mix("#21402a", "#060a08", 1 - day); for (let i = 0; i < 14; i++) { const x = r() * W, y = horizon + 2 + r() * 22, h = 22 + r() * 26; g.beginPath(); g.moveTo(x, y - h); g.lineTo(x + h * .28, y); g.lineTo(x - h * .28, y); g.closePath(); g.fill(); } }
      if (o.snow) { g.fillStyle = `rgba(245,250,255,${.55 * day + .2})`; g.fillRect(0, horizon + 34, W, H); }
    }
    // the animal
    const L = W * (o.big || .62);
    let cx = W * .5, cy = under ? H * .58 : (o.mode === "fly" ? H * .42 : o.mode === "float" ? horizon + 6 : o.look === "caribou" ? horizon + 8 : horizon + 30);
    const hop = o.happy ? Math.abs(Math.sin(o.t * 9)) * o.happy * 18 : 0;
    cy += (o.mode === "fly" ? Math.sin(o.t * 1.2) * 8 : 0) - hop;
    g.save(); g.translate(cx, cy); g.scale(L * (o.heading < 0 ? -1 : 1), L);
    if (o.mode === "float") { g.save(); g.beginPath(); g.rect(-2, -2, 4, 2.06); g.clip(); drawAnimal(g, o.look, o.t, o.mode, o.sleep); g.restore(); }
    else drawAnimal(g, o.look, o.t, o.mode, o.sleep);
    g.restore();
    if (o.sleep) { g.fillStyle = "rgba(255,255,255,.8)"; g.font = `600 ${W * .05}px ${getComputedStyle(document.body).fontFamily}`; const z = (o.t * .6) % 1; g.globalAlpha = 1 - z; g.fillText("z", cx + L * .25, cy - L * .25 - z * 30); g.globalAlpha = 1; }
    // vignette
    const v = g.createRadialGradient(W / 2, H / 2, W * .3, W / 2, H / 2, W * .72); v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,.45)");
    g.fillStyle = v; g.fillRect(0, 0, W, H);
  }

  const cache = new Map();
  function portrait(cv, look, cls) {
    const key = look + cls + cv.width;
    let src = cache.get(key);
    if (!src) {
      src = document.createElement("canvas"); src.width = src.height = cv.width;
      const g = src.getContext("2d"), W = src.width, c = CLS[cls].color;
      const grd = g.createRadialGradient(W * .4, W * .3, 0, W * .5, W * .5, W * .7); grd.addColorStop(0, mix(c, "#ffffff", .15)); grd.addColorStop(1, mix(c, "#0b1020", .62));
      g.fillStyle = grd; g.fillRect(0, 0, W, W);
      const mode = BIRD[look] ? "fly" : look === "caribou" ? "stand" : "swim";
      const big = { albatross: .5, frigate: .58, pelican: .64, whale: .8, marlin: .7, caribou: .78, turtle: .82 }[look] || .78;
      g.save(); g.translate(W * .5, W * (look === "caribou" ? .62 : .56)); g.scale(W * big, W * big);
      drawAnimal(g, look, mode === "fly" ? .15 : .3, mode, false); g.restore();
      cache.set(key, src);
    }
    const g = cv.getContext("2d"); g.clearRect(0, 0, cv.width, cv.height); g.drawImage(src, 0, 0);
  }
  return { scene, portrait, BIRD };
})();
