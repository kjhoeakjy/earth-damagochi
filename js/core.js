/* ============================================================
   나비야 나비야 — core: helpers, species, data decoding, sun & moon, storage
   ============================================================ */
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const easeInOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const DAY = 86400000, HOUR = 3600000, MIN = 60000;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n, d = 0) => Number(n).toLocaleString("ko-KR", { maximumFractionDigits: d, minimumFractionDigits: d });
const kmFmt = km => km >= 100 ? fmt(Math.round(km)) : km >= 10 ? fmt(km, 0) : fmt(km, 1);

function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = seed >>> 0 || 1; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];

/* ---------- geometry on the sphere ---------- */
// Matches three.js SphereGeometry UVs: lon 0 → +X, lon 90°E → −Z, north → +Y.
function ll2v(lon, lat, r = 1) {
  const la = lat * D2R, lo = lon * D2R, c = Math.cos(la);
  return [r * c * Math.cos(lo), r * Math.sin(la), -r * c * Math.sin(lo)];
}
function v2ll(x, y, z) { const r = Math.hypot(x, y, z); return [Math.atan2(-z, x) * R2D, Math.asin(clamp(y / r, -1, 1)) * R2D]; }
function hav(lon1, lat1, lon2, lat2) {
  const p1 = lat1 * D2R, p2 = lat2 * D2R, dp = p2 - p1, dl = (lon2 - lon1) * D2R;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(h)));
}
function bearing(lon1, lat1, lon2, lat2) {
  const p1 = lat1 * D2R, p2 = lat2 * D2R, dl = (lon2 - lon1) * D2R;
  const y = Math.sin(dl) * Math.cos(p2), x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (Math.atan2(y, x) * R2D + 360) % 360;
}
const COMPASS = ["북쪽", "북동쪽", "동쪽", "남동쪽", "남쪽", "남서쪽", "서쪽", "북서쪽"];
const compass = deg => COMPASS[Math.round(deg / 45) % 8];
function slerpLL(lon1, lat1, lon2, lat2, f) {
  const a = ll2v(lon1, lat1), b = ll2v(lon2, lat2);
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; d = clamp(d, -1, 1);
  const w = Math.acos(d);
  if (w < 1e-6) return [lerp(lon1, lon2, f), lerp(lat1, lat2, f)];
  const s = Math.sin(w), k1 = Math.sin((1 - f) * w) / s, k2 = Math.sin(f * w) / s;
  return v2ll(a[0] * k1 + b[0] * k2, a[1] * k1 + b[1] * k2, a[2] * k1 + b[2] * k2);
}

/* ---------- Korean text helpers ---------- */
const DIGIT_JONG = [true, true, false, true, false, false, true, true, true, false]; // 영 일 이 삼 사 오 육 칠 팔 구
const DIGIT_RIEUL = [false, true, false, false, false, false, false, true, true, false];
function lastJong(word) {
  const s = String(word).replace(/[\s)\]"'’”.!?·~]+$/g, "");
  const ch = s.charCodeAt(s.length - 1);
  if (ch >= 0xAC00 && ch <= 0xD7A3) { const j = (ch - 0xAC00) % 28; return { has: j !== 0, rieul: j === 8 }; }
  if (ch >= 48 && ch <= 57) { const d = ch - 48; return { has: DIGIT_JONG[d], rieul: DIGIT_RIEUL[d] }; }
  const c = s.slice(-1).toLowerCase();
  if ("lmnr".includes(c)) return { has: true, rieul: c === "l" || c === "r" };
  return { has: false, rieul: false };
}
// josa("구름", "이/가") → "구름이"
function josa(word, pair) {
  const { has, rieul } = lastJong(word);
  const [a, b] = pair.split("/");
  if (pair === "으로/로") return word + (has && !rieul ? "으로" : "로");
  return word + (has ? a : b);
}
// Friendly name forms: 별 → 별이 (for 이가/이는 forms), 나비 → 나비
const nameI = n => lastJong(n).has ? n + "이" : n;
const KDAY = ["일", "월", "화", "수", "목", "금", "토"];
const dateKo = (ms, y = true) => { const d = new Date(ms); return (y ? d.getFullYear() + "년 " : "") + (d.getMonth() + 1) + "월 " + d.getDate() + "일"; };
const dateKoW = ms => { const d = new Date(ms); return dateKo(ms, false) + " (" + KDAY[d.getDay()] + ")"; };
const dateShort = ms => { const d = new Date(ms); return (d.getMonth() + 1) + "." + d.getDate(); };
const timeKo = ms => { const d = new Date(ms); const h = d.getHours(), m = d.getMinutes(); return (h < 12 ? "오전 " : "오후 ") + ((h + 11) % 12 + 1) + ":" + String(m).padStart(2, "0"); };
const localKey = ms => { const d = new Date(ms); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
function midnight(ms) { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }
function nextMidnight(ms) { const d = new Date(ms); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 1); return d.getTime(); }
function shiftYears(ms, dy) { const d = new Date(ms); d.setFullYear(d.getFullYear() + dy); return d.getTime(); }
const durKo = days => days >= 365 ? (Math.floor(days / 365) + "년" + (Math.round((days % 365) / 30.4) ? " " + Math.round((days % 365) / 30.4) + "개월" : "")) : days >= 60 ? Math.round(days / 30.4) + "개월" : Math.round(days) + "일";

