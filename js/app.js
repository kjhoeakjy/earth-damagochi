/* ============================================================
   UI — picking an animal, adoption, the pet panel, the observation log, the tag's signal, timeline.
   ============================================================ */
const App = {
  mode: "browse", sel: null, hover: null, q: "", onlySync: false, sort: "rec",
  filters: { cls: new Set(), sp: new Set(), area: new Set(), visit: new Set(), age: new Set(), sex: new Set(), scale: new Set(), dur: new Set() },
  pet: null, A: null, dayView: null, tab: "day", lastK: -1, ended: false, t: 0, pos: null,
  vis: new Set(), drafts: {}, editing: null, lastFix: null, lastSt: null, others: [], othersOpen: false, otherHover: null,
};
const narrow = () => matchMedia("(max-width: 860px)").matches;
const ageKey = A => !A.age ? "unk" : A.age === "adult" ? "adult" : "young";
const FDEF = {
  cls: { opts: () => Object.entries(CLS).map(([k, v]) => [k, v.ko, v.color]), get: A => A.S.cls },
  sp: { opts: () => { const c = {}; DB.animals.forEach(A => c[A.sp] = (c[A.sp] || 0) + 1); return Object.keys(c).sort((a, b) => c[b] - c[a]).map(k => [k, SPECIES[k].ko.replace(/ \(.+\)$/, ""), CLS[SPECIES[k].cls].color]); }, get: A => A.sp },
  area: { opts: () => Object.entries(AREA), get: A => A.area },
  visit: { opts: () => GROUPS, get: A => A.visits, multi: true },
  age: { opts: () => [["adult", "어른"], ["young", "어린 개체"], ["unk", "모름"]], get: ageKey },
  sex: { opts: () => [["f", "암컷"], ["m", "수컷"], ["unk", "모름"]], get: A => A.sex || "unk" },
  scale: { opts: () => [["s", "3천km 미만"], ["m", "3천~1만km"], ["l", "1만km 이상"]], get: A => A.km < 3000 ? "s" : A.km < 10000 ? "m" : "l" },
  dur: { opts: () => [["s", "석 달 이하"], ["m", "석 달~1년"], ["l", "1년 넘게"]], get: A => A.days <= 92 ? "s" : A.days <= 366 ? "m" : "l" },
};
function passes(A, skip) {
  if (App.onlySync && !A.sync) return false;
  if (App.q) { const q = App.q.toLowerCase().trim(); if (q && !q.split(/\s+/).every(w => A.search.includes(w))) return false; }
  for (const [f, set] of Object.entries(App.filters)) {
    if (f === skip || !set.size) continue;
    const v = FDEF[f].get(A);
    if (FDEF[f].multi ? ![...set].some(x => v.has(x)) : !set.has(v)) return false;
  }
  return true;
}
const visible = () => DB.animals.filter(A => passes(A));
function score(A) { return (A.sync ? 1000 + Math.min(A.sync.left, 200) : 0) + Math.log10(A.km + 10) * 40 + Math.min(A.placeOrder.length, 20) * 6 + (A.age ? 10 : 0) + (A.S.iucn !== "LC" ? 15 : 0); }
const SORTS = {
  rec: (a, b) => score(b) - score(a),
  sync: (a, b) => (b.sync ? 1 : 0) - (a.sync ? 1 : 0) || (b.sync ? b.sync.left : 0) - (a.sync ? a.sync.left : 0) || b.km - a.km,
  km: (a, b) => b.km - a.km, far: (a, b) => b.maxFromHome - a.maxFromHome, days: (a, b) => b.days - a.days,
  places: (a, b) => b.placeOrder.length - a.placeOrder.length,
};
const shortName = A => A.S.ko.replace(/ \(.+\)$/, "");
const tagShort = A => String(A.tag).replace(/^(Sooty|SoTern|AsFr|MaBo)/, "").replace(/ \[.+\]$/, "").replace(/^Brown pelican.*/, "BRPE-1");
const hhmm = ms => { const d = new Date(ms); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
const pct = x => Math.round(x * 100);

/* colours for the ways a position was taken; paler = less precise */
const QBASE = { GPS: [247, 201, 107], "Fastloc GPS": [172, 216, 132], "아르고스": [99, 210, 222], "햇빛 세기로 추정": [195, 166, 255] };
const QALPHA = { a: 1, 8: 1, 7: .92, 6: .84, 5: .74, 4: .64, g: .9, b: .62, 3: 1, 2: .82, 1: .66, 0: .5, A: .38, B: .28, R: .7, L: .9 };
const qcol = c => { const q = QUAL[c], b = QBASE[q.kind]; return `rgba(${b[0]},${b[1]},${b[2]},${QALPHA[c]})`; };
const rowsHTML = rows => `<dl class="rows">${rows.map(([k, v, n]) => `<div><dt>${esc(k)}</dt><dd><b>${esc(v)}</b>${n ? `<small>${esc(n)}</small>` : ""}</dd></div>`).join("")}</dl>`;
function mixHTML(mix) {
  return `<div class="mix" aria-hidden="true">${mix.map(q => `<i style="flex:${q.n};background:${qcol(q.c)}"></i>`).join("")}</div>
    <ul class="mixl">${mix.map(q => `<li><i style="background:${qcol(q.c)}"></i><span>${esc(q.kind)} · ${esc(q.txt)}</span><span class="mono">${q.f < .01 ? "1% 미만" : pct(q.f) + "%"}</span></li>`).join("")}</ul>`;
}
const ICO = (p, w = 1.7) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const HL_ICON = {
  tag: '<path d="M4 12.5 11.5 5H19v7.5L11.5 20z"/><circle cx="15.3" cy="8.7" r="1.3"/>',
  stamp: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5" stroke-dasharray="2 2"/>',
  line: '<path d="M3 12h18" stroke-dasharray="3 2"/><path d="M9 7l3-3 3 3M9 17l3 3 3-3"/>',
  pin: '<path d="M12 21s-6.5-6-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.3"/>',
  route: '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h6.5a3 3 0 0 0 0-6h-5a3 3 0 0 1 0-6H16"/>',
  home: '<path d="M4 11.5 12 5l8 6.5V20H4z"/><path d="M10 20v-5h4v5"/>',
  warn: '<path d="M12 4 21 19H3z"/><path d="M12 10v4M12 16.5v.01"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
  none: '<circle cx="12" cy="12" r="8"/><path d="M7 17 17 7"/>',
  end: '<path d="M6 4v16M6 5h11l-2.5 4L17 13H6"/>',
};
const ARROW_L = ICO('<path d="m14.5 6-6 6 6 6"/>', 2), ARROW_R = ICO('<path d="m9.5 6 6 6-6 6"/>', 2);

/* ---------- toast & floaters ---------- */
let toastT = 0, toastAt = 0;
function toast(html, ms = 3800) {
  const t = $("#toast");
  t.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="var(--monarch-2)" stroke-width="1.8" stroke-linecap="round"><path d="M12 21s-7.5-4.7-7.5-10A4.3 4.3 0 0 1 12 8.2 4.3 4.3 0 0 1 19.5 11c0 5.3-7.5 10-7.5 10z"/></svg><span>${html}</span>`;
  t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), ms); toastAt = performance.now();
}
function hearts(el, n = 4) {
  const r = el.getBoundingClientRect();
  for (let i = 0; i < n; i++) {
    const f = document.createElement("div"); f.className = "floater"; f.textContent = "♥";
    f.style.left = (r.left + r.width / 2 + (Math.random() - .5) * r.width * .5) + "px"; f.style.top = (r.top + r.height * .45) + "px";
    f.style.setProperty("--dx", ((Math.random() - .5) * 80) + "px"); f.style.animationDelay = (i * .12) + "s";
    document.body.appendChild(f); setTimeout(() => f.remove(), 1800);
  }
}
const plus = g => g ? ` <b style="color:var(--heart)">♥+${g}</b>` : "";

/* ============================================================ browse ============================================================ */
function renderFilters() {
  for (const box of $$("#filters .chips")) {
    const f = box.dataset.f, def = FDEF[f];
    const base = DB.animals.filter(A => passes(A, f));
    box.innerHTML = def.opts().map(([k, label, color]) => {
      const n = base.filter(A => def.multi ? def.get(A).has(k) : def.get(A) === k).length;
      if (!n && !App.filters[f].has(k) && (f === "visit" || f === "sp")) return "";
      return `<button class="chip" type="button" data-k="${k}" aria-pressed="${App.filters[f].has(k)}" ${n ? "" : 'style="opacity:.45"'}>${color ? `<span class="sw" style="background:${color}"></span>` : ""}${esc(label)} <span class="n">${n}</span></button>`;
    }).join("");
  }
}
function renderList() {
  const list = visible().sort(SORTS[App.sort]);
  $("#count").textContent = `${list.length}마리` + (list.length !== DB.animals.length ? ` / 전체 ${DB.animals.length}마리` : "");
  const el = $("#list");
  App.vis = new Set(list.map(A => A.id));
  if (!list.length) { el.innerHTML = `<div class="empty">조건에 맞는 동물이 없어요.<br><button class="btn small" type="button" id="resetF" style="margin-top:10px">필터 모두 지우기</button></div>`; $("#resetF").onclick = resetFilters; refreshCand(); return; }
  el.innerHTML = list.map(A => {
    const s = A.sync, pills = [];
    if (s) pills.push(`<span class="pill sync">${s.k}년 전 오늘 · ${esc(A.nowPlace || "")}</span>`);
    if (A.age) pills.push(`<span class="pill">${A.age === "adult" ? "어른" : "어린 개체"}</span>`);
    if (A.sex) pills.push(`<span class="pill">${A.sex === "f" ? "암컷" : "수컷"}</span>`);
    if (A.status.length) pills.push(`<span class="pill" title="태그가 배터리 전압과 상태 신호도 보냈어요">상태 신호</span>`);
    if (A.S.iucn !== "LC") pills.push(`<span class="pill iucn ${A.S.iucn}" title="IUCN 적색목록 ${IUCN[A.S.iucn]}">${A.S.iucn}</span>`);
    const to = A.endName && A.endName !== placeName(A.placeOrder[0]) ? ` → ${esc(A.endName)}` : "";
    return `<button class="cand" type="button" role="option" data-id="${A.id}" aria-selected="${App.sel === A.id}">
      <canvas width="104" height="104" data-look="${A.S.look}" data-cls="${A.S.cls}"></canvas>
      <div style="min-width:0"><div class="t">${esc(shortName(A))} <span class="id">#${esc(tagShort(A))}</span></div>
        <div class="s">${esc(A.home)}${to} · ${durKo(A.days)}</div><div class="m">${pills.join("")}</div></div>
      <div class="scale"><b>${fmt(A.km)}</b>km</div></button>`;
  }).join("");
  for (const cv of $$("canvas", el)) Critter.portrait(cv, cv.dataset.look, cv.dataset.cls);
  refreshCand();
}
// glow state of the points on the globe: hidden by filters, normal, hovered, selected
function refreshCand() { Globe.candState(id => !App.vis.has(id) ? -1 : id === App.sel ? 2 : id === App.hover ? 1 : 0); }
function resetFilters() { for (const s of Object.values(App.filters)) s.clear(); App.q = ""; $("#q").value = ""; App.onlySync = false; $("#onlySync").checked = false; refreshBrowse(); }
function refreshBrowse() { renderFilters(); renderList(); }

function select(id, fly = true) {
  App.sel = id || null;
  document.body.toggleAttribute("data-sel", !!App.sel);
  $$("#list .cand").forEach(b => b.setAttribute("aria-selected", b.dataset.id === id));
  const A = id && DB.byId.get(id);
  renderDetail();
  refreshCand();
  if (!A) { Globe.showTrack(null); Globe.setMarker(null); return; }
  Globe.showTrack(A, { color: CLS[A.S.cls].color, fresh: 0, opacity: .95 });
  Globe.setMarker([A.nowPos.lon, A.nowPos.lat], CLS[A.S.cls].color);
  Globe.setHome(null);
  if (fly) { const lls = []; for (let i = 0; i < A.T.length; i += Math.max(1, Math.floor(A.T.length / 160))) lls.push([A.X[i], A.Y[i]]); Globe.fitPoints(lls, .38); }
  const b = $(`#list .cand[data-id="${id}"]`), L = $("#list");
  if (b && !narrow()) {
    const top = b.offsetTop, bot = top + b.offsetHeight;
    if (top < L.scrollTop + 8) L.scrollTo({ top: top - 8, behavior: "smooth" });
    else if (bot > L.scrollTop + L.clientHeight - 8) L.scrollTo({ top: bot - L.clientHeight + 8, behavior: "smooth" });
  }
  if (narrow()) $("#detailBody").scrollTop = 0;
}

function renderIntro() {
  const nSync = DB.animals.filter(A => A.sync).length;
  const counts = Object.keys(CLS).map(k => [k, DB.animals.filter(A => A.S.cls === k).length]);
  $("#detailBody").innerHTML = `<div class="intro">
    <div class="eyebrow">실제 위성 추적 기록</div>
    <h2>지구를 진짜로 여행한 동물 한 마리를 입양해요</h2>
    <p>여기 있는 ${DB.animals.length}마리는 모두 과학자들이 몸에 위성 태그를 달아 실제로 따라간 동물이에요. 뻐꾸기, 갈매기, 알바트로스, 코끼리물범, 긴수염고래, 바다거북, 순록까지 있어요.</p>
    <ol>
      <li>왼쪽에서 분류, 종, 출발지, 가는 곳, 나이, 성별로 골라 보세요. 지구본의 반짝이는 점을 눌러도 돼요.</li>
      <li>고른 동물의 실제 여정을 지구 위에서 미리 볼 수 있어요. 선 위의 작은 점이 태그가 실제로 위치를 잰 곳이에요.</li>
      <li>입양하면 그 동물의 시계에 맞춰 하루하루가 흘러요. 위치 기록이 들어온 시각이 되면 알려 주고, 매일 그날의 실제 기록으로 만든 관측 일지가 쌓여요.</li>
    </ol>
    <div class="callout"><b>오늘 날짜에 맞춘 동물 ${nSync}마리</b><br>몇 년 전 바로 오늘, 그 동물이 실제로 있던 곳에서 시작해요. 그 뒤로는 진짜 시간과 같은 속도로 함께 나아가요.</div>
    <div class="legend">${counts.map(([k, n]) => `<span><i style="background:${CLS[k].color}"></i>${CLS[k].ko} ${n}</span>`).join("")}</div>
    <button class="btn" type="button" id="luckyBtn">오늘 날짜에 맞춘 동물 아무나 보기</button>
    <p class="faint" style="margin:0;font-size:12px">지구는 실제 태양 위치로 낮과 밤을 그렸어요. 별자리도 실제 하늘이에요. 구름은 날씨 정보가 아니라 위성 사진 한 장이에요.</p>
  </div>`;
  $("#detailFoot").hidden = true;
  $("#luckyBtn").onclick = () => { const c = visible().filter(A => A.sync); const pool = c.length ? c : DB.animals.filter(A => A.sync); select(pool[Math.floor(Math.random() * pool.length)].id); };
}
function renderDetail() {
  const A = App.sel && DB.byId.get(App.sel);
  if (!A) return renderIntro();
  const S = A.S, s = A.sync, src = A.src_;
  const places = A.placeOrder.map(placeName);
  const t0 = A.T[0], t1 = A.t1;
  $("#detailBody").innerHTML = `<div class="body">
    <div class="dhead"><canvas width="168" height="168"></canvas><div>
      <div class="eyebrow">${CLS[S.cls].ko} · 태그 #${esc(tagShort(A))}</div>
      <h2>${esc(S.ko)}</h2><div class="sci">${esc(S.sci)} · ${esc(S.en)}</div></div>
      <button class="iconbtn dclose" type="button" id="dClose" aria-label="소개 닫기" title="닫기">${ICO('<path d="M6 6l12 12M18 6 6 18"/>', 2)}</button></div>
    ${s ? `<div class="callout"><b>${s.k}년 전 오늘</b>, 이 동물은 <b>${esc(A.nowPlace || "")}</b>에 있었어요. 지금 입양하면 거기서부터 함께 걸어요. 남은 기록은 ${Math.floor(s.left)}일이에요.</div>`
      : `<div class="callout">기록은 <b>${dateKo(t0)}</b>부터 <b>${dateKo(t1)}</b>까지, ${durKo(A.days)}이에요. 입양하면 태그를 단 첫날부터 함께 시작해요.</div>`}
    <dl class="kv">
      <dt>출발지</dt><dd>${esc(AREA[A.area].startsWith(A.home) ? AREA[A.area] : `${A.home} (${AREA[A.area]})`)}</dd>
      <dt>성별</dt><dd>${A.sex === "f" ? "암컷" : A.sex === "m" ? "수컷" : "기록 없음"}</dd>
      <dt>나이</dt><dd>${esc(A.ageText || "기록 없음")}${A.withCalf ? " · 새끼와 함께" : ""}</dd>
      <dt>기록 기간</dt><dd>${dateKo(t0)} ~ ${dateKo(t1)} (${durKo(A.days)})</dd>
      <dt>이동 거리</dt><dd>${fmt(A.km)}km · 출발지에서 가장 멀리 ${fmt(A.maxFromHome)}km</dd>
      <dt>지나간 곳</dt><dd>${places.slice(0, 8).map(esc).join(", ")}${places.length > 8 ? ` 외 ${places.length - 8}곳` : ""}</dd>
      <dt>보전 상태</dt><dd>IUCN ${S.iucn} (${IUCN[S.iucn]})</dd>
    </dl>
    <div class="sec"><h3>이 기록에 들어 있는 것</h3>${rowsHTML(Story.contents(A))}
      <div class="sub-h">위치 정확도</div>${mixHTML(Story.qualMix(A))}
      <p class="faint small">${esc(Story.NOT_IN)}</p></div>
    <details class="ending"><summary>기록이 어떻게 끝나는지 보기</summary>${rowsHTML(Story.ending(A))}</details>
    <ul class="facts">${S.facts.map(f => `<li>${esc(f)}</li>`).join("")}</ul>
    <div class="src">자료: ${esc(src.who || "")} · <a href="${esc(src.url || "#")}" target="_blank" rel="noopener">${esc(src.title || "")}</a> (${esc(src.via || "")})${src.note ? `<br>${esc(src.note)}` : ""}</div>
  </div>`;
  Critter.portrait($("#detailBody canvas"), S.look, S.cls);
  $("#dClose").onclick = () => select(null);
  const foot = $("#detailFoot"); foot.hidden = false;
  const full = Store.state.pets.length >= 6, have = Store.state.pets.some(p => p.aid === A.id);
  foot.innerHTML = have ? `<button class="btn primary block" type="button" id="goPet">이미 함께하는 동물이에요 · 보러 가기</button>`
    : `<button class="btn primary block" type="button" id="adoptBtn" ${full ? "disabled" : ""}>${full ? "여섯 마리까지 함께할 수 있어요" : `${esc(shortName(A))} 입양하기`}</button>`;
  if (have) $("#goPet").onclick = () => { Store.state.active = Store.state.pets.find(p => p.aid === A.id).id; Store.save(); enterPet(); };
  else if (!full) $("#adoptBtn").onclick = () => openAdopt(A);
}

/* ============================================================ adoption ============================================================ */
const NAMES = {
  bird: ["나비", "구름이", "바람이", "하늘이", "솜이", "깃털이", "별이"], sea: ["나비", "몽글이", "파도", "물결이", "두부", "방울이", "모래"],
  fish: ["나비", "푸름이", "파랑이", "물방울", "바다", "초롱이"], land: ["나비", "솔이", "눈송이", "보리", "단풍이", "이끼"],
};
function openAdopt(A) {
  const s = A.sync, m = $("#mAdopt"), sh = $("#adSheet");
  const sug = NAMES[A.S.cls];
  let mode = s ? "sync" : "start", pace = 1, name = sug[0];
  const paceRow = () => mode === "start" ? `<div class="field"><label>시간 흐름</label><div class="chips" id="adPace">
      ${[[1, "하루에 하루 (진짜 시간)"], [24, "한 시간에 하루"], [1440, "1분에 하루 (구경용)"]].map(([v, l]) => `<button class="chip" type="button" data-v="${v}" aria-pressed="${pace === v}">${l}</button>`).join("")}</div></div>` : "";
  const render = () => {
    sh.innerHTML = `
      <div><div class="eyebrow">입양 신청서</div><h2 id="adTitle">${esc(josa(shortName(A), "을/를"))} 입양할까요?</h2></div>
      <div class="field"><label for="adName">이름을 지어 주세요</label><input id="adName" maxlength="12" value="${esc(name)}" autocomplete="off">
        <div class="namechips">${sug.map(n => `<button class="chip" type="button" data-n="${esc(n)}" aria-pressed="${n === name}">${esc(n)}</button>`).join("")}</div></div>
      <div class="field"><label>언제부터 함께할까요?</label><div class="chips" id="adMode">
        ${s ? `<button class="chip" type="button" data-m="sync" aria-pressed="${mode === "sync"}">${s.k}년 전 오늘부터 · ${esc(A.nowPlace || "")}</button>` : ""}
        <button class="chip" type="button" data-m="start" aria-pressed="${mode === "start"}">태그를 단 날부터 · ${dateKo(A.T[0])}</button></div>
        <div class="faint" style="font-size:12px">${mode === "sync" ? `${dateKo(s.t)}의 실제 위치에서 시작해 진짜 시간과 같은 속도로 나아가요. 그때 위치를 잰 시각이 되면 지금도 같은 시각에 새 기록이 들어와요. 기록은 ${Math.floor(s.left)}일 남았어요.` : `첫날 위치에서 시작해요. ${durKo(A.days)} 동안의 기록을 처음부터 따라가요.`}</div></div>
      ${paceRow()}
      <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" type="button" id="adCancel">다음에 할게요</button><button class="btn primary" type="button" id="adOk">입양하기</button></div>`;
    $("#adName").oninput = e => { name = e.target.value; $$(".namechips .chip", sh).forEach(c => c.setAttribute("aria-pressed", c.dataset.n === name)); };
    $$(".namechips .chip", sh).forEach(c => c.onclick = () => { name = c.dataset.n; render(); });
    $$("#adMode .chip", sh).forEach(c => c.onclick = () => { mode = c.dataset.m; render(); });
    $$("#adPace .chip", sh).forEach(c => c.onclick = () => { pace = +c.dataset.v; render(); });
    $("#adCancel").onclick = () => { m.hidden = true; };
    $("#adOk").onclick = () => {
      const nm = (name || "").trim().slice(0, 12) || sug[0];
      const now = Date.now();
      const pet = { id: "p" + now.toString(36), aid: A.id, name: nm, adoptedAt: now, anchorReal: now, mode, pace: mode === "sync" ? 1 : pace, anchorTrack: mode === "sync" ? s.t : A.T[0], k: s ? s.k : 0, bond: { pts: 0, streak: 0, visits: 0 }, memos: {}, seen: {} };
      Store.state.pets.push(pet); Store.state.active = pet.id; Story.visit(pet, now); Store.save();
      m.hidden = true; showCert(pet, true);
    };
  };
  render(); m.hidden = false; setTimeout(() => $("#adName").focus(), 30);
  m.onclick = e => { if (e.target === m) m.hidden = true; };
}
function guilloche(cv) {
  const r = cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
  cv.width = r.width * d; cv.height = r.height * d;
  const g = cv.getContext("2d"), W = cv.width, H = cv.height;
  g.strokeStyle = "rgba(150,105,55,.22)"; g.lineWidth = d * .7;
  for (const [cx, cy, R, k] of [[W / 2, H / 2, Math.min(W, H) * .44, 7], [W / 2, H / 2, Math.min(W, H) * .3, 11]]) {
    g.beginPath();
    for (let i = 0; i <= 2400; i++) { const t = i / 2400 * Math.PI * 2 * 9; const rr = R * (.82 + .18 * Math.sin(k * t / 9)); const x = cx + Math.cos(t) * rr * (W / H) * .9, y = cy + Math.sin(t) * rr * .9 + Math.sin(t * 13) * R * .02; i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
  }
  g.strokeStyle = "rgba(150,105,55,.35)"; g.lineWidth = d * 1.2; g.strokeRect(W * .03, H * .045, W * .94, H * .91);
  g.lineWidth = d * .6; g.strokeRect(W * .045, H * .065, W * .91, H * .87);
}
function showCert(pet, fresh) {
  const A = DB.byId.get(pet.aid), S = A.S, m = $("#mCert");
  $("#cert").innerHTML = `<canvas class="guil"></canvas><div class="in">
    <div class="ttl">입양 증서<small>CERTIFICATE OF ADOPTION</small></div>
    <div class="line">아래 동물의 실제 기록을 하루하루 함께 따라가기로 약속했음을 증명합니다.</div>
    <div class="who">${esc(pet.name)}</div>
    <div class="line">${esc(S.ko)} <i>${esc(S.sci)}</i> · 태그 #${esc(tagShort(A))}<br>${esc(A.home)}에서 출발 · 기록 ${esc(A.src_.who || "")}</div>
    <div class="grid"><div>입양한 날<b>${dateKo(pet.adoptedAt)}</b></div><div>함께 시작한 기록<b>${dateKo(pet.anchorTrack)}</b></div><div>기록 속 여정<b>${fmt(A.km)}km</b></div></div>
  </div>
  <svg class="seal" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46" fill="#b7432a" opacity=".88"/><circle cx="50" cy="50" r="38" fill="none" stroke="#f6dccd" stroke-width="1.5" stroke-dasharray="3 3"/>
    <text x="50" y="47" text-anchor="middle" font-family="Diphylleia, serif" font-size="16" fill="#fbe9de">나비야</text><text x="50" y="66" text-anchor="middle" font-family="Diphylleia, serif" font-size="16" fill="#fbe9de">나비야</text></svg>`;
  m.hidden = false;
  requestAnimationFrame(() => guilloche($("#cert canvas")));
  $("#certGo").textContent = fresh ? "함께 시작하기" : "닫기";
  $("#certGo").onclick = () => { m.hidden = true; if (fresh) enterPet(); };
  m.onclick = e => { if (e.target === m && !fresh) m.hidden = true; };
}

/* ============================================================ pet mode ============================================================ */
function activePet() { const st = Store.state; return st.pets.find(p => p.id === st.active) || st.pets[0] || null; }
function enterPet() {
  const pet = activePet(); if (!pet) return enterBrowse();
  // notes kept by older versions were called replies
  pet.memos = pet.memos || pet.replies || {}; delete pet.replies; pet.seen = pet.seen || {};
  App.mode = "pet"; App.pet = pet; App.A = DB.byId.get(pet.aid); App.lastK = -1; App.dayView = null; App.lastFix = App.lastSt = null; App.editing = null;
  document.body.dataset.mode = "pet"; document.body.removeAttribute("data-sel");
  $("#picker").hidden = true; $("#detail").hidden = true; $("#pet").hidden = false; $("#journal").hidden = false; $("#timeline").hidden = false;
  Globe.showCandidates(false); Globe.layout();
  const A = App.A, now = Date.now(), t = Story.petClock(pet, A, now);
  Globe.showTrack(A, { color: "#f5a65b", now: t, meet: pet.anchorTrack, fresh: 1 });
  Globe.setHome([A.X[0], A.Y[0]]);
  const p = posAt(A, t); Globe.setMarker([p.lon, p.lat], "#ffd2a1");
  Globe.flyTo(p.lon, p.lat, Math.min(Globe.homeDist(), Globe.distFor(.35, .4)), 1800);
  Globe.setFollow(true, () => { const q = posAt(App.A, Story.petClock(App.pet, App.A)); return [q.lon, q.lat]; });
  $("#cFollow").setAttribute("aria-pressed", "true");
  const v = Story.visit(pet, now);
  if (v) {
    Store.save();
    const msg = v.gap > 1 ? `${v.gap}일 만에 다시 왔어요` : v.streak >= 2 ? `${v.streak}일 연속 방문이에요` : "오늘 첫 방문이에요";
    setTimeout(() => toast(msg + plus(v.gain)), 900);
  }
  renderModeBtn(); renderSwitch(); tick(true);
  $$(".tab").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === App.tab));
}
function enterBrowse() {
  App.mode = "browse"; document.body.dataset.mode = "browse";
  $("#picker").hidden = false; $("#detail").hidden = false; $("#pet").hidden = true; $("#journal").hidden = true; $("#timeline").hidden = true;
  Globe.setFollow(false); Globe.setHome(null); Globe.highlight(null, null); Globe.setOthers(null); Globe.setErrorDisk(null);
  Globe.showCandidates(true); Globe.layout();
  Globe.setTime(Date.now());
  renderModeBtn(); refreshBrowse(); select(App.sel, false);
  if (!App.sel) { Globe.showTrack(null); Globe.setMarker(null); Globe.goHome(); }
}
function renderModeBtn() {
  const b = $("#btnMode"), pet = activePet();
  if (App.mode === "pet") { b.hidden = false; b.textContent = "+ 다른 동물 둘러보기"; b.onclick = () => enterBrowse(); }
  else if (pet) { b.hidden = false; b.textContent = `← ${pet.name}에게 돌아가기`; b.onclick = () => enterPet(); }
  else b.hidden = true;
}
function renderSwitch() {
  const el = $("#petSwitch"), pets = Store.state.pets;
  el.hidden = pets.length < 2;
  el.innerHTML = pets.map(p => `<button class="chip" type="button" data-p="${p.id}" aria-pressed="${p.id === App.pet.id}">${esc(p.name)}</button>`).join("");
  $$(".chip", el).forEach(c => c.onclick = () => { Store.state.active = c.dataset.p; Store.save(); enterPet(); });
}
const typing = () => { const a = document.activeElement; return !!a && $("#tabBody").contains(a) && (a.tagName === "TEXTAREA" || a.tagName === "INPUT"); };

