"""Build the animal catalog for 나비야 나비야.

Reads the raw tracking files (see README: where each one comes from) from $NABIYA_RAW
(dl/, repos/eio/, ne/), cleans and downsamples the tracks, labels every fix with a Korean
place name, keeps the other recorded fields (fix quality, tag status, animal details), and
writes data/animals.json for the web page.

    NABIYA_RAW=/path/to/raw python3 pipeline/build_catalog.py [out.json]
"""
import json, os, sqlite3, sys, warnings
from pathlib import Path

import numpy as np
import pandas as pd
import rdata
from pyproj import Transformer

sys.path.insert(0, str(Path(__file__).resolve().parent))
from catalog_lib import Labeler, clean, track_fields, trim_frozen_tail  # noqa: E402

warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parent.parent
RAW = Path(os.environ.get("NABIYA_RAW", ROOT / "raw"))
DL = RAW / "dl"
EIO = RAW / "repos" / "eio"
NE = RAW / "ne"
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "data" / "animals.json"


def rload(name):
    return rdata.conversion.convert(rdata.parser.parse_file(DL / name))


# --------------------------------------------------------------------------
# Raw loaders: each returns DataFrame[t (UTC datetime), lon, lat, q (+ er, season)]
# q, the kind and quality of each fix:
#   G1 / G2  GPS with error <=10 m / >10 m (ICARUS)      G   GPS, no accuracy given
#   F4..F8   Fastloc GPS from that many satellites         L   light-level geolocation
#   A3 A2 A1 A0 AA AB  Argos location class                 A   Argos, class not given
# er: error radius in metres where the data gives one (bearded seals; marlin latitude band)
# --------------------------------------------------------------------------

def gulls(ids):
    con = sqlite3.connect(DL / "gulls.gpkg")
    df = pd.read_sql(
        'select "timestamp" t, "location-long" lon, "location-lat" lat, '
        '"individual-local-identifier" id, visible from '
        '"Navigation-experiments-in-lesser-black-backed-gulls"', con)
    df = df[df.visible == "true"]
    df["t"] = pd.to_datetime(df.t, utc=True)
    df["q"] = "G"
    return {i: df[df.id == i][["t", "lon", "lat", "q"]] for i in ids}


_icarus_cache = {}


def icarus(study, ids):
    if study not in _icarus_cache:
        s = (EIO / f"{study}.js").read_text()
        d = json.loads(s[s.index("=") + 1:].strip().rstrip(";"))
        rows = []
        for k, feats in d.items():
            for ft in feats:
                p = ft["properties"]
                if p.get("visible") == "false" or p.get("import-marked-outlier") == "true":
                    continue
                if not p.get("location-long") or not p.get("location-lat"):
                    continue
                rows.append((k, p["timestamp"], float(p["location-long"]), float(p["location-lat"]),
                             p.get("mortality-status") or "", p.get("tag-voltage") or "",
                             "G1" if p.get("location-error-text") == "<=10m" else "G2"))
        df = pd.DataFrame(rows, columns=["id", "t", "lon", "lat", "mort", "volt", "q"])
        df["t"] = pd.to_datetime(df.t, utc=True)
        _icarus_cache[study] = df
    df = _icarus_cache[study]
    return {i: df[df.id == i][["t", "lon", "lat", "q"]] for i in ids}


MORT = {"alive": "a", "dead": "d", "lost": "l", "unknown": "u"}


def icarus_status(study, i):
    """The tag's own status messages: [unix seconds, a/d/l/u (alive, dead, lost, unknown), battery mV]."""
    df = _icarus_cache[study]
    df = df[(df.id == i) & (df.mort != "")].sort_values("t")
    return [[int(r.t.timestamp()), MORT.get(r.mort, "u"), int(round(float(r.volt))) if r.volt else None]
            for r in df.itertuples()]


def albatross():
    o = rload("cran_adehabitatLT_master_data_albatross.rda")["albatross"]
    tr = Transformer.from_crs("+proj=utm +zone=42 +datum=WGS84", "EPSG:4326", always_xy=True)
    out = {}
    for i, df in enumerate(o):
        df = df.dropna(subset=["x"])
        lon, lat = tr.transform(df.x.values, df.y.values)
        out[i] = pd.DataFrame({"t": pd.to_datetime(df.date.values, unit="s", utc=True),
                               "lon": lon, "lat": lat, "q": "A"})
    return out


