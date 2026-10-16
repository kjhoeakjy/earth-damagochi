/* ============================================================
   Globe — three.js r147 with hand-written shaders:
   real sun position, soft terminator, relief from elevation, sun glint on the sea,
   city lights, drifting clouds with shadows, single-scattering atmosphere, Milky Way.
   ============================================================ */
const Globe = (() => {
  const G = { ok: false, onPick: null, onHover: null, onUserMove: null, onFrame: null };
  let renderer, scene, camera, controls, canvas, W = 1, H = 1, dpr = 1;
  let earthU, cloudU, atmoU, sky, sunSprite, marker, ring, ringU, homeDot;
  let candPts = null, candIds = [], candLL = [], candIndex = new Map();
  let anim = null, followOn = false, followGet = null, interacting = false, offsetX = 0;
  const ribbons = new Map(); let activeRibbon = null;
  const sun = new THREE.Vector3(1, 0, 0);
  const clock = new THREE.Clock();
  const FOV = 34;

  const SH = {
    common: `
      vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
      vec3 toSRGB(vec3 c){ return pow(c, vec3(1.0/2.2)); }`,
    earthV: `
      varying vec2 vUv; varying vec3 vPos;
      void main(){ vUv = uv; vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    earthF: `
      uniform sampler2D tDay, tNight, tClouds, tWater, tTopo;
      uniform vec3 uSun; uniform vec2 uTexel; uniform float uShift, uExposure, uBump;
      varying vec2 vUv; varying vec3 vPos;
      void main(){
        vec3 N = normalize(vPos);
        vec3 V = normalize(cameraPosition - vPos);
        vec3 L = normalize(uSun);
        float cl = max(length(N.xz), 0.12);
        vec3 east = normalize(vec3(N.z, 0.0, -N.x) + vec3(1e-5, 0.0, 0.0));
        vec3 north = normalize(cross(N, east));
        float water = texture2D(tWater, vUv).r;

        // relief from the elevation map, only on land
        float hL = texture2D(tTopo, vUv - vec2(uTexel.x, 0.0)).r;
        float hR = texture2D(tTopo, vUv + vec2(uTexel.x, 0.0)).r;
        float hD = texture2D(tTopo, vUv - vec2(0.0, uTexel.y)).r;
        float hU = texture2D(tTopo, vUv + vec2(0.0, uTexel.y)).r;
        vec2 grad = vec2((hR - hL) / cl, hU - hD) * uBump * (1.0 - water);
        vec3 Nb = normalize(N - grad.x * east - grad.y * north);

        vec3 day = pow(texture2D(tDay, vUv).rgb, vec3(2.2));
        vec3 deep = vec3(0.0011, 0.0052, 0.0175);
        vec3 shelf = day * vec3(0.5, 0.85, 1.1) + vec3(0.0, 0.0015, 0.004);
        day = mix(day, max(deep, shelf), water);

        float mu = dot(N, L);
        float dayAmt = smoothstep(-0.07, 0.22, mu);
        float diff = max(dot(Nb, L), 0.0);
        diff = mix(diff, smoothstep(-0.07, 0.6, mu) * 0.85, 0.18) * smoothstep(-0.05, 0.12, mu);

        // clouds sit a few kilometres up, so their shadows land a little away from the sun
        vec2 sunT = vec2(dot(L, east) / cl, dot(L, north));
        float cs = texture2D(tClouds, vUv + vec2(uShift, 0.0) - sunT * vec2(0.0018, 0.0036)).r;
        cs = smoothstep(0.18, 0.9, cs);
        vec3 col = day * diff * 2.0 * (1.0 - 0.55 * cs);

        // sun glint and sky reflection on open water
        vec3 Hh = normalize(L + V);
        float nh = max(dot(N, Hh), 0.0), nv = max(dot(N, V), 0.0);
        float fres = 0.02 + 0.98 * pow(1.0 - nv, 5.0);
        float spec = pow(nh, 700.0) * 0.9 + pow(nh, 90.0) * 0.06;
        col += water * (1.0 - cs) * spec * vec3(1.0, 0.86, 0.66) * smoothstep(0.0, 0.18, mu) * (0.45 + fres);
        col += water * fres * vec3(0.09, 0.2, 0.5) * dayAmt * 0.32;

        // haze toward the limb, warmer along the terminator
        float haze = pow(1.0 - nv, 2.6);
        float tw = smoothstep(-0.28, 0.0, mu) * (1.0 - smoothstep(0.0, 0.42, mu));
        vec3 sky = mix(vec3(0.2, 0.42, 1.0), vec3(1.0, 0.5, 0.25), tw * 0.35);
        col = mix(col, sky * (0.16 + 0.6 * dayAmt), haze * 0.3 * max(dayAmt, tw * 0.6));

        // city lights on the night side (dimmed under clouds)
        float li = texture2D(tNight, vUv).r;
        float nightAmt = 1.0 - smoothstep(-0.2, 0.05, mu);
        vec3 lc = vec3(1.0, 0.66, 0.32) * pow(li, 1.35) * 2.3 + vec3(1.0, 0.86, 0.62) * pow(li, 4.0) * 2.5;
        col += lc * nightAmt * (1.0 - 0.9 * water) * (1.0 - 0.72 * cs);
        col += day * 0.006 * nightAmt;

        col = aces(col * uExposure);
        gl_FragColor = vec4(toSRGB(col), 1.0);
      }`,
    cloudF: `
      uniform sampler2D tClouds; uniform vec3 uSun; uniform float uShift, uExposure;
      varying vec2 vUv; varying vec3 vPos;
      void main(){
        vec3 N = normalize(vPos), L = normalize(uSun), V = normalize(cameraPosition - vPos);
        float c = smoothstep(0.14, 0.95, texture2D(tClouds, vUv + vec2(uShift, 0.0)).r);
        float mu = dot(N, L);
        float lit = smoothstep(-0.12, 0.22, mu);
        float tw = smoothstep(-0.24, 0.0, mu) * (1.0 - smoothstep(0.0, 0.3, mu));
        vec3 col = mix(vec3(1.0), vec3(1.0, 0.6, 0.36), tw * 0.85) * (0.06 + 1.3 * max(mu, 0.0) + 0.22 * lit);
        col = mix(vec3(0.0035, 0.0045, 0.009), col, lit);
        float nv = max(dot(N, V), 0.0);
        float a = c * (0.93 - 0.3 * pow(1.0 - nv, 4.0));
        gl_FragColor = vec4(toSRGB(aces(col * uExposure * 0.92)), a);
      }`,
    atmoV: `
      varying vec3 vPos;
      void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    atmoF: `
      uniform vec3 uSun; uniform float uR0, uR1, uIntensity;
      varying vec3 vPos;
      void main(){
        vec3 ro = cameraPosition, rd = normalize(vPos - ro);
        float b = dot(ro, rd);
        float h1 = b * b - (dot(ro, ro) - uR1 * uR1);
        if (h1 <= 0.0) discard;
        float s1 = sqrt(h1);
        float tA = max(-b - s1, 0.0), tB = -b + s1;
        float h0 = b * b - (dot(ro, ro) - uR0 * uR0);
        if (h0 > 0.0) tB = min(tB, -b - sqrt(h0));
        float len = max(tB - tA, 0.0), dt = len / 12.0;
        vec3 sum = vec3(0.0);
        for (int i = 0; i < 12; i++) {
          vec3 p = ro + rd * (tA + (float(i) + 0.5) * dt);
          float r = length(p);
          float hg = clamp((r - uR0) / (uR1 - uR0), 0.0, 1.0);
          float dens = exp(-hg * 5.2);
          float sd = dot(p / r, uSun);
          float lit = smoothstep(-0.2, 0.25, sd);
          float tw = smoothstep(-0.3, 0.02, sd) * (1.0 - smoothstep(0.02, 0.32, sd));
          vec3 c = mix(vec3(0.27, 0.5, 1.0), vec3(1.0, 0.45, 0.2), tw * 0.55);
          sum += c * dens * (lit + tw * 0.4);
        }
        sum *= dt * 14.0;
        float ct = dot(rd, uSun);
        float phase = 0.72 + 0.4 * ct * ct + 2.4 * pow(max(ct, 0.0), 28.0);
        gl_FragColor = vec4(1.0 - exp(-sum * phase * uIntensity), 1.0);
      }`,
    mwF: `
      uniform sampler2D tMW; uniform float uBright; varying vec2 vUv;
      void main(){
        vec3 t = texture2D(tMW, vUv).rgb;
        vec3 c = mix(vec3(0.58, 0.68, 1.0), vec3(1.0, 0.82, 0.62), clamp(t.g * 1.4, 0.0, 1.0)) * pow(t.r, 1.35) * uBright;
        gl_FragColor = vec4(c, 1.0);
      }`,
    starV: `
      attribute vec3 color; attribute float aSize, aAlpha; uniform float uDpr;
      varying vec3 vColor; varying float vAlpha;
      void main(){ vColor = color; vAlpha = aAlpha; gl_PointSize = aSize * uDpr; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    starF: `
      varying vec3 vColor; varying float vAlpha;
      void main(){ float r = length(gl_PointCoord - 0.5) * 2.0; float a = exp(-r * r * 4.5); if (a < 0.02) discard; gl_FragColor = vec4(vColor * a * vAlpha, 1.0); }`,
    ribV: `
      attribute vec3 aDir; attribute float aSide, aDay, aKm;
      uniform float uWidth, uLift;
      varying float vSide, vDay, vKm, vFacing;
      void main(){
        vec3 p = normalize(position + aDir * aSide * uWidth) * uLift;
        vSide = aSide; vDay = aDay; vKm = aKm;
        vFacing = dot(normalize(p), normalize(cameraPosition - p));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    ribF: `
      uniform vec3 uColor; uniform float uNow, uMeet, uOpacity, uDash, uHiA, uHiB, uFresh;
      varying float vSide, vDay, vKm, vFacing;
      void main(){
        if (vDay > uNow) discard;
        float e = abs(vSide);
        float pre = step(vDay, uMeet);
        if (pre > 0.5 && fract(vKm / uDash) > 0.5) discard;
        float core = 1.0 - smoothstep(0.18, 0.42, e);
        float glow = exp(-e * e * 5.0);
        float age = max(uNow - vDay, 0.0);
        float fresh = mix(1.0, exp(-age / 6.0), uFresh);
        float hi = step(uHiA, vDay) * step(vDay, uHiB);
        vec3 c = mix(uColor, vec3(1.0, 0.97, 0.9), core * (0.25 + 0.6 * max(fresh, hi)));
        float a = (core * 0.9 + glow * 0.32) * uOpacity * mix(0.5 + 0.5 * fresh, 0.55, pre);
        a = max(a, (core + glow * 0.5) * hi);
        a *= smoothstep(-0.02, 0.14, vFacing);
        gl_FragColor = vec4(c, a);
      }`,
    ptV: `
      attribute vec3 color; attribute float aSize, aPhase, aState;
      uniform float uTime, uDpr;
      varying vec3 vColor; varying float vState, vFacing;
      void main(){
        vColor = color; vState = aState;
        vFacing = dot(normalize(position), normalize(cameraPosition - position));
        float pulse = 1.0 + 0.14 * sin(uTime * 2.2 + aPhase);
        float k = aState > 1.5 ? 1.8 : aState > 0.5 ? 1.4 : 1.0;
        gl_PointSize = aState < -0.5 ? 0.0 : aSize * uDpr * pulse * k * step(-0.05, vFacing);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    ptF: `
      varying vec3 vColor; varying float vState, vFacing;
      void main(){
        float r = length(gl_PointCoord - 0.5) * 2.0;
        if (r > 1.0) discard;
        float core = 1.0 - smoothstep(0.3, 0.42, r);
        float ring = smoothstep(0.56, 0.66, r) * (1.0 - smoothstep(0.8, 0.94, r));
        float glow = (1.0 - r) * 0.45;
        vec3 c = mix(vColor, vec3(1.0), core * 0.45);
        float a = max(core, max(ring * (0.35 + 0.65 * min(vState, 1.0)), glow));
        a *= smoothstep(-0.05, 0.15, vFacing);
        gl_FragColor = vec4(c, a);
      }`,
    fixV: `
      attribute float aDay; uniform float uNow, uHiA, uHiB, uDpr, uSize;
      varying float vHi, vFacing;
      void main(){
        vFacing = dot(normalize(position), normalize(cameraPosition - position));
        vHi = step(uHiA, aDay) * step(aDay, uHiB);
        gl_PointSize = step(aDay, uNow) * uSize * uDpr * (1.0 + vHi * 0.8) * step(0.0, vFacing);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fixF: `
      uniform vec3 uColor; varying float vHi, vFacing;
      void main(){
        float r = length(gl_PointCoord - 0.5) * 2.0;
        if (r > 1.0) discard;
        float a = (1.0 - smoothstep(0.5, 1.0, r)) * smoothstep(0.0, 0.18, vFacing) * mix(0.62, 1.0, vHi);
        gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.35 + 0.65 * vHi), a);
      }`,
    diskF: `
      uniform vec3 uColor; varying vec2 vUv;
      void main(){
        float r = length(vUv - 0.5) * 2.0;
        if (r > 1.0) discard;
        float edge = smoothstep(0.9, 0.965, r) * (1.0 - smoothstep(0.975, 1.0, r));
        gl_FragColor = vec4(uColor, 0.09 + 0.1 * r * r + edge * 0.65);
      }`,
    ringF: `
      uniform vec3 uColor; uniform float uT; varying vec2 vUv;
      void main(){
        float r = length(vUv - 0.5) * 2.0;
        float ph = fract(uT * 0.45);
        float rr = mix(0.15, 1.0, ph);
        float band = exp(-pow((r - rr) / 0.07, 2.0));
        float a = band * (1.0 - ph) * 0.9;
        if (a < 0.01) discard;
        gl_FragColor = vec4(uColor, a);
      }`,
  };

  function glowTexture(inner, outer, size = 128) {
    const c = document.createElement("canvas"); c.width = c.height = size;
    const g = c.getContext("2d"), r = size / 2, grd = g.createRadialGradient(r, r, 0, r, r, r);
    grd.addColorStop(0, inner); grd.addColorStop(0.18, inner); grd.addColorStop(0.32, outer);
    grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd; g.fillRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(c); return t;
  }
  function sunTexture(size = 256) {
    const c = document.createElement("canvas"); c.width = c.height = size;
    const g = c.getContext("2d"), r = size / 2;
    let grd = g.createRadialGradient(r, r, 0, r, r, r);
    grd.addColorStop(0, "rgba(255,255,250,1)"); grd.addColorStop(0.06, "rgba(255,250,235,1)");
    grd.addColorStop(0.12, "rgba(255,226,170,.55)"); grd.addColorStop(0.35, "rgba(255,180,110,.12)"); grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd; g.fillRect(0, 0, size, size);
    g.globalCompositeOperation = "lighter"; g.strokeStyle = "rgba(255,230,190,.10)"; g.lineWidth = 2;
    for (let i = 0; i < 4; i++) { g.beginPath(); const a = i * Math.PI / 4; g.moveTo(r - Math.cos(a) * r, r - Math.sin(a) * r); g.lineTo(r + Math.cos(a) * r, r + Math.sin(a) * r); g.stroke(); }
    return new THREE.CanvasTexture(c);
  }

  const loader = new THREE.TextureLoader();
  const loadTex = url => new Promise((res, rej) => loader.load(url, res, undefined, rej));
  function prepTex(t, repeat = true) {
    t.wrapS = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    t.needsUpdate = true; return t;
  }

  async function init(cv) {
    canvas = cv;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    } catch (e) { return false; }
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(0x03050a, 1);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(FOV, 1, 0.02, 200);
    camera.position.set(...ll2v(127, 30, 3.2));
    controls = new THREE.OrbitControls(camera, canvas);
    Object.assign(controls, { enablePan: false, enableDamping: true, dampingFactor: 0.075, rotateSpeed: 0.45, zoomSpeed: 0.8, minDistance: 1.16, maxDistance: 7 });
    controls.addEventListener("start", () => { interacting = true; anim = null; canvas.classList.add("dragging"); if (G.onUserMove) G.onUserMove(); });
    controls.addEventListener("end", () => { interacting = false; canvas.classList.remove("dragging"); });

    const T = s => "tex/" + s;
    const [day, night, clouds, water, topo, mw] = await Promise.all(
      ["day-2k.jpg", "night-2k.jpg", "clouds-2k.jpg", "water-2k.jpg", "topo-2k.jpg", "milkyway.jpg"].map(f => loadTex(T(f))));
    [day, night, clouds, water, topo, mw].forEach(t => prepTex(t));

    const geo = new THREE.SphereGeometry(1, 200, 100);
    earthU = {
      tDay: { value: day }, tNight: { value: night }, tClouds: { value: clouds }, tWater: { value: water }, tTopo: { value: topo },
      uSun: { value: sun }, uTexel: { value: new THREE.Vector2(1 / 2048, 1 / 1024) }, uShift: { value: 0 }, uExposure: { value: 1.0 }, uBump: { value: 2.6 },
    };
    const earth = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: earthU, vertexShader: SH.earthV, fragmentShader: SH.common + SH.earthF }));
    scene.add(earth);

    cloudU = { tClouds: { value: clouds }, uSun: { value: sun }, uShift: { value: 0 }, uExposure: { value: 1.0 } };
    const cl = new THREE.Mesh(new THREE.SphereGeometry(1.0065, 160, 80), new THREE.ShaderMaterial({
      uniforms: cloudU, vertexShader: SH.earthV, fragmentShader: SH.common + SH.cloudF, transparent: true, depthWrite: false }));
    cl.renderOrder = 1; scene.add(cl);

    atmoU = { uSun: { value: sun }, uR0: { value: 1.0 }, uR1: { value: 1.055 }, uIntensity: { value: 0.42 } };
    const at = new THREE.Mesh(new THREE.SphereGeometry(1.055, 128, 64), new THREE.ShaderMaterial({
      uniforms: atmoU, vertexShader: SH.atmoV, fragmentShader: SH.atmoF, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    at.renderOrder = 4; scene.add(at);

    // the sky is in equatorial coordinates; setTime() turns it by Greenwich sidereal time
    sky = new THREE.Group(); scene.add(sky);
    const mwMesh = new THREE.Mesh(new THREE.SphereGeometry(90, 96, 48), new THREE.ShaderMaterial({
      uniforms: { tMW: { value: mw }, uBright: { value: 0.11 } },
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: SH.mwF, side: THREE.BackSide, depthWrite: false }));
    mwMesh.renderOrder = -2; sky.add(mwMesh);
    fetch("data/sky.json").then(r => r.json()).then(addStars).catch(() => { /* sky without stars */ });

    sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    sunSprite.scale.set(9, 9, 1); scene.add(sunSprite);

    marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture("rgba(255,250,240,1)", "rgba(245,166,91,.55)"), depthWrite: false, transparent: true, sizeAttenuation: false }));
    marker.scale.set(0.034, 0.034, 1); marker.visible = false; marker.renderOrder = 6; scene.add(marker);
    ringU = { uColor: { value: new THREE.Color("#ffd2a1") }, uT: { value: 0 } };
    ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      uniforms: ringU, vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: SH.ringF, transparent: true, depthWrite: false }));
    ring.visible = false; ring.renderOrder = 5; scene.add(ring);
    homeDot = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture("rgba(235,240,250,1)", "rgba(160,190,240,.35)"), depthWrite: false, transparent: true, sizeAttenuation: false }));
    homeDot.scale.set(0.018, 0.018, 1); homeDot.visible = false; homeDot.renderOrder = 6; scene.add(homeDot);

    // picking
    let down = null;
    canvas.addEventListener("pointerdown", e => { down = { x: e.clientX, y: e.clientY }; });
    canvas.addEventListener("pointerup", e => {
      if (!down) return; const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y); down = null;
      if (moved < 6 && G.onPick) { const id = pickAt(e.clientX, e.clientY, 20); G.onPick(id); }
    });
    let hoverT = 0;
    canvas.addEventListener("pointermove", e => {
      if (e.buttons || performance.now() - hoverT < 50) return; hoverT = performance.now();
      const id = pickAt(e.clientX, e.clientY, 14); canvas.style.cursor = id ? "pointer" : "";
      if (G.onHover) G.onHover(id);
    });
    canvas.addEventListener("pointerleave", () => { if (G.onHover) G.onHover(null); });

    new ResizeObserver(() => layout()).observe(canvas);
    window.addEventListener("resize", layout);
    layout();
    G.ok = true;
    renderer.setAnimationLoop(frame);
    return true;
  }

  function bvColor(bv) {
    const stops = [[-0.3, [0.62, 0.72, 1]], [0, [0.8, 0.86, 1]], [0.4, [1, 0.98, 0.95]], [0.8, [1, 0.92, 0.78]], [1.2, [1, 0.8, 0.58]], [1.8, [1, 0.68, 0.45]]];
    if (bv <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) if (bv <= stops[i][0]) { const [a, ca] = stops[i - 1], [b, cb] = stops[i], f = (bv - a) / (b - a); return ca.map((v, k) => lerp(v, cb[k], f)); }
    return stops[stops.length - 1][1];
  }
  function addStars(d) {
    const s = d.stars, n = s.length / 4;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), alpha = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const ra = s[i * 4] / 100, dec = s[i * 4 + 1] / 100, mag = s[i * 4 + 2] / 100, bv = s[i * 4 + 3] / 100;
      pos.set(ll2v(ra, dec, 85), i * 3); col.set(bvColor(bv), i * 3);
      const f = Math.pow(10, -0.4 * (mag + 1.5));
      size[i] = clamp(2.0 + 5.4 * Math.pow(f, 0.25), 1.9, 7.5); alpha[i] = clamp(0.3 + 2.6 * Math.sqrt(f), 0.24, 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1)); g.setAttribute("aAlpha", new THREE.BufferAttribute(alpha, 1));
    const p = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: { uDpr: { value: dpr } }, vertexShader: SH.starV, fragmentShader: SH.starF, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    p.renderOrder = -1; p.frustumCulled = false; sky.add(p);
  }

  const wantBig = () => renderer.capabilities.maxTextureSize >= 4096 && Math.max(screen.width, screen.height) * dpr >= 1600 && !(navigator.connection && navigator.connection.saveData);
  let upgraded = false;
  async function upgrade() {
    if (!G.ok || !wantBig()) return;
    upgraded = true;
    try {
      const [day, night] = await Promise.all(["day-4k.jpg", "night-4k.jpg"].map(f => loadTex("tex/" + f)));
      [day, night].forEach(t => prepTex(t));
      const old = [earthU.tDay.value, earthU.tNight.value];
      earthU.tDay.value = day; earthU.tNight.value = night;
      old.forEach(t => t.dispose());
    } catch (e) { /* keep the 2k set */ }
    if (cloudsAsk) { if (cloudsAsk.large) setClouds(cloudsAsk.small, cloudsAsk.large); return; }
    try { const c = prepTex(await loadTex("tex/clouds-4k.jpg")); if (cloudsAsk) c.dispose(); else swapClouds(c); } catch (e) { /* keep 2k */ }
  }

  // clouds as the satellites saw them last (the live data's clouds.json); they replace the stand-in picture
  // and stop drifting. Same layout as the stand-in: 180°W at the left, brighter is more cloud.
  let realClouds = null, cloudsAsk = null, cloudsReq = 0;
  function swapClouds(t) { const old = earthU.tClouds.value; earthU.tClouds.value = cloudU.tClouds.value = t; if (old !== t) old.dispose(); }
  async function setClouds(small, large) {
    if (!G.ok) return false;
    cloudsAsk = { small, large };
    const req = ++cloudsReq;
    for (const url of upgraded && large ? [large, small] : [small]) {
      try {
        const t = prepTex(await loadTex(url));
        if (req !== cloudsReq) { t.dispose(); return false; }
        realClouds = { small, large };
        swapClouds(t);
        return true;
      } catch (e) { /* try the smaller one */ }
    }
    return false;
  }

  /* ---------- layout & camera ---------- */
  function freeBox() {
    const r = canvas.getBoundingClientRect();
    if (r.width > 860) {
      const L = document.querySelector(".left"), R = document.querySelector(".right");
      const lr = L && L.getBoundingClientRect(), rr = R && R.getBoundingClientRect();
      if (lr && rr && lr.width && rr.width) return { x0: lr.right, x1: rr.left, h: r.height, w: r.width };
    }
    return { x0: 0, x1: r.width, h: r.height, w: r.width };
  }
  function layout() {
    if (!renderer) return;
    const r = canvas.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    const fb = freeBox();
    offsetX = Math.round((fb.x0 + fb.x1) / 2 - W / 2);
    if (offsetX) camera.setViewOffset(W, H, -offsetX, 0, W, H); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }
  // camera distance that makes an angular cap of radius θ (rad) fill `frac` of the free area
  function distFor(theta, frac = 0.42) {
    if (!G.ok) return 3;
    const fb = freeBox(), Rpx = Math.max(120, Math.min(fb.x1 - fb.x0, fb.h) * frac);
    const tb = Math.tan(FOV * D2R / 2) * Rpx / (fb.h / 2);
    const th = Math.min(theta, Math.PI / 2 - 0.05);
    return clamp(Math.cos(th) + Math.sin(th) / tb, 1.2, 6.5);
  }
  const homeDist = () => clamp(distFor(Math.PI / 2, 0.44), 2.2, 6.5);
  function camDir() { return camera.position.clone().normalize(); }
  function flyTo(lon, lat, dist, ms = 1700) {
    if (!G.ok) return;
    const to = new THREE.Vector3(...ll2v(lon, lat)).normalize();
    const d0 = camera.position.length();
    anim = { from: camDir(), to, d0, d1: dist == null ? d0 : dist, t0: performance.now(), ms };
  }
  function goHome() { if (!G.ok) return; const [lo, la] = v2ll(...camDir().toArray()); flyTo(lo, clamp(la, -35, 50), homeDist(), 1300); }
  function zoomBy(f) { if (!G.ok) return; const d = camera.position.length(); const [lo, la] = v2ll(...camDir().toArray()); flyTo(lo, la, clamp(1 + (d - 1) * f, controls.minDistance, controls.maxDistance), 550); }
  function fitPoints(lls, frac = 0.36) {
    if (!lls.length) return;
    let x = 0, y = 0, z = 0; for (const [lo, la] of lls) { const v = ll2v(lo, la); x += v[0]; y += v[1]; z += v[2]; }
    const c = new THREE.Vector3(x, y, z); if (c.length() < 1e-6) c.set(1, 0, 0); c.normalize();
    let th = 0; for (const [lo, la] of lls) { const v = new THREE.Vector3(...ll2v(lo, la)); th = Math.max(th, v.angleTo(c)); }
    const [lo, la] = v2ll(c.x, c.y, c.z);
    flyTo(lo, la, Math.min(distFor(Math.max(th, 0.16), frac), homeDist()));
  }

  function slerpV(a, b, t) {
    const d = clamp(a.dot(b), -1, 1), w = Math.acos(d);
    if (w < 1e-5) return a.clone();
    const s = Math.sin(w);
    return a.clone().multiplyScalar(Math.sin((1 - t) * w) / s).add(b.clone().multiplyScalar(Math.sin(t * w) / s));
  }

  /* ---------- sun ---------- */
  function setTime(ms) {
    const [lo, la] = subsolar(ms);
    sun.set(...ll2v(lo, la)).normalize();
    if (sunSprite) sunSprite.position.copy(sun).multiplyScalar(60);
    if (sky) { const d = ms / DAY - 10957.5; sky.rotation.y = -(((18.697374558 + 24.06570982441908 * d) % 24) * 15) * D2R; }
  }

  /* ---------- tracks ---------- */
  function buildRibbon(A) {
    const P = [], days = [], kms = [];
    const t0 = A.T[0];
    for (let i = 0; i < A.T.length; i++) {
      const v = ll2v(A.X[i], A.Y[i]);
      if (i) {
        const u = P[P.length - 1];
        const ang = Math.acos(clamp(u[0] * v[0] + u[1] * v[1] + u[2] * v[2], -1, 1));
        const steps = Math.ceil(ang / (0.5 * D2R));
        for (let s = 1; s < steps; s++) {
          const f = s / steps, [lo, la] = slerpLL(A.X[i - 1], A.Y[i - 1], A.X[i], A.Y[i], f);
          P.push(ll2v(lo, la)); days.push((lerp(A.T[i - 1], A.T[i], f) - t0) / DAY); kms.push(lerp(A.cum[i - 1], A.cum[i], f));
        }
      }
      P.push(v); days.push((A.T[i] - t0) / DAY); kms.push(A.cum[i]);
    }
    const n = P.length;
    const pos = new Float32Array(n * 6), dir = new Float32Array(n * 6), side = new Float32Array(n * 2), day = new Float32Array(n * 2), km = new Float32Array(n * 2);
    let last = [0, 1, 0];
    for (let i = 0; i < n; i++) {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)], p = P[i];
      let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2];
      let sx = p[1] * tz - p[2] * ty, sy = p[2] * tx - p[0] * tz, sz = p[0] * ty - p[1] * tx;
      const l = Math.hypot(sx, sy, sz);
      if (l > 1e-9) { sx /= l; sy /= l; sz /= l; last = [sx, sy, sz]; } else[sx, sy, sz] = last;
      for (let k = 0; k < 2; k++) {
        const j = i * 2 + k;
        pos.set(p, j * 3); dir.set([sx, sy, sz], j * 3); side[j] = k ? 1 : -1; day[j] = days[i]; km[j] = kms[i];
      }
    }
    const idx = new Uint32Array((n - 1) * 6);
    for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], i * 6); }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aDir", new THREE.BufferAttribute(dir, 3));
    g.setAttribute("aSide", new THREE.BufferAttribute(side, 1));
    g.setAttribute("aDay", new THREE.BufferAttribute(day, 1));
    g.setAttribute("aKm", new THREE.BufferAttribute(km, 1));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.1);
    const u = {
      uColor: { value: new THREE.Color("#f5a65b") }, uNow: { value: 1e9 }, uMeet: { value: -1 }, uOpacity: { value: 1 }, uDash: { value: 40 },
      uHiA: { value: -1 }, uHiB: { value: -2 }, uWidth: { value: 0.004 }, uLift: { value: 1.0025 }, uFresh: { value: 1 },
    };
    const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: u, vertexShader: SH.ribV, fragmentShader: SH.ribF, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    m.renderOrder = 3; m.frustumCulled = false;
    return { mesh: m, u };
  }
  function showTrack(A, o = {}) {
    if (!G.ok) return;
    if (activeRibbon) activeRibbon.mesh.visible = false;
    if (activeFix) activeFix.mesh.visible = false;
    if (!A) { activeRibbon = activeFix = null; return; }
    let f = fixSets.get(A.id);
    if (!f) { f = buildFixes(A); fixSets.set(A.id, f); scene.add(f.mesh); }
    f.mesh.visible = o.fixes !== false; activeFix = f;
    f.u.uNow.value = o.now == null ? 1e9 : (o.now - A.T[0]) / DAY; f.u.uHiA.value = -1; f.u.uHiB.value = -2;
    let r = ribbons.get(A.id);
    if (!r) { r = buildRibbon(A); ribbons.set(A.id, r); scene.add(r.mesh); }
    r.A = A; r.mesh.visible = true; activeRibbon = r;
    r.u.uColor.value.set(o.color || "#f5a65b");
    r.u.uNow.value = o.now == null ? 1e9 : (o.now - A.T[0]) / DAY;
    r.u.uMeet.value = o.meet == null ? -1 : (o.meet - A.T[0]) / DAY;
    r.u.uFresh.value = o.fresh == null ? 1 : o.fresh;
    r.u.uOpacity.value = o.opacity || 1;
    r.u.uHiA.value = -1; r.u.uHiB.value = -2;
  }
  function trackNow(ms) {
    if (activeRibbon) activeRibbon.u.uNow.value = (ms - activeRibbon.A.T[0]) / DAY;
    if (activeFix) activeFix.u.uNow.value = (ms - activeFix.A.T[0]) / DAY;
  }
  function highlight(a, b) {
    for (const r of [activeRibbon, activeFix]) {
      if (!r) continue; const t0 = r.A.T[0];
      r.u.uHiA.value = a == null ? -1 : (a - t0) / DAY; r.u.uHiB.value = b == null ? -2 : (b - t0) / DAY;
    }
  }

  /* ---------- the fixes themselves: where the tag really measured (the ribbon joins them) ---------- */
  const fixSets = new Map(); let activeFix = null;
  function buildFixes(A) {
    const n = A.T.length, pos = new Float32Array(n * 3), day = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos.set(ll2v(A.X[i], A.Y[i], 1.0034), i * 3); day[i] = (A.T[i] - A.T[0]) / DAY; }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("aDay", new THREE.BufferAttribute(day, 1));
    const u = { uNow: { value: 1e9 }, uHiA: { value: -1 }, uHiB: { value: -2 }, uDpr: { value: dpr }, uSize: { value: 3 }, uColor: { value: new THREE.Color("#ffe9cf") } };
    const m = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: u, vertexShader: SH.fixV, fragmentShader: SH.fixF, transparent: true, depthWrite: false }));
    m.renderOrder = 4; m.frustumCulled = false;
    return { mesh: m, u, A };
  }

  /* ---------- other animals tracked at the same moment ---------- */
  let others = null; const othersU = { uTime: { value: 0 }, uDpr: { value: 1 } };
  function setOthers(list) {
    if (!G.ok) return;
    if (!list || !list.length) { if (others) others.visible = false; return; }
    const n = list.length;
    if (!others || others.userData.n !== n) {
      if (others) { scene.remove(others); others.geometry.dispose(); }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(n).fill(8.5), 1));
      g.setAttribute("aPhase", new THREE.BufferAttribute(Float32Array.from({ length: n }, () => Math.random() * 6.28), 1));
      g.setAttribute("aState", new THREE.BufferAttribute(new Float32Array(n), 1));
      othersU.uDpr.value = dpr;
      others = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: othersU, vertexShader: SH.ptV, fragmentShader: SH.ptF, transparent: true, depthWrite: false }));
      others.userData.n = n; others.renderOrder = 5; others.frustumCulled = false; scene.add(others);
    }
    const g = others.geometry, P = g.getAttribute("position"), C = g.getAttribute("color"), S = g.getAttribute("aState"), c = new THREE.Color();
    list.forEach((o, i) => { P.array.set(ll2v(o.lon, o.lat, 1.005), i * 3); c.set(o.color); C.array.set([c.r, c.g, c.b], i * 3); S.array[i] = o.state || 0; });
    P.needsUpdate = C.needsUpdate = S.needsUpdate = true; others.visible = true;
  }

  /* ---------- how far off a fix may be ---------- */
  let disk = null;
  function setErrorDisk(ll, km) {
    if (!G.ok) return;
    if (!disk) {
      disk = new THREE.Mesh(new THREE.CircleGeometry(1, 96), new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color("#ffd2a1") } },
        vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader: SH.diskF, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      disk.renderOrder = 4; scene.add(disk);
    }
    disk.visible = !!ll && km > 0;
    if (!disk.visible) return;
    const th = km / 6371.0088, p = new THREE.Vector3(...ll2v(ll[0], ll[1])).normalize();
    disk.position.copy(p).multiplyScalar(1.002);
    disk.lookAt(p.clone().multiplyScalar(3));
    disk.scale.setScalar(Math.tan(th));
  }

  /* ---------- markers ---------- */
  let markLL = null;
  function setMarker(ll, color) {
    if (!G.ok) return;
    markLL = ll; marker.visible = ring.visible = !!ll;
    if (color) ringU.uColor.value.set(color);
    if (ll) placeMarker();
  }
  function placeMarker() {
    const p = new THREE.Vector3(...ll2v(markLL[0], markLL[1], 1.004));
    marker.position.copy(p);
    ring.position.copy(p.clone().multiplyScalar(1.0005));
    ring.lookAt(p.clone().multiplyScalar(2));
  }
  function setHome(ll) { if (!G.ok) return; homeDot.visible = !!ll; if (ll) homeDot.position.set(...ll2v(ll[0], ll[1], 1.003)); }

  /* ---------- candidates ---------- */
  function setCandidates(list) {
    if (!G.ok) return;
    if (candPts) { scene.remove(candPts); candPts.geometry.dispose(); }
    candIds = list.map(c => c.id); candLL = list.map(c => [c.lon, c.lat]); candIndex = new Map(candIds.map((id, i) => [id, i]));
    const n = list.length, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), ph = new Float32Array(n), st = new Float32Array(n);
    const c = new THREE.Color();
    list.forEach((d, i) => { pos.set(ll2v(d.lon, d.lat, 1.006), i * 3); c.set(d.color); col.set([c.r, c.g, c.b], i * 3); size[i] = 13; ph[i] = Math.random() * 6.28; });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1)); g.setAttribute("aPhase", new THREE.BufferAttribute(ph, 1)); g.setAttribute("aState", new THREE.BufferAttribute(st, 1));
    candPts = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uDpr: { value: dpr } }, vertexShader: SH.ptV, fragmentShader: SH.ptF, transparent: true, depthWrite: false }));
    candPts.renderOrder = 5; candPts.frustumCulled = false; scene.add(candPts);
  }
  function candState(fn) {
    if (!candPts) return;
    const a = candPts.geometry.getAttribute("aState");
    candIds.forEach((id, i) => { a.array[i] = fn(id); }); a.needsUpdate = true;
  }
  function showCandidates(on) { if (candPts) candPts.visible = on; }

  /* ---------- projection & picking ---------- */
  const tmp = new THREE.Vector3();
  function project(lon, lat, r = 1.004) {
    tmp.set(...ll2v(lon, lat, r));
    const facing = tmp.clone().normalize().dot(camera.position.clone().sub(tmp).normalize());
    tmp.project(camera);
    return { x: (tmp.x + 1) / 2 * W, y: (1 - tmp.y) / 2 * H, vis: facing > 0.02 && tmp.z < 1, facing };
  }
  function pickAt(cx, cy, radius) {
    if (!candPts || !candPts.visible) return null;
    const r = canvas.getBoundingClientRect(), x = cx - r.left, y = cy - r.top;
    const st = candPts.geometry.getAttribute("aState").array;
    let best = null, bd = radius;
    candIds.forEach((id, i) => {
      if (st[i] < -0.5) return;
      const p = project(candLL[i][0], candLL[i][1], 1.006); if (!p.vis) return;
      const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = id; }
    });
    return best;
  }

  /* ---------- loop ---------- */
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.1), t = clock.elapsedTime;
    if (anim) {
      const k = clamp((performance.now() - anim.t0) / anim.ms, 0, 1), e = easeInOut(k);
      const ang = anim.from.angleTo(anim.to), dm = Math.max(anim.d0, anim.d1) + Math.min(ang, 2.2) * 0.55 * (ang > 0.35 ? 1 : 0);
      const d = k < .5 ? lerp(anim.d0, dm, easeInOut(k * 2)) : lerp(dm, anim.d1, easeInOut((k - .5) * 2));
      camera.position.copy(slerpV(anim.from, anim.to, e).multiplyScalar(d));
      if (k >= 1) anim = null;
    } else if (followOn && followGet && !interacting) {
      const ll = followGet();
      if (ll) { const to = new THREE.Vector3(...ll2v(ll[0], ll[1])).normalize(); const d = camera.position.length(); camera.position.copy(slerpV(camDir(), to, 1 - Math.exp(-dt * 1.4)).multiplyScalar(d)); }
    }
    const dist = camera.position.length();
    controls.rotateSpeed = clamp((dist - 1) * 0.32, 0.04, 0.6);
    controls.update();
    // ribbon width ≈ 4 css px at the surface under the camera
    const px = (dist - 1) * 2 * Math.tan(FOV * D2R / 2) / H;
    if (activeRibbon) { activeRibbon.u.uWidth.value = px * 4.2; activeRibbon.u.uDash.value = Math.max(2, px * 6371 * 9); }
    if (ring.visible) { const s = px * 46; ring.scale.set(s, s, s); ringU.uT.value = t; }
    if (markLL) placeMarker();
    cloudU.uShift.value = earthU.uShift.value = realClouds ? 0 : (t * 0.0000045) % 1;
    if (candPts) candPts.material.uniforms.uTime.value = t;
    othersU.uTime.value = t;
    if (activeFix) activeFix.u.uSize.value = clamp(4.9 - dist * 0.55, 2.2, 4.3);
    if (G.onFrame) G.onFrame(dt, t);
    renderer.render(scene, camera);
  }

  Object.assign(G, {
    init, upgrade, layout, flyTo, goHome, zoomBy, fitPoints, setTime, showTrack, trackNow, highlight, setMarker, setHome,
    setCandidates, candState, showCandidates, project, homeDist, distFor, setOthers, setErrorDisk, setClouds,
    setFollow(on, get) { followOn = on; if (get) followGet = get; },
    camDistance: () => camera ? camera.position.length() : 3,
  });
  // a live getter (Object.assign would copy its value once)
  Object.defineProperty(G, "following", { get: () => followOn });
  return G;
})();