// called every second in pet mode (and right away on entering)
function tick(force) {
  const pet = App.pet, A = App.A; if (!pet || App.mode !== "pet") return;
  const now = Date.now(), t = Story.petClock(pet, A, now), k = dayIndexAt(A, t);
  App.ended = Story.ended(pet, A, now);
  Globe.setTime(t); Globe.trackNow(t);
  const p = posAt(A, t); Globe.setMarker([p.lon, p.lat]);
  App.pos = p; App.t = t;
  // fixes and status messages arrive when the pet's clock reaches the moment they were sent
  const fi = idxAt(A, t); let si = App.lastSt ?? 0;
  while (si < A.status.length && A.status[si].t <= t) si++;
  const newFix = App.lastFix != null && fi > App.lastFix, newSt = App.lastSt != null && si > App.lastSt;
  if (newFix || newSt) announce(newFix ? fi : -1, newSt ? A.status[si - 1] : null);
  App.lastFix = fi; App.lastSt = si;
  let tab = force ? "reset" : null;
  if (k !== App.lastK) {
    const prev = App.lastK; App.lastK = k;
    const follow = App.dayView == null || App.dayView === prev;
    if (follow) App.dayView = k;
    if (prev >= 0 && k > prev && !newFix) toast(`${dateKo(buildDays(A)[k].s, false)} 관측 일지가 시작됐어요`);
    renderTimeline();
    tab = tab || (follow && App.tab === "day" ? "reset" : "keep");
  } else if (newFix || newSt) {
    renderTimeline();
    if (App.tab === "day" ? App.dayView === k : App.tab !== "info") tab = tab || "keep";
  }
  if (tab && (force || !typing())) renderTab(tab === "keep");
  renderPet(force || newFix || newSt);
  renderClock();
  updateOthers(force);
  const ni = nearestIdx(A, t);
  Globe.setErrorDisk(A.ER && A.ER[ni] >= 3000 ? [A.X[ni], A.Y[ni]] : null, A.ER ? A.ER[ni] / 1000 : 0);
}
function announce(fi, st) {
  const A = App.A, pet = App.pet;
  if (document.hidden || pet.pace > 24 || performance.now() - toastAt < 2500) return;
  if (st && st.c !== "a") toast(`태그 상태 신호 · <b>${MORT[st.c]}</b> · 배터리 ${fmt(st.v)}mV`, 5200);
  else if (fi >= 0) toast(`새 위치 기록 · ${timeKo(A.T[fi])} · ${esc(placeName(runAt(A.pl, fi)) || "")} <span class="faint">${esc(QUAL[A.QS[fi]].kind)}</span>`);
  else if (st) toast(`태그 상태 신호 · ${MORT[st.c]} · 배터리 ${fmt(st.v)}mV`);
}
function renderClock() {
  const c = $("#clock"), now = Date.now();
  if (App.mode === "pet" && App.pet) {
    const pet = App.pet, rel = pet.mode === "sync" ? `${pet.k}년 전 오늘` : `기록 ${App.lastK + 1}일째`;
    c.innerHTML = `<b>${esc(pet.name)}의 시간</b> · ${dateKo(App.t)} ${timeKo(App.t)}<br>${rel} · 지금 내 시간 ${timeKo(now)}`;
  } else c.innerHTML = `<b>${dateKoW(now)}</b> ${timeKo(now)}<br>실제 태양 위치로 그린 지구`;
}
let petRenderT = 0;
function renderPet(force) {
  const pet = App.pet, A = App.A;
  if (!force && performance.now() - petRenderT < 15000) { updatePetStatus(); return; }
  petRenderT = performance.now();
  $("#petName").textContent = pet.name;
  $("#petSub").textContent = `${shortName(A)} #${tagShort(A)} · ${A.home}에서 출발`;
  const kmT = kmAt(A, App.t) - kmAt(A, pet.anchorTrack);
  const together = Math.max(1, Math.floor((midnight(Date.now()) - midnight(pet.adoptedAt)) / DAY) + 1);
  const home = hav(A.X[0], A.Y[0], App.pos.lon, App.pos.lat);
  let raw = 0; for (let i = 0, n = idxAt(A, App.t); i <= n; i++) raw += A.NF[i];
  $("#petStats").innerHTML = [
    ["함께한 날", fmt(together), "일"], ["함께 간 거리", kmFmt(Math.max(0, kmT)), "km"],
    ["출발지에서", kmFmt(home), "km"], ["받은 위치 기록", fmt(raw), "개"],
  ].map(([k2, v, u]) => `<div class="stat"><div class="k">${k2}</div><div class="v">${v}<small>${u}</small></div></div>`).join("");
  const L = Story.level(pet.bond.pts || 0);
  const full = Math.round(L.frac * 5);
  $("#hearts").innerHTML = Array.from({ length: 5 }, (_, i) => `<svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.7-7.5-10A4.3 4.3 0 0 1 12 8.2 4.3 4.3 0 0 1 19.5 11c0 5.3-7.5 10-7.5 10z" fill="${i < full ? "var(--heart)" : "none"}" stroke="var(--heart)" stroke-width="1.6"/></svg>`).join("");
  $("#lvl").innerHTML = `<b>${L.name}</b>${L.next ? ` · ${L.next}까지 ♥${L.toNext}` : ""}`;
  if (!App.otherHover) renderOthers();
  updatePetStatus();
}
function updatePetStatus() {
  const A = App.A, live = $("#liveDot"), st = $("#petStatus"), sg = $("#petSig"), t = App.t, p = App.pos;
  const fi = idxAt(A, t), last = A.status.filter(m => m.t <= t).pop();
  const lastSt = last ? ` · 태그 ${esc(MORT[last.c])} ${fmt(last.v)}mV <span class="faint">(${esc(Story.agoKo(t - last.t))})</span>` : "";
  if (App.ended) {
    live.className = "live off";
    st.textContent = `기록이 끝났어요 · 마지막 위치 기록 ${dateKo(A.t1)}`;
    sg.innerHTML = `${esc(placeName(runAt(A.pl, A.T.length - 1)) || "")}${lastSt}`;
    return;
  }
  const since = t - A.T[fi];
  live.className = "live" + (since > 2 * DAY ? " stale" : "");
  live.title = since > 2 * DAY ? "위치 기록이 이틀 넘게 없어요" : "기록이 이어지는 중";
  const place = placeName(runAt(A.pl, nearestIdx(A, t)));
  const alt = sunAlt(p.lon, p.lat, t), rising = sunAlt(p.lon, p.lat, t + 20 * MIN) > alt;
  const tod = alt > 6 ? "낮" : alt > Story.DARK ? (rising ? "해 뜬 무렵" : "해 질 무렵") : alt > -6 ? (rising ? "새벽 어스름" : "저녁 어스름") : "밤";
  let move = "";
  if (fi < A.T.length - 1) {
    const km = A.cum[fi + 1] - A.cum[fi], h = (A.T[fi + 1] - A.T[fi]) / HOUR;
    move = A.coarse ? "" : km / h >= 1 ? ` · 기록 사이 평균 시속 ${fmt(km / h, km / h < 10 ? 1 : 0)}km` : " · 거의 제자리";
  }
  st.innerHTML = `${esc(place || "")} · 그곳 ${Story.clock24(Story.solarMin(t, p.lon))} ${tod}${move}`;
  sg.innerHTML = `마지막 위치 기록 ${esc(Story.agoKo(since))} · ${esc(QUAL[A.QS[fi]].kind)} ${esc(QUAL[A.QS[fi]].txt)}${lastSt}`;
}