def pelican():
    v = rload("pelican.rda")["pelican"]["gps"]
    return pd.DataFrame({"t": pd.to_datetime(v["timestamp"], unit="s", utc=True),
                         "lon": v["longitude"], "lat": v["latitude"], "q": "G"})


def seals_kerguelen():
    out = {}
    s = rload("ianjonsen_aniMotum_main_data_sese.rda")["sese"]
    s1 = rload("cran_foieGras_master_data_sese1.RData")["sese1"]
    e2 = rload("cran_bsam_master_data_ellie2.RData")["ellie2"]
    for src in (s, s1, e2):
        for i, g in src.groupby("id"):
            out[str(i)] = pd.DataFrame({"t": pd.to_datetime(g.date.values, unit="s", utc=True),
                                        "lon": g.lon.values, "lat": g.lat.values,
                                        "q": "A" + g.lc.astype(str).values})
    return out


def fur_seal():
    f = rload("cran_crawl_master_data_northernFurSeal.rda")["northernFurSeal"]
    return pd.DataFrame({"t": pd.to_datetime(f.GMT.values, unit="s", utc=True),
                         "lon": f.long.values, "lat": f.lat.values, "q": "A" + f.loc_class.astype(str).values})


def ringed():
    out = {}
    for name, key in (("calbertsen_argosTrack_master_argosTrack_data_adult_ringed_seal.rda", "adult_ringed_seal"),
                      ("calbertsen_argosTrack_master_argosTrack_data_subadult_ringed_seal.rda", "subadult_ringed_seal")):
        r = rload(name)[key]
        out[key] = pd.DataFrame({"t": pd.to_datetime(r.date.astype(str).values, utc=True),
                                 "lon": r.lon.values, "lat": r.lat.values, "q": "A" + r.lc.astype(str).values})
    s = rload("cran_argosfilter_master_data_seal.rda")["seal"]
    lcmap = {-9: "Z", -2: "B", -1: "A", 0: "0", 1: "1", 2: "2", 3: "3"}
    out["svalbard"] = pd.DataFrame({"t": pd.to_datetime(s.dtime.values, unit="s", utc=True),
                                    "lon": s.lon.values, "lat": s.lat.values,
                                    "q": ["A" + lcmap.get(int(x), "B") for x in s.lc.values]})
    return out


BEARDED_TAG = {}


def bearded():
    b = rload("cran_crawl_master_data_beardedSeals.rda")["beardedSeals"]
    out = {}
    for i, g in b.groupby("deployid"):
        out[str(i)] = pd.DataFrame({"t": pd.to_datetime(g.date_time.values, unit="s", utc=True),
                                    "lon": g.longitude.values, "lat": g.latitude.values,
                                    "q": "A" + g.quality.astype(str).values, "er": g.error_radius.values})
        BEARDED_TAG[str(i)] = {"instr": str(g.instr.iloc[0]), "ptt": str(g.ptt.iloc[0])}
    return out


def whale():
    w = rload("adehabitatLT_whale.rda")["whale"][0].dropna(subset=["x"])
    return pd.DataFrame({"t": pd.to_datetime(w.date.values, unit="s", utc=True),
                         "lon": w.x.values, "lat": w.y.values, "q": "A"})


def marlin():
    m = rload("cran_xtractomatic_master_data_Marlintag38606.rda")["Marlintag38606"]
    lon = np.where(m.lon.values > 180, m.lon.values - 360, m.lon.values)
    # Daily light-level estimates: put each at noon UTC of its day. The data gives a latitude/longitude band
    # around each estimate; keep the larger half-width (latitude, in practice) as the error radius.
    half_km = np.maximum((m.higLat.values - m.lowLat.values) / 2 * 111.2,
                         (m.higLon.values - m.lowLon.values) / 2 * 111.2 * np.cos(np.radians(m.lat.values)))
    return pd.DataFrame({"t": pd.to_datetime(m.date.values, unit="D", utc=True) + pd.Timedelta(hours=12),
                         "lon": lon, "lat": m.lat.values, "q": "L", "er": half_km * 1000})