/* ---------- sun & moon (NOAA / Meeus low-precision, good to ~0.1°) ---------- */
function subsolar(ms) {
  const d = ms / DAY - 10957.5;
  const g = (357.529 + 0.98560028 * d) * D2R;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * D2R;
  const e = (23.439 - 0.00000036 * d) * D2R;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = ((18.697374558 + 24.06570982441908 * d) % 24 + 24) % 24;
  let lon = (ra * R2D / 15 - gmst) * 15;
  lon = ((lon % 360) + 540) % 360 - 180;
  return [lon, dec * R2D];
}
function sunAlt(lon, lat, ms) {
  const [sl, sb] = subsolar(ms), a = ll2v(lon, lat), b = ll2v(sl, sb);
  return Math.asin(clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1)) * R2D;
}
// Daylight over the solar day centred on local solar noon nearest `ms` (minutes; −1 polar night, 1440 polar day).
function daylight(lon, lat, ms) {
  const noonUtc = midnightUTC(ms) + (12 - lon / 15) * HOUR;
  let up = 0;
  for (let k = 0; k < 144; k++) if (sunAlt(lon, lat, noonUtc - 12 * HOUR + (k + .5) * 10 * MIN) > -0.833) up++;
  return up * 10;
}
function midnightUTC(ms) { const d = new Date(ms); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); }
// apparent ecliptic longitude of the sun (deg), for the solstices and equinoxes
function sunLongitude(ms) {
  const d = ms / DAY - 10957.5, g = (357.529 + 0.98560028 * d) * D2R;
  return (((280.459 + 0.98564736 * d + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) % 360) + 360) % 360;
}
const SYNODIC = 29.530588853, NEWMOON = 947182440000;
const moonPhase = ms => { const p = ((ms - NEWMOON) / DAY / SYNODIC) % 1; return p < 0 ? p + 1 : p; };
function moonName(p) {
  if (p < .034 || p > .966) return "삭(새 달)";
  if (Math.abs(p - .5) < .034) return "보름달";
  if (Math.abs(p - .25) < .034) return "상현달";
  if (Math.abs(p - .75) < .034) return "하현달";
  return null;
}

/* ---------- species ---------- */
const CLS = {
  bird: { ko: "새", color: "#f7c96b" },
  sea: { ko: "바다 포유류", color: "#63d2de" },
  fish: { ko: "물고기·거북", color: "#f2948c" },
  land: { ko: "육지 포유류", color: "#acd884" },
};
const AREA = {
  europe: "유럽", mongolia: "몽골", atlantic: "어센션섬 (대서양)", southern: "남극해의 섬",
  namerica: "북아메리카", npacific: "북태평양", arctic: "북극 바다", oceania: "호주",
};
const IUCN = { CR: "위급", EN: "위기", VU: "취약", NT: "준위협", LC: "관심 대상" };