/* ---------- other animals tracked at the same moment ---------- */
let othersCount = -1;
function updateOthers(force) {
  const A = App.A, L = Story.companions(A, App.t);
  App.others = L;
  Globe.setOthers(L.map(o => ({ lon: o.lon, lat: o.lat, color: CLS[o.B.S.cls].color, state: o.B.id === App.otherHover ? 1 : 0 })));
  if (force || L.length !== othersCount) { othersCount = L.length; renderOthers(); }
}
function renderOthers() {
  const el = $("#petOthers"), L = App.others || [];
  if (!L.length) { el.innerHTML = `<h3>같은 시각 추적되던 동물</h3><p class="faint">이 시각에 함께 기록된 다른 동물은 없어요.</p>`; return; }
  const show = App.othersOpen ? L : L.slice(0, 4);
  el.innerHTML = `<h3>같은 시각 추적되던 동물 <span class="mono">${L.length}</span></h3>
    <div class="olist">${show.map(o => `<button class="orow" type="button" data-id="${o.B.id}"><i style="background:${CLS[o.B.S.cls].color}"></i>
      <span class="on">${esc(shortName(o.B))} <span class="mono faint">#${esc(tagShort(o.B))}</span><small>${esc(placeName(o.pl) || "")}${o.same ? " · 같은 연구" : ""}</small></span>
      <span class="mono">${kmFmt(o.km)}km</span></button>`).join("")}</div>
    ${L.length > 4 ? `<button class="linkbtn" type="button" id="oMore">${App.othersOpen ? "접기" : `${L.length - 4}마리 더 보기`}</button>` : ""}`;
  $$(".orow", el).forEach(b => {
    b.onclick = () => { const o = App.others.find(x => x.B.id === b.dataset.id); if (!o) return; Globe.setFollow(false); $("#cFollow").setAttribute("aria-pressed", "false"); Globe.flyTo(o.lon, o.lat, Math.max(Globe.camDistance(), 2.2), 1200); };
    b.onpointerenter = () => { App.otherHover = b.dataset.id; updateOthers(); };
    b.onpointerleave = () => { App.otherHover = null; updateOthers(); };
  });
  const more = $("#oMore"); if (more) more.onclick = () => { App.othersOpen = !App.othersOpen; renderOthers(); };
}

