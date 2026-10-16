"""Shared steps for the 나비야 나비야 catalogs: track cleaning, Korean place labels, compact encoding.

build_catalog.py (the archived records) and live.py (animals tracked right now) both turn a table of
fixes into the same record format that js/core.js reads.
"""
import json, re, sys

import numpy as np
import pandas as pd
from shapely.geometry import Point, shape
from shapely.strtree import STRtree
from shapely.ops import nearest_points

R = 6371.0088


def hav(lon1, lat1, lon2, lat2):
    lon1, lat1, lon2, lat2 = map(np.radians, (lon1, lat1, lon2, lat2))
    a = np.sin((lat2 - lat1) / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin((lon2 - lon1) / 2) ** 2
    return 2 * R * np.arcsin(np.sqrt(np.clip(a, 0, 1)))


# --------------------------------------------------------------------------
# Cleaning
# --------------------------------------------------------------------------

def speed_filter(df, vmax_ms):
    """Remove isolated spikes (both in- and out-speed too high), then a forward pass."""
    df = df.reset_index(drop=True)
    for _ in range(50):
        if len(df) < 3:
            break
        t = df.t.values.astype("datetime64[s]").astype(np.int64).astype(float)
        d = hav(df.lon.values[:-1], df.lat.values[:-1], df.lon.values[1:], df.lat.values[1:]) * 1000
        dt = np.maximum(np.diff(t), 60.0)
        v = d / dt
        vin = np.r_[0, v]
        vout = np.r_[v, 0]
        bad = (vin > vmax_ms) & (vout > vmax_ms)
        if not bad.any():
            break
        df = df[~bad].reset_index(drop=True)
    keep = [0]
    for i in range(1, len(df)):
        j = keep[-1]
        d = hav(df.lon[j], df.lat[j], df.lon[i], df.lat[i]) * 1000
        dt = max((df.t[i] - df.t[j]).total_seconds(), 60.0)
        if d / dt <= vmax_ms:
            keep.append(i)
    return df.loc[keep].reset_index(drop=True)


def unwrap_lon(lon):
    out = np.array(lon, dtype=float)
    for i in range(1, len(out)):
        d = out[i] - out[i - 1]
        if d > 180:
            out[i:] -= 360
        elif d < -180:
            out[i:] += 360
    return out


def trim_frozen_tail(df, km=0.3, min_days=2):
    """ICARUS tags resend their last fix when they cannot get a new one, and keep sending after a bird dies or
    drops the tag. A record that ends with days of one repeated spot no longer follows a moving animal, so keep
    only the first fix of that run as the last known place."""
    lons, lats = df.lon.values, df.lat.values
    j = len(df) - 1
    while j > 0 and hav(lons[j - 1], lats[j - 1], lons[-1], lats[-1]) <= km:
        j -= 1
    span = (df.t.iloc[-1] - df.t.iloc[j]).total_seconds() / 86400
    if len(df) - j >= 3 and span >= min_days:
        return df.iloc[:j + 1].reset_index(drop=True), span, df.t.iloc[-1]
    return df, 0.0, None


# q, the kind and quality of each fix (see build_catalog.py), ranked best first, and its one-letter code
QRANK = {"G1": 0, "F8": 1, "F7": 2, "F6": 3, "F5": 4, "F4": 5, "G": 6, "G2": 7,
         "A3": 10, "A2": 11, "A1": 12, "A0": 13, "AA": 14, "AB": 15, "A": 16, "L": 20}
QCHAR = {"G1": "a", "G": "g", "G2": "b", "F4": "4", "F5": "5", "F6": "6", "F7": "7", "F8": "8",
         "A3": "3", "A2": "2", "A1": "1", "A0": "0", "AA": "A", "AB": "B", "A": "R", "L": "L"}


def clean(df, vmax_ms, bin_hours):
    df = df.dropna(subset=["lon", "lat", "t"]).copy()
    df["t"] = pd.to_datetime(df.t, utc=True)
    df = df[(df.lat.abs() <= 90) & (df.lon.abs() <= 360)]
    df["lon"] = ((df.lon + 180) % 360) - 180
    df = df[~df.q.isin(["Z", "AZ"])]
    df = df.sort_values("t").drop_duplicates("t").reset_index(drop=True)
    df = speed_filter(df, vmax_ms)
    # bin: median position per bin (Argos noise smoothing), time = median time
    df["ulon"] = unwrap_lon(df.lon.values)
    secs = (df.t - pd.Timestamp("1970-01-01", tz="UTC")).dt.total_seconds().astype(np.int64)
    b = secs // int(bin_hours * 3600)
    g = df.groupby(b.values)
    res = pd.DataFrame({"t": g.t.apply(lambda s: s.iloc[len(s) // 2]).values,
                        "lon": g.ulon.median().values, "lat": g.lat.median().values,
                        "n": g.n.sum().values if "n" in df else g.size().values,
                        "q": g.q.apply(lambda s: min(s, key=lambda c: QRANK.get(c, 50))).values})
    if "er" in df:
        res["er"] = g.er.min().values
    if "season" in df:
        res["season"] = g.season.agg(lambda s: s.mode().iloc[0]).values
    res["lon"] = ((res.lon + 180) % 360) - 180
    return res.reset_index(drop=True)


# --------------------------------------------------------------------------
# Place labelling (Natural Earth, Korean names)
# --------------------------------------------------------------------------

def load_geo(ne_dir, name):
    d = json.load(open(ne_dir / f"{name}.geojson"))
    geoms, props = [], []
    for f in d["features"]:
        if not f.get("geometry"):
            continue
        try:
            g = shape(f["geometry"])
        except Exception:
            continue
        if not g.is_valid:
            g = g.buffer(0)
        geoms.append(g)
        props.append(f["properties"])
    return geoms, props, STRtree(geoms)


def containing(tree_tuple, pt):
    geoms, props, tree = tree_tuple
    hits = tree.query(pt, predicate="intersects")
    return [(geoms[i], props[i]) for i in hits]


# Natural Earth gives some marine names in a form that reads oddly in a sentence; tidy a few.
KO_FIX = {
    "남대서양": "남대서양", "북대서양": "북대서양",
}
ADMIN1_COUNTRIES = {"캐나다", "미국", "오스트레일리아", "러시아", "브라질", "중국", "인도"}
REGION_KINDS = {"Desert": "desert", "Range/mtn": "range", "Plateau": "plateau", "Basin": "basin",
                "Plain": "plain", "Peninsula": "peninsula", "Lowland": "plain", "Valley": "valley",
                "Delta": "delta", "Wetlands": "wetland", "Tundra": "tundra", "Gorge": "valley",
                "Foothills": "range", "Geoarea": "area", "Isthmus": "peninsula", "Coast": "coast",
                "Island group": "islands", "Island": "island"}
NAME_FIX = {
    "중화인민공화국": "중국", "터키": "튀르키예", "파이옌느": "파이얀네호", "피하야르비": "퓌해예르비호",
    "캐나다 누나부트 준": "캐나다 누나부트", "칼리닌그라드": "비스와 석호", "프스코프스코예호": "프스코프호",
    "뱅센 베이": "뱅센만", "코체부 사운드": "코체부만", "팜리코 사운드": "팜리코만",
}
REGION_FIX = {
    "헨티인 마운틴스": "헨티산맥", "엘버즈 마운틴스": "엘부르즈산맥", "미툼바 마운틴스": "미툼바산맥",
    "달로우 마운틴스": "다러우산맥", "샨 플래투": "샨고원", "초타 나그푸르 플래투": "초타나그푸르고원",
    "카탕가 플래투": "카탕가고원", "무칭가 마운틴스": "무칭가산맥", "삿푸라 레인지": "사트푸라산맥",
    "탄누올라 레인지": "탄누올라산맥", "카시 힐스": "카시 구릉", "나가 힐즈": "나가 구릉",
    "시왈릭 힐스": "시와리크 구릉", "브룩스 레인지": "브룩스산맥", "콜럼비아 마운틴스": "컬럼비아산맥",
    "버클랜드 테이블랜드": "버클랜드 고원", "벨처 아일랜즈": "벨처 제도", "코츠 아일랜드": "코츠섬",
    "씨 아일랜즈": "시아일랜즈", "코스탈 플레인": "대서양 해안 평야", "발틱 플레인스": "발트 평원",
    "레반트 코스트": "레반트 해안", "웨스턴 데저트": "서부 사막", "이스턴 사막": "동부 사막",
    "피니시 레이크 리전": "핀란드 호수 지대", "그랜드 에르그 오리엔탈": "그랑 에르그 오리앙탈",
    "아틀라스 텔리엔": "텔 아틀라스산맥", "폰틱 스텝": "폰토스 초원", "마사이 스텝": "마사이 초원",
    "노스 슬로프": "노스슬로프", "미노르카 섬": "메노르카섬", "슌도르본": "순다르반스",
    "엘 게지라": "게지라 평원", "수드": "수드 습지", "이웸베르 스텝": "이웸베르 초원", "북유럽 평원": "북유럽 평원",
}


class Labeler:
    """Korean place, region and nearby-city names for a point, collected into shared lookup tables."""

    def __init__(self, ne_dir):
        print("loading geodata ...", file=sys.stderr)
        self.countries = load_geo(ne_dir, "ne_50m_admin_0_countries")
        self.lakes = load_geo(ne_dir, "ne_50m_lakes")
        self.marine = load_geo(ne_dir, "ne_10m_geography_marine_polys")
        self.regions = load_geo(ne_dir, "ne_10m_geography_regions_polys")
        self.admin1 = load_geo(ne_dir, "ne_50m_admin_1_states_provinces")
        pp = json.load(open(ne_dir / "ne_10m_populated_places.geojson"))["features"]
        self.cities = [(f["properties"].get("NAME_KO") or "", f["properties"].get("NAME"),
                        f["geometry"]["coordinates"], f["properties"].get("POP_MAX") or 0) for f in pp
                       if (f["properties"].get("POP_MAX") or 0) >= 30000 and f["properties"].get("NAME_KO")]
        self.city_xy = np.array([c[2] for c in self.cities])
        self.places, self.place_index = [], {}
        self.regions_tbl, self.region_index = [], {}
        self.cities_tbl, self.city_index = [], {}

    def pidx(self, ko, kind, en):
        key = (ko, kind)
        if key not in self.place_index:
            self.place_index[key] = len(self.places)
            self.places.append([ko, kind, en])
        return self.place_index[key]

    def ridx(self, ko, kind):
        key = (ko, kind)
        if key not in self.region_index:
            self.region_index[key] = len(self.regions_tbl)
            self.regions_tbl.append([ko, kind])
        return self.region_index[key]

    def cidx(self, ko, lon, lat):
        if ko not in self.city_index:
            self.city_index[ko] = len(self.cities_tbl)
            self.cities_tbl.append([ko, round(lon, 3), round(lat, 3)])
        return self.city_index[ko]

    def label(self, lon, lat):
        pt = Point(lon, lat)
        # lakes first
        for g, p in containing(self.lakes, pt):
            ko = p.get("name_ko") or p.get("name")
            if ko:
                return self.pidx(ko, "lake", p.get("name")), None
        land = containing(self.countries, pt)
        if land:
            g, p = land[0]
            cko = p.get("NAME_KO") or p.get("ADMIN")
            sub = None
            if cko in ADMIN1_COUNTRIES:
                for g2, p2 in containing(self.admin1, pt):
                    if p2.get("name_ko"):
                        sub = p2["name_ko"]
                        break
            name = f"{cko} {sub}" if sub else cko
            return self.pidx(name, "land", p.get("ADMIN")), cko
        hits = containing(self.marine, pt)
        if hits:
            g, p = min(hits, key=lambda gp: gp[0].area)
            ko = p.get("name_ko") or p.get("name")
            en = p.get("name") or ""
            if ko in ("대서양", "태평양"):
                if en.lower().startswith("north"):
                    ko = "북" + ko
                elif en.lower().startswith("south"):
                    ko = "남" + ko
                else:
                    ko = ("북" if lat >= 0 else "남") + ko
            ko = KO_FIX.get(ko, ko)
            ko = re.sub(r" 씨$", "해", ko)
            return self.pidx(ko, "sea", en), None
        # near a coast?
        geoms, props, tree = self.countries
        j = tree.nearest(pt)
        near = nearest_points(pt, geoms[j])[1]
        dkm = hav(lon, lat, near.x, near.y)
        cko = props[j].get("NAME_KO") or props[j].get("ADMIN")
        if dkm < 60:
            return self.pidx(f"{cko} 앞바다", "sea", props[j].get("ADMIN")), None
        return self.pidx("먼 바다", "sea", "open ocean"), None

    def region_label(self, lon, lat):
        pt = Point(lon, lat)
        best = None
        for g, p in containing(self.regions, pt):
            k = REGION_KINDS.get(p.get("FEATURECLA"))
            ko = p.get("NAME_KO")
            if not k or not ko:
                continue
            if best is None or g.area < best[0]:
                best = (g.area, ko, k)
        return self.ridx(best[1], best[2]) if best else None

    def city_label(self, lon, lat):
        d = hav(lon, lat, self.city_xy[:, 0], self.city_xy[:, 1])
        j = int(np.argmin(d))
        if d[j] <= 45:
            c = self.cities[j]
            return self.cidx(c[0], c[2][0], c[2][1])
        return None

    def tables(self):
        """The lookup tables with the name fixes applied (places, regions, cities)."""
        places = [list(p) for p in self.places]
        for p_ in places:
            p_[0] = NAME_FIX.get(p_[0], p_[0])
            for k, v in NAME_FIX.items():
                if p_[0].startswith(k + " "):
                    p_[0] = v + p_[0][len(k):]
        regions = [[REGION_FIX.get(r[0], r[0]), r[1]] for r in self.regions_tbl]
        return places, regions, [list(c) for c in self.cities_tbl]


# --------------------------------------------------------------------------
# Encoding helpers (Google polyline style signed varints)
# --------------------------------------------------------------------------

def enc(values):
    out = []
    prev = 0
    for v in values:
        d = int(v) - prev
        prev = int(v)
        d = ~(d << 1) if d < 0 else (d << 1)
        while d >= 0x20:
            out.append(chr((0x20 | (d & 0x1f)) + 63))
            d >>= 5
        out.append(chr(d + 63))
    return "".join(out)


def runs(codes):
    """[[startIndex, code], ...] for runs of equal codes (None -> -1)."""
    r = []
    last = object()
    for i, c in enumerate(codes):
        c = -1 if c is None else c
        if c != last:
            r.append([i, c])
            last = c
    return r


def track_fields(df, labels):
    """The record fields that describe a cleaned track. labels: (place, city, region) codes per point."""
    lons, lats = df.lon.values, df.lat.values
    seg = hav(lons[:-1], lats[:-1], lons[1:], lats[1:])
    t0 = df.t.iloc[0]
    tmin = ((df.t - t0).dt.total_seconds() // 60).astype(int).values
    pl = [l[0] for l in labels]
    disp = hav(lons[0], lats[0], lons, lats)
    rec = {
        "t0": int(t0.timestamp()), "n": len(df), "days": round((df.t.iloc[-1] - t0).total_seconds() / 86400, 1),
        "km": round(float(seg.sum())),
        "maxFromHome": round(float(disp.max())),
        "latRange": [round(float(lats.min()), 2), round(float(lats.max()), 2)],
        "start": [round(float(lons[0]), 4), round(float(lats[0]), 4)],
        "places": len(set(pl)),
        "t": enc(tmin), "x": enc(np.round(lons * 1e4)), "y": enc(np.round(lats * 1e4)),
        "pl": runs(pl), "ci": runs([l[1] for l in labels]), "rg": runs([l[2] for l in labels]),
        # raw fixes merged into each point, and the best fix quality among them (one letter per point)
        "nf": enc(df.n.values), "qs": "".join(QCHAR[q] for q in df.q.values),
    }
    if "er" in df and df.er.notna().any():
        rec["er"] = enc(np.round(df.er.fillna(0).values))
    if "season" in df:
        rec["se"] = runs(list(df.season.values))
    return rec