const SPECIES = {
  lbbg: {
    ko: "줄무늬노랑발갈매기", en: "Lesser black-backed gull (발트해 무리)", sci: "Larus fuscus fuscus", cls: "bird", iucn: "LC", look: "gull", move: "fly",
    facts: ["핀란드에서 번식하는 발트해 무리는 바다 대신 동유럽과 중동 내륙을 가로질러 동아프리카 큰 호수까지 가요.",
      "날개를 펴면 1.3~1.5m쯤 돼요. 등이 거의 검은색이라 다른 갈매기와 쉽게 구별해요.",
      "물고기와 곤충을 주로 먹지만 들판의 지렁이도 마다하지 않는 잡식성이에요."],
  },
  cuckoo: {
    ko: "뻐꾸기", en: "Common cuckoo", sci: "Cuculus canorus", cls: "bird", iucn: "LC", look: "cuckoo", move: "fly",
    facts: ["뻐꾸기는 다른 새 둥지에 알을 낳는 '탁란'을 해요. 그래서 부모에게 길을 배우지 않고도 혼자 아프리카 가는 길을 찾아요.",
      "몽골 뻐꾸기는 인도를 지나 아라비아해를 건너 아프리카 남동부까지 가요. 바다 위를 며칠 동안 쉬지 않고 날기도 해요.",
      "다른 새들이 꺼리는 털 많은 송충이도 잘 먹어요."],
  },
  snipe: {
    ko: "꺅도요", en: "Common snipe", sci: "Gallinago gallinago", cls: "bird", iucn: "LC", look: "snipe", move: "fly",
    facts: ["번식기에는 꽁지깃을 떨어 '두두두두' 하는 소리를 내며 하늘에서 구애 비행을 해요.",
      "긴 부리를 진흙에 꽂아 지렁이와 곤충 애벌레를 더듬어 찾아요. 부리 끝이 아주 예민해요.",
      "몸의 줄무늬가 마른 풀과 똑같아서 가만히 있으면 거의 안 보여요."],
  },
  dove: {
    ko: "유럽멧비둘기", en: "European turtle dove", sci: "Streptopelia turtur", cls: "bird", iucn: "VU", look: "dove", move: "fly",
    facts: ["유럽에서 여름을 나고, 사하라 사막을 건너 서아프리카 사헬 지대에서 겨울을 나요.",
      "1980년 이후 유럽에서 수가 크게 줄어 지금은 취약종(VU)이에요. 위성 추적은 이 새를 지키는 데 쓰여요.",
      "주로 풀씨와 곡식 낟알을 먹어요. 목에 검고 흰 줄무늬 무늬가 있어요."],
  },
  tern: {
    ko: "검은등제비갈매기", en: "Sooty tern", sci: "Onychoprion fuscatus", cls: "bird", iucn: "LC", look: "tern", move: "fly",
    facts: ["깃털이 물에 쉽게 젖어서 바다 위에 거의 내려앉지 않아요. 어린 새는 번식할 때까지 몇 년 동안 땅을 밟지 않고 바다 위를 날아다닌다고 알려져 있어요.",
      "어센션섬 사람들은 밤새 시끄럽게 우는 이 새를 '와이드어웨이크(잠 못 자게 하는 새)'라고 불러요.",
      "물에 뛰어들지 않고 수면 가까이 스치듯 날며 작은 물고기와 오징어를 낚아채요."],
  },
  frigate: {
    ko: "어센션군함조", en: "Ascension frigatebird", sci: "Fregata aquila", cls: "bird", iucn: "VU", look: "frigate", move: "fly",
    facts: ["전 세계에서 어센션섬 둘레에서만 번식하는 새예요.",
      "깃털이 방수가 잘 안 돼서 바다에 앉지 못해요. 그래서 하늘에서 다른 새의 먹이를 빼앗기도 해요.",
      "몸에 비해 날개가 아주 커서 상승 기류를 타고 며칠씩 날 수 있어요."],
  },
  booby: {
    ko: "푸른얼굴얼가니새", en: "Masked booby", sci: "Sula dactylatra", cls: "bird", iucn: "LC", look: "booby", move: "fly",
    facts: ["하늘 높은 곳에서 화살처럼 바다로 내리꽂혀 물고기를 잡아요.",
      "얼굴의 검푸른 맨살이 가면처럼 보여서 영어로 '가면 얼가니새'라고 해요.",
      "날치를 즐겨 먹어요."],
  },
  albatross: {
    ko: "나그네알바트로스", en: "Wandering albatross", sci: "Diomedea exulans", cls: "bird", iucn: "VU", look: "albatross", move: "fly",
    facts: ["날개를 펴면 3m가 넘어요. 지금 살아 있는 새 가운데 날개가 가장 길어요.",
      "날갯짓을 거의 하지 않고 파도 위 바람을 타는 '역동적 활공'으로 하루에 수백 km를 날아요.",
      "한 번 짝을 맺으면 평생 함께해요. 먹이를 찾으러 떠났다가 둥지의 짝과 새끼에게 돌아와요."],
  },
  pelican: {
    ko: "갈색사다새", en: "Brown pelican", sci: "Pelecanus occidentalis", cls: "bird", iucn: "LC", look: "pelican", move: "fly",
    facts: ["사다새 무리에서는 드물게 하늘에서 바다로 다이빙해서 물고기를 잡아요.",
      "부리 밑 주머니에 물을 10리터 넘게 담았다가 물만 뱉고 물고기를 삼켜요.",
      "한때 농약(DDT) 때문에 멸종 위기였다가 금지 이후 회복했어요."],
  },
  eseal: {
    ko: "남방코끼리물범", en: "Southern elephant seal", sci: "Mirounga leonina", cls: "sea", iucn: "LC", look: "eseal", move: "swim",
    facts: ["다 자란 수컷은 몸무게가 3톤을 넘기도 해요. 물범과 바다사자를 통틀어 가장 커요.",
      "한 번 숨을 참고 1,000m 넘게, 길게는 거의 두 시간 동안 잠수해요.",
      "케르겔렌 코끼리물범에 다는 CTD 태그는 잠수할 때 수온과 염분도 재요. 다만 여기 받은 기록에는 위치만 남아 있어요."],
  },
  furseal: {
    ko: "북방물개", en: "Northern fur seal", sci: "Callorhinus ursinus", cls: "sea", iucn: "VU", look: "furseal", move: "swim",
    facts: ["새끼는 태어난 해 가을, 어미 없이 혼자 첫 바다 여행을 떠나요. 이 기록이 바로 그 첫 여행이에요.",
      "털이 아주 빽빽해서 1㎠에 4만 가닥이 넘어요. 그 털 사이 공기층이 몸을 따뜻하게 지켜요.",
      "물에 떠서 쉴 때 뒷발을 물 밖으로 들어 올리는 독특한 자세를 해요."],
  },
  ringed: {
    ko: "고리무늬물범", en: "Ringed seal", sci: "Pusa hispida", cls: "sea", iucn: "LC", look: "ringed", move: "swim",
    facts: ["바다가 얼면 앞발 발톱으로 얼음을 긁어 숨구멍을 여러 개 만들어 지켜요.",
      "눈 밑에 굴을 파고 그 안에서 새끼를 낳아요.",
      "등의 회색 고리 무늬 때문에 이런 이름이 붙었어요. 북극곰의 주된 먹이예요."],
  },
  bearded: {
    ko: "턱수염물범", en: "Bearded seal", sci: "Erignathus barbatus", cls: "sea", iucn: "LC", look: "bearded", move: "swim",
    facts: ["길고 하얀 수염으로 바다 밑 진흙을 더듬어 조개와 게를 찾아요.",
      "수컷은 물속에서 길게 떨리는 소리를 내요. 몇 km 밖까지 들려요.",
      "얕은 바다를 좋아해서 바다얼음이 물러나면 같이 북쪽으로 따라가요."],
  },
  rightwhale: {
    ko: "북대서양긴수염고래", en: "North Atlantic right whale", sci: "Eubalaena glacialis", cls: "sea", iucn: "CR", look: "whale", move: "swim",
    facts: ["남은 수가 400마리도 안 되는 위급종(CR)이에요. 배와 부딪히거나 그물에 걸리는 사고가 가장 큰 위험이에요.",
      "머리의 하얀 굳은살(캘러시티) 무늬가 사람 지문처럼 저마다 달라서 연구자들은 이 무늬로 한 마리씩 알아봐요.",
      "겨울에 미국 조지아·플로리다 앞바다에서 새끼를 낳고, 봄에 먹이가 많은 북쪽 바다로 올라가요."],
  },
  marlin: {
    ko: "녹새치", en: "Blue marlin", sci: "Makaira nigricans", cls: "fish", iucn: "VU", look: "marlin", move: "swim",
    facts: ["창처럼 뾰족한 위턱으로 물고기 떼를 후려쳐 사냥해요.",
      "암컷이 수컷보다 훨씬 커서 몇 배나 무거워요.",
      "이 개체의 태그는 햇빛 세기로 위치를 계산해서, 하루 한 번 오차가 큰 추정 위치만 남아요."],
  },
  turtle: {
    ko: "푸른바다거북", en: "Green turtle", sci: "Chelonia mydas", cls: "fish", iucn: "EN", look: "turtle", move: "swim",
    facts: ["이름의 '푸른'은 등딱지가 아니라 몸속 지방이 초록빛이라서 붙었어요. 해초를 먹어서 그래요.",
      "다 자라면 바다풀(해초)과 해조류를 먹는 초식 거북이 돼요.",
      "알이 묻힌 모래 온도로 새끼의 성별이 정해져요. 따뜻하면 암컷이 더 많이 나와요."],
  },
  caribou: {
    ko: "산악순록 (카리부)", en: "Mountain caribou", sci: "Rangifer tarandus caribou", cls: "land", iucn: "VU", look: "caribou", move: "walk",
    facts: ["눈이 깊은 겨울에는 높은 산에 올라가 나뭇가지에 매달린 지의류를 뜯어 먹어요.",
      "순록은 암컷도 뿔이 나는 유일한 사슴 무리예요.",
      "발굽이 넓어서 눈 위를 설피 신은 것처럼 걸어요. 캐나다 BC주의 산악 순록은 수가 크게 줄어 보호받고 있어요."],
  },
};