/* ---------- scope animation ---------- */
let scopeHappy = 0, scopeT = 0;
function drawScope(dt, t) {
  if (App.mode !== "pet" || !App.A || $("#pet").hidden) return;
  scopeT += dt; if (scopeT < 1 / 30) return; scopeT = 0;
  const A = App.A, S = A.S, p = App.pos || posAt(A, App.t), tt = App.t;
  const i = nearestIdx(A, tt), pk = placeKind(runAt(A.pl, i)), rk = regionKind(runAt(A.rg, i));
  const alt = sunAlt(p.lon, p.lat, tt), sp = App.ended ? 0 : speedAt(A, tt);
  const month = new Date(tt).getMonth() + 1, north = p.lat > 0;
  const winter = north ? (month >= 11 || month <= 4) : (month >= 5 && month <= 9);
  const polarIce = Math.abs(p.lat) > 55 && winter;
  const terrain = rk === "desert" ? "desert" : rk === "range" || rk === "plateau" ? "mountain" : rk === "wetland" || rk === "delta" ? "wetland" : rk === "tundra" ? "tundra" : (Math.abs(p.lat) > 50 ? "forest" : "grass");
  const sea = pk === "sea" || pk === "lake";
  let mode, under = false, env = sea ? pk : "land", floor = false;
  if (S.move === "fly") mode = sp > 6 || sea ? (sp > 2 || S.look === "tern" || S.look === "frigate" || S.look === "albatross" ? "fly" : "float") : "stand";
  else if (S.move === "walk") mode = sp > .25 ? "walk" : "stand";
  else {
    const deep = S.look === "whale" || S.look === "marlin" || S.look === "turtle";
    if (deep) { mode = "swim"; under = true; floor = S.look === "turtle"; env = "sea"; }
    else if (!sea) { mode = "float"; env = "sea"; }
    else if (sp > 1.2) { mode = "swim"; under = true; floor = S.look === "bearded"; }
    else mode = "float";
  }
  scopeHappy = Math.max(0, scopeHappy - dt * .9);
  const heading = (() => { const a = posAt(A, tt - 3 * HOUR), b = posAt(A, tt + 3 * HOUR); const dl = ((b.lon - a.lon + 540) % 360) - 180; return Math.abs(dl) < .01 ? 1 : dl > 0 ? 1 : -1; })();
  Critter.scene($("#scopeCv"), {
    look: S.look, t, alt, moon: moonPhase(tt), env, terrain, snow: S.look === "caribou" && winter, ice: polarIce && (S.look === "ringed" || S.look === "bearded"),
    mode, under, floor, heading, sleep: false, happy: scopeHappy, big: { whale: .8, marlin: .72, turtle: .66, caribou: .62, albatross: .5, frigate: .56, pelican: .6 }[S.look] || .64,
  });
}

/* ============================================================ journal tabs ============================================================ */
function setTab(tab) { App.tab = tab; $$(".tab").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === tab)); renderTab(); }
function renderTab(keep) {
  if (App.mode !== "pet") return;
  const el = $("#tabBody"), top = el.scrollTop;
  ({ day: tabDay, trip: tabTrip, signal: tabSignal, passport: tabPassport, badges: tabBadges, info: tabInfo })[App.tab]();
  el.scrollTop = keep ? top : 0;
}
function viewDay(k, fly = true) {
  const A = App.A, D = buildDays(A); k = clamp(k, 0, App.lastK); App.dayView = k;
  const d = D[k];
  Globe.highlight(d.a, Math.min(d.b, App.t));
  if (fly && k !== App.lastK) { Globe.setFollow(false); $("#cFollow").setAttribute("aria-pressed", "false"); const e = posAt(A, Math.min(d.b, App.t)); Globe.flyTo(e.lon, e.lat, Math.min(Globe.camDistance(), 2.6), 1200); }
  if (k === App.lastK && fly) { Globe.highlight(null, null); followNow(); }
  renderTimeline();
  if (App.tab !== "day") { App.tab = "day"; $$(".tab").forEach(x => x.setAttribute("aria-selected", x.dataset.tab === "day")); }
  renderTab();
  if (narrow()) $("#journal").scrollIntoView({ behavior: "smooth", block: "start" });
}
function followNow() { const p = App.pos; Globe.setFollow(true); $("#cFollow").setAttribute("aria-pressed", "true"); if (p) Globe.flyTo(p.lon, p.lat, Math.min(Globe.camDistance(), 2.6), 1000); }