def turtle():
    t = rload("cran_SDLfilter_master_data_turtle.rda")["turtle"]
    return pd.DataFrame({"t": pd.to_datetime(t.DateTime.values, unit="s", utc=True),
                         "lon": t.lon.values, "lat": t.lat.values, "q": ["F%d" % q for q in t.qi.values]})


_car = None


def caribou(ids):
    global _car
    if _car is None:
        _car = pd.read_csv(DL / "rfordatascience_tidytuesday_master_data_2020_2020-06-23_locations.csv")
        _car["t"] = pd.to_datetime(_car.timestamp, utc=True)
    return {i: pd.DataFrame({"t": pd.to_datetime(g.t.values, utc=True), "lon": g.longitude.values,
                             "lat": g.latitude.values, "q": "G", "season": g.season.str[0].values})
            for i, g in _car[_car.animal_id.isin(ids)].groupby("animal_id")}


# Cleaning, place labels and encoding: catalog_lib.py
LAB = Labeler(NE)


# --------------------------------------------------------------------------
# Catalog definition
# --------------------------------------------------------------------------
SRC = {
    "wikelski2015": {
        "title": "Navigation experiments in lesser black-backed gulls (Wikelski et al. 2015)",
        "who": "Max Planck Institute of Animal Behavior 외", "via": "Movebank · movingpandas-examples",
        "url": "https://doi.org/10.1038/srep17061",
        "note": "실험으로 옮기지 않고 그 자리에 풀어준 어른 새만 골랐어요."},
    "icarus_cuckoo": {
        "title": "ICARUS Mongolia cuckoos Nymba (Movebank study 1542155599, CC0)",
        "who": "몽골 야생동물과학보전센터 · MPIAB", "via": "Movebank · eio/animal-movement",
        "url": "https://www.movebank.org/cms/webapp?gwt_fragment=page=studies,path=study1542155599",
        "note": ""},
    "icarus_dove": {
        "title": "ICARUS Turtle doves (Movebank study 1542192442, CC BY-NC)",
        "who": "프랑스 국립자연사박물관(MNHN) · MPIAB", "via": "Movebank · eio/animal-movement",
        "url": "https://www.movebank.org/cms/webapp?gwt_fragment=page=studies,path=study1542192442",
        "note": ""},
    "icarus_seabird": {
        "title": "Seabird ecology in the Atlantic, Ascension Island (Movebank study 1531481854, CC0)",
        "who": "어센션섬 정부 · MPIAB", "via": "Movebank · eio/animal-movement",
        "url": "https://www.movebank.org/cms/webapp?gwt_fragment=page=studies,path=study1531481854",
        "note": ""},
    "weimerskirch": {
        "title": "Argos monitoring of adult wandering albatrosses, Crozet (H. Weimerskirch, CEBC-CNRS)",
        "who": "프랑스 시제 생물학연구센터(CEBC-CNRS)", "via": "R 패키지 adehabitatLT",
        "url": "https://cran.r-project.org/package=adehabitatLT",
        "note": ""},
    "harrison_pelican": {
        "title": "Brown Pelican GPS (Autumn-Lynn Harrison, Smithsonian)",
        "who": "스미스소니언 철새센터", "via": "R 패키지 ctmm",
        "url": "https://cran.r-project.org/package=ctmm", "note": ""},
    "imos_sese": {
        "title": "Southern elephant seal Argos data, Îles Kerguelen (IMOS · IPEV · SNO-MEMO)",
        "who": "호주 IMOS · 프랑스 IPEV/SNO-MEMO", "via": "R 패키지 aniMotum · foieGras · bsam",
        "url": "https://imos.org.au", "note": ""},
    "nmml_fur": {
        "title": "Northern fur seal pup relocation data (Johnson et al. 2008, NOAA NMML)",
        "who": "미국 해양대기청(NOAA) 해양포유류연구소", "via": "R 패키지 crawl",
        "url": "https://cran.r-project.org/package=crawl", "note": ""},
    "dfo_ringed": {
        "title": "Ringed seal Argos tracks, Sanikiluaq, Nunavut (Fisheries and Oceans Canada)",
        "who": "캐나다 수산해양부", "via": "R 패키지 argosTrack (Albertsen et al. 2015)",
        "url": "https://doi.org/10.1890/14-2101.1", "note": ""},
    "npi_ringed": {
        "title": "Ringed seal tagged in Svalbard (C. Lydersen & K. M. Kovacs, Norwegian Polar Institute)",
        "who": "노르웨이 극지연구소", "via": "R 패키지 argosfilter",
        "url": "https://cran.r-project.org/package=argosfilter", "note": ""},
    "nmml_bearded": {
        "title": "Bearded seal location data, Alaska (NOAA Marine Mammal Laboratory)",
        "who": "미국 해양대기청(NOAA) 해양포유류연구소", "via": "R 패키지 crawl",
        "url": "https://cran.r-project.org/package=crawl", "note": ""},
    "whalenet": {
        "title": "Argos monitoring of a right whale (WhaleNet, Wheelock College)",
        "who": "WhaleNet (휠록 칼리지)", "via": "R 패키지 adehabitatLT",
        "url": "https://cran.r-project.org/package=adehabitatLT",
        "note": "초기 위성 기록이라 위치가 1도 단위로 거친 날이 있어요."},
    "musyl_marlin": {
        "title": "Blue marlin pop-up satellite tag 38606, Pacific 2003 (Dr. Mike Musyl, Pelagic Research Group)",
        "who": "Pelagic Research Group", "via": "R 패키지 xtractomatic (NOAA)",
        "url": "https://cran.r-project.org/package=xtractomatic",
        "note": ""},
    "shimada_turtle": {
        "title": "Green turtle Fastloc GPS, Sandy Strait (Shimada et al. 2016)",
        "who": "제임스쿡대학교 · 퀸즐랜드 환경부", "via": "R 패키지 SDLfilter",
        "url": "https://doi.org/10.3354/meps11972", "note": ""},
    "bc_caribou": {
        "title": "Mountain caribou in British Columbia (BC Ministry of Environment, Movebank)",
        "who": "캐나다 브리티시컬럼비아주 환경부", "via": "Movebank · TidyTuesday 2020-06-23",
        "url": "https://doi.org/10.5441/001/1.p5bn656k", "note": ""},
}