/* place → broad group, for the "가는 곳" filter */
const GROUPS = [["africa", "아프리카"], ["asia", "아시아"], ["europe", "유럽"], ["namerica", "북아메리카"], ["oceania", "오세아니아"],
  ["atlantic", "대서양"], ["pacific", "태평양"], ["indian", "인도양"], ["southern", "남극해"], ["arctic", "북극해"], ["med", "지중해·흑해"]];
const PG = {
  europe: "핀란드|에스토니아|폴란드|루마니아|몰도바|우크라이나|벨라루스|리투아니아|라트비아|독일|덴마크|불가리아|스웨덴|스페인|프랑스|노르웨이|핀란드만|발트해|비스와 석호|리가만|보트니아만|파이얀네호|퓌해예르비호|페이푸스호|프스콥스코예호|러시아 칼리닌그라드|러시아 프스코프",
  asia: "튀르키예|팔레스타인|레바논|이스라엘|몽골|중국|네팔|미얀마|방글라데시|카자흐스탄|키르기스스탄|우즈베키스탄|이란|카타르|사우디아라비아|러시아 투바 공화국",
  africa: "이집트|수단|남수단|우간다|탄자니아|에리트레아|콩고 민주 공화국|케냐|리비아|에티오피아|소말리아|모잠비크|잠비아|짐바브웨|르완다|모로코|서사하라|모리타니|세네갈|말리|알제리|앨버트호|빅토리아호|나세르호|키오가호|에드워드호",
  namerica: "쿠바|팜리코만",
  oceania: "",
  atlantic: "남대서양|북대서양|카리브해|멕시코만|플로리다 해협|세인트헬레나|팜리코만",
  pacific: "북태평양|베링해|산호해|미국 하와이",
  indian: "인도양|아라비아해|홍해|아카바만|수에즈만",
  southern: "남극해|데이비스해|뱅센만|프랑스령 남방 및 남극",
  arctic: "북극해|보퍼트해|축치해|그린란드해|허드슨만|허드슨 해협|코체부만",
  med: "지중해|에게해|마르마라해|크레타만|흑해",
};
const PGS = Object.fromEntries(Object.entries(PG).map(([k, v]) => [k, new Set(v.split("|").filter(Boolean))]));
function placeGroups(name) {
  const g = Object.keys(PGS).filter(k => PGS[k].has(name));
  if (/^인도 /.test(name)) g.push("asia");
  if (/^(미국|캐나다) /.test(name) && name !== "미국 하와이") g.push("namerica");
  if (/^오스트레일리아/.test(name)) g.push("oceania");
  return g;
}

