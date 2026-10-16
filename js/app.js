/* ============================================================
   UI — picking an animal, adoption, the pet panel, its record (오늘 · 여정 · 정보), the timeline.
   ============================================================ */
const App = {
  mode: "browse", sel: null, hover: null, q: "", sort: "recent", filters: { sp: new Set(), now: new Set() },
  pet: null, A: null, dayView: null, tab: "day", lastK: -1, ended: false, t: 0, pos: null,
  vis: new Set(), lastFix: null, lastSt: null, others: [], otherHover: null,
};
const TABS = ["day", "trip", "info"];
const narrow = () => matchMedia("(max-width: 860px)").matches;
const FDEF = {
  sp: { opts: () => { const c = {}; DB.animals.forEach(A => c[A.sp] = (c[A.sp] || 0) + 1); return Object.keys(c).sort((a, b) => c[b] - c[a]).map(k => [k, SPECIES[k].ko.replace(/ \(.+\)$/, "")]); }, get: A => A.sp },
  // where the animal is now, broadly
  now: { opts: () => GROUPS, get: A => A.nowGroups, multi: true },
};
function passes(A, skip) {
  if (App.q) { const q = App.q.toLowerCase().trim(); if (q && !q.split(/\s+/).every(w => A.search.includes(w))) return false; }
  for (const [f, set] of Object.entries(App.filters)) {
    if (f === skip || !set.size) continue;
    const v = FDEF[f].get(A);
    if (FDEF[f].multi ? ![...set].some(x => v.has(x)) : !set.has(v)) return false;
  }
  return true;
}
const visible = () => DB.animals.filter(A => passes(A));
const SORTS = { recent: (a, b) => b.t1 - a.t1, km: (a, b) => b.km - a.km, days: (a, b) => trackDays(b) - trackDays(a) };
const shortName = A => A.S.ko.replace(/ \(.+\)$/, "");
const hhmm = ms => { const d = new Date(ms); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
const pct = x => Math.round(x * 100);
const sexAgeKo = A => [A.sex === "f" ? "암컷" : A.sex === "m" ? "수컷" : "", ageKo(A)].filter(Boolean).join(" · ") || "기록 없음";
// links from the data files open only on the web
const href = u => /^https:\/\//.test(u || "") ? u : "#";

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
  place: '<path d="M12 21s-6.5-6-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15 12 21 12 21z"/><path d="M9.5 10.5h5"/>',
  line: '<path d="M3 12h18" stroke-dasharray="3 2"/><path d="M9 7l3-3 3 3M9 17l3 3 3-3"/>',
  pin: '<path d="M12 21s-6.5-6-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.3"/>',
  route: '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h6.5a3 3 0 0 0 0-6h-5a3 3 0 0 1 0-6H16"/>',
  home: '<path d="M4 11.5 12 5l8 6.5V20H4z"/><path d="M10 20v-5h4v5"/>',
  warn: '<path d="M12 4 21 19H3z"/><path d="M12 10v4M12 16.5v.01"/>',
  none: '<circle cx="12" cy="12" r="8"/><path d="M7 17 17 7"/>',
  end: '<path d="M6 4v16M6 5h11l-2.5 4L17 13H6"/>',
};

/* ---------- species photos (Wikimedia Commons, kept by pipeline/live.py) ---------- */
const photoOf = S => (S && (DB.photos[S.sci] || DB.photos[S.sci.split(" ").slice(0, 2).join(" ")])) || null;
// shown while a photo loads, and in its place when there is none
const CLS_ICON = {
  bird: '<path d="M2.5 12c3-1.5 5.8-1 8 1.4 1.9-3.3 5-5.3 11-5.6-3 1.7-5 4.3-6 7.4-.9 2.6-3.7 3.6-6.2 2.5"/>',
  sea: '<path d="M3 13.5c2 3.6 6.6 5.3 10.7 4.3 3-.7 5.1-2.9 5.7-5.4l2.6-2.2-2.7.3C17.8 7.7 14.9 6.4 11.4 6.9 7 7.5 3.8 10 3 13.5z"/>',
  fish: '<path d="M3 12c3-4 8-5.5 12.5-3.5L21 6v12l-5.5-2.5C11 17.5 6 16 3 12z"/>',
  land: '<path d="M6 20v-6l-2-4 3-5 2 4h6l2-4 3 5-2 4v6"/>',
};
function photoHTML(S, size, lazy = false) {
  const p = photoOf(S);
  return `<span class="ph${p ? "" : " none"}" style="--c:${CLS[S.cls].color}">${ICO(CLS_ICON[S.cls] || CLS_ICON.bird, 1.4)}${p ? `<img src="${esc(p[size])}" alt="${esc(S.ko)}"${lazy ? ' loading="lazy"' : ""} decoding="async">` : ""}</span>`;
}
// a photo shows the species, not this animal; its author and licence link to its Commons page
function creditHTML(S) {
  const p = photoOf(S);
  return p ? `종 사진 · <a href="${esc(href(p.page))}" target="_blank" rel="noopener">${esc([p.by || "작가 미상", p.lic].filter(Boolean).join(" · "))}</a>` : "";
}

/* ---------- toast ---------- */
let toastT = 0, toastAt = 0;
function toast(html, ms = 3800) {
  const t = $("#toast");
  t.innerHTML = `<i class="tdot" aria-hidden="true"></i><span>${html}</span>`;
  t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), ms); toastAt = performance.now();
}
const PACES = [[1, "실제 속도"], [24, "1시간에 하루"], [1440, "1분에 하루"]];
const paceKo = v => (PACES.find(p => p[0] === v) || PACES[0])[1];
// raw fixes received after time a, up to and including b
const fixesBetween = (A, a, b) => { let n = 0; for (let i = idxAt(A, a) + 1, e = idxAt(A, b); i <= e; i++) n += A.NF[i]; return n; };