CAT = []


def add(aid, sp, src, df, *, tag, home, area, vmax, bin_h, sex=None, age=None, ageText=None, extra=None,
        study=None):
    CAT.append(dict(id=aid, sp=sp, src=src, raw=df, tag=tag, home=home, area=area, vmax=vmax, bin_h=bin_h,
                    sex=sex, age=age, ageText=ageText, extra=extra or {}, study=study))


# Birds -------------------------------------------------------------------
G = gulls(["91761A", "91732A", "91762A", "91758A", "91780A", "91759A"])
for i, df in G.items():
    add(f"lbbg-{i}", "lbbg", "wikelski2015", df, tag=i, home="핀란드 남부 번식지", area="europe",
        vmax=30, bin_h=4, age="adult", ageText="어른 (번식 중에 포획)")

C = icarus("CUCKOOS", ["BE8BA8", "B89E5F", "BED44E", "B89A08", "A47C53", "B42651", "B9FE31", "BBE6AB"])
for i in ["BE8BA8", "B89E5F", "BED44E", "B89A08", "A47C53", "B42651"]:
    add(f"cuckoo-{i}", "cuckoo", "icarus_cuckoo", C[i], tag=i,
        home="몽골 서부 호브드" if C[i].lon.iloc[0] < 100 else "몽골 중부 투브", area="mongolia",
        vmax=30, bin_h=3, study="CUCKOOS")
for i in ["B9FE31", "BBE6AB"]:
    add(f"snipe-{i}", "snipe", "icarus_cuckoo", C[i], tag=i, home="몽골 동부 초원", area="mongolia",
        vmax=30, bin_h=3, study="CUCKOOS")

D = icarus("DOVES", ["Aragon1_BA09685", "Aragon4_BA09690", "Menorca 2 [C11732]", "Soan [FRP_GY71628]",
                     "FR4 [FRP_GY154746]"])