/* ---------- data ---------- */
const DB = { places: [], regions: [], cities: [], sources: {}, animals: [], byId: new Map() };
function decodeSeq(str) {
  const out = []; let i = 0, v = 0;
  while (i < str.length) {
    let b, shift = 0, res = 0;
    do { b = str.charCodeAt(i++) - 63; res |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    v += (res & 1) ? ~(res >> 1) : (res >> 1);
    out.push(v);
  }
  return out;
}
function runAt(runs, i) {
  let lo = 0, hi = runs.length - 1, ans = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (runs[m][0] <= i) { ans = m; lo = m + 1; } else hi = m - 1; }
  return ans < 0 ? -1 : runs[ans][1];
}
/* Kind and quality of a position fix, one letter per track point (pipeline/build_catalog.py).
   km: the error the method promises, where it promises one. */
const QUAL = {
  a: { r: 0, kind: "GPS", txt: "오차 10m 이내", km: .01 },
  8: { r: 1, kind: "Fastloc GPS", txt: "위성 8개로 계산", km: .05 }, 7: { r: 2, kind: "Fastloc GPS", txt: "위성 7개로 계산", km: .05 },
  6: { r: 3, kind: "Fastloc GPS", txt: "위성 6개로 계산", km: .05 }, 5: { r: 4, kind: "Fastloc GPS", txt: "위성 5개로 계산", km: .1 },
  4: { r: 5, kind: "Fastloc GPS", txt: "위성 4개로 계산", km: .1 },
  g: { r: 6, kind: "GPS", txt: "오차 표시 없음", km: null }, b: { r: 7, kind: "GPS", txt: "오차 10m 넘음", km: null },
  3: { r: 10, kind: "아르고스", txt: "3등급 · 오차 250m 이내", km: .25 }, 2: { r: 11, kind: "아르고스", txt: "2등급 · 오차 250~500m", km: .5 },
  1: { r: 12, kind: "아르고스", txt: "1등급 · 오차 0.5~1.5km", km: 1.5 }, 0: { r: 13, kind: "아르고스", txt: "0등급 · 오차 1.5km 넘음", km: null },
  A: { r: 14, kind: "아르고스", txt: "A등급 · 오차 추정 없음", km: null }, B: { r: 15, kind: "아르고스", txt: "B등급 · 오차 추정 없음", km: null },
  R: { r: 16, kind: "아르고스", txt: "등급 기록 없음", km: null }, L: { r: 20, kind: "햇빛 세기로 추정", txt: "하루 한 번", km: null },
};
// the tag's own status messages (ICARUS "mortality-status")
const MORT = { a: "alive", d: "dead", l: "lost", u: "unknown" };
const MORT_KO = { a: "살아 있음", d: "사망 감지", l: "lost", u: "알 수 없음" };
const SEASON_KO = { S: "여름", W: "겨울" };