// 24 hours of the viewer's clock: daylight where the animal was, the fixes, status messages
function stripSVG(S) {
  const W = 320, y0 = 12, bh = 20, H = 50;
  const col = { day: "rgba(255,206,140,.66)", twi: "rgba(160,150,225,.42)", night: "rgba(6,10,24,.0)" };
  let g = `<defs><clipPath id="stripClip"><rect x="0" y="${y0}" width="${W}" height="${bh}" rx="6"/></clipPath>
    <pattern id="stripHatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="rgba(5,8,16,.9)"/><path d="M0 0v6" stroke="rgba(176,196,240,.16)" stroke-width="2"/></pattern></defs>
    <rect x="0" y="${y0}" width="${W}" height="${bh}" rx="6" fill="rgba(14,22,48,.95)"/><g clip-path="url(#stripClip)">`;
  for (const [a, b, kind] of S.bands) if (kind !== "night") g += `<rect x="${(a * W).toFixed(1)}" y="${y0}" width="${((b - a) * W).toFixed(1)}" height="${bh}" fill="${col[kind]}"/>`;
  if (S.before > 0) g += `<rect x="0" y="${y0}" width="${(S.before * W).toFixed(1)}" height="${bh}" fill="url(#stripHatch)"/>`;
  if (S.after < 1) g += `<rect x="${(S.after * W).toFixed(1)}" y="${y0}" width="${((1 - S.after) * W).toFixed(1)}" height="${bh}" fill="url(#stripHatch)"/>`;
  if (S.now != null) g += `<line x1="${(S.now * W).toFixed(1)}" x2="${(S.now * W).toFixed(1)}" y1="${y0}" y2="${y0 + bh}" stroke="#ffd2a1" stroke-width="1" stroke-dasharray="2 2" opacity=".8"/>`;
  g += "</g>";
  for (const [x, q] of S.fixes) g += `<line x1="${(x * W).toFixed(1)}" x2="${(x * W).toFixed(1)}" y1="${y0 - 3}" y2="${y0 + bh + 3}" stroke="${qcol(q)}" stroke-width="1.6" stroke-linecap="round"/>`;
  for (const [x, c] of S.st) g += `<path d="M${(x * W).toFixed(1)} ${y0 - 10}l3.5 3.5-3.5 3.5-3.5-3.5z" fill="${c === "a" ? "#93d99a" : c === "d" ? "#ff8f9e" : "#b2bccd"}"/>`;
  if (S.now != null) g += `<path d="M${(S.now * W).toFixed(1)} ${y0 + bh + 1}l4 6h-8z" fill="#ffd2a1"/>`;
  for (const h of [0, 6, 12, 18, 24]) g += `<text x="${Math.min(W - 6, Math.max(6, h / 24 * W))}" y="${H - 1}" text-anchor="middle" font-size="8.5" font-family="IBM Plex Mono, monospace" fill="#7c889e">${h}</text>`;
  return `<figure class="strip"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="하루 24시간 동안 그곳의 낮과 밤, 위치 기록 ${S.fixes.length}번">${g}</svg>
    <figcaption>내 시간 0~24시 · <span class="k-day">밝은 칸</span> 그곳의 낮 · <span class="k-fix">세로선</span> 위치 기록${S.st.length ? " · ◆ 태그 상태 신호" : ""}${S.before > 0 || S.after < 1 ? " · 빗금은 기록 밖" : ""}</figcaption></figure>`;
}
function fixChips(A, fx) {
  if (!fx.length) return "";
  const show = fx.slice(0, 24);
  return `<div class="fxs">${show.map(i => `<span class="fx" style="--q:${qcol(A.QS[i])}" title="${esc(timeKo(A.T[i]) + " · " + QUAL[A.QS[i]].kind + " " + QUAL[A.QS[i]].txt + (A.NF[i] > 1 ? ` · 기록 ${A.NF[i]}개를 묶음` : ""))}">${hhmm(A.T[i])}</span>`).join("")}${fx.length > 24 ? `<span class="fx more">+${fx.length - 24}</span>` : ""}</div>`;
}
function tabDay() {
  const pet = App.pet, A = App.A, k = App.dayView ?? App.lastK, m = Story.meetDay(pet, A);
  const C = Story.card(pet, A, k, k === App.lastK && !App.ended ? App.t : Infinity), x = C.x, d = x.d;
  const pre = k < m, today = k === App.lastK && !App.ended;
  const rel = pre ? `만나기 ${m - k}일 전` : k === m ? "만난 날" : `만난 지 ${k - m}일째`;
  const st = x.newPl.filter(c => !(k === 0 && c === runAt(A.pl, 0)));
  const sec = (title, rows, extra = "") => rows && rows.length ? `<section class="osec"><h4>${title}</h4>${rowsHTML(rows)}${extra}</section>` : "";
  const editing = App.editing === k, mine = pet.memos[k];
  $("#tabBody").innerHTML = `
    <div class="daynav"><button class="iconbtn" type="button" id="dPrev" aria-label="전날 일지" ${k <= 0 ? "disabled" : ""}>${ARROW_L}</button>
      <div class="when"><b>${dateKoW(d.s)}${today ? " · 오늘" : ""}</b>${new Date(d.s).getFullYear()}년 · 기록 ${k + 1}일째 · ${rel}</div>
      <button class="iconbtn" type="button" id="dNext" aria-label="다음 날 일지" ${k >= App.lastK ? "disabled" : ""}>${ARROW_R}</button></div>
    <article class="obs${pre ? " pre" : ""}">
      <header class="obs-h"><span>관측 일지</span><span class="mono">${esc(shortName(A))} #${esc(tagShort(A))} · ${pre ? "만나기 전" : "D+" + (k - m)}</span></header>
      ${st.length ? `<div class="stamp-mini" aria-hidden="true">${Story.stampSVG(st[0], d.s, hashStr(A.id + st[0]) % 100000, false)}</div>` : ""}
      ${stripSVG(C.strip)}
      ${C.hl.length ? `<ul class="hl">${C.hl.map(([ic, t]) => `<li class="hl-${ic}">${ICO(HL_ICON[ic])}<span>${esc(t)}</span></li>`).join("")}</ul>` : ""}
      ${sec("위치", C.rows.pos)}${sec("이동", C.rows.move)}${sec("신호", C.rows.sig, fixChips(A, x.fx))}${sec("하늘", C.rows.sky)}
      ${C.tagRows ? sec("태그를 단 날", C.tagRows) : ""}${C.endRows ? sec("기록의 끝", C.endRows) : ""}
    </article>
    <p class="faint note">모든 값은 위치 기록과 그 시각, 태그가 보낸 상태 신호에서 계산했어요. 기록 사이의 위치와 거리는 두 기록을 지구 표면의 가장 짧은 길로 이어 구했어요.</p>
    ${pre ? "" : mine && !editing ? `<div class="mymemo"><div class="mm-h"><span>내 메모</span><button class="linkbtn" type="button" id="mEdit">고치기</button></div><p>${esc(mine)}</p></div>`
      : `<div class="memo"><label for="mTxt">내 메모</label><textarea id="mTxt" maxlength="200" placeholder="이날 기록을 보고 떠오른 것을 적어 두세요">${esc(App.drafts[k] ?? mine ?? "")}</textarea>
      <div class="r-row"><span>이 기기에만 저장돼요</span><button class="btn small primary" type="button" id="mSave">저장</button></div></div>`}`;
  $("#dPrev").onclick = () => viewDay(k - 1);
  $("#dNext").onclick = () => viewDay(k + 1);
  const ta = $("#mTxt");
  if (ta) ta.oninput = () => { App.drafts[k] = ta.value; };
  const save = $("#mSave");
  if (save) save.onclick = () => {
    const v = ta.value.trim(); if (!v) return ta.focus();
    const fresh = !pet.memos[k];
    pet.memos[k] = v.slice(0, 200); delete App.drafts[k]; App.editing = null;
    const g = fresh ? Story.gain(pet, "memo") : 0; Store.save();
    toast("메모를 저장했어요" + plus(g)); renderPet(true); tabDay();
  };
  const ed = $("#mEdit"); if (ed) ed.onclick = () => { App.editing = k; App.drafts[k] = pet.memos[k]; tabDay(); $("#mTxt").focus(); };
  if (!pre && !pet.seen[k]) { pet.seen[k] = 1; const g = Story.gain(pet, "read"); Store.save(); if (g) renderPet(true); }
}