dove_home = {"Aragon1_BA09685": ("스페인 아라곤", "Aragon1"), "Aragon4_BA09690": ("스페인 아라곤", "Aragon4"),
             "Menorca 2 [C11732]": ("스페인 메노르카섬", "Menorca 2"),
             "Soan [FRP_GY71628]": ("프랑스 프로방스", "Soan"), "FR4 [FRP_GY154746]": ("프랑스 카마르그", "FR4")}
for i, df in D.items():
    h, short = dove_home[i]
    add(f"dove-{short.replace(' ', '')}", "dove", "icarus_dove", df, tag=i, home=h, area="europe",
        vmax=30, bin_h=3, study="DOVES")

S = icarus("SEABIRDS", ["Sooty266701", "Sooty3EC1C1", "Sooty63EAEB", "Sooty2D3CEA", "SoTern72740C",
                        "SoTern2AC677", "SoTern3A28B5", "Sooty3CE2F0", "AsFr5F6D29", "AsFr3DAF54",
                        "MaBo38E14C"])
for i in ["Sooty266701", "Sooty3EC1C1", "Sooty63EAEB", "Sooty2D3CEA", "SoTern72740C", "SoTern2AC677",
          "SoTern3A28B5", "Sooty3CE2F0"]:
    add(f"tern-{i}", "tern", "icarus_seabird", S[i], tag=i, home="어센션섬", area="atlantic", vmax=30, bin_h=3,
        study="SEABIRDS")
# AsFr5F6D29 left out: from early July on its tag repeats one spot on Ascension for seven months.
for i in ["AsFr3DAF54"]:
    add(f"frigate-{i}", "frigate", "icarus_seabird", S[i], tag=i, home="어센션섬", area="atlantic",
        vmax=30, bin_h=3, study="SEABIRDS")
add("booby-MaBo38E14C", "booby", "icarus_seabird", S["MaBo38E14C"], tag="MaBo38E14C", home="어센션섬",
    area="atlantic", vmax=30, bin_h=3, study="SEABIRDS")

A = albatross()
for i, df in A.items():
    add(f"albatross-{i + 1}", "albatross", "weimerskirch", df, tag=f"Crozet #{i + 1}", home="크로제 제도",
        area="southern", vmax=30, bin_h=3, age="adult", ageText="어른")

add("pelican-1", "pelican", "harrison_pelican", pelican(), tag="Brown pelican (ctmm)",
    home="미국 노스캐롤라이나 아우터뱅크스", area="namerica", vmax=30, bin_h=4)

# Marine mammals ----------------------------------------------------------
K = seals_kerguelen()
for i, df in K.items():
    add(f"eseal-{i}", "eseal", "imos_sese", df, tag=i, home="케르겔렌 제도", area="southern", vmax=3.2,
        bin_h=6)

add("furseal-pup", "furseal", "nmml_fur", fur_seal(), tag="NFS pup (Johnson et al. 2008)",
    home="베링해 프리빌로프 제도", area="npacific", vmax=3.5, bin_h=6, age="pup", ageText="새끼 (그해 태어남)")

RS = ringed()
add("ringed-106373", "ringed", "dfo_ringed", RS["adult_ringed_seal"], tag="106373", home="허드슨만 새니킬루아크",
    area="arctic", vmax=3, bin_h=6, age="adult", ageText="어른")
add("ringed-43847", "ringed", "dfo_ringed", RS["subadult_ringed_seal"], tag="43847", home="허드슨만 새니킬루아크",
    area="arctic", vmax=3, bin_h=6, age="juvenile", ageText="어린 개체 (아성체)")
add("ringed-svalbard", "ringed", "npi_ringed", RS["svalbard"], tag="Svalbard 2002", home="노르웨이 스발바르",
    area="arctic", vmax=3, bin_h=6)

B = bearded()
for i, df in B.items():
    add(f"bearded-{i}", "bearded", "nmml_bearded", df, tag=i, home="알래스카 코체부 사운드", area="arctic",
        vmax=3, bin_h=6, extra=BEARDED_TAG[i])

add("whale-1996", "rightwhale", "whalenet", whale(), tag="WhaleNet 1996", home="미국 조지아·플로리다 앞바다",
    area="namerica", vmax=4, bin_h=24)

# Fish & reptile ----------------------------------------------------------
add("marlin-38606", "marlin", "musyl_marlin", marlin(), tag="38606", home="하와이 앞바다", area="npacific",
    vmax=50, bin_h=24)