const placeName = c => c >= 0 ? DB.places[c][0] : null;
const placeKind = c => c >= 0 ? DB.places[c][1] : null;
const regionName = c => c >= 0 ? DB.regions[c][0] : null;
const regionKind = c => c >= 0 ? DB.regions[c][1] : null;
const cityName = c => c >= 0 ? DB.cities[c][0] : null;

function prepAnimal(r) {
  const tm = decodeSeq(r.t), xs = decodeSeq(r.x), ys = decodeSeq(r.y), n = tm.length;
  const A = Object.assign({}, r);
  A.T = new Float64Array(n); A.X = new Float64Array(n); A.Y = new Float64Array(n); A.cum = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    A.T[i] = r.t0 * 1000 + tm[i] * MIN; A.X[i] = xs[i] / 1e4; A.Y[i] = ys[i] / 1e4;
    if (i) A.cum[i] = A.cum[i - 1] + hav(A.X[i - 1], A.Y[i - 1], A.X[i], A.Y[i]);
  }
  // raw fixes merged into each point, best fix quality per point, error radius (m) where the data has one
  A.NF = Int32Array.from(r.nf ? decodeSeq(r.nf) : new Array(n).fill(1));
  A.QS = r.qs || "g".repeat(n);
  A.ER = r.er ? Float64Array.from(decodeSeq(r.er)) : null;
  A.rawN = A.NF.reduce((s, v) => s + v, 0);
  A.status = (r.status || []).map(([s, c, v]) => ({ t: s * 1000, c, v }));
  A.frozen = r.frozen ? { until: r.frozen.until * 1000, days: r.frozen.days } : null;
  delete A.t; delete A.x; delete A.y; delete A.nf; delete A.qs; delete A.er;
  A.t1 = A.T[n - 1];
  A.S = SPECIES[A.sp];
  A.src_ = DB.sources[A.src] || {};
  const seen = new Set(); A.placeOrder = [];
  for (const [, c] of A.pl) if (c >= 0 && !seen.has(c)) { seen.add(c); A.placeOrder.push(c); }
  A.visits = new Set(); for (const c of A.placeOrder) for (const g of placeGroups(placeName(c))) A.visits.add(g);
  A.endName = placeName(runAt(A.pl, n - 1)) || "";
  A.search = [A.S.ko, A.S.en, A.S.sci, A.home, A.tag, A.id, AREA[A.area], ...A.placeOrder.map(placeName)].join(" ").toLowerCase();
  A.method = A.src === "musyl_marlin" ? "light" : A.src === "shimada_turtle" ? "fastloc" : A.src.startsWith("icarus") ? "icarus" :
    /^(weimerskirch|imos_sese|nmml_fur|dfo_ringed|npi_ringed|nmml_bearded|whalenet)$/.test(A.src) ? "argos" : "gps";
  A.loc = { light: "햇빛 세기로 추정 (하루 한 번)", fastloc: "Fastloc GPS", icarus: "GPS · ICARUS", argos: "아르고스 위성", gps: "GPS" }[A.method];
  // positions too rough for speeds: light-level estimates, and the 1996 whale fixes rounded to whole degrees
  A.coarse = A.method === "light" || A.src === "whalenet";
  return A;
}
function idxAt(A, t) {
  const T = A.T; if (t < T[0]) return -1;
  let lo = 0, hi = T.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (T[m] <= t) lo = m; else hi = m - 1; }
  return lo;
}
function posAt(A, t) {
  const T = A.T, n = T.length;
  if (t <= T[0]) return { lon: A.X[0], lat: A.Y[0], i: 0, f: 0 };
  if (t >= T[n - 1]) return { lon: A.X[n - 1], lat: A.Y[n - 1], i: n - 1, f: 0 };
  const i = idxAt(A, t), f = (t - T[i]) / (T[i + 1] - T[i]);
  const [lon, lat] = slerpLL(A.X[i], A.Y[i], A.X[i + 1], A.Y[i + 1], f);
  return { lon, lat, i, f };
}
function kmAt(A, t) {
  const p = posAt(A, t);
  if (p.i >= A.T.length - 1) return A.cum[A.cum.length - 1];
  return A.cum[p.i] + (A.cum[p.i + 1] - A.cum[p.i]) * p.f;
}
const nearestIdx = (A, t) => { const p = posAt(A, t); return p.f > .5 ? Math.min(p.i + 1, A.T.length - 1) : p.i; };
// Speed in km/h over the last few hours of track time.
function speedAt(A, t, span = 6 * HOUR) { const a = Math.max(A.T[0], t - span); return t - a < HOUR ? 0 : (kmAt(A, t) - kmAt(A, a)) / ((t - a) / HOUR); }