function tabTrip() {
  const pet = App.pet, A = App.A, D = buildDays(A), m = Story.meetDay(pet, A), t = App.t;
  const R = Story.records(A, t), ST = Story.stays(A, t);
  const goT = (ms, ll) => { const k = dayIndexAt(A, ms); return `data-k="${k}"${ll ? ` data-ll="${ll[0].toFixed(3)},${ll[1].toFixed(3)}"` : ""}`; };
  const rec = [];
  if (R.day) rec.push([`하루 가장 많이 이동`, `${kmFmt(R.day.km)}km`, `${dateKo(D[R.day.k].s)}`, goT(D[R.day.k].s)]);
  if (R.fast) rec.push(["가장 빠른 구간", `시속 ${fmt(R.fast.v, R.fast.v < 10 ? 1 : 0)}km`, `${dateKo(A.T[R.fast.i], false)} ${timeKo(A.T[R.fast.i])}부터 ${Story.hm((A.T[R.fast.i + 1] - A.T[R.fast.i]) / MIN)} 사이 평균`, goT(A.T[R.fast.i], [A.X[R.fast.i + 1], A.Y[R.fast.i + 1]])]);
  const at = i => `${dateKo(A.T[i], false)} · ${placeName(runAt(A.pl, i)) || ""}`;
  rec.push(["가장 북쪽", `${A.Y[R.north] >= 0 ? "북위" : "남위"} ${Math.abs(A.Y[R.north]).toFixed(2)}°`, at(R.north), goT(A.T[R.north], [A.X[R.north], A.Y[R.north]])]);
  rec.push(["가장 남쪽", `${A.Y[R.south] >= 0 ? "북위" : "남위"} ${Math.abs(A.Y[R.south]).toFixed(2)}°`, at(R.south), goT(A.T[R.south], [A.X[R.south], A.Y[R.south]])]);
  rec.push(["출발지에서 가장 먼 곳", `${kmFmt(hav(A.X[0], A.Y[0], A.X[R.far], A.Y[R.far]))}km`, at(R.far), goT(A.T[R.far], [A.X[R.far], A.Y[R.far]])]);
  if (R.meas > 20 && R.meas > R.tot * .3) rec.push(["해 진 뒤 이동", `${pct(R.night / R.meas)}%`, `8시간 안쪽으로 이어진 기록 ${kmFmt(R.meas)}km 가운데`, ""]);
  if (R.gap) rec.push(["가장 오래 끊긴 신호", R.gap.dt >= 2 * DAY ? `${fmt(R.gap.dt / DAY, 1)}일` : Story.hm(R.gap.dt / MIN), `${dateKo(A.T[R.gap.i], false)} ${timeKo(A.T[R.gap.i])} 다음 기록까지`, goT(A.T[R.gap.i])]);
  const rows = [];
  for (let k = App.lastK; k >= 0; k--) {
    const d = Story.digest(A, k), pre = k < m, today = k === App.lastK;
    const x = today ? Story.day(A, k, t) : null, raw = x ? x.raw : d.raw, km = x ? x.km : d.km, stc = (x ? x.st : d.st).map(s => s.c);
    const sub = [regionName(d.rg), cityName(d.ci) && cityName(d.ci) + " 근처"].filter(Boolean).join(" · ") || (placeKind(d.pl) === "sea" ? "바다 위" : "");
    const flag = stc.includes("d") ? ` · <span class="bad">dead 신호</span>` : stc.some(c => c !== "a") ? " · 상태 신호" : "";
    rows.push(`<button class="dl${pre ? " pre" : ""}" type="button" data-k="${k}"><span class="d">${pre ? "지난날" : "D+" + (k - m)}<br>${dateShort(d.s)}</span>
      <span class="p">${esc(placeName(d.pl) || "")}${d.newPl.length && k > 0 ? ` <span class="new">새 도장</span>` : ""}<small>${esc(sub)}${sub ? " · " : ""}${raw ? `기록 ${raw}번` : "기록 없음"}${flag}</small></span><span class="km">${kmFmt(km)}km</span></button>`);
  }
  $("#tabBody").innerHTML = `<div class="sec"><h3>지금까지</h3>
    <div class="stats"><div class="stat"><div class="k">태그 단 뒤 이동</div><div class="v">${kmFmt(kmAt(A, t))}<small>km</small></div></div>
      <div class="stat"><div class="k">기록된 날</div><div class="v">${App.lastK + 1}<small>일</small></div></div>
      <div class="stat"><div class="k">받은 위치 기록</div><div class="v">${fmt(R.raw)}<small>개</small></div></div>
      <div class="stat"><div class="k">기록 없는 날</div><div class="v">${fmt(R.empty)}<small>일</small></div></div></div></div>
    <div class="sec"><h3>기록 모음</h3><div class="recs">${rec.map(([a, b, c, go]) => `<button class="rec" type="button" ${go || "disabled"}><span class="rk">${esc(a)}</span><b>${esc(b)}</b><small>${esc(c)}</small></button>`).join("")}</div></div>
    <div class="sec"><h3>머문 곳 <span class="mono faint">${ST.length}</span></h3>
      <p class="faint small">위치가 사흘 넘게 처음 자리에서 25km 안에 있었던 때예요.</p>
      ${ST.length ? `<div class="stays">${ST.slice().reverse().map(s => `<button class="stay" type="button" ${goT(s.t0, [s.lon, s.lat])}><b>${esc(placeName(s.pl) || "")}${s.open ? ` <span class="now">지금 머무는 중</span>` : ""}</b>
        <small>${esc([regionName(s.rg), cityName(s.ci) && cityName(s.ci) + " 근처"].filter(Boolean).join(" · "))}</small>
        <span class="mono">${dateShort(s.t0)} ~ ${dateShort(s.t1)} · ${fmt(s.days, s.days < 10 ? 1 : 0)}일 · 기록 ${s.nfix}개</span></button>`).join("")}</div>` : `<p class="muted small">아직 없어요.</p>`}</div>
    ${A.se ? seasonHTML(Story.signal(A, t).seasons) : ""}
    <div class="sec"><h3>날마다</h3><div class="dlist">${rows.join("")}</div></div>`;
  const tb = $("#tabBody");
  $$("[data-k]", tb).forEach(b => b.onclick = () => {
    const k = +b.dataset.k, ll = b.dataset.ll;
    if (ll) { const [lo, la] = ll.split(",").map(Number); viewDay(k, false); Globe.setFollow(false); $("#cFollow").setAttribute("aria-pressed", "false"); Globe.flyTo(lo, la, Math.min(Globe.camDistance(), 2.4), 1200); }
    else viewDay(k);
  });
}
function seasonHTML(S) {
  if (!S || !S.runs.length) return "";
  return `<div class="sec"><h3>연구자가 붙인 계절</h3>
    <div class="seasons">${S.runs.map(r => `<span class="sr ${r.c}" style="flex:${Math.max(1, (r.t1 - r.t0) / DAY)}" title="${esc(SEASON_KO[r.c])} ${esc(dateKo(r.t0))} ~ ${esc(dateKo(r.t1))}"></span>`).join("")}</div>
    <p class="muted small">${S.runs.map(r => `${SEASON_KO[r.c]} ${dateShort(r.t0)}~${dateShort(r.t1)}`).join(" · ")}</p>
    ${S.km != null ? `<p class="small">여름으로 표시된 위치들의 한가운데와 겨울로 표시된 위치들의 한가운데는 <b>${kmFmt(S.km)}km</b> 떨어져 있어요.</p>` : ""}</div>`;
}

function tabSignal() {
  const A = App.A, t = App.t, G = Story.signal(A, t), D = buildDays(A), K = App.lastK, m = Story.meetDay(App.pet, A);
  const raw = G.perDay.reduce((s, v) => s + v, 0), withFix = G.perDay.filter(v => v > 0).length, maxN = Math.max(1, ...G.perDay);
  const W = 320, H = 64, bw = W / G.perDay.length;
  let bars = "";
  G.perDay.forEach((v, k) => {
    const h = v ? 4 + (H - 18) * Math.sqrt(v / maxN) : 0, x = k * bw;
    bars += v ? `<rect x="${x.toFixed(2)}" y="${(H - 12 - h).toFixed(1)}" width="${Math.max(.6, bw - (bw > 3 ? 1 : 0)).toFixed(2)}" height="${h.toFixed(1)}" rx="${bw > 4 ? 1.5 : 0}" fill="${k < m ? "rgba(245,166,91,.4)" : "#f5a65b"}" data-k="${k}"><title>${dateKo(D[k].s)} · 기록 ${v}번</title></rect>`
      : `<rect x="${x.toFixed(2)}" y="${H - 14}" width="${Math.max(.6, bw - (bw > 3 ? 1 : 0)).toFixed(2)}" height="2" fill="rgba(255,143,158,.55)" data-k="${k}"><title>${dateKo(D[k].s)} · 기록 없음</title></rect>`;
  });
  const lab = k => `<text x="${clamp(k * bw + bw / 2, 14, W - 14).toFixed(1)}" y="${H - 1}" text-anchor="middle" font-size="8.5" font-family="IBM Plex Mono, monospace" fill="#7c889e">${dateShort(D[k].s)}</text>`;
  const perDay = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="날마다 받은 위치 기록 수">${bars}${lab(0)}${K > 0 ? lab(K) : ""}</svg>`;
  let html = `<div class="sec"><h3>태그가 보낸 것</h3>
    <div class="stats"><div class="stat"><div class="k">받은 위치 기록</div><div class="v">${fmt(raw)}<small>개</small></div></div>
      <div class="stat"><div class="k">기록 있는 날</div><div class="v">${withFix}<small>/ ${K + 1}일</small></div></div>
      <div class="stat"><div class="k">마지막 기록</div><div class="v sm">${esc(App.ended ? dateKo(A.t1, false) : Story.agoKo(G.since))}</div></div>
      <div class="stat"><div class="k">가장 오래 끊긴 때</div><div class="v sm">${G.gap ? (G.gap.dt >= 2 * DAY ? fmt(G.gap.dt / DAY, 1) + "일" : esc(Story.hm(G.gap.dt / MIN))) : "-"}</div></div></div></div>
    <div class="sec"><h3>날마다 받은 위치 기록</h3>${perDay}<p class="faint small">막대를 누르면 그날 일지로 가요. 흐린 막대는 만나기 전, 붉은 줄은 기록이 없던 날이에요.</p></div>
    <div class="sec"><h3>위치를 재는 방법</h3><p class="small muted">${esc(A.loc)} · ${esc(Story.METHOD[A.method])}</p>
      <div class="sub-h">정확도</div>${mixHTML(G.mix)}
      ${G.er ? `<p class="small">이 기록에는 위치마다 오차 반경이 있어요. 지금까지 중간값 <b>${Story.erFmt(G.er.med)}</b>, 가장 작게 ${Story.erFmt(G.er.min)}, 가장 크게 ${Story.erFmt(G.er.max)}예요.${A.ER && A.coarse ? " 지구본의 둥근 테두리가 지금 위치의 오차 범위예요." : ""}</p>` : ""}</div>`;
  if (A.status.length) html += batteryHTML(A, G.st, t);
  $("#tabBody").innerHTML = html;
  $$(".chart [data-k]").forEach(r => r.addEventListener("click", () => viewDay(+r.getAttribute("data-k"))));
}
function batteryHTML(A, st, t) {
  if (!st.length) return `<div class="sec"><h3>태그 배터리와 상태 신호</h3><p class="muted small">아직 받은 상태 신호가 없어요.</p></div>`;
  const W = 320, H = 96, t0 = Math.min(A.T[0], st[0].t), t1 = Math.max(t, st[st.length - 1].t), vs = st.map(s => s.v);
  const lo = Math.min(...vs) - 40, hi = Math.max(...vs) + 40;
  const X = ms => 8 + (W - 54) * (ms - t0) / Math.max(1, t1 - t0), Y = v => 8 + (H - 30) * (1 - (v - lo) / (hi - lo));
  const path = st.map((s, i) => `${i ? "L" : "M"}${X(s.t).toFixed(1)} ${Y(s.v).toFixed(1)}`).join("");
  const dots = st.map(s => `<circle cx="${X(s.t).toFixed(1)}" cy="${Y(s.v).toFixed(1)}" r="${s.c === "a" ? 2.6 : 3.6}" fill="${s.c === "a" ? "#93d99a" : s.c === "d" ? "#ff8f9e" : "#b2bccd"}"><title>${dateKo(s.t)} ${timeKo(s.t)} · ${MORT[s.c]} · ${fmt(s.v)}mV</title></circle>`).join("");
  const yl = v => `<text x="${W - 2}" y="${(Y(v) + 3).toFixed(1)}" text-anchor="end" font-size="8.5" font-family="IBM Plex Mono, monospace" fill="#7c889e">${fmt(v)}</text>`;
  const cnt = {}; for (const s of st) cnt[s.c] = (cnt[s.c] || 0) + 1;
  const recent = st.slice(-6).reverse();
  return `<div class="sec"><h3>태그 배터리와 상태 신호</h3>
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="태그 배터리 전압 변화">
      <path d="${path}" fill="none" stroke="rgba(245,166,91,.7)" stroke-width="1.4"/>${dots}${yl(Math.max(...vs))}${Math.min(...vs) !== Math.max(...vs) ? yl(Math.min(...vs)) : ""}
      <text x="8" y="${H - 4}" font-size="8.5" font-family="IBM Plex Mono, monospace" fill="#7c889e">${dateShort(t0)}</text>
      <text x="${W - 46}" y="${H - 4}" text-anchor="end" font-size="8.5" font-family="IBM Plex Mono, monospace" fill="#7c889e">${dateShort(t1)}</text></svg>
    <p class="small muted">상태 신호 ${st.length}번 · ${Object.keys(cnt).map(c => `${MORT[c]} ${cnt[c]}번`).join(", ")}. 전압 단위는 mV예요.</p>
    ${rowsHTML(recent.map(s => [`${dateShort(s.t)} ${hhmm(s.t)}`, `${MORT_KO[s.c]} (${MORT[s.c]})`, `배터리 ${fmt(s.v)}mV`]))}
    <p class="faint small">'dead'는 태그가 한동안 움직임을 느끼지 못하면 보내는 신호예요. 이 연구에는 dead 신호 뒤에 다시 움직인 새도 있어서, 이 신호만으로 죽었다고 단정할 수는 없어요.</p></div>`;
}