add("turtle-QA23117", "turtle", "shimada_turtle", turtle(), tag="QA23117", home="호주 퀸즐랜드 샌디 해협",
    area="oceania", vmax=2.5, bin_h=12)

# Land mammals ------------------------------------------------------------
IND = pd.read_csv(DL / "rfordatascience_tidytuesday_master_data_2020_2020-06-23_individuals.csv")
car_ids = ["KE_car128", "QU_car114", "NA_car133", "KE_car155", "QU_car110", "MO_car102"]
CR = caribou(car_ids)
site_ko = {"Kennedy": "케네디", "Quintette": "퀸텟", "Narraway": "나러웨이", "Moberly": "모벌리",
           "Graham": "그레이엄", "Hart Ranges": "하트 산맥", "Burnt Pine": "번트파인", "Scott": "스콧"}
OFF_KO = {"removal": "목걸이 회수", "dead": "사망", "other": "기타", "unknown": "모름"}
for i in car_ids:
    rows = IND[IND.animal_id == i]
    r = rows.iloc[0]
    ls = str(r.life_stage).replace("-", "~") + "살"
    extra = {"herd": [site_ko.get(r.study_site, r.study_site), r.study_site]}
    if r.with_calf is True or str(r.with_calf) == "True":
        extra["withCalf"] = True
    if str(r.pregnant) == "True":
        extra["pregnant"] = True
    if isinstance(r.deploy_on_comments, str):
        extra["deployNote"] = r.deploy_on_comments
    extra["deployOff"] = [[OFF_KO.get(x.deploy_off_type, x.deploy_off_type),
                           x.deploy_off_comments if isinstance(x.deploy_off_comments, str) else ""]
                          for x in rows.itertuples()]
    add(f"caribou-{i}", "caribou", "bc_caribou", CR[i], tag=i,
        home=f"캐나다 BC {site_ko.get(r.study_site, r.study_site)} 산지", area="namerica", vmax=8, bin_h=24,
        sex="f" if r.sex == "f" else "m", age="adult" if not str(r.life_stage).startswith("2") else "young",
        ageText=f"포획 당시 {ls}", extra=extra)

# --------------------------------------------------------------------------
# Process
# --------------------------------------------------------------------------
animals = []
for a in CAT:
    df = clean(a["raw"], a["vmax"], a["bin_h"])
    frozen = None
    if a["src"].startswith("icarus"):
        df, span, t_end = trim_frozen_tail(df)
        if span:
            # the tag kept sending the same spot for this long after the last movement
            frozen = {"until": int(t_end.timestamp()), "days": round(span, 1)}
            print(f"trimmed frozen tail {a['id']}: {span:.1f} days", file=sys.stderr)
    if len(df) < 8:
        print("skip (too few)", a["id"], len(df), file=sys.stderr)
        continue
    labels = [(LAB.label(lo, la)[0], LAB.city_label(lo, la), LAB.region_label(lo, la))
              for lo, la in zip(df.lon.values, df.lat.values)]
    rec = {
        "id": a["id"], "sp": a["sp"], "src": a["src"], "tag": a["tag"], "home": a["home"], "area": a["area"],
        "sex": a["sex"], "age": a["age"], "ageText": a["ageText"], **a["extra"], **track_fields(df, labels),
    }
    if a["study"]:
        rec["status"] = icarus_status(a["study"], a["tag"])
    if frozen:
        rec["frozen"] = frozen
    animals.append(rec)
    print(f'{a["id"]:28s} n={len(df):5d} days={rec["days"]:7.1f} km={rec["km"]:9d} places={rec["places"]:3d} '
          f'start={LAB.places[labels[0][0]][0]} -> end={LAB.places[labels[-1][0]][0]}', file=sys.stderr)

places, regions_tbl, cities_tbl = LAB.tables()
out = {"generated": pd.Timestamp.utcnow().isoformat(), "places": places, "regions": regions_tbl,
       "cities": cities_tbl, "sources": SRC, "animals": animals}
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
print("wrote", OUT, OUT.stat().st_size, "bytes;", len(animals), "animals;", len(places), "places;",
      len(cities_tbl), "cities;", len(regions_tbl), "regions", file=sys.stderr)