// Year shift that puts today's calendar date inside the record (most recent year first).
function syncInfo(A, now = Date.now()) {
  for (let k = 1; k <= 30; k++) {
    const t = shiftYears(now, -k);
    if (t < A.T[0] + DAY / 2) break;
    if (t <= A.t1 - 3 * DAY) return { k, t, left: (A.t1 - t) / DAY };
  }
  return null;
}

/* Per-day digest of a record (viewer-local calendar days). */
function buildDays(A) {
  if (A.daysCache) return A.daysCache;
  const out = []; const seenPl = new Set(); let maxHome = 0;
  const [hx, hy] = [A.X[0], A.Y[0]];
  for (let s = midnight(A.T[0]), k = 0; s < A.t1; s = nextMidnight(s), k++) {
    const e = nextMidnight(s), a = Math.max(s, A.T[0]), b = Math.min(e, A.t1);
    const kmA = kmAt(A, a), kmB = kmAt(A, b);
    const noon = clamp(s + 12 * HOUR, A.T[0], A.t1), pn = posAt(A, noon), pe = posAt(A, b), pa = posAt(A, a);
    const iA = Math.max(0, idxAt(A, a)), iB = Math.max(0, idxAt(A, b - 1));
    let fixes = 0; for (let i = iA; i <= iB; i++) if (A.T[i] >= s && A.T[i] < e) fixes++;
    const ni = nearestIdx(A, noon);
    const newPl = [];
    const from = k === 0 ? 0 : iA + 1;
    for (let i = from; i <= iB; i++) { const c = runAt(A.pl, i); if (c >= 0 && !seenPl.has(c)) { seenPl.add(c); newPl.push(c); } }
    if (k === 0) { const c = runAt(A.pl, 0); if (c >= 0 && !seenPl.has(c)) { seenPl.add(c); newPl.unshift(c); } }
    const cross = [];
    const lats = [pa.lat]; for (let i = iA; i <= iB; i++) if (A.T[i] > a && A.T[i] < b) lats.push(A.Y[i]); lats.push(pe.lat);
    for (let i = 1; i < lats.length; i++) {
      for (const [v, name] of [[0, "적도"], [23.44, "북회귀선"], [-23.44, "남회귀선"], [66.56, "북극권"], [-66.56, "남극권"]])
        if ((lats[i - 1] - v) * (lats[i] - v) < 0 && !cross.includes(name)) cross.push(name);
    }
    const home = hav(hx, hy, pe.lon, pe.lat);
    const rec = home > maxHome * 1.02 && home > 200; if (home > maxHome) maxHome = home;
    const cities = []; for (let i = iA; i <= iB; i++) { const c = runAt(A.ci, i); if (c >= 0 && !cities.includes(c)) cities.push(c); }
    // what the tag sent that day: raw fix count, best fix quality, smallest error radius, status messages
    let raw = 0, q = null, er = 0;
    for (let i = iA; i <= iB; i++) if (A.T[i] >= s && A.T[i] < e) {
      raw += A.NF[i]; const c = A.QS[i];
      if (!q || QUAL[c].r < QUAL[q].r) q = c;
      if (A.ER && A.ER[i] > 0) er = er ? Math.min(er, A.ER[i]) : A.ER[i];
    }
    const st = A.status.filter(m => m.t >= s && m.t < e);
    out.push({
      k, s, e, a, b, km: kmB - kmA, kmTotal: kmB, lon: pn.lon, lat: pn.lat, elon: pe.lon, elat: pe.lat,
      pl: runAt(A.pl, ni), rg: runAt(A.rg, ni), ci: runAt(A.ci, ni), cities, fixes, newPl, cross, home, homeRec: rec,
      raw, q, er, st, season: A.se ? runAt(A.se, ni) : null,
      dir: hav(pa.lon, pa.lat, pe.lon, pe.lat) > 15 ? compass(bearing(pa.lon, pa.lat, pe.lon, pe.lat)) : null,
      disp: hav(pa.lon, pa.lat, pe.lon, pe.lat),
    });
  }
  const ks = out.map(d => d.km).filter(x => x > 0).sort((a, b) => a - b);
  const q = p => ks.length ? ks[Math.min(ks.length - 1, Math.floor(p * ks.length))] : 0;
  A.kmBig = Math.max(q(.85), 30); A.kmRest = Math.min(q(.2), 25); A.kmMaxDay = ks.length ? ks[ks.length - 1] : 1;
  A.daysCache = out;
  return out;
}
const dayIndexAt = (A, t) => { const D = buildDays(A); let lo = 0, hi = D.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (D[m].s <= t) lo = m; else hi = m - 1; } return lo; };

/* ---------- storage: this browser only ---------- */
const Store = {
  key: "nabiya.v1",
  state: { v: 1, pets: [], active: null, updatedAt: 0 },
  load() {
    try { const s = JSON.parse(localStorage.getItem(this.key) || "null"); if (Store.valid(s)) this.state = s; } catch (e) { /* storage blocked */ }
  },
  save() {
    this.state.updatedAt = Date.now();
    try { localStorage.setItem(this.key, JSON.stringify(this.state)); } catch (e) { /* storage blocked */ }
  },
  valid: s => !!s && s.v === 1 && Array.isArray(s.pets) && s.pets.every(p => p && typeof p.aid === "string" && typeof p.anchorTrack === "number"),
  // a copyable text for moving to another device
  exportCode() { return "NABIYA1:" + btoa(unescape(encodeURIComponent(JSON.stringify(this.state)))); },
  importCode(code) {
    const m = String(code).trim().match(/^NABIYA1:([A-Za-z0-9+/=]+)$/);
    if (!m) return false;
    try { const s = JSON.parse(decodeURIComponent(escape(atob(m[1])))); if (!Store.valid(s)) return false; this.state = s; this.save(); return true; } catch (e) { return false; }
  },
};