function tabPassport() {
  const pet = App.pet, A = App.A, m = Story.meetDay(pet, A);
  const st = Story.stamps(A, App.t);
  const mine = st.filter(s => s.s > pet.anchorTrack).length;
  $("#tabBody").innerHTML = `<div class="sec"><h3>${esc(pet.name)}의 여권</h3>
    <p class="muted" style="margin:0;font-size:13px">위치 기록이 처음 들어간 나라와 바다마다 도장을 찍어요. 흐린 도장은 만나기 전에 찍힌 거예요. 함께 모은 도장 ${mine}개.</p></div>
    <div class="passport">${st.map((s, i) => `<button class="stamp${s.k < m ? " pre" : ""}" type="button" data-k="${s.k}" title="${esc(placeName(s.c))} · ${esc(dateKo(s.s))} ${esc(timeKo(s.s))}">${Story.stampSVG(s.c, s.s, hashStr(A.id + s.c) % 100000, i === 0)}</button>`).join("")}
    ${App.ended ? "" : `<div class="stamp next">다음 도장은<br>어디일까요?</div>`}</div>`;
  $$(".stamp[data-k]").forEach(b => b.onclick = () => viewDay(+b.dataset.k));
}
function tabBadges() {
  const pet = App.pet, A = App.A, B = Story.badges(pet, A, App.t, App.ended);
  $("#tabBody").innerHTML = `<div class="sec"><h3>배지 ${B.filter(b => b.got).length} / ${B.length}</h3></div>
    <div class="badges">${B.map(b => `<div class="badge${b.got ? "" : " locked"}" style="color:${b.got ? "var(--monarch-2)" : "var(--ink-3)"}">${b.svg}<div><b style="color:var(--ink)">${esc(b.name)}</b><span class="muted">${esc(b.desc)}</span></div></div>`).join("")}</div>`;
}
function tabInfo() {
  const pet = App.pet, A = App.A, S = A.S, src = A.src_;
  $("#tabBody").innerHTML = `
    <div class="sec"><h3>이름</h3><div class="field" style="flex-direction:row;gap:8px"><input id="iName" maxlength="12" value="${esc(pet.name)}" style="flex:1;min-width:0" aria-label="이름"><button class="btn small" type="button" id="iSave">바꾸기</button></div></div>
    <div class="sec"><h3>시간</h3><p class="muted" style="margin:0;font-size:13px">${pet.mode === "sync" ? `${pet.k}년 전 오늘에 맞춰 진짜 시간과 같은 속도로 흘러요. 그때 위치를 잰 시각이 되면 지금도 같은 시각에 새 기록이 들어와요. 오늘 밤 12시가 지나면 다음 날 일지가 시작돼요.` : `태그를 단 날부터 시작했어요. 지금 속도는 ${pet.pace === 1 ? "하루에 하루" : pet.pace === 24 ? "한 시간에 하루" : "1분에 하루"}예요.`}</p>
      ${pet.mode === "start" ? `<div class="chips" id="iPace">${[[1, "하루에 하루"], [24, "한 시간에 하루"], [1440, "1분에 하루"]].map(([v, l]) => `<button class="chip" type="button" data-v="${v}" aria-pressed="${pet.pace === v}">${l}</button>`).join("")}</div>` : ""}</div>
    <div class="sec"><h3>입양 증서</h3><button class="btn small" type="button" id="iCert">증서 다시 보기</button></div>
    <div class="sec"><h3>이 동물의 기록</h3><dl class="kv">
      <dt>종</dt><dd>${esc(S.ko)} <i class="faint">${esc(S.sci)}</i></dd><dt>태그</dt><dd>#${esc(A.tag)}</dd>
      <dt>출발지</dt><dd>${esc(A.home)}</dd><dt>기록 기간</dt><dd>${dateKo(A.T[0])} ~ ${App.ended ? dateKo(A.t1) : "진행 중"}</dd>
      <dt>나이·성별</dt><dd>${esc(A.ageText || "기록 없음")} · ${A.sex === "f" ? "암컷" : A.sex === "m" ? "수컷" : "기록 없음"}</dd></dl>
      ${rowsHTML(Story.contents(A, App.ended ? Infinity : App.t).filter(r => r[0] !== "위치 기록"))}
      <p class="faint small">${esc(Story.NOT_IN)}</p>
      <div class="src">자료: ${esc(src.who || "")} · <a href="${esc(src.url || "#")}" target="_blank" rel="noopener">${esc(src.title || "")}</a> (${esc(src.via || "")})</div></div>
    <div class="sec"><h3>알아 두기</h3><p class="muted" style="margin:0;font-size:13px">위치는 실시간이 아니라 몇 년 전 실제 기록이에요. 지구본의 작은 점이 태그가 실제로 잰 위치이고, 선은 그 사이를 지구 표면의 가장 짧은 길로 이은 거예요. 낮과 밤, 해 뜨고 지는 시각, 별자리, 달 모양은 그 시각 그 장소를 기준으로 계산했어요. 구름은 날씨가 아니라 위성 사진 한 장이에요.</p></div>
    <div class="sec"><h3>다른 기기로 옮기기</h3><p class="muted small" style="margin:0">입양 기록은 이 브라우저에만 저장돼요. 아래 코드를 복사해 다른 기기의 같은 칸에 붙여 넣으면 그대로 옮겨져요.</p>
      <div class="field" style="flex-direction:row;gap:8px"><input id="iCode" readonly value="${esc(Store.exportCode())}" style="flex:1;min-width:0;font-family:var(--f-mono);font-size:11px" aria-label="백업 코드"><button class="btn small" type="button" id="iCopy">복사</button></div>
      <div class="field" style="flex-direction:row;gap:8px"><input id="iPaste" placeholder="NABIYA1: 로 시작하는 코드 붙여 넣기" style="flex:1;min-width:0;font-size:12px" aria-label="옮겨 올 코드"><button class="btn small" type="button" id="iLoad">불러오기</button></div>
      <div id="iMsg" class="small faint"></div></div>
    <div class="sec"><h3>작별</h3><div id="byeBox"><button class="btn small" type="button" id="iBye">${esc(josa(pet.name, "과/와"))} 작별하기</button></div></div>`;
  $("#iSave").onclick = () => { const v = $("#iName").value.trim().slice(0, 12); if (!v) return; pet.name = v; Store.save(); renderPet(true); renderSwitch(); renderModeBtn(); toast(`이제 이름은 ${esc(v)}예요`); };
  $$("#iPace .chip").forEach(c => c.onclick = () => {
    const now = Date.now(), t = Story.petClock(pet, A, now);
    pet.anchorReal = now; pet.anchorTrack = t; pet.pace = +c.dataset.v; Store.save(); tabInfo();
  });
  $("#iCert").onclick = () => showCert(pet, false);
  $("#iCopy").onclick = () => {
    const inp = $("#iCode"), done = () => { $("#iMsg").textContent = "복사했어요."; };
    try { navigator.clipboard.writeText(inp.value).then(done, () => { inp.select(); $("#iMsg").textContent = "코드를 선택해 두었어요. 직접 복사해 주세요."; }); }
    catch (e) { inp.select(); $("#iMsg").textContent = "코드를 선택해 두었어요. 직접 복사해 주세요."; }
  };
  $("#iLoad").onclick = () => {
    if (!Store.importCode($("#iPaste").value)) { $("#iMsg").textContent = "코드를 읽지 못했어요. NABIYA1: 부터 끝까지 붙여 넣었는지 확인해 주세요."; return; }
    Store.state.pets = Store.state.pets.filter(p => DB.byId.has(p.aid)); Store.save();
    toast("입양 기록을 불러왔어요"); activePet() ? enterPet() : enterBrowse();
  };
  $("#iBye").onclick = () => {
    $("#byeBox").innerHTML = `<div class="confirm">정말 작별할까요? 메모와 도장, 배지가 모두 사라져요.<div style="display:flex;gap:8px"><button class="btn small" type="button" id="byeNo">아니요</button><button class="btn small" type="button" id="byeYes" style="border-color:rgba(255,143,158,.5);color:var(--heart)">작별하기</button></div></div>`;
    $("#byeNo").onclick = tabInfo;
    $("#byeYes").onclick = () => { const st = Store.state; st.pets = st.pets.filter(p => p.id !== pet.id); st.active = st.pets[0] ? st.pets[0].id : null; Store.save(); App.pet = null; st.pets.length ? enterPet() : enterBrowse(); };
  };
}