/* ============================================================ browse ============================================================ */
function renderFilters() {
  for (const box of $$("#filters .chips")) {
    const f = box.dataset.f, def = FDEF[f], set = App.filters[f];
    const base = DB.animals.filter(A => passes(A, f));
    const opts = def.opts().map(([k, label]) => [k, label, base.filter(A => def.multi ? def.get(A).has(k) : def.get(A) === k).length])
      .filter(([k, , n]) => n || set.has(k));
    box.innerHTML = opts.map(([k, label, n]) => `<button class="chip" type="button" data-k="${k}" aria-pressed="${set.has(k)}">${esc(label)} <span class="n">${n}</span></button>`).join("");
    // one choice is no choice
    box.parentElement.hidden = opts.length < 2 && !set.size;
  }
}
function renderList() {
  const list = visible().sort(SORTS[App.sort]);
  $("#count").textContent = `${list.length}마리` + (list.length !== DB.animals.length ? ` / 전체 ${DB.animals.length}마리` : "");
  const el = $("#list");
  App.vis = new Set(list.map(A => A.id));
  if (!DB.animals.length) { el.innerHTML = `<div class="empty">${DB.liveFailed ? "지금 추적 중인 동물을 불러오지 못했어요." : "지금 추적 중인 동물이 없어요."}</div>`; refreshCand(); return; }
  if (!list.length) { el.innerHTML = `<div class="empty">조건에 맞는 동물이 없어요.<br><button class="btn small" type="button" id="resetF" style="margin-top:10px">조건 모두 지우기</button></div>`; $("#resetF").onclick = resetFilters; refreshCand(); return; }
  const now = Date.now();
  el.innerHTML = list.map(A => {
    const pills = [`<span class="pill live"><i aria-hidden="true"></i>${esc(Story.agoKo(now - A.t1))} 신호</span>`];
    if (agePill(A)) pills.push(`<span class="pill">${agePill(A)}</span>`);
    if (A.sex) pills.push(`<span class="pill">${A.sex === "f" ? "암컷" : "수컷"}</span>`);
    if (IUCN[A.S.iucn] && A.S.iucn !== "LC") pills.push(`<span class="pill iucn ${A.S.iucn}" title="IUCN 적색목록 ${IUCN[A.S.iucn]}">${A.S.iucn}</span>`);
    return `<button class="cand" type="button" role="option" data-id="${A.id}" aria-selected="${App.sel === A.id}">${photoHTML(A.S, "s", true)}
      <div style="min-width:0"><div class="t">${esc(shortName(A))} <span class="id">${esc(nameOf(A) || "#" + tagShort(A))}</span></div>
        <div class="s">지금 ${esc(A.nowPlace || A.endName || "")} · ${esc(trackAgeKo(A))}</div><div class="m">${pills.join("")}</div></div>
      <div class="scale"${trackCut(A) ? ` title="${esc(dateKo(A.T[0]))}부터"` : ""}><b>${fmt(A.km)}</b>km</div></button>`;
  }).join("");
  refreshCand();
}
// glow state of the points on the globe: hidden by filters, normal, hovered, selected
function refreshCand() { Globe.candState(id => !App.vis.has(id) ? -1 : id === App.sel ? 2 : id === App.hover ? 1 : 0); }
function resetFilters() { for (const s of Object.values(App.filters)) s.clear(); App.q = ""; $("#q").value = ""; refreshBrowse(); }
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
  const n = DB.animals.length, now = Date.now();
  $("#detailFoot").hidden = true;
  if (!n) {
    $("#detailBody").innerHTML = `<div class="intro"><h2>지금 추적 중인 동물이 없어요</h2>
      <p>${DB.liveFailed ? "실시간 위치를 불러오지 못했어요. 잠시 뒤에 새로고침해 주세요." : "사흘 안에 위치를 보낸 동물이 없어요. 새 위치는 6시간마다 받아 와요."}</p></div>`;
    return;
  }
  const last = Math.max(...DB.animals.map(A => A.t1));
  $("#detailBody").innerHTML = `<div class="intro">
    <h2>지금 추적 중인 동물 ${n}마리</h2>
    <p>한 마리를 입양하면 그 동물의 태그가 보내는 위치를 실제 시간으로 따라가요. 목록이나 지구본의 점을 눌러 고르세요.</p>
    <div class="callout live"><b>가장 최근 신호 ${esc(Story.agoKo(now - last))}</b><br>사흘 안에 위치를 보낸 동물만 있어요. 새 위치는 6시간마다 받아 와요.</div>
    <button class="btn" type="button" id="luckyBtn">무작위로 하나 보기</button>
  </div>`;
  $("#luckyBtn").onclick = () => { const c = visible(); const pool = c.length ? c : DB.animals; select(pool[Math.floor(Math.random() * pool.length)].id); };
}
// the study and its terms, as the data's owners ask to be credited (older files kept HTML in the citation)
function srcHTML(src, S) {
  const cite = String(src.citation || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(), p = S && photoOf(S);
  return `<div class="src">${p ? `<p>${creditHTML(S)} (위키미디어 공용)</p>` : ""}
    <p>자료: ${esc(src.who || "")} · <a href="${esc(href(src.url))}" target="_blank" rel="noopener">${esc(src.title || "")}</a> (${esc([src.via, src.license].filter(Boolean).join(" · "))})${src.note ? `<br>${esc(src.note)}` : ""}</p>
    ${cite ? `<details class="cite"><summary>인용 방법</summary><p>${esc(cite)}</p></details>` : ""}</div>`;
}
function renderDetail() {
  const A = App.sel && DB.byId.get(App.sel);
  if (!A) return renderIntro();
  const S = A.S, now = Date.now(), places = A.placeOrder.map(placeName), t0 = trackSince(A);
  $("#detailBody").innerHTML = `<div class="body">
    <figure class="dphoto">${photoHTML(S, "l")}
      <button class="iconbtn dclose" type="button" id="dClose" aria-label="닫기" title="닫기">${ICO('<path d="M6 6l12 12M18 6 6 18"/>', 2)}</button>
      ${photoOf(S) ? `<figcaption>${creditHTML(S)}</figcaption>` : ""}</figure>
    <div class="dhead"><div class="eyebrow">${CLS[S.cls].ko} · #${esc(tagShort(A))}</div>
      <h2>${esc(S.ko)}</h2><div class="sci">${esc(S.sci)}${S.en && S.en !== S.ko ? ` · ${esc(S.en)}` : ""}</div></div>
    ${A.open ? `<div class="callout live"><b>지금 추적 중</b> · 마지막 신호 ${esc(Story.agoKo(now - A.t1))}${A.nowPlace ? ` · ${esc(A.nowPlace)}` : ""}</div>`
      : `<div class="callout">실시간 목록에서 빠진 기록이에요 · 마지막 신호 ${dateKo(A.t1)}</div>`}
    <dl class="kv">
      ${nameOf(A) ? `<dt>별명</dt><dd>${esc(nameOf(A))} <span class="faint">연구자가 붙인 이름</span></dd>` : ""}
      <dt>성별·나이</dt><dd>${esc(sexAgeKo(A))}</dd>
      <dt>추적</dt><dd>${A.open ? `${dateKo(t0)}부터 · ${esc(trackAgeKo(A))}` : `${dateKo(t0)} ~ ${dateKo(A.t1)}`}</dd>
      <dt>이동 거리</dt><dd>${fmt(A.km)}km${trackCut(A) ? ` <span class="faint">${dateKo(A.T[0])}부터</span>` : ""}</dd>
      <dt>지나간 곳</dt><dd>${places.slice(0, 8).map(esc).join(", ")}${places.length > 8 ? ` 외 ${places.length - 8}곳` : ""}</dd>
      <dt>보전 상태</dt><dd>${esc(iucnKo(S.iucn))}</dd>
    </dl>
    ${S.facts.length ? `<ul class="facts">${S.facts.map(f => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}
    ${srcHTML(A.src_)}
  </div>`;
  $("#dClose").onclick = () => select(null);
  const foot = $("#detailFoot"); foot.hidden = false;
  const full = Store.state.pets.length >= 6, have = Store.state.pets.some(p => p.aid === A.id);
  foot.innerHTML = have ? `<button class="btn primary block" type="button" id="goPet">입양한 동물 · 보러 가기</button>`
    : `<button class="btn primary block" type="button" id="adoptBtn" ${full ? "disabled" : ""}>${full ? "6마리까지 입양할 수 있어요" : `${esc(shortName(A))} 입양하기`}</button>`;
  if (have) $("#goPet").onclick = () => { Store.state.active = Store.state.pets.find(p => p.aid === A.id).id; Store.save(); enterPet(); };
  else if (!full) $("#adoptBtn").onclick = () => openAdopt(A);
}

/* ============================================================ adoption ============================================================ */
const NAMES = { bird: ["나비", "바람", "하늘", "구름"], sea: ["나비", "파도", "물결", "바다"], fish: ["나비", "파랑", "물결", "바다"], land: ["나비", "솔", "보리", "단풍"] };
function openAdopt(A) {
  const m = $("#mAdopt"), sh = $("#adSheet");
  // the researchers' name for it first
  const nick = nameOf(A), sug = [...new Set([nick, ...NAMES[A.S.cls]].filter(Boolean))].slice(0, 4);
  let name = sug[0];
  const render = () => {
    sh.innerHTML = `
      <div class="adhead">${photoHTML(A.S, "s")}<div><h2 id="adTitle">${esc(shortName(A))} 입양</h2>
        <div class="faint small">태그 #${esc(tagShort(A))}${A.nowPlace ? ` · 지금 ${esc(A.nowPlace)}` : ""}</div></div></div>
      <div class="field"><label for="adName">이름</label><input id="adName" maxlength="12" value="${esc(name)}" autocomplete="off">
        <div class="namechips">${sug.map(n => `<button class="chip" type="button" data-n="${esc(n)}" aria-pressed="${n === name}">${esc(n)}</button>`).join("")}</div>
        ${nick ? `<div class="faint small">${esc(nick)}: 연구자가 붙인 이름</div>` : ""}</div>
      <p class="muted small">입양하면 지금부터 이 동물의 태그가 보내는 위치를 실제 시간으로 따라가요. 마지막 신호 ${esc(Story.agoKo(Date.now() - A.t1))}.</p>
      <div class="actions"><button class="btn" type="button" id="adCancel">취소</button><button class="btn primary" type="button" id="adOk">입양하기</button></div>`;
    $("#adName").oninput = e => { name = e.target.value; $$(".namechips .chip", sh).forEach(c => c.setAttribute("aria-pressed", c.dataset.n === name)); };
    $$(".namechips .chip", sh).forEach(c => c.onclick = () => { name = c.dataset.n; render(); });
    $("#adCancel").onclick = () => { m.hidden = true; };
    $("#adOk").onclick = () => {
      const nm = (name || "").trim().slice(0, 12) || sug[0], now = Date.now();
      // a live pet's clock is the real time; a record that is no longer live starts at its beginning
      const live = A.open, anchorTrack = live ? now : A.T[0];
      const pet = { id: "p" + now.toString(36), aid: A.id, name: nm, adoptedAt: now, anchorReal: now, mode: live ? "live" : "start", pace: 1, anchorTrack, seenT: anchorTrack, k: 0 };
      if (live) pet.liveSeen = A.t1;
      Store.state.pets.push(pet); Store.state.active = pet.id; Store.save(); keepSnaps();
      m.hidden = true; enterPet();
      if (live) startReplay();
      toast(`${esc(josa(nm, "을/를"))} 입양했어요`);
    };
  };
  render(); m.hidden = false; setTimeout(() => $("#adName").focus(), 30);
  m.onclick = e => { if (e.target === m) m.hidden = true; };
}

/* ============================================================ pet mode ============================================================ */
// pets whose record is here (a live one can be missing while the live file doesn't load and no copy was kept)
const petsHere = () => Store.state.pets.filter(p => DB.byId.has(p.aid));
function activePet() { const st = Store.state, ps = petsHere(); return ps.find(p => p.id === st.active) || ps[0] || null; }
function enterPet() {
  const pet = activePet(); if (!pet) return enterBrowse();
  stopReplay(false);
  App.mode = "pet"; App.pet = pet; App.A = DB.byId.get(pet.aid); App.lastK = -1; App.dayView = null; App.lastFix = App.lastSt = null;
  if (!TABS.includes(App.tab)) App.tab = "day";
  document.body.dataset.mode = "pet"; document.body.removeAttribute("data-sel");
  $("#picker").hidden = true; $("#detail").hidden = true; $("#pet").hidden = false; $("#journal").hidden = false; $("#timeline").hidden = false;
  Globe.showCandidates(false); Globe.layout();
  const A = App.A, now = Date.now(), t = Story.petClock(pet, A, now);
  Globe.showTrack(A, { color: "#f5a65b", now: t, meet: pet.anchorTrack, fresh: 1 });
  Globe.setHome([A.X[0], A.Y[0]]);
  const p = posAt(A, t); Globe.setMarker([p.lon, p.lat], "#ffd2a1");
  Globe.flyTo(p.lon, p.lat, Math.min(Globe.homeDist(), Globe.distFor(.35, .4)), 1800);
  Globe.setFollow(true, () => { const q = App.replay ? App.pos : posAt(App.A, Story.petClock(App.pet, App.A)); return q && [q.lon, q.lat]; });
  $("#cFollow").setAttribute("aria-pressed", "true");
  // a live record grows between visits; a past one is read up to the pet's clock
  const nNew = pet.mode === "live" ? (pet.liveSeen != null && pet.liveSeen < A.t1 ? fixesBetween(A, pet.liveSeen, A.t1) : 0)
    : pet.seenT != null && pet.seenT < t ? fixesBetween(A, pet.seenT, t) : 0;
  pet.seenT = t; if (pet.mode === "live") pet.liveSeen = A.t1; Store.save();
  if (A.live && DB.liveFailed) setTimeout(() => toast("최신 위치를 받아 오지 못해서 지난번에 받은 기록으로 보여 줘요", 5200), 900);
  else if (nNew) setTimeout(() => toast(`지난번 이후 새 위치 기록 <b>${fmt(nNew)}</b>개`), 900);
  $("#petPhoto").dataset.sp = "";
  renderModeBtn(); renderSwitch(); tick(true);
  $$(".tab").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === App.tab));
}
function enterBrowse() {
  if (App.mode === "pet") Store.save();
  stopReplay(false);
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
  if (App.mode === "pet") { b.hidden = false; b.textContent = "다른 동물 보기"; b.onclick = () => enterBrowse(); }
  else if (pet) { b.hidden = false; b.textContent = `← ${pet.name}`; b.onclick = () => enterPet(); }
  else b.hidden = true;
}
function renderSwitch() {
  const el = $("#petSwitch"), pets = petsHere();
  el.hidden = pets.length < 2;
  el.innerHTML = pets.map(p => `<button class="chip" type="button" data-p="${p.id}" aria-pressed="${p.id === App.pet.id}">${esc(p.name)}</button>`).join("");
  $$(".chip", el).forEach(c => c.onclick = () => { Store.state.active = c.dataset.p; Store.save(); enterPet(); });
}
const typing = () => { const a = document.activeElement; return !!a && $("#tabBody").contains(a) && (a.tagName === "TEXTAREA" || a.tagName === "INPUT"); };

// called every second in pet mode (and right away on entering)
function tick(force) {
  const pet = App.pet, A = App.A; if (!pet || App.mode !== "pet" || App.replay) return;
  const now = Date.now(), t = Story.petClock(pet, A, now), k = dayIndexAt(A, t);
  App.ended = Story.ended(pet, A, now);
  Globe.setTime(t); Globe.trackNow(t);
  const p = posAt(A, t); Globe.setMarker([p.lon, p.lat]);
  App.pos = p; App.t = t; pet.seenT = t;
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
  else if (fi >= 0) toast(`새 위치 · ${timeKo(A.T[fi])} · ${esc(placeName(runAt(A.pl, fi)) || "")}`);
  else if (st) toast(`태그 상태 신호 · ${MORT[st.c]} · 배터리 ${fmt(st.v)}mV`);
}
function renderClock() {
  const c = $("#clock"), now = Date.now();
  if (App.mode === "pet" && App.pet) {
    const pet = App.pet, rel = pet.mode === "live" ? (App.ended ? "실시간 기록 끝" : "실시간") : pet.mode === "sync" ? `${pet.k}년 전 오늘` : `기록 ${App.lastK + 1}일째${pet.pace > 1 ? " · " + paceKo(pet.pace) : ""}`;
    c.innerHTML = `<b>${dateKo(App.t)} ${timeKo(App.t)}</b><br>${rel}`;
  } else c.innerHTML = `<b>${dateKoW(now)}</b> ${timeKo(now)}${DB.clouds ? `<br>구름 ${Story.agoKo(now - Date.parse(DB.clouds.taken))} 위성 사진` : ""}`;
}
let petRenderT = 0;
function renderPet(force) {
  const pet = App.pet, A = App.A;
  if (!force && performance.now() - petRenderT < 15000) { updatePetStatus(); return; }
  petRenderT = performance.now();
  const ph = $("#petPhoto");
  if (ph.dataset.sp !== A.sp) { ph.dataset.sp = A.sp; ph.innerHTML = photoHTML(A.S, "l") + (photoOf(A.S) ? `<figcaption>${creditHTML(A.S)}</figcaption>` : ""); }
  $("#petName").textContent = pet.name;
  $("#petSub").textContent = `${shortName(A)} #${tagShort(A)} · ${A.open ? trackAgeKo(A) : A.live ? `추적 ${durKo((A.t1 - trackSince(A)) / DAY)}` : `${A.home} 출발`}`;
  const kmT = kmAt(A, App.t) - kmAt(A, pet.anchorTrack);
  const together = Math.max(1, Math.floor((midnight(Date.now()) - midnight(pet.adoptedAt)) / DAY) + 1);
  $("#petStats").innerHTML = [["입양 후", fmt(together), "일"], ["입양 후 이동", kmFmt(Math.max(0, kmT)), "km"]]
    .map(([k2, v, u]) => `<div class="stat"><div class="k">${k2}</div><div class="v">${v}<small>${u}</small></div></div>`).join("");
  if (!App.otherHover) renderOthers();
  updatePetStatus();
}
function updatePetStatus() {
  const A = App.A, live = $("#liveDot"), st = $("#petStatus"), sg = $("#petSig"), t = App.t, p = App.pos;
  const fi = idxAt(A, t), last = A.status.filter(m => m.t <= t).pop();
  const lastSt = last ? ` · 태그 ${esc(MORT[last.c])} ${fmt(last.v)}mV` : "";
  if (App.ended) {
    live.className = "live off";
    st.textContent = `기록 끝 · ${dateKo(A.t1)}`;
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
  // between two fixes: that stretch; past the last fix of a live record: the stretch before it, while it's recent
  const j = fi < A.T.length - 1 ? fi : A.open && fi > 0 && since < DAY ? fi - 1 : -1;
  if (j >= 0 && !A.coarse) {
    const km = A.cum[j + 1] - A.cum[j], h = (A.T[j + 1] - A.T[j]) / HOUR, pre = j < fi ? " · 최근" : " ·";
    move = km / h >= 1 ? `${pre} 시속 ${fmt(km / h, km / h < 10 ? 1 : 0)}km` : `${pre} 거의 제자리`;
  }
  st.innerHTML = `${esc(place || "")} · 현지 ${Story.clock24(Story.solarMin(t, p.lon))} ${tod}${move}`;
  sg.innerHTML = `마지막 위치 기록 ${esc(Story.agoKo(since))}${lastSt}`;
}

/* ---------- the nearest other animals tracked at the same moment ---------- */
let othersCount = -1;
function updateOthers(force) {
  const A = App.A, L = Story.companions(A, App.t);
  App.others = L;
  Globe.setOthers(L.map(o => ({ lon: o.lon, lat: o.lat, color: CLS[o.B.S.cls].color, state: o.B.id === App.otherHover ? 1 : 0 })));
  if (force || L.length !== othersCount) { othersCount = L.length; renderOthers(); }
}
function renderOthers() {
  const el = $("#petOthers"), L = (App.others || []).slice(0, 3);
  el.hidden = !L.length;
  if (!L.length) { el.innerHTML = ""; return; }
  el.innerHTML = `<h3>${App.A.open ? "지금 가장 가까운 동물" : "그때 가장 가까웠던 동물"}</h3>
    <div class="olist">${L.map(o => `<button class="orow" type="button" data-id="${o.B.id}">${photoHTML(o.B.S, "s")}
      <span class="on">${esc(shortName(o.B))} <span class="mono faint">#${esc(tagShort(o.B))}</span><small>${esc(placeName(o.pl) || "")}${o.same ? " · 같은 연구" : ""}</small></span>
      <span class="mono">${kmFmt(o.km)}km</span></button>`).join("")}</div>`;
  $$(".orow", el).forEach(b => {
    b.onclick = () => { const o = App.others.find(x => x.B.id === b.dataset.id); if (!o) return; Globe.setFollow(false); $("#cFollow").setAttribute("aria-pressed", "false"); Globe.flyTo(o.lon, o.lat, Math.max(Globe.camDistance(), 2.2), 1200); };
    b.onpointerenter = () => { App.otherHover = b.dataset.id; updateOthers(); };
    b.onpointerleave = () => { App.otherHover = null; updateOthers(); };
  });
}

/* ============================================================ record tabs ============================================================ */
function setTab(tab) { App.tab = tab; $$(".tab").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === tab)); renderTab(); }
function renderTab(keep) {
  if (App.mode !== "pet") return;
  const el = $("#tabBody"), top = el.scrollTop;
  ({ day: tabDay, trip: tabTrip, info: tabInfo })[App.tab]();
  el.scrollTop = keep ? top : 0;
}
function viewDay(k, fly = true) {
  stopReplay(true, false);
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

/* ---------- replay: the record once, from its first fix to the pet's now, then back to now ---------- */
function startReplay() {
  const A = App.A, pet = App.pet; if (!A || !pet || !Globe.ok) return;
  const t0 = A.T[0], t1 = Math.min(Story.petClock(pet, A), A.T[A.T.length - 1]);
  if (t1 - t0 < 2 * DAY) return;
  stopReplay(false);
  App.replay = { t0, t1, ms: clamp(6000 + (t1 - t0) / DAY * 22, 8000, 22000), at: performance.now() + 1300, raf: 0 };
  document.body.dataset.replay = "";
  $("#timeline").hidden = true; $("#replay").hidden = false;
  $("#rpWhat").textContent = trackCut(A) ? `${dateKo(t0)}부터 지금까지` : "첫 기록부터 지금까지";
  Globe.setOthers(null); Globe.setErrorDisk(null); Globe.highlight(null, null);
  Globe.showTrack(A, { color: "#f5a65b", now: t0, fresh: 1, fixes: false });
  // the whole way in view, then the camera keeps the animal near the middle
  const step = Math.max(1, Math.floor(A.T.length / 400)), lls = [];
  for (let i = 0; i < A.T.length; i += step) lls.push([A.X[i], A.Y[i]]);
  Globe.fitPoints(lls, .42); Globe.setFollow(true); $("#cFollow").setAttribute("aria-pressed", "true");
  if (narrow()) window.scrollTo({ top: 0, behavior: "smooth" });
  stepReplay();
}
function stepReplay() {
  const R = App.replay, A = App.A; if (!R) return;
  const now = performance.now(), f = clamp((now - R.at) / R.ms, 0, 1), t = R.t0 + (R.t1 - R.t0) * f;
  Globe.trackNow(t);
  const p = posAt(A, t); App.pos = p; Globe.setMarker([p.lon, p.lat]);
  $("#rpDate").textContent = dateKo(t);
  $("#rpWhere").textContent = placeName(runAt(A.pl, nearestIdx(A, t))) || "";
  $("#rpKm").textContent = kmFmt(kmAt(A, t)) + "km";
  $("#rpBar").style.width = (f * 100).toFixed(2) + "%";
  if (f >= 1 && !R.end) R.end = now;
  if (R.end && now - R.end > 1500) return stopReplay(true);
  R.raf = requestAnimationFrame(stepReplay);
}
// back: return to the pet's now (fly: and look at it)
function stopReplay(back, fly = true) {
  const R = App.replay; if (!R) return;
  cancelAnimationFrame(R.raf); App.replay = null;
  delete document.body.dataset.replay;
  $("#replay").hidden = true; $("#timeline").hidden = App.mode !== "pet";
  if (!back || App.mode !== "pet") return;
  const A = App.A, pet = App.pet, t = Story.petClock(pet, A);
  Globe.showTrack(A, { color: "#f5a65b", now: t, meet: pet.anchorTrack, fresh: 1 });
  tick(true);
  if (fly) { Globe.setFollow(true); $("#cFollow").setAttribute("aria-pressed", "true"); Globe.flyTo(App.pos.lon, App.pos.lat, Math.min(Globe.homeDist(), Globe.distFor(.35, .4)), 1600); }
}

// one day: what the tag sent and where the animal was (the timeline below picks the day)
function tabDay() {
  const pet = App.pet, A = App.A, k = App.dayView ?? App.lastK, m = Story.meetDay(pet, A);
  const C = Story.card(pet, A, k, k === App.lastK && !App.ended ? App.t : Infinity), d = C.x.d;
  const today = k === App.lastK && !App.ended;
  const sec = (title, rows) => rows && rows.length ? `<section class="osec"><h4>${title}</h4>${rowsHTML(rows)}</section>` : "";
  $("#tabBody").innerHTML = `
    <div class="dayhead"><div><b>${dateKoW(d.s)}${today ? " · 오늘" : ""}</b><span>${new Date(d.s).getFullYear()}년${k < m ? " · 입양 전" : k === m ? " · 입양한 날" : ""}</span></div>
      ${k !== App.lastK ? `<button class="btn small" type="button" id="dToday">${App.ended ? "마지막 날로" : "오늘로"}</button>` : ""}</div>
    ${C.hl.length ? `<ul class="hl">${C.hl.map(([ic, t]) => `<li class="hl-${ic}">${ICO(HL_ICON[ic])}<span>${esc(t)}</span></li>`).join("")}</ul>` : ""}
    ${sec("위치", C.rows.pos)}${sec("이동", C.rows.move)}${sec("신호", C.rows.sig)}${sec("하늘", C.rows.sky)}
    ${C.tagRows ? sec("태그 부착", C.tagRows) : ""}${C.endRows ? sec("기록 끝", C.endRows) : ""}`;
  const b = $("#dToday"); if (b) b.onclick = () => viewDay(App.lastK);
}

function tabTrip() {
  const A = App.A, D = buildDays(A), t = App.t;
  const R = Story.records(A, t), ST = Story.stays(A, t), PL = Story.entered(A, t);
  const goT = (ms, ll) => { const k = dayIndexAt(A, ms); return `data-k="${k}"${ll ? ` data-ll="${ll[0].toFixed(3)},${ll[1].toFixed(3)}"` : ""}`; };
  const at = i => `${dateKo(A.T[i], false)} · ${placeName(runAt(A.pl, i)) || ""}`;
  const rec = [];
  if (R.day) rec.push(["하루 가장 많이 이동", `${kmFmt(R.day.km)}km`, dateKo(D[R.day.k].s), goT(D[R.day.k].s)]);
  if (R.fast) rec.push(["가장 빠른 구간", `시속 ${fmt(R.fast.v, R.fast.v < 10 ? 1 : 0)}km`, `${dateKo(A.T[R.fast.i], false)} ${timeKo(A.T[R.fast.i])}부터 ${Story.hm((A.T[R.fast.i + 1] - A.T[R.fast.i]) / MIN)}`, goT(A.T[R.fast.i], [A.X[R.fast.i + 1], A.Y[R.fast.i + 1]])]);
  rec.push(["가장 북쪽", `${A.Y[R.north] >= 0 ? "북위" : "남위"} ${Math.abs(A.Y[R.north]).toFixed(2)}°`, at(R.north), goT(A.T[R.north], [A.X[R.north], A.Y[R.north]])]);
  rec.push(["가장 남쪽", `${A.Y[R.south] >= 0 ? "북위" : "남위"} ${Math.abs(A.Y[R.south]).toFixed(2)}°`, at(R.south), goT(A.T[R.south], [A.X[R.south], A.Y[R.south]])]);
  rec.push([`${homeWord(A)}에서 가장 먼 곳`, `${kmFmt(hav(A.X[0], A.Y[0], A.X[R.far], A.Y[R.far]))}km`, at(R.far), goT(A.T[R.far], [A.X[R.far], A.Y[R.far]])]);
  $("#tabBody").innerHTML = `<div class="sec"><div class="sechead"><h3>지금까지</h3>${App.t - A.T[0] >= 2 * DAY ? `<button class="btn small" type="button" id="tReplay">처음부터 다시 보기</button>` : ""}</div>
    <div class="stats three"><div class="stat"><div class="k">총 이동</div><div class="v">${kmFmt(kmAt(A, t))}<small>km</small></div></div>
      <div class="stat"><div class="k">기록된 날</div><div class="v">${fmt(App.lastK + 1)}<small>일</small></div></div>
      <div class="stat"><div class="k">지나간 곳</div><div class="v">${PL.length}<small>곳</small></div></div></div>
    ${trackCut(A) ? `<p class="faint small">지도에는 ${dateKo(A.T[0])}부터 기록이 담겨 있어요. 추적은 ${dateKo(trackSince(A))}에 시작했어요.</p>` : ""}</div>
    <div class="sec"><h3>기록</h3><div class="recs">${rec.map(([a, b, c, go]) => `<button class="rec" type="button" ${go || "disabled"}><span class="rk">${esc(a)}</span><b>${esc(b)}</b><small>${esc(c)}</small></button>`).join("")}</div></div>
    <div class="sec"><h3>지나간 곳</h3><p class="faint small">처음 들어간 나라와 바다, 들어간 날</p>
      <div class="plist">${PL.slice().reverse().map(p => `<button class="prow" type="button" data-k="${p.k}"><span>${esc(placeName(p.c))}</span><span class="d">${dateKo(p.s, new Date(p.s).getFullYear() !== new Date().getFullYear())}</span></button>`).join("")}</div></div>
    <div class="sec"><h3>머문 곳</h3><p class="faint small">25km 안에서 사흘 넘게 머문 곳</p>
      ${ST.length ? `<div class="stays">${ST.slice().reverse().map(s => `<button class="stay" type="button" ${goT(s.t0, [s.lon, s.lat])}><b>${esc(placeName(s.pl) || "")}${s.open ? ` <span class="now">머무는 중</span>` : ""}</b>
        <small>${esc([regionName(s.rg), cityName(s.ci) && cityName(s.ci) + " 근처"].filter(Boolean).join(" · "))}</small>
        <span class="mono">${spanShort(s.t0, s.t1)} · ${fmt(s.days, s.days < 10 ? 1 : 0)}일</span></button>`).join("")}</div>` : `<p class="muted small">없음</p>`}</div>
    ${A.se ? seasonHTML(Story.signal(A, t).seasons) : ""}`;
  if ($("#tReplay")) $("#tReplay").onclick = () => startReplay();
  $$("[data-k]", $("#tabBody")).forEach(b => b.onclick = () => {
    const k = +b.dataset.k, ll = b.dataset.ll;
    if (ll) { const [lo, la] = ll.split(",").map(Number); viewDay(k, false); Globe.setFollow(false); $("#cFollow").setAttribute("aria-pressed", "false"); Globe.flyTo(lo, la, Math.min(Globe.camDistance(), 2.4), 1200); }
    else viewDay(k);
  });
}
// 7.7 ~ 10.15, or 2025.10.16 ~ 2026.10.15 across a new year
const spanShort = (a, b) => { const ya = new Date(a).getFullYear(), yb = new Date(b).getFullYear(); return ya === yb ? `${dateShort(a)} ~ ${dateShort(b)}` : `${ya}.${dateShort(a)} ~ ${yb}.${dateShort(b)}`; };
function seasonHTML(S) {
  if (!S || !S.runs.length) return "";
  return `<div class="sec"><h3>연구자 표시 계절</h3>
    <div class="seasons">${S.runs.map(r => `<span class="sr ${r.c}" style="flex:${Math.max(1, (r.t1 - r.t0) / DAY)}" title="${esc(SEASON_KO[r.c])} ${esc(dateKo(r.t0))} ~ ${esc(dateKo(r.t1))}"></span>`).join("")}</div>
    <p class="muted small">${S.runs.map(r => `${SEASON_KO[r.c]} ${spanShort(r.t0, r.t1)}`).join(" · ")}</p>
    ${S.km != null ? `<p class="small">여름·겨울 위치의 중심 사이 <b>${kmFmt(S.km)}km</b></p>` : ""}</div>`;
}

function tabInfo() {
  const pet = App.pet, A = App.A, S = A.S, K = App.lastK, t = App.ended ? A.t1 : App.t;
  const G = Story.signal(A, t), raw = G.perDay.reduce((s, v) => s + v, 0), empty = G.perDay.slice(0, K).filter(v => !v).length;
  const gap = G.gap ? (G.gap.dt >= 2 * DAY ? fmt(G.gap.dt / DAY, 1) + "일" : Story.hm(G.gap.dt / MIN)) : "";
  const fetched = DB.live ? Story.agoKo(Date.now() - Date.parse(DB.live.generated)) : null;
  $("#tabBody").innerHTML = `
    <div class="sec"><h3>이름</h3><div class="field row"><input id="iName" maxlength="12" value="${esc(pet.name)}" aria-label="이름"><button class="btn small" type="button" id="iSave">바꾸기</button></div></div>
    <div class="sec"><h3>이 동물</h3><dl class="kv">
      <dt>종</dt><dd>${esc(S.ko)} <i class="faint">${esc(S.sci)}</i></dd>
      <dt>태그</dt><dd>#${esc(A.tag)}</dd>
      ${nameOf(A) ? `<dt>별명</dt><dd>${esc(nameOf(A))} <span class="faint">연구자가 붙인 이름</span></dd>` : ""}
      <dt>성별·나이</dt><dd>${esc(sexAgeKo(A))}</dd>
      <dt>추적</dt><dd>${dateKo(trackSince(A))}부터${App.ended ? ` ${dateKo(A.t1)}까지` : ""}</dd>
      <dt>보전 상태</dt><dd>${esc(iucnKo(S.iucn))}</dd></dl></div>
    <div class="sec"><h3>태그 신호</h3><dl class="kv">
      <dt>재는 방법</dt><dd>${esc(A.loc)}<br><span class="faint">${esc(Story.METHOD[A.method])}</span></dd>
      <dt>받은 위치</dt><dd>${fmt(raw)}개${raw > G.n ? ` <span class="faint">지도에는 ${fmt(G.n)}개 지점</span>` : ""}</dd>
      ${K > 0 ? `<dt>위치 없는 날</dt><dd>${fmt(empty)}일 <span class="faint">${fmt(K)}일 중</span></dd>` : ""}
      ${gap ? `<dt>가장 긴 공백</dt><dd>${esc(gap)}</dd>` : ""}
      ${G.er ? `<dt>오차 반경</dt><dd>중간값 ${esc(Story.erFmt(G.er.med))}</dd>` : ""}</dl>
      ${G.mix.length > 1 ? mixHTML(G.mix) : ""}</div>
    ${A.status.length ? batteryHTML(A, G.st, t) : ""}
    <div class="sec"><h3>출처</h3>${srcHTML(A.src_, S)}</div>
    <div class="sec"><h3>시간</h3>${pet.mode === "live"
      ? `<p class="muted small">새 위치는 6시간마다 받아 와요. 태그가 위치를 모아서 보내기 때문에 몇 시간 늦게 보일 수 있어요.${fetched ? ` 마지막으로 받아 온 때는 ${esc(josa(fetched, "이에요/예요"))}.` : ""}</p>`
      : pet.mode === "sync" ? `<p class="muted small">몇 년 전 실제 기록을 ${pet.k}년 전 오늘에 맞춰 실제 시간으로 따라가요.</p>`
      : `<p class="muted small">몇 년 전 실제 기록을 첫 기록부터 따라가요.</p><div class="chips" id="iPace">${PACES.map(([v, l]) => `<button class="chip" type="button" data-v="${v}" aria-pressed="${pet.pace === v}">${l}</button>`).join("")}</div>`}
      <p class="faint small">${DB.clouds ? `지구본의 구름은 ${pet.mode === "live" ? "" : "그때가 아니라 "}${esc(Story.agoKo(Date.now() - Date.parse(DB.clouds.taken)))} 기상위성이 찍은 모습이에요. 극지방은 사진에 담기지 않아요.` : "지구본의 구름은 그날 날씨가 아니라 위성 사진 한 장이에요."}</p></div>
    <details class="sec fold"><summary>다른 기기로 옮기기</summary>
      <p class="muted small">입양 기록은 이 브라우저에만 저장돼요. 아래 코드를 다른 기기에 붙여 넣으면 옮겨져요.</p>
      <div class="field row"><input id="iCode" readonly value="${esc(Store.exportCode())}" class="code" aria-label="백업 코드"><button class="btn small" type="button" id="iCopy">복사</button></div>
      <div class="field row"><input id="iPaste" placeholder="코드 붙여 넣기" aria-label="옮겨 올 코드"><button class="btn small" type="button" id="iLoad">불러오기</button></div>
      <div id="iMsg" class="small faint"></div></details>
    <div class="sec"><h3>입양 취소</h3><div id="byeBox"><button class="btn small" type="button" id="iBye">입양 취소</button></div></div>`;
  $("#iSave").onclick = () => { const v = $("#iName").value.trim().slice(0, 12); if (!v) return; pet.name = v; Store.save(); renderPet(true); renderSwitch(); renderModeBtn(); toast(`이름을 ${esc(josa(v, "으로/로"))} 바꿨어요`); };
  $$("#iPace .chip").forEach(c => c.onclick = () => {
    const now = Date.now(), t2 = Story.petClock(pet, A, now);
    pet.anchorReal = now; pet.anchorTrack = t2; pet.pace = +c.dataset.v; Store.save(); tabInfo();
  });
  $("#iCopy").onclick = () => {
    const inp = $("#iCode"), done = () => { $("#iMsg").textContent = "복사했어요."; }, manual = () => { inp.select(); $("#iMsg").textContent = "코드를 선택해 두었어요. 직접 복사해 주세요."; };
    try { navigator.clipboard.writeText(inp.value).then(done, manual); } catch (e) { manual(); }
  };
  $("#iLoad").onclick = () => {
    if (!Store.importCode($("#iPaste").value)) { $("#iMsg").textContent = "코드를 읽지 못했어요."; return; }
    // the imported pets may need records this page hasn't read yet
    $("#iMsg").textContent = "불러왔어요. 다시 여는 중…"; location.reload();
  };
  $("#iBye").onclick = () => {
    $("#byeBox").innerHTML = `<div class="confirm">${esc(josa(pet.name, "을/를"))} 이 기기에서 지울까요?<div class="actions"><button class="btn small" type="button" id="byeNo">그대로 두기</button><button class="btn small danger" type="button" id="byeYes">입양 취소</button></div></div>`;
    $("#byeNo").onclick = tabInfo;
    $("#byeYes").onclick = () => { const st = Store.state; st.pets = st.pets.filter(p => p.id !== pet.id); st.active = st.pets[0] ? st.pets[0].id : null; Store.save(); App.pet = null; st.pets.length ? enterPet() : enterBrowse(); };
  };
}
// the tag's battery and status messages (only some past records have them)
function batteryHTML(A, st, t) {
  if (!st.length) return `<div class="sec"><h3>태그 배터리와 상태 신호</h3><p class="muted small">아직 없음</p></div>`;
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
    <p class="small muted">상태 신호 ${st.length}번 · ${Object.keys(cnt).map(c => `${MORT[c]} ${cnt[c]}번`).join(", ")}</p>
    ${rowsHTML(recent.map(s => [`${dateShort(s.t)} ${hhmm(s.t)}`, `${MORT_KO[s.c]} (${MORT[s.c]})`, `배터리 ${fmt(s.v)}mV`]))}
    ${cnt.d ? `<p class="faint small">dead는 태그가 한동안 움직임을 못 느낄 때 보내는 신호예요. 실제 사망과 다를 수 있어요.</p>` : ""}</div>`;
}

/* ---------- timeline: one pill a day, its bar the distance moved ---------- */
function renderTimeline() {
  const pet = App.pet, A = App.A; if (!pet) return;
  const D = buildDays(A), m = Story.meetDay(pet, A), K = App.lastK, sel = App.dayView ?? K;
  const today = K >= 0 ? Story.day(A, K, App.t) : null;
  const kmOf = k => k === K ? today.km : D[k].km, rawOf = k => k === K ? today.raw : D[k].raw, stOf = k => (k === K ? today.st : D[k].st).map(s => s.c);
  let maxKm = 1; for (let k = 0; k <= K; k++) maxKm = Math.max(maxKm, kmOf(k));
  const html = [];
  for (let k = 0; k <= K; k++) {
    const d = D[k], km = kmOf(k), raw = rawOf(k), sc = stOf(k), h = 4 + 20 * Math.sqrt(km / maxKm), cls = ["dpill"];
    if (k < m) cls.push("pre"); if (k === K) cls.push("today"); if (d.newPl.length && k > 0) cls.push("new-place");
    if (!raw) cls.push("nofix"); if (sc.includes("d")) cls.push("st-d"); else if (sc.some(c => c !== "a")) cls.push("st-u");
    html.push(`<button class="${cls.join(" ")}" type="button" data-k="${k}" ${k === sel ? 'aria-current="true"' : ""} title="${k < m ? "입양 전 · " : ""}${dateKo(d.s)} · ${esc(placeName(d.pl) || "")} · ${kmFmt(km)}km · ${raw ? `기록 ${raw}번` : "기록 없음"}${sc.length ? " · 상태 " + sc.map(c => MORT[c]).join(",") : ""}"><i style="height:${h.toFixed(1)}px"></i>${new Date(d.s).getDate()}</button>`);
  }
  if (!App.ended) html.push(`<span class="dpill" aria-hidden="true" style="opacity:.5">?</span>`);
  const el = $("#tlDays"); el.innerHTML = html.join("");
  const d = D[sel];
  $("#tlLabel").innerHTML = `<b>${dateKo(d.s, false)}${sel === K && !App.ended ? " · 오늘" : ""}</b>${new Date(d.s).getFullYear()}년 · ${esc(placeName(d.pl) || "")}`;
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
    const hl = label("home", `<div class="bubble" style="font-size:11px;padding:2px 8px;opacity:.8">${trackCut(App.A) ? "첫 위치" : "출발"}</div><div class="stem" style="height:12px"></div>`, "mini");
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
      const when = A.open ? `${Story.agoKo(Date.now() - A.t1)} 신호` : A.sync ? `${A.sync.k}년 전 오늘` : "";
      const el = label("cand", `<div class="bubble"><span class="dot" style="background:${CLS[A.S.cls].color};box-shadow:0 0 10px ${CLS[A.S.cls].color}"></span><b>${esc(shortName(A))}</b> ${when ? `<span class="faint">${esc(when)}</span>` : ""}</div><div class="stem"></div>`, "mini");
      placeLabel(el, [A.nowPos.lon, A.nowPos.lat], 1.006);
    } else hideLabel("cand");
  }
}

/* ============================================================ live records ============================================================ */
// Animals tracked right now: .github/workflows/live.yml publishes them to the live-data branch every six hours.
const LIVE_URL = (() => {
  const m = location.hostname.match(/^([\w-]+)\.github\.io$/), repo = location.pathname.split("/").filter(Boolean)[0];
  return m && repo ? `https://raw.githubusercontent.com/${m[1]}/${repo}/live-data/live.json` : "data/live.json";
})();
const LIVE_DAYS = 3;  // a fix this recent counts as tracked right now (pipeline/live.py)
// the photos sit next to the live file
const liveFile = rel => new URL(rel, new URL(LIVE_URL, location.href)).href;

// clouds as the weather satellites saw them last: .github/workflows/clouds.yml puts them next to the live file every hour
async function loadClouds() {
  const c = await fetch(liveFile("clouds.json"), { cache: "no-cache" }).then(r => r.ok ? r.json() : null).catch(() => null);
  if (!c || !c.files || !c.files.s || !Date.parse(c.taken) || (DB.clouds && DB.clouds.taken === c.taken)) return;
  const v = "?v=" + encodeURIComponent(c.taken);
  if (await Globe.setClouds(liveFile(c.files.s) + v, c.files.l ? liveFile(c.files.l) + v : null)) { DB.clouds = c; renderClock(); }
}

// one code per distinct row, so a place named in two files is one place
const rowIdx = {};
function intern(table, row) {
  const T = DB[table], m = rowIdx[table] || (rowIdx[table] = new Map(T.map((r, i) => [JSON.stringify(r), i])));
  const k = JSON.stringify(row);
  if (!m.has(k)) { m.set(k, T.length); T.push(row); }
  return m.get(k);
}
/* Adds the animals of a live file, or of one kept copy, to DB. open: still followed (its days run up to now).
   list: offer them in the picker, those the pipeline lists and that sent a fix in the last LIVE_DAYS. */
function addLive(data, open, list) {
  const P = (data.places || []).map(r => intern("places", r)), R = (data.regions || []).map(r => intern("regions", r)), C = (data.cities || []).map(r => intern("cities", r));
  (data.placeGroups || []).forEach((g, i) => { if (PGS[g] && data.places[i]) PGS[g].add(data.places[i][0]); });
  const re = (runs, M) => runs.map(([i, c]) => [i, c >= 0 ? M[c] : c]), alias = {};
  for (const [k, sp] of Object.entries(data.species || {})) {
    // a species the catalog already describes keeps its name and facts
    const same = Object.keys(SPECIES).find(x => !x.startsWith("mb:") && SPECIES[x].sci === sp.sci);
    if (same) { alias[k] = same; continue; }
    if (SPECIES[k]) continue;
    const cls = CLS[sp.cls] ? sp.cls : "land";
    SPECIES[k] = { ko: sp.ko || sp.en || sp.sci, en: sp.en || sp.sci, sci: sp.sci, cls, iucn: sp.iucn || null, facts: [] };
  }
  for (const [sci, p] of Object.entries(data.photos || {}))
    if (!DB.photos[sci] && p.s && p.l) DB.photos[sci] = { ...p, s: liveFile(p.s), l: liveFile(p.l) };
  Object.assign(DB.sources, data.sources || {});
  const now = Date.now();
  for (const r of data.animals || []) {
    const sp = alias[r.sp] || r.sp;
    if (DB.byId.has(r.id) || !SPECIES[sp]) continue;
    const A = prepAnimal({ ...r, sp, pl: re(r.pl, P), rg: re(r.rg, R), ci: re(r.ci, C) });
    A.open = open;
    DB.byId.set(A.id, A);
    if (list && r.live && r.live.listed && now - A.t1 < LIVE_DAYS * DAY) DB.animals.push(A);
  }
}
/* A copy of each adopted live record, in this browser: the pet stays when its animal leaves the live file
   (no fix for a month, or the study stops sharing) or when the file doesn't load. */
const SNAP_KEY = "nabiya.live.v1";
function loadSnaps() { try { return JSON.parse(localStorage.getItem(SNAP_KEY) || "{}") || {}; } catch (e) { return {}; } }
function snapOf(r, data) {
  // the rows this record uses, renumbered
  const sub = (table, runs) => { const m = new Map(), was = []; return [runs.map(([i, c]) => { if (c < 0) return [i, c]; if (!m.has(c)) { m.set(c, was.length); was.push(c); } return [i, m.get(c)]; }), was]; };
  const [pl, P] = sub("places", r.pl), [rg, R] = sub("regions", r.rg), [ci, C] = sub("cities", r.ci);
  const sci = (data.species[r.sp] || {}).sci || "", ph = data.photos || {};
  return { generated: data.generated, places: P.map(c => data.places[c]), placeGroups: P.map(c => (data.placeGroups || [])[c] || null),
    regions: R.map(c => data.regions[c]), cities: C.map(c => data.cities[c]), sources: { [r.src]: data.sources[r.src] },
    species: { [r.sp]: data.species[r.sp] }, photos: Object.fromEntries([sci, sci.split(" ").slice(0, 2).join(" ")].filter(k => ph[k]).map(k => [k, ph[k]])),
    animals: [{ ...r, pl, rg, ci }] };
}
function keepSnaps() {
  if (!DB.live) return;
  const snaps = loadSnaps(), mine = new Set(Store.state.pets.map(p => p.aid)), out = {};
  for (const aid of mine) {
    const r = DB.live.animals.find(x => x.id === aid);
    if (r) out[aid] = snapOf(r, DB.live); else if (snaps[aid]) out[aid] = snaps[aid];
  }
  try { localStorage.setItem(SNAP_KEY, JSON.stringify(out)); } catch (e) { /* storage blocked or full */ }
}

/* ============================================================ boot ============================================================ */
function wire() {
  $("#q").addEventListener("input", e => { App.q = e.target.value; refreshBrowse(); });
  $("#sort").addEventListener("change", e => { App.sort = e.target.value; renderList(); });
  $("#filters").addEventListener("click", e => {
    const c = e.target.closest(".chip"); if (!c) return;
    const f = c.closest(".chips").dataset.f, set = App.filters[f], k = c.dataset.k;
    set.has(k) ? set.delete(k) : set.add(k); refreshBrowse();
  });
  $("#list").addEventListener("click", e => { const b = e.target.closest(".cand"); if (b) select(b.dataset.id); });
  $("#list").addEventListener("pointerover", e => { const b = e.target.closest(".cand"); const id = b ? b.dataset.id : null; if (id !== App.hover) { App.hover = id; refreshCand(); } });
  $("#list").addEventListener("pointerleave", () => { App.hover = null; refreshCand(); });
  // a photo that doesn't load leaves its stand-in
  document.addEventListener("error", e => { const im = e.target; if (im.tagName === "IMG" && im.parentElement && im.parentElement.classList.contains("ph")) im.parentElement.classList.add("none"); }, true);
  $$(".tab").forEach(b => b.addEventListener("click", () => setTab(b.dataset.tab)));
  $("#tlDays").addEventListener("click", e => { const b = e.target.closest(".dpill[data-k]"); if (b) viewDay(+b.dataset.k); });
  $("#rpSkip").onclick = () => stopReplay(true);
  $("#tlPrev").onclick = () => viewDay((App.dayView ?? App.lastK) - 1);
  $("#tlNext").onclick = () => viewDay((App.dayView ?? App.lastK) + 1);
  // the pet's clock position is saved when the page goes away, so the next visit can say what arrived since
  const keep = () => { if (App.mode === "pet") Store.save(); };
  addEventListener("pagehide", keep);
  document.addEventListener("visibilitychange", () => { if (document.hidden) keep(); });
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
  Globe.onFrame = () => updateLabels();
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#mAdopt").hidden) $("#mAdopt").hidden = true; });
  // mobile: the globe band height follows the viewport
  const setStage = () => document.documentElement.style.setProperty("--stage-h", Math.round(Math.min(innerHeight * .52, innerWidth * 1.05)) + "px");
  setStage(); addEventListener("resize", setStage);
}

// the middle of where the animals are now, as [lon, lat]
function centreOf(L) {
  let x = 0, y = 0, z = 0;
  for (const A of L) { const lo = A.nowPos.lon * Math.PI / 180, la = A.nowPos.lat * Math.PI / 180; x += Math.cos(la) * Math.cos(lo); y += Math.cos(la) * Math.sin(lo); z += Math.sin(la); }
  if (Math.hypot(x, y, z) < 1e-6) return [110, 25];
  return [Math.atan2(y, x) * 180 / Math.PI, clamp(Math.atan2(z, Math.hypot(x, y)) * 180 / Math.PI, -35, 45)];
}
async function boot() {
  Store.load();
  wire();
  const msg = $("#ldMsg");
  // the picker offers animals tracked right now; the catalog of past records (data/animals.json) is read only
  // for pets adopted from it before
  const past = Store.state.pets.some(p => !p.aid.startsWith("mb"));
  const [live, data] = await Promise.all([
    fetch(LIVE_URL, { cache: "no-cache" }).then(r => r.ok ? r.json() : Promise.reject(r.status)).catch(() => null),
    past ? fetch("data/animals.json").then(r => r.json()).catch(() => null) : null,
  ]);
  DB.live = live && Array.isArray(live.animals) ? live : null;
  DB.liveFailed = !DB.live;
  if (DB.live) addLive(DB.live, true, true);
  // adopted animals that left the live file come from this browser's copy, ended; while the file can't be read,
  // they go on as before
  const snaps = loadSnaps();
  for (const p of Store.state.pets) if (p.aid.startsWith("mb") && !DB.byId.has(p.aid) && snaps[p.aid]) addLive(snaps[p.aid], DB.liveFailed, false);
  if (data) {
    for (const [t, k] of [["places", "pl"], ["regions", "rg"], ["cities", "ci"]]) {
      const M = data[t].map(r => intern(t, r));
      for (const r of data.animals) r[k] = r[k].map(([i, c]) => [i, c >= 0 ? M[c] : c]);
    }
    Object.assign(DB.sources, data.sources);
    for (const r of data.animals) if (!DB.byId.has(r.id)) DB.byId.set(r.id, prepAnimal(r));
    // a past record that is no longer in the catalog can't be followed
    Store.state.pets = Store.state.pets.filter(p => p.aid.startsWith("mb") || DB.byId.has(p.aid));
  }
  if (!petsHere().some(p => p.id === Store.state.active)) Store.state.active = petsHere()[0] ? petsHere()[0].id : null;
  keepSnaps();
  const now = Date.now();
  for (const A of DB.byId.values()) {
    A.sync = A.live ? null : syncInfo(A, now);
    const t = A.live ? A.t1 : A.sync ? A.sync.t : A.T[0];
    A.nowPos = posAt(A, t); A.nowPlace = placeName(runAt(A.pl, nearestIdx(A, t)));
    A.nowGroups = new Set(placeGroups(A.nowPlace || ""));
  }
  msg.textContent = "지구를 그리는 중…";
  let ok = false;
  try { ok = typeof THREE !== "undefined" && await Globe.init($("#globe")); } catch (e) { ok = false; }
  if (!ok) $("#stage").insertAdjacentHTML("beforeend", `<div class="empty" style="position:absolute;inset:auto 0 40% 0">이 기기에서는 3D 지구를 그릴 수 없어요.</div>`);
  if (ok) {
    Globe.setTime(now);
    Globe.setCandidates(DB.animals.map(A => ({ id: A.id, lon: A.nowPos.lon, lat: A.nowPos.lat, color: CLS[A.S.cls].color })));
  }
  $("#loading").classList.add("done"); setTimeout(() => $("#loading").remove(), 900);
  // straight to a live pet; a pet from the past records waits behind the mode button
  if (activePet() && activePet().aid.startsWith("mb")) enterPet(); else { enterBrowse(); if (ok) Globe.flyTo(...centreOf(DB.animals), Globe.homeDist(), 10); }
  setInterval(() => { if (App.mode === "pet") tick(false); else { renderClock(); Globe.setTime(Date.now()); } }, 1000);
  renderClock();
  if (ok) { loadClouds(); setInterval(loadClouds, 20 * 60000); setTimeout(() => Globe.upgrade(), 1500); }
  window.__ready = true;
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
