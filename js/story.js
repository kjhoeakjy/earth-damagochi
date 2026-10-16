/* ============================================================
   Story — what each day of a record holds, from the data alone: the tag's fixes (time, place,
   accuracy), its status messages, and what follows from them by arithmetic and astronomy
   (distance, speed, day and night where the animal was, the moon). Nothing is imagined.
   Also what the owner does with it: passport stamps, badges, visits, their own notes.
   ============================================================ */
const Story = (() => {
  const SEOUL = [126.98, 37.57];
  const DARK = -0.833;                // sun's upper edge on the horizon, with refraction
  const NIGHT_SPAN = 8 * HOUR;        // only stretches this short are split into day and night
  const LINES = [[0, "적도"], [23.44, "북회귀선"], [-23.44, "남회귀선"], [66.56, "북극권"], [-66.56, "남극권"]];
  const hm = min => { const h = Math.floor(min / 60), m = Math.round(min % 60); return (h ? h + "시간" : "") + (m || !h ? (h ? " " : "") + m + "분" : ""); };
  const pct = x => Math.round(x * 100);
  const erFmt = m => m >= 1000 ? fmt(m / 1000, m >= 10000 ? 0 : 1) + "km" : Math.round(m) + "m";
  const llFmt = (lon, lat) => `${lat >= 0 ? "북위" : "남위"} ${Math.abs(lat).toFixed(2)}° · ${lon >= 0 ? "동경" : "서경"} ${Math.abs(lon).toFixed(2)}°`;
  function agoKo(ms) {
    const m = Math.round(ms / MIN);
    if (m < 1) return "방금";
    if (m < 60) return m + "분 전";
    if (m < 6 * 60) return hm(m) + " 전";
    if (m < 48 * 60) return Math.round(m / 60) + "시간 전";
    return Math.round(m / 1440) + "일 전";
  }

  function petClock(pet, A, now = Date.now()) {
    const t = pet.anchorTrack + (now - pet.anchorReal) * pet.pace;
    return clamp(t, A.T[0], A.t1);
  }
  const meetDay = (pet, A) => dayIndexAt(A, pet.anchorTrack);
  const ended = (pet, A, now = Date.now()) => pet.anchorTrack + (now - pet.anchorReal) * pet.pace >= A.t1;

  /* ---------- sun & moon where the animal is ---------- */
  // local mean solar time (minutes after midnight): what a sundial there would read, no time zones
  const solarMin = (ms, lon) => ((((ms + lon / 15 * HOUR) % DAY) + DAY) % DAY) / MIN;
  const clock24 = min => { const m = Math.round(min) % 1440; return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); };
  // sunrise before and sunset after the local solar noon nearest ms
  function sunTimes(lon, lat, ms) {
    const noon = midnightUTC(ms) + (12 - lon / 15) * HOUR, f = t => sunAlt(lon, lat, t) - DARK, step = 15 * MIN;
    const cross = (a, b) => { const fa = f(a) < 0; for (let i = 0; i < 20; i++) { const m = (a + b) / 2; if ((f(m) < 0) === fa) a = m; else b = m; } return (a + b) / 2; };
    let rise = null, set = null, pv = f(noon - 12 * HOUR);
    for (let t = noon - 12 * HOUR + step; t <= noon + 12 * HOUR + 1; t += step) {
      const v = f(t);
      if (pv < 0 && v >= 0 && t <= noon) rise = cross(t - step, t);
      if (pv >= 0 && v < 0 && t > noon && set == null) set = cross(t - step, t);
      pv = v;
    }
    return { rise, set, noon, noonAlt: sunAlt(lon, lat, noon) };
  }
  const TERMS = [[0, "춘분"], [90, "하지"], [180, "추분"], [270, "동지"]];
  // the solstice or equinox that falls in [s, e), with its moment
  function solarTerm(s, e) {
    const a = sunLongitude(s), b = sunLongitude(e);
    for (const [deg, name] of TERMS) {
      if ((a - deg + 360) % 360 > 350 && (b - deg + 360) % 360 < 10) {
        let lo = s, hi = e;
        for (let i = 0; i < 28; i++) { const m = (lo + hi) / 2; if ((sunLongitude(m) - deg + 360) % 360 > 180) lo = m; else hi = m; }
        return { name, deg, t: (lo + hi) / 2 };
      }
    }
    return null;
  }
  function termNote(term, lat) {
    if (term.deg === 0 || term.deg === 180) return "낮과 밤 길이가 거의 같음";
    const longest = (term.deg === 90) === (lat >= 0);
    return `${lat >= 0 ? "북" : "남"}반구 낮이 가장 ${longest ? "긴" : "짧은"} 날`;
  }
  const moonInfo = ms => { const p = moonPhase(ms); return { p, illum: (1 - Math.cos(2 * Math.PI * p)) / 2, waxing: p < .5, name: moonName(p) }; };

  /* ---------- stretches between fixes ---------- */
  const minGap = (A, i) => (QUAL[A.QS[i]].r < 10 && QUAL[A.QS[i + 1]].r < 10 ? .75 : 2) * HOUR;
  // the straight stretch from fix i to fix i+1: length, hours, share of it in the dark there, average speed
  function seg(A, i) {
    const C = A.segC || (A.segC = new Array(A.T.length - 1));
    if (C[i]) return C[i];
    const dt = A.T[i + 1] - A.T[i], km = A.cum[i + 1] - A.cum[i];
    const s = { km, h: dt / HOUR, night: null, v: null };
    if (dt > 0 && dt <= NIGHT_SPAN) {
      const m = Math.max(1, Math.ceil(dt / HOUR)); let dark = 0;
      for (let q = 0; q < m; q++) {
        const f = (q + .5) / m, [lo, la] = slerpLL(A.X[i], A.Y[i], A.X[i + 1], A.Y[i + 1], f);
        if (sunAlt(lo, la, A.T[i] + dt * f) < DARK) dark++;
      }
      s.night = dark / m;
    }
    if (!A.coarse && dt >= minGap(A, i)) s.v = km / (dt / HOUR);
    return (C[i] = s);
  }
  // first fix index of every place the animal entered
  function firstIdx(A) {
    if (A.firstPl) return A.firstPl;
    const m = new Map();
    for (const [i, c] of A.pl) if (c >= 0 && !m.has(c)) m.set(c, i);
    return (A.firstPl = m);
  }
  const homeKm = (A, i) => hav(A.X[0], A.Y[0], A.X[i], A.Y[i]);

  /* ---------- one day ---------- */
  // per-day values that never change (cached on the day)
  function digest(A, k) {
    const D = buildDays(A), d = D[k];
    if (d.dg) return d;
    d.dg = true;
    const mid = d.s + 12 * HOUR;
    d.light = daylight(d.lon, d.lat, mid);
    d.seoul = daylight(SEOUL[0], SEOUL[1], mid);
    d.sun = sunTimes(d.lon, d.lat, mid);
    d.moon = moonInfo(d.s + 21 * HOUR);
    d.term = solarTerm(d.s, d.e);
    return d;
  }

  /* Everything day k holds, cut at `upto` (the pet's clock) so today shows only what has already happened. */
  function day(A, k, upto = Infinity) {
    const D = buildDays(A), d = digest(A, k), n = A.T.length;
    const e = Math.min(d.e, upto), b = Math.max(d.a, Math.min(d.b, upto)), partial = upto < d.e;
    const fx = [];
    for (let i = Math.max(0, idxAt(A, d.s - 1) + 1); i < n && A.T[i] < e; i++) if (A.T[i] >= d.s) fx.push(i);
    const st = A.status.filter(m => m.t >= d.s && m.t < e);
    let raw = 0, q = null, er = 0;
    for (const i of fx) {
      raw += A.NF[i]; const c = A.QS[i];
      if (!q || QUAL[c].r < QUAL[q].r) q = c;
      if (A.ER && A.ER[i] > 0) er = er ? Math.min(er, A.ER[i]) : A.ER[i];
    }
    const km = kmAt(A, b) - kmAt(A, d.a);
    // stretches inside the day: split by the dark, and the fastest one
    let tot = 0, meas = 0, night = 0, fast = null;
    const cross = [];
    for (let i = Math.max(0, idxAt(A, d.a)); i < n - 1 && A.T[i] < b; i++) {
      const g = seg(A, i), t0 = Math.max(A.T[i], d.a), t1 = Math.min(A.T[i + 1], b);
      if (t1 > t0) {
        const part = g.km * (t1 - t0) / (A.T[i + 1] - A.T[i]);
        tot += part;
        if (g.night != null) { meas += part; night += part * g.night; }
        if (g.v != null && A.T[i] >= d.s && A.T[i + 1] <= b && (!fast || g.v > fast.v)) fast = { v: g.v, i };
      }
      const y0 = A.Y[i], y1 = A.Y[i + 1];
      for (const [v, name] of LINES) if ((y0 - v) * (y1 - v) < 0) {
        const t = A.T[i] + (v - y0) / (y1 - y0) * (A.T[i + 1] - A.T[i]);
        if (t >= d.a && t < b) cross.push({ name, t, gap: A.T[i + 1] - A.T[i], north: y1 > y0 });
      }
    }
    // places entered for the first time
    const F = firstIdx(A), newPl = [];
    for (const [c, i] of F) if ((k === 0 || A.T[i] >= d.s) && A.T[i] < e) newPl.push(c);
    // the last fix up to the end of this (partial) day, maybe from an earlier day
    const li = idxAt(A, e - 1);
    let farBefore = 0; for (let i = 0; i < (fx.length ? fx[0] : 0); i++) farBefore = Math.max(farBefore, homeKm(A, i));
    let farIn = 0; for (const i of fx) farIn = Math.max(farIn, homeKm(A, i));
    const home = li >= 0 ? homeKm(A, li) : 0;
    const step = A.km > 8000 ? 5000 : 1000, kmA = kmAt(A, d.a), kmB = kmAt(A, b);
    const milestone = Math.floor(kmB / step) > Math.floor(kmA / step) && kmB >= step ? Math.floor(kmB / step) * step : 0;
    const lastDay = upto >= A.t1 && A.t1 >= d.s && A.t1 < d.e;
    return {
      d, k, partial, upto: Math.min(upto, d.e), fx, st, raw, q, er, km, tot, meas, night, fast, cross, newPl, li, home,
      far: farIn > farBefore * 1.02 && farIn > 200 && k > 0 ? farIn : 0,
      milestone, backHome: home < 120 && farBefore > 1000 && fx.length > 0,
      season: A.se && li >= 0 ? runAt(A.se, li) : null,
      first: k === 0, last: lastDay,
    };
  }

  /* the observation card for a day: highlights, then sections of [label, value, note] rows */
  function card(pet, A, k, upto) {
    const x = day(A, k, upto), d = x.d, S = A.S, rows = { pos: [], move: [], sig: [], sky: [] }, hl = [];
    const p = x.li >= 0 ? { lon: A.X[x.li], lat: A.Y[x.li] } : { lon: d.lon, lat: d.lat };
    const pl = x.li >= 0 ? runAt(A.pl, x.li) : d.pl, rg = x.li >= 0 ? runAt(A.rg, x.li) : d.rg, ci = x.li >= 0 ? runAt(A.ci, x.li) : d.ci;
    const place = placeName(pl), region = regionName(rg), city = cityName(ci);

    // highlights
    if (x.first) hl.push(["tag", `태그 부착 · 첫 기록 ${timeKo(A.T[0])}`]);
    for (const c of x.newPl) hl.push(["stamp", x.first && c === runAt(A.pl, 0) ? `${placeName(c)}에서 기록 시작` : `${placeName(c)} 첫 진입`]);
    for (const c of x.cross) hl.push(["line", `${c.name} 통과 · ${timeKo(c.t)}쯤${c.gap > 6 * HOUR ? ` (기록 간격 ${hm(c.gap / MIN)})` : ""}`]);
    if (x.far) hl.push(["pin", `출발지에서 가장 먼 거리 경신 · ${kmFmt(x.far)}km`]);
    if (x.milestone) hl.push(["route", `누적 이동 ${fmt(x.milestone)}km 넘음`]);
    if (x.backHome) hl.push(["home", "출발지 120km 안으로 돌아옴"]);
    for (const m of x.st) if (m.c !== "a") hl.push(["warn", `${timeKo(m.t)} 태그 상태 신호 '${MORT[m.c]}'`]);
    if (d.term) hl.push(["sun", `${d.term.name} · ${termNote(d.term, p.lat)}`]);
    if (!x.fx.length && !x.first) hl.push(["none", x.partial ? "오늘은 아직 위치 기록 없음" : "위치 기록 없음"]);
    if (x.last) hl.push(["end", `마지막 기록 · ${timeKo(A.t1)}`]);

    // position: where the tag last measured; today, also where the map's marker stands between two fixes
    const now = x.partial && x.li >= 0 ? posAt(A, x.upto) : null, off = now ? hav(p.lon, p.lat, now.lon, now.lat) : 0;
    if (off >= 10) rows.pos.push(["지금 추정", `마지막 기록에서 ${compass(bearing(p.lon, p.lat, now.lon, now.lat))}으로 ${kmFmt(off)}km`, "두 기록 사이를 직선으로 이어 추정"]);
    rows.pos.push([off >= 10 ? "기록된 곳" : "장소", [place, region].filter(Boolean).join(" · ") || "이름 없는 곳", city ? `${city} 근처` : ""]);
    rows.pos.push(["좌표", llFmt(p.lon, p.lat), x.li >= 0 ? `${A.T[x.li] < d.s ? dateKo(A.T[x.li], false) + " " : ""}${timeKo(A.T[x.li])} 측정` : ""]);
    if (off >= 10) rows.pos.push(["출발지에서", kmFmt(hav(A.X[0], A.Y[0], now.lon, now.lat)) + "km", `마지막 기록 때 ${kmFmt(x.home)}km`]);
    else rows.pos.push(["출발지에서", kmFmt(x.home) + "km", A.home]);
    if (x.q) rows.pos.push(["정확도", `${QUAL[x.q].kind} · ${QUAL[x.q].txt}`, x.er ? `오차 반경 ${erFmt(x.er)}` : ""]);

    // movement
    if (x.fx.length || x.km > .05) {
      rows.move.push(["이동 거리", kmFmt(x.km) + "km", x.partial ? "지금까지" : ""]);
      const a = posAt(A, d.a), z = posAt(A, x.partial ? x.upto : d.b), disp = hav(a.lon, a.lat, z.lon, z.lat);
      if (disp > 15) rows.move.push(["방향", `${compass(bearing(a.lon, a.lat, z.lon, z.lat))}으로 ${kmFmt(disp)}km`, ""]);
      if (x.fast) rows.move.push(["가장 빠른 구간", `시속 ${fmt(x.fast.v, x.fast.v < 10 ? 1 : 0)}km`, `${timeKo(A.T[x.fast.i])}~${timeKo(A.T[x.fast.i + 1])} 평균`]);
      if (x.meas > 1 && x.meas > x.tot * .5) rows.move.push(["해 진 뒤 이동", pct(x.night / x.meas) + "%", ""]);
    }

    // signal
    rows.sig.push(["위치 기록", x.raw ? `${x.raw}번` : "없음", x.raw > x.fx.length ? `지도에는 ${x.fx.length}개 지점` : ""]);
    if (x.li >= 0 && (x.partial || !x.fx.length)) rows.sig.push(["마지막 기록", agoKo(x.upto - A.T[x.li]), `${dateKo(A.T[x.li], false)} ${timeKo(A.T[x.li])}`]);
    for (const m of x.st) rows.sig.push([`태그 상태 ${timeKo(m.t)}`, `${MORT_KO[m.c]} (${MORT[m.c]})`, `배터리 ${fmt(m.v)}mV`]);
    if (x.season) rows.sig.push(["연구자 표시", `${SEASON_KO[x.season]} 서식지`, ""]);

    // sky
    const sun = d.sun;
    if (d.light >= 1440) rows.sky.push(["낮 길이", "24시간", "백야"]);
    else if (d.light <= 0) rows.sky.push(["낮 길이", "0시간", "극야"]);
    else {
      const diff = d.light - d.seoul;
      rows.sky.push(["낮 길이", hm(d.light), Math.abs(diff) >= 10 ? `서울보다 ${hm(Math.abs(diff))} ${diff > 0 ? "길어요" : "짧아요"}` : "서울과 비슷"]);
      if (sun.rise != null && sun.set != null) rows.sky.push(["해 뜸 · 해 짐", `${clock24(solarMin(sun.rise, d.lon))} · ${clock24(solarMin(sun.set, d.lon))}`, "현지 태양시"]);
    }
    rows.sky.push(["한낮 해 높이", Math.round(sun.noonAlt) + "°", ""]);
    rows.sky.push(["달", `${pct(d.moon.illum)}% 밝음`, d.moon.name || (d.moon.waxing ? "차오르는 중" : "기우는 중")]);

    // first day: the tagging; last day: how the record ends
    const tagRows = x.first ? tagging(A) : null;
    const endRows = x.last ? ending(A) : null;
    return { x, hl, rows, tagRows, endRows, strip: strip(A, d, x) };
  }

  // 24 hours of the viewer's clock: day and night where the animal was, fixes, status messages
  function strip(A, d, x) {
    const L = d.e - d.s, out = { bands: [], fixes: [], st: [], before: 0, after: 1, now: x.partial ? (x.upto - d.s) / L : null };
    const N = 96; let prev = null, x0 = 0;
    for (let j = 0; j <= N; j++) {
      const t = d.s + L * Math.min(j, N - .001) / N, p = posAt(A, t), alt = sunAlt(p.lon, p.lat, t);
      const kind = alt > DARK ? "day" : alt > -6 ? "twi" : "night";
      if (kind !== prev || j === N) { if (prev) out.bands.push([x0, j / N, prev]); prev = kind; x0 = j / N; }
    }
    if (A.T[0] > d.s) out.before = (A.T[0] - d.s) / L;
    if (A.t1 < d.e) out.after = (A.t1 - d.s) / L;
    for (const i of x.fx) out.fixes.push([(A.T[i] - d.s) / L, A.QS[i], A.T[i]]);
    for (const m of x.st) out.st.push([(m.t - d.s) / L, m.c, m.t]);
    return out;
  }

  const METHOD = {
    icarus: "저장해 둔 위치를 국제우주정거장이 지나갈 때 한꺼번에 받아요.",
    gps: "태그가 위성 신호로 직접 재요.",
    argos: "태그의 전파를 위성이 받아 계산해요. 등급이 높을수록 정확해요.",
    fastloc: "물 위로 나온 짧은 순간 위성 신호를 잡아 계산해요.",
    light: "낮 길이로 위도를, 한낮 시각으로 경도를 계산해요. 오차가 커요.",
  };
  function tagging(A) {
    const r = [["첫 기록", `${dateKo(A.T[0])} ${timeKo(A.T[0])}`, llFmt(A.X[0], A.Y[0])], ["재는 방법", A.loc, METHOD[A.method]]];
    if (A.sex || A.ageText) r.push(["개체", [A.sex === "f" ? "암컷" : A.sex === "m" ? "수컷" : "", A.ageText].filter(Boolean).join(" · "), A.withCalf ? "새끼 동반" : ""]);
    if (A.herd) r.push(["무리", `${A.herd[0]} 무리`, A.herd[1]]);
    if (A.deployNote) r.push(["포획 메모", A.deployNote, "연구자 원문"]);
    if (A.instr) r.push(["태그", `${A.instr} · PTT ${A.ptt}`, "Wildlife Computers"]);
    const s0 = A.status[0];
    if (s0) r.push(["첫 상태 신호", `${MORT_KO[s0.c]} (${MORT[s0.c]})`, `${dateKo(s0.t, false)} · 배터리 ${fmt(s0.v)}mV`]);
    return r;
  }
  function ending(A) {
    const r = [["마지막 기록", `${dateKo(A.t1)} ${timeKo(A.t1)}`, llFmt(A.X[A.T.length - 1], A.Y[A.T.length - 1])]];
    if (A.frozen) {
      const after = A.status.filter(m => m.t > A.t1), cnt = {};
      for (const m of after) cnt[m.c] = (cnt[m.c] || 0) + 1;
      r.push(["그 뒤", `${fmt(A.frozen.days, 0)}일 동안 같은 자리 위치만 수신`, "지도에서는 뺐어요"]);
      if (after.length) r.push(["그동안 상태 신호", `${after.length}번`, Object.keys(cnt).map(c => `${MORT[c]} ${cnt[c]}번`).join(", ")]);
    }
    const ls = A.status.filter(m => m.t <= (A.frozen ? A.frozen.until : A.t1)).pop();
    if (ls && !A.frozen) r.push(["마지막 상태 신호", `${MORT_KO[ls.c]} (${MORT[ls.c]})`, `${dateKo(ls.t, false)} · 배터리 ${fmt(ls.v)}mV`]);
    if (A.deployOff) r.push(["끝난 방식", A.deployOff.map(([ko, c]) => c ? `${ko} (${c})` : ko).join(", "), "연구자 기록"]);
    else if (!A.frozen) r.push(["끝난 이유", "기록 없음", ""]);
    return r;
  }

  /* ---------- the whole record so far ---------- */
  function qualMix(A, n = A.T.length) {
    const c = {}; for (let i = 0; i < n; i++) c[A.QS[i]] = (c[A.QS[i]] || 0) + 1;
    return Object.keys(c).sort((a, b) => QUAL[a].r - QUAL[b].r).map(k => ({ c: k, n: c[k], f: c[k] / n, ...QUAL[k] }));
  }
  function records(A, upto) {
    const n = idxAt(A, upto) + 1, D = buildDays(A), K = dayIndexAt(A, upto), R = {};
    let best = null;
    for (let k = 0; k <= K; k++) {
      const d = D[k], km = k === K ? kmAt(A, Math.min(d.b, upto)) - kmAt(A, d.a) : d.km;
      if (d.fixes && (!best || km > best.km)) best = { k, km };
    }
    R.day = best;
    let fast = null, N = 0, S = 0, far = 0, meas = 0, night = 0, tot = 0, gap = null;
    for (let i = 0; i < n; i++) {
      if (A.Y[i] > A.Y[N]) N = i; if (A.Y[i] < A.Y[S]) S = i;
      if (homeKm(A, i) > homeKm(A, far)) far = i;
      if (i + 1 < n) {
        const g = seg(A, i);
        if (g.v != null && (!fast || g.v > fast.v)) fast = { v: g.v, i };
        tot += g.km;
        if (g.night != null) { meas += g.km; night += g.km * g.night; }
        const dt = A.T[i + 1] - A.T[i]; if (!gap || dt > gap.dt) gap = { dt, i };
      }
    }
    Object.assign(R, { fast, north: N, south: S, far, meas, night, tot, gap, n });
    R.raw = 0; for (let i = 0; i < n; i++) R.raw += A.NF[i];
    R.empty = 0; for (let k = 0; k < K; k++) if (!D[k].fixes) R.empty++;
    return R;
  }
  // places it stayed: fixes that kept within R km of where the stay began, for at least minDays
  function stays(A, upto, R = 25, minDays = 3) {
    const n = idxAt(A, upto) + 1, out = [];
    let i = 0;
    while (i < n) {
      let j = i;
      while (j + 1 < n && hav(A.X[i], A.Y[i], A.X[j + 1], A.Y[j + 1]) <= R) j++;
      if (j > i && A.T[j] - A.T[i] >= minDays * DAY) {
        let sx = 0, sy = 0, sz = 0;
        for (let q = i; q <= j; q++) { const v = ll2v(A.X[q], A.Y[q]); sx += v[0]; sy += v[1]; sz += v[2]; }
        const [lon, lat] = v2ll(sx, sy, sz), mid = (i + j) >> 1;
        out.push({ i, j, t0: A.T[i], t1: A.T[j], lon, lat, days: (A.T[j] - A.T[i]) / DAY, nfix: j - i + 1, pl: runAt(A.pl, mid), rg: runAt(A.rg, mid), ci: runAt(A.ci, mid), open: j === n - 1 && n < A.T.length });
        i = j + 1;
      } else i++;
    }
    return out;
  }
  // what the tag sent, up to the pet's clock
  function signal(A, upto) {
    const n = idxAt(A, upto) + 1, D = buildDays(A), K = dayIndexAt(A, upto);
    const perDay = [];
    for (let k = 0; k <= K; k++) {
      if (k < K) { perDay.push(D[k].raw); continue; }
      let r = 0; for (let i = Math.max(0, idxAt(A, D[k].s - 1) + 1); i < n; i++) if (A.T[i] >= D[k].s) r += A.NF[i];
      perDay.push(r);
    }
    const out = { n, perDay, mix: qualMix(A, n), st: A.status.filter(m => m.t <= upto), since: n ? upto - A.T[n - 1] : 0 };
    let gap = null; for (let i = 0; i + 1 < n; i++) { const dt = A.T[i + 1] - A.T[i]; if (!gap || dt > gap.dt) gap = { dt, i }; }
    out.gap = gap;
    if (A.ER) {
      const v = []; for (let i = 0; i < n; i++) if (A.ER[i] > 0) v.push(A.ER[i]);
      v.sort((a, b) => a - b);
      if (v.length) out.er = { med: v[v.length >> 1], min: v[0], max: v[v.length - 1] };
    }
    if (A.se) {
      const runs = [];
      for (const [i, c] of A.se) { if (i >= n) break; if (runs.length) runs[runs.length - 1].j = i - 1; runs.push({ c, i, j: n - 1 }); }
      for (const r of runs) { r.t0 = A.T[r.i]; r.t1 = A.T[r.j]; }
      const cen = c => { let sx = 0, sy = 0, sz = 0, m = 0; for (const r of runs) if (r.c === c) for (let q = r.i; q <= r.j; q++) { const v = ll2v(A.X[q], A.Y[q]); sx += v[0]; sy += v[1]; sz += v[2]; m++; } return m ? v2ll(sx, sy, sz) : null; };
      const s = cen("S"), w = cen("W");
      out.seasons = { runs, s, w, km: s && w ? hav(s[0], s[1], w[0], w[1]) : null };
    }
    return out;
  }
  // other animals that were being tracked at the same moment
  function companions(A, t) {
    const me = posAt(A, t);
    return DB.animals.filter(B => B !== A && B.T[0] <= t && t <= B.t1).map(B => {
      const p = posAt(B, t);
      return { B, lon: p.lon, lat: p.lat, km: hav(me.lon, me.lat, p.lon, p.lat), same: B.src === A.src, pl: runAt(B.pl, nearestIdx(B, t)) };
    }).sort((a, b) => (b.same - a.same) || a.km - b.km);
  }
  // what the record holds; `upto` keeps a running record from counting what hasn't arrived yet
  function contents(A, upto = Infinity) {
    const live = upto < A.t1, nSt = live ? A.status.filter(m => m.t <= upto).length : A.status.length;
    const r = [["위치 기록", `원본 ${fmt(A.rawN)}개`, A.rawN > A.n ? `지도에는 ${fmt(A.n)}개 지점` : ""]];
    r.push(["재는 방법", A.loc, METHOD[A.method]]);
    if (A.ER) { const s = signal(A, Math.min(upto, A.t1)).er; if (s) r.push(["오차 반경", `${live ? "지금까지 " : ""}중간값 ${erFmt(s.med)}`, `${erFmt(s.min)} ~ ${erFmt(s.max)}`]); }
    if (A.status.length) r.push(["태그 상태 신호", live ? `지금까지 ${nSt}번` : `${nSt}번`, "배터리 전압 · alive/dead 등"]);
    if (A.se) r.push(["계절 표시", "위치마다 여름·겨울", "연구자 표시"]);
    if (A.herd) r.push(["무리", `${A.herd[0]} (${A.herd[1]})`, A.withCalf ? "새끼 동반" : ""]);
    if (A.deployNote) r.push(["포획 메모", A.deployNote, "연구자 원문"]);
    if (A.instr) r.push(["태그 기종", `${A.instr} · PTT ${A.ptt}`, ""]);
    return r;
  }

  /* ---------- passport ---------- */
  function stamps(A, upto) {
    const out = [];
    for (const [c, i] of firstIdx(A)) if (A.T[i] <= upto) out.push({ c, k: dayIndexAt(A, A.T[i]), s: A.T[i] });
    return out.sort((a, b) => a.s - b.s);
  }
  const KCOL = { sea: "#63d2de", lake: "#8fb8ff", land: "#f5a65b" };
  function stampSVG(code, ms, seed, first) {
    const r = rng(seed), name = placeName(code), kind = placeKind(code), col = KCOL[kind] || "#f5a65b";
    const rot = (r() * 22 - 11).toFixed(1), id = "sp" + seed;
    const icon = kind === "sea" ? `<path d="M38 64c4-4 8-4 12 0s8 4 12 0 8-4 12 0 8 4 12 0" fill="none" stroke="${col}" stroke-width="2.4" stroke-linecap="round"/><path d="M42 72c4-4 8-4 12 0s8 4 12 0 8-4 12 0" fill="none" stroke="${col}" stroke-width="2" stroke-linecap="round" opacity=".6"/>`
      : kind === "lake" ? `<ellipse cx="60" cy="66" rx="20" ry="7" fill="none" stroke="${col}" stroke-width="2.2"/><ellipse cx="60" cy="66" rx="10" ry="3.4" fill="none" stroke="${col}" stroke-width="1.8" opacity=".7"/>`
        : `<path d="M36 74l14-20 8 10 7-8 13 18z" fill="none" stroke="${col}" stroke-width="2.4" stroke-linejoin="round"/>`;
    const fs = name.length > 9 ? 9 : name.length > 6 ? 10.5 : 12;
    const date = new Date(ms), ds = `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`;
    return `<svg viewBox="0 0 120 120" role="img" aria-label="${esc(name)} 도장, ${esc(dateKo(ms))}"><g transform="rotate(${rot} 60 60)" opacity=".92">
      <circle cx="60" cy="60" r="52" fill="rgba(255,255,255,.02)" stroke="${col}" stroke-width="2.6"/>
      <circle cx="60" cy="60" r="45" fill="none" stroke="${col}" stroke-width="1.1" stroke-dasharray="2 3"/>
      <path id="${id}" d="M22 60a38 38 0 1 1 76 0" fill="none"/>
      <text font-family="IBM Plex Sans KR, sans-serif" font-size="${fs}" font-weight="600" fill="${col}" letter-spacing=".5"><textPath href="#${id}" startOffset="50%" text-anchor="middle">${esc(name)}</textPath></text>
      ${icon}
      <text x="60" y="94" font-family="IBM Plex Mono, monospace" font-size="8.5" fill="${col}" text-anchor="middle" letter-spacing=".6">${first ? "출발 " : ""}${ds}</text>
    </g></svg>`;
  }

  /* ---------- badges ---------- */
  const ICON = {
    sun: '<circle cx="14" cy="14" r="5"/><path d="M14 3v3M14 22v3M3 14h3M22 14h3M6.2 6.2l2 2M19.8 19.8l2 2M6.2 21.8l2-2M19.8 8.2l2-2"/>',
    cal: '<rect x="4" y="6" width="20" height="18" rx="3"/><path d="M4 11h20M9 3v5M19 3v5"/>',
    pen: '<path d="M5 23l3.5-1 12-12-2.5-2.5-12 12z"/><path d="M16.5 7.5l2.5 2.5"/>',
    route: '<circle cx="7" cy="21" r="2.5"/><circle cx="21" cy="7" r="2.5"/><path d="M9.5 21H17a3.5 3.5 0 0 0 0-7h-6a3.5 3.5 0 0 1 0-7h7.5"/>',
    globe: '<circle cx="14" cy="14" r="10"/><path d="M4 14h20M14 4c3 3 4.4 6.4 4.4 10S17 21 14 24c-3-3-4.4-6.4-4.4-10S11 7 14 4z"/>',
    stamp: '<circle cx="14" cy="14" r="10"/><circle cx="14" cy="14" r="6.5" stroke-dasharray="2 2"/>',
    line: '<path d="M3 14h22" stroke-dasharray="3 2"/><path d="M10 8l4-4 4 4M10 20l4 4 4-4"/>',
    pin: '<path d="M14 25s-8-7.5-8-13a8 8 0 0 1 16 0c0 5.5-8 13-8 13z"/><circle cx="14" cy="12" r="2.8"/>',
    star: '<path d="M14 3.5l3.2 6.6 7.2 1-5.2 5 1.3 7.2L14 19.9l-6.5 3.4 1.3-7.2-5.2-5 7.2-1z"/>',
  };
  const BADGES = [
    ["visit3", "3일 연속 방문", "사흘 연속으로 열어 봄", "sun"],
    ["week", "7일 방문", "서로 다른 7일에 열어 봄", "cal"],
    ["memo3", "메모 3개", "일지에 메모 3개", "pen"],
    ["km1k", "1,000km", "입양 후 이동 거리", "route"],
    ["km10k", "10,000km", "입양 후 이동 거리", "globe"],
    ["stamp3", "새 장소 3곳", "입양 후 처음 들어간 나라·바다", "stamp"],
    ["line", "위도선 통과", "적도·회귀선·극권 중 하나", "line"],
    ["far", "가장 먼 곳", "입양 후 출발지에서 가장 먼 지점 도달", "pin"],
    ["end", "기록 끝까지", "마지막 기록까지 따라감", "star"],
  ];
  function badges(pet, A, upto, isEnded) {
    const D = buildDays(A), m = meetDay(pet, A), b = pet.bond || {}, t0 = pet.anchorTrack;
    const kmTogether = Math.max(0, kmAt(A, upto) - kmAt(A, t0));
    let far = 0; for (let i = 1; i < A.T.length; i++) if (homeKm(A, i) > homeKm(A, far)) far = i;
    const farT = A.T[far];
    let crossed = false;
    for (let i = Math.max(0, idxAt(A, t0)); i < A.T.length - 1 && A.T[i] < upto && !crossed; i++)
      for (const [v] of LINES) if ((A.Y[i] - v) * (A.Y[i + 1] - v) < 0) { const t = A.T[i] + (v - A.Y[i]) / (A.Y[i + 1] - A.Y[i]) * (A.T[i + 1] - A.T[i]); if (t >= t0 && t <= upto) crossed = true; }
    const got = {
      visit3: (b.bestStreak || b.streak || 0) >= 3, week: (b.visits || 0) >= 7, memo3: Object.keys(pet.memos || {}).length >= 3,
      km1k: kmTogether >= 1000, km10k: kmTogether >= 10000,
      stamp3: stamps(A, upto).filter(s => s.s > t0).length >= 3,
      line: crossed, far: farT >= t0 && farT <= upto && homeKm(A, far) > 200, end: isEnded && m < D.length - 1,
    };
    return BADGES.map(([id, name, desc, icon]) => ({ id, name, desc, got: !!got[id], svg: `<svg viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[icon]}</svg>` }));
  }

  /* ---------- the owner's visits: days opened, and the current run of consecutive days ---------- */
  function visit(pet, now = Date.now()) {
    const b = pet.bond || (pet.bond = { streak: 0, visits: 0 });
    const today = localKey(now);
    if (b.lastDay === today) return null;
    b.streak = b.lastDay === localKey(now - DAY) ? (b.streak || 0) + 1 : 1;
    b.bestStreak = Math.max(b.bestStreak || 0, b.streak);
    b.visits = (b.visits || 0) + 1; b.lastDay = today;
    return { streak: b.streak };
  }

  return {
    petClock, meetDay, ended, digest, day, card, records, stays, signal, companions, contents, ending, qualMix,
    stamps, stampSVG, badges, visit, hm, agoKo, erFmt, llFmt, solarMin, clock24, METHOD, DARK,
  };
})();