/* ---------- timeline ---------- */
function renderTimeline() {
  const pet = App.pet, A = App.A; if (!pet) return;
  const D = buildDays(A), m = Story.meetDay(pet, A), K = App.lastK, sel = App.dayView ?? K;
  const today = K >= 0 ? Story.day(A, K, App.t) : null;
  const kmOf = k => k === K ? today.km : D[k].km, rawOf = k => k === K ? today.raw : D[k].raw, stOf = k => (k === K ? today.st : D[k].st).map(s => s.c);
  let maxKm = 1; for (let k = 0; k <= K; k++) maxKm = Math.max(maxKm, kmOf(k));
  const html = [];
  for (let k = 0; k <= K; k++) {
    const d = D[k], km = kmOf(k), raw = rawOf(k), sc = stOf(k), h = 4 + 20 * Math.sqrt(km / maxKm), cls = ["dpill"];
    if (k < m) cls.push("pre"); if (k === K) cls.push("today"); if (d.newPl.length && k > 0) cls.push("stamp-day");
    if (!raw) cls.push("nofix"); if (sc.includes("d")) cls.push("st-d"); else if (sc.some(c => c !== "a")) cls.push("st-u");
    html.push(`<button class="${cls.join(" ")}" type="button" data-k="${k}" ${k === sel ? 'aria-current="true"' : ""} title="${dateKo(d.s)} · ${esc(placeName(d.pl) || "")} · ${kmFmt(km)}km · ${raw ? `기록 ${raw}번` : "기록 없음"}${sc.length ? " · 상태 " + sc.map(c => MORT[c]).join(",") : ""}"><i style="height:${h.toFixed(1)}px"></i>${new Date(d.s).getDate()}</button>`);
  }
  if (!App.ended) html.push(`<span class="dpill" aria-hidden="true" style="opacity:.5">?</span>`);
  const el = $("#tlDays"); el.innerHTML = html.join("");
  const d = D[sel];
  $("#tlLabel").innerHTML = `<b>${sel < m ? "지난날" : "D+" + (sel - m)} · ${dateKo(d.s, false)}</b>${new Date(d.s).getFullYear()}년 · ${esc(placeName(d.pl) || "")}`;
  $("#tlPrev").disabled = sel <= 0; $("#tlNext").disabled = sel >= K;
  // centre the chosen day (after the label above has taken its width)
  const centre = () => { const c = $(`.dpill[data-k="${sel}"]`, el); if (c && el.clientWidth) el.scrollLeft += c.getBoundingClientRect().left - el.getBoundingClientRect().left - (el.clientWidth - c.offsetWidth) / 2; };
  centre(); requestAnimationFrame(centre);
}

/* ---------- labels over the globe ---------- */
let labelEls = {};
function label(key, html, cls) {
  let el = labelEls[key];
  if (!el) { el = document.createElement("div"); el.className = "tag-label " + (cls || ""); $("#labels").appendChild(el); labelEls[key] = el; }
  if (el._html !== html) { el.innerHTML = html; el._html = html; }
  return el;
}
function placeLabel(el, ll, lift = 1.004) {
  if (!ll) { el.style.opacity = 0; return null; }
  const p = Globe.project(ll[0], ll[1], lift);
  el.style.opacity = p.vis ? clamp(p.facing * 4, 0, 1) : 0;
  el.style.transform = `translate(${p.x}px, ${p.y - 6}px) translate(-50%, -100%)`;
  return p;
}
const hideLabel = key => { if (labelEls[key]) labelEls[key].style.opacity = 0; };
function updateLabels() {
  if (App.mode === "pet" && App.pet && App.pos) {
    const el = label("pet", `<div class="bubble"><span class="dot"></span><b>${esc(App.pet.name)}</b></div><div class="stem"></div>`);
    const pp = placeLabel(el, [App.pos.lon, App.pos.lat]);
    const hl = label("home", `<div class="bubble" style="font-size:11px;padding:2px 8px;opacity:.8">출발</div><div class="stem" style="height:12px"></div>`, "mini");
    const hp = placeLabel(hl, [App.A.X[0], App.A.Y[0]]);
    if (pp && hp && Math.hypot(pp.x - hp.x, pp.y - hp.y) < 48) hl.style.opacity = 0;
    const o = App.otherHover && App.others.find(x => x.B.id === App.otherHover);
    if (o) placeLabel(label("other", `<div class="bubble"><span class="dot" style="background:${CLS[o.B.S.cls].color};box-shadow:0 0 10px ${CLS[o.B.S.cls].color}"></span><b>${esc(shortName(o.B))}</b> <span class="faint">#${esc(tagShort(o.B))}</span></div><div class="stem"></div>`, "mini"), [o.lon, o.lat], 1.006);
    else hideLabel("other");
    hideLabel("cand");
  } else {
    hideLabel("pet"); hideLabel("home"); hideLabel("other");
    const id = App.hover || App.sel, A = id && DB.byId.get(id);
    if (A) {
      const el = label("cand", `<div class="bubble"><span class="dot" style="background:${CLS[A.S.cls].color};box-shadow:0 0 10px ${CLS[A.S.cls].color}"></span><b>${esc(shortName(A))}</b> ${A.sync ? `<span class="faint">${A.sync.k}년 전 오늘</span>` : ""}</div><div class="stem"></div>`, "mini");
      placeLabel(el, [A.nowPos.lon, A.nowPos.lat], 1.006);
    } else hideLabel("cand");
  }
}

/* ============================================================ boot ============================================================ */
function wire() {
  $("#q").addEventListener("input", e => { App.q = e.target.value; refreshBrowse(); });
  $("#onlySync").addEventListener("change", e => { App.onlySync = e.target.checked; refreshBrowse(); });
  $("#sort").addEventListener("change", e => { App.sort = e.target.value; renderList(); });
  $("#moreF").addEventListener("click", e => { const f = $("#filters"), c = f.classList.toggle("collapsed"); e.target.textContent = c ? "필터 더 보기" : "필터 접기"; e.target.setAttribute("aria-expanded", !c); });
  $("#filters").addEventListener("click", e => {
    const c = e.target.closest(".chip"); if (!c) return;
    const f = c.closest(".chips").dataset.f, set = App.filters[f], k = c.dataset.k;
    set.has(k) ? set.delete(k) : set.add(k); refreshBrowse();
  });
  $("#list").addEventListener("click", e => { const b = e.target.closest(".cand"); if (b) select(b.dataset.id); });
  $("#list").addEventListener("pointerover", e => { const b = e.target.closest(".cand"); const id = b ? b.dataset.id : null; if (id !== App.hover) { App.hover = id; refreshCand(); } });
  $("#list").addEventListener("pointerleave", () => { App.hover = null; refreshCand(); });
  $$(".tab").forEach(b => b.addEventListener("click", () => setTab(b.dataset.tab)));
  $("#tlDays").addEventListener("click", e => { const b = e.target.closest(".dpill[data-k]"); if (b) viewDay(+b.dataset.k); });
  $("#tlPrev").onclick = () => viewDay((App.dayView ?? App.lastK) - 1);
  $("#tlNext").onclick = () => viewDay((App.dayView ?? App.lastK) + 1);
  const scope = $("#scope");
  const petIt = () => { if (!App.pet) return; scopeHappy = 1; hearts(scope); const g = Story.gain(App.pet, "pet"); if (g) { Store.save(); renderPet(true); toast("쓰다듬었어요" + plus(g), 2400); } };
  scope.addEventListener("click", petIt);
  scope.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); petIt(); } });
  $("#cFollow").onclick = () => {
    if (App.mode === "pet") {
      if (Globe.following) { Globe.setFollow(false); $("#cFollow").setAttribute("aria-pressed", "false"); }
      else { App.dayView = App.lastK; Globe.highlight(null, null); renderTimeline(); if (App.tab === "day") renderTab(); followNow(); }
    } else if (App.sel) select(App.sel);
  };
  $("#cIn").onclick = () => Globe.zoomBy(.6);
  $("#cOut").onclick = () => Globe.zoomBy(1.6);
  $("#cHome").onclick = () => { Globe.setFollow(false); $("#cFollow").setAttribute("aria-pressed", "false"); Globe.goHome(); };
  Globe.onUserMove = () => { if (App.mode === "pet" && Globe.following) { Globe.setFollow(false); $("#cFollow").setAttribute("aria-pressed", "false"); } };
  Globe.onPick = id => { if (App.mode !== "browse") return; if (id) select(id); };
  Globe.onHover = id => { if (App.mode !== "browse" || id === App.hover) return; App.hover = id; refreshCand(); };
  Globe.onFrame = (dt, t) => { updateLabels(); drawScope(dt, t); };
  document.addEventListener("keydown", e => { if (e.key === "Escape") { if (!$("#mAdopt").hidden) $("#mAdopt").hidden = true; else if (!$("#mCert").hidden && $("#certGo").textContent === "닫기") $("#mCert").hidden = true; } });
  // mobile: the globe band height follows the viewport
  const setStage = () => document.documentElement.style.setProperty("--stage-h", Math.round(Math.min(innerHeight * .52, innerWidth * 1.05)) + "px");
  setStage(); addEventListener("resize", setStage);
}

async function boot() {
  Store.load();
  wire();
  const msg = $("#ldMsg");
  let data;
  try {
    const r = await fetch("data/animals.json"); data = await r.json();
  } catch (e) { msg.textContent = "동물 기록을 불러오지 못했어요. 새로고침해 주세요."; return; }
  Object.assign(DB, { places: data.places, regions: data.regions, cities: data.cities, sources: data.sources });
  DB.animals = data.animals.map(prepAnimal); DB.animals.forEach(A => DB.byId.set(A.id, A));
  // a record that is no longer in the catalog can't be followed
  Store.state.pets = Store.state.pets.filter(p => DB.byId.has(p.aid));
  if (!Store.state.pets.some(p => p.id === Store.state.active)) Store.state.active = Store.state.pets[0] ? Store.state.pets[0].id : null;
  const now = Date.now();
  for (const A of DB.animals) {
    A.sync = syncInfo(A, now);
    const t = A.sync ? A.sync.t : A.T[0];
    A.nowPos = posAt(A, t); A.nowPlace = placeName(runAt(A.pl, nearestIdx(A, t)));
  }
  msg.textContent = "진짜 지구를 그리는 중…";
  let ok = false;
  try { ok = typeof THREE !== "undefined" && await Globe.init($("#globe")); } catch (e) { ok = false; }
  if (!ok) {
    $("#stage").insertAdjacentHTML("beforeend", `<div class="empty" style="position:absolute;inset:auto 0 40% 0">이 기기에서는 3D 지구를 그릴 수 없어요. 고르기와 관측 일지는 그대로 쓸 수 있어요.</div>`);
    // no render loop from the globe: keep the scope window alive on its own
    let last = performance.now();
    const loop = now2 => { const dt = Math.min((now2 - last) / 1000, .1); last = now2; drawScope(dt, now2 / 1000); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
  if (ok) {
    Globe.setTime(now);
    Globe.setCandidates(DB.animals.map(A => ({ id: A.id, lon: A.nowPos.lon, lat: A.nowPos.lat, color: CLS[A.S.cls].color })));
  }
  $("#loading").classList.add("done"); setTimeout(() => $("#loading").remove(), 900);
  if (activePet()) enterPet(); else { enterBrowse(); if (ok) Globe.flyTo(110, 25, Globe.homeDist(), 10); }
  setInterval(() => { if (App.mode === "pet") tick(false); else { renderClock(); Globe.setTime(Date.now()); } }, 1000);
  renderClock();
  if (ok) setTimeout(() => Globe.upgrade(), 1500);
  window.__ready = true;
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
