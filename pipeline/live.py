"""Animals tracked right now, from Movebank, for 나비야 나비야.

Finds the studies a Movebank account may download under an open licence (CC0, CC BY, CC BY-NC) whose animals
sent a GPS fix in the last few days, follows a few animals from each, and writes them in the record format of
data/animals.json. Only animals that are alive as far as the data says, still moving, and sending right now are
offered ("listed"); the others stay in the file a while for anyone who adopted them. GitHub Actions runs it on a schedule (.github/workflows/live.yml). A state file carries each
animal's track from run to run, so later runs download only the new fixes.

    MOVEBANK_USER=... MOVEBANK_PASS=... python3 pipeline/live.py --ne <Natural Earth dir> \\
        --state live/state.json --out live/live.json

A study that asks users to accept licence terms is skipped, and its terms are kept under "needsLicense" in the
state file, until its id and the md5 of those terms are added to pipeline/live_licenses.json.
"""
import argparse, base64, csv, hashlib, http.cookiejar, io, json, os, re, sys, time, urllib.error, urllib.parse
import urllib.request
from pathlib import Path

import numpy as np
import pandas as pd
from shapely.geometry import Point

sys.path.insert(0, str(Path(__file__).resolve().parent))
from catalog_lib import Labeler, clean, containing, hav, track_fields  # noqa: E402

HERE = Path(__file__).resolve().parent
API = "https://www.movebank.org/movebank/service"
OPEN_LICENSES = {"CC0": "CC0", "CCBY": "CC BY", "CCBYNC": "CC BY-NC"}
LIVE_DAYS = 3          # a fix within this many days counts as tracked right now
STILL_KM, STILL_DAYS = 0.3, 3  # a tag that stayed this close to one spot this long: a dead animal or a dropped tag
HISTORY_DAYS = 365     # how far back a newly followed animal's track starts
KEEP_DAYS = 30         # animals no longer listed stay in the file this long, for anyone who adopted them
MAX_STUDIES = 40       # studies looked into per run
PER_STUDY = 3          # animals listed from one study
MAX_ANIMALS = 60       # animals listed, at most
# Track resolution by age: fine near now, one point a day for old fixes. (younger than N days, bin hours)
TIERS = [(2, 0.5), (30, 3), (None, 24)]
VMAX = {"bird": 30, "sea": 4, "fish": 4, "land": 10}  # m/s, for dropping impossible jumps
# Critically endangered and endangered species are left out: where they are right now helps poachers more than
# anyone else, even when a study shares it.
HIDE_IUCN = {"CR", "EN"}
# how a deployment ended, when it did (Movebank's deployment-end-type vocabulary)
END_TYPES = {"dead", "equipment failure", "fall off", "removal", "captured", "released", "scheduled detachment"}
FAR_PAST = {"timestamp_start": "20000101000000000", "timestamp_end": "20000101000001000"}


# --------------------------------------------------------------------------
# Movebank REST API (docs: github.com/movebank/movebank-api-doc)
# --------------------------------------------------------------------------

class LicenseRequired(Exception):
    def __init__(self, terms):
        super().__init__("licence terms must be accepted")
        self.terms = terms


class Movebank:
    def __init__(self, user, password, base=API, pause=1.0):
        self.base = base.rstrip("/")
        self.auth = "Basic " + base64.b64encode(f"{user}:{password}".encode()).decode()
        # cookies keep the session between reading licence terms and accepting them
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.pause, self.last, self.calls = pause, 0.0, 0

    def get(self, path, params, tries=4):
        url = f"{self.base}/{path}?" + urllib.parse.urlencode(params, doseq=True)
        for k in range(tries):
            # Movebank serves one request at a time per address; leave a gap between them as well
            time.sleep(max(0.0, self.pause - (time.time() - self.last)))
            self.calls += 1
            req = urllib.request.Request(url, headers={"Authorization": self.auth, "User-Agent": "nabiya-live/1"})
            try:
                with self.opener.open(req, timeout=180) as r:
                    body = r.read()
                    lic = r.headers.get("accept-license", "").lower() == "true"
                self.last = time.time()
                if lic or body.startswith(b"The requested download may contain copyrighted material"):
                    raise LicenseRequired(body)
                return body
            except urllib.error.HTTPError as e:
                self.last = time.time()
                if e.code in (429, 500, 502, 503, 504) and k < tries - 1:
                    time.sleep(10 * 2 ** k)
                    continue
                raise
            except (urllib.error.URLError, TimeoutError):
                self.last = time.time()
                if k < tries - 1:
                    time.sleep(10 * 2 ** k)
                    continue
                raise

    def table(self, **params):
        text = self.get("direct-read", params).decode("utf-8-sig", "replace")
        if text.strip() in ("", "No data available."):
            return []
        return list(csv.DictReader(io.StringIO(text)))

    def accept(self, study_id, md5):
        """Accept a study's licence terms for this account; the terms must have been read in this session."""
        self.get("direct-read", {"entity_type": "event", "study_id": study_id, **FAR_PAST, "license-md5": md5})

    def locations(self, study_id, ids, start_ms=None, end_ms=None, daily=False, limit=None):
        """{individual_local_identifier: [(ms, lon, lat), ...]} of GPS fixes, oldest first."""
        params = {"study_id": study_id, "individual_local_identifiers": list(ids), "sensor_type": "gps"}
        if start_ms is not None:
            params["timestamp_start"] = int(start_ms)
        if end_ms is not None:
            params["timestamp_end"] = int(end_ms)
        if daily:
            params["event_reduction_profile"] = "EURING_01"
        if limit:
            params["max_events_per_individual"] = limit
        body = self.get("json-auth", params)
        try:
            d = json.loads(body)
        except ValueError:
            raise LicenseRequired(body)
        out = {}
        for ind in d.get("individuals", []):
            fx = [(l["timestamp"], l["location_long"], l["location_lat"]) for l in ind.get("locations", [])
                  if l.get("location_long") is not None and l.get("location_lat") is not None]
            out[str(ind.get("individual_local_identifier"))] = sorted(fx)
        return out


def ts(s):
    """A Movebank CSV timestamp ('2008-05-31 13:30:02.001', UTC) as epoch seconds, or None."""
    try:
        return pd.Timestamp(s, tz="UTC").timestamp() if s else None
    except ValueError:
        return None


def norm_license(s):
    return "".join(ch for ch in (s or "").upper() if ch.isalnum()).replace("CCZERO", "CC0")


def has_gps(row):
    v = (row.get("sensor_type_ids") or "").lower()
    return not v or "gps" in v or "653" in v.replace(" ", "").split(",")


def num(s):
    try:
        v = float(s)
        return v if v > 0 else None
    except (TypeError, ValueError):
        return None


STAGES = [("subadult", "young", "어린 개체"), ("sub-adult", "young", "어린 개체"), ("adult", "adult", "어른"),
          ("juvenile", "young", "어린 개체"), ("immature", "young", "어린 개체"), ("first", "young", "첫해 개체"),
          ("yearling", "young", "한 살"), ("fledgling", "young", "갓 날기 시작함"), ("nestling", "young", "둥지 새끼"),
          ("chick", "young", "새끼"), ("calf", "young", "새끼"), ("pup", "young", "새끼"), ("young", "young", "어린 개체")]


def life_stage(s):
    """(adult | young | None, Korean text) from a deployment's animal-life-stage; other words stay as given."""
    s = (s or "").strip()
    for key, stage, ko in STAGES:
        if key in s.lower():
            return stage, ko
    return None, s or None


def latest_deployments(mb, sid):
    """{individual id: its latest deployment}; empty when the study doesn't share its deployments."""
    try:
        rows = mb.table(entity_type="deployment", study_id=sid)
    except urllib.error.HTTPError:
        return {}
    out = {}
    for d in rows:
        i = d.get("individual_id")
        if i and (ts(d.get("deploy_on_timestamp")) or 0) >= (ts(out.get(i, {}).get("deploy_on_timestamp")) or 0):
            out[i] = d
    return out


def deployment_ended(d, now_s):
    end = (d.get("deployment_end_type") or "").strip().lower().replace("-", " ").replace("_", " ")
    off = ts(d.get("deploy_off_timestamp"))
    return end in END_TYPES or (off is not None and off < now_s - 86400)


def listed(a, now_s):
    """Offered in the app: alive as far as the data says, still moving, and sending right now."""
    return a["lastT"] >= now_s - LIVE_DAYS * 86400 and not a.get("dead") and not a.get("still")


# --------------------------------------------------------------------------
# Species: curated names first (live_species.json), then Wikidata (names, IUCN) and GBIF (taxonomy)
# --------------------------------------------------------------------------

MARINE_MAMMALS = {"Phocidae", "Otariidae", "Odobenidae", "Balaenidae", "Balaenopteridae", "Eschrichtiidae",
                  "Delphinidae", "Monodontidae", "Phocoenidae", "Physeteridae", "Kogiidae", "Ziphiidae",
                  "Trichechidae", "Dugongidae"}
LOOK = {"bird": "gull", "sea": "eseal", "fish": "turtle", "land": "caribou"}
MOVE = {"bird": "fly", "sea": "swim", "fish": "swim", "land": "walk"}
IUCN_EN = {"least concern": "LC", "near threatened": "NT", "vulnerable": "VU", "endangered": "EN",
           "critically endangered": "CR", "extinct in the wild": "EW", "data deficient": "DD"}


def http_json(url):
    req = urllib.request.Request(url, headers={
        "User-Agent": "nabiya-live/1 (https://github.com/kjhoeakjy/earth-damagochi)",
        "Accept": "application/sparql-results+json, application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def lookup_species(sci, curated, net=True):
    s = {"sci": sci, **curated.get(sci, {})}
    if net:
        try:
            g = http_json("https://api.gbif.org/v1/species/match?" + urllib.parse.urlencode({"name": sci}))
            s.setdefault("taxon", {k: g[k] for k in ("class", "order", "family") if g.get(k)})
        except Exception as e:  # the curated list still applies; the next run asks again
            print(f"  GBIF lookup failed for {sci}: {e}", file=sys.stderr)
            s["retry"] = True
    if net and not all(k in s for k in ("ko", "en", "iucn")):
        q = ('SELECT ?ko ?en ?st WHERE { ?i wdt:P225 "%s" . '
             'OPTIONAL { ?i wdt:P1843 ?ko FILTER(LANG(?ko) = "ko") } '
             'OPTIONAL { ?i wdt:P1843 ?en FILTER(LANG(?en) = "en") } '
             'OPTIONAL { ?i wdt:P141 ?s . ?s rdfs:label ?st FILTER(LANG(?st) = "en") } } LIMIT 10') % sci.replace('"', "")
        try:
            rows = http_json("https://query.wikidata.org/sparql?" + urllib.parse.urlencode(
                {"query": q, "format": "json"}))["results"]["bindings"]
            for r in rows:
                if "ko" in r:
                    s.setdefault("ko", r["ko"]["value"])
                if "en" in r:
                    s.setdefault("en", r["en"]["value"][:1].upper() + r["en"]["value"][1:])
                if "st" in r and r["st"]["value"].lower() in IUCN_EN:
                    s.setdefault("iucn", IUCN_EN[r["st"]["value"].lower()])
        except Exception as e:
            print(f"  Wikidata lookup failed for {sci}: {e}", file=sys.stderr)
    tx = s.get("taxon", {})
    if "cls" not in s:
        c = tx.get("class")
        s["cls"] = ("bird" if c == "Aves" else "sea" if c == "Mammalia" and tx.get("family") in MARINE_MAMMALS
                    else "fish" if c in ("Actinopterygii", "Elasmobranchii") or tx.get("family") in (
                        "Cheloniidae", "Dermochelyidae") else "land")
    s.setdefault("look", LOOK[s["cls"]])
    s.setdefault("move", MOVE[s["cls"]])
    return s


# --------------------------------------------------------------------------
# Tracks
# --------------------------------------------------------------------------

def pts_frame(p):
    return pd.DataFrame({"t": pd.to_datetime(np.array(p["t"], dtype=np.int64), unit="s", utc=True),
                         "lon": np.array(p["x"], dtype=float) / 1e5, "lat": np.array(p["y"], dtype=float) / 1e5,
                         "n": np.array(p["n"], dtype=np.int64), "q": list(p["q"])})


def frame_pts(df):
    secs = (pd.to_datetime(df.t, utc=True) - pd.Timestamp(0, tz="UTC")).dt.total_seconds().round()
    return {"t": [int(v) for v in secs], "x": [int(round(v * 1e5)) for v in df.lon],
            "y": [int(round(v * 1e5)) for v in df.lat], "n": [int(v) for v in df.n], "q": "".join(df.q)}


def fixes_frame(rows):
    df = pd.DataFrame(rows, columns=["ms", "lon", "lat"])
    df["t"] = pd.to_datetime(df.ms.astype("int64"), unit="ms", utc=True)
    df["n"] = 1
    df["q"] = "G"  # GPS; the feed gives no accuracy
    return df[["t", "lon", "lat", "n", "q"]]


def is_still(df):
    """The track's last STILL_DAYS stayed within STILL_KM of its last point."""
    end = df.t.iloc[-1]
    win = df[df.t >= end - pd.Timedelta(days=STILL_DAYS)]
    if len(win) < 3 or win.t.iloc[-1] - win.t.iloc[0] < pd.Timedelta(days=STILL_DAYS * 0.8):
        return False
    return float(np.max(hav(win.lon.values, win.lat.values, df.lon.iloc[-1], df.lat.iloc[-1]))) <= STILL_KM


def tiered(df, now, vmax):
    """Clean a track and bin it by age (TIERS): fine near now, coarser further back. Fixes from the future
    (a tag with a wrong clock) are left out."""
    age = (now - df.t).dt.total_seconds() / 86400
    parts, lo = [], 0.0
    for days, bin_h in TIERS:
        part = df[(age >= lo) & ((age < days) if days is not None else True)]
        if len(part):
            parts.append(clean(part, vmax, bin_h))
        lo = days if days is not None else lo
    if not parts:
        return df.iloc[0:0]
    out = pd.concat(parts).sort_values("t").drop_duplicates("t").reset_index(drop=True)
    return clean(out, vmax, 1 / 60) if len(out) > 2 else out  # speed check across the tier joins


AREA_OF_CONTINENT = {"Europe": "europe", "Asia": "asia", "Africa": "africa", "North America": "namerica",
                     "South America": "samerica", "Oceania": "oceania", "Antarctica": "southern"}
# seas by their Natural Earth names, most specific first, into the groups of js/core.js GROUPS
SEA_GROUPS = [
    ("mediterranean", "med"), ("aegean", "med"), ("adriatic", "med"), ("ionian", "med"), ("tyrrhenian", "med"),
    ("ligurian", "med"), ("balearic", "med"), ("alboran", "med"), ("black sea", "med"), ("marmara", "med"),
    ("azov", "med"), ("baltic", "europe"), ("bothnia", "europe"), ("gulf of finland", "europe"),
    ("gulf of riga", "europe"), ("north sea", "europe"), ("wadden", "europe"),
    ("arctic", "arctic"), ("barents", "arctic"), ("kara sea", "arctic"), ("laptev", "arctic"), ("siberian", "arctic"),
    ("chukchi", "arctic"), ("beaufort", "arctic"), ("greenland", "arctic"), ("hudson", "arctic"), ("baffin", "arctic"),
    ("norwegian", "arctic"), ("white sea", "arctic"), ("kotzebue", "arctic"),
    ("southern", "southern"), ("weddell", "southern"), ("ross sea", "southern"), ("davis sea", "southern"),
    ("indian", "indian"), ("arabian", "indian"), ("red sea", "indian"), ("bengal", "indian"), ("persian", "indian"),
    ("aden", "indian"), ("andaman", "indian"), ("mozambique", "indian"), ("laccadive", "indian"),
    ("atlantic", "atlantic"), ("caribbean", "atlantic"), ("gulf of mexico", "atlantic"), ("biscay", "atlantic"),
    ("celtic", "atlantic"), ("irish sea", "atlantic"), ("english channel", "atlantic"), ("labrador", "atlantic"),
    ("sargasso", "atlantic"), ("st. lawrence", "atlantic"), ("gulf of maine", "atlantic"),
    ("pacific", "pacific"), ("bering", "pacific"), ("okhotsk", "pacific"), ("japan", "pacific"),
    ("china sea", "pacific"), ("yellow sea", "pacific"), ("coral", "pacific"), ("tasman", "pacific"),
    ("philippine", "pacific"), ("gulf of alaska", "pacific"), ("gulf of california", "pacific")]


def continent(lab, lon, lat, near=False):
    """The continent of the country at (with near: or nearest to) a point, as a js/core.js group key."""
    pt = Point(lon, lat)
    land = containing(lab.countries, pt)
    if not land and near:
        geoms, props, tree = lab.countries
        j = tree.nearest(pt)
        land = [(geoms[j], props[j])]
    if not land:
        return None
    p = land[0][1]
    if p.get("ADMIN") == "Russia":  # one country on both sides of the Urals
        return "europe" if lon < 60 else "asia"
    return AREA_OF_CONTINENT.get(p.get("CONTINENT"))


def sea_group(name):
    n = (name or "").lower()
    return next((g for key, g in SEA_GROUPS if key in n), None)


def area_of(lab, lon, lat):
    """The broad area a track starts in, for the picker's filter (js/core.js AREA)."""
    pt = Point(lon, lat)
    land = containing(lab.countries, pt)
    if land:
        return "mongolia" if land[0][1].get("ADMIN") == "Mongolia" else continent(lab, lon, lat)
    for g, p in sorted(containing(lab.marine, pt), key=lambda gp: gp[0].area):
        grp = sea_group(p.get("name"))
        if grp == "pacific":
            return "npacific" if lat >= 0 else "spacific"
        if grp:
            return "europe" if grp == "med" else grp
    return None


def place_group(lab, kind, en, lon, lat):
    """Where a named place lies, broadly (js/core.js GROUPS), for the picker's 가는 곳 filter."""
    if kind == "sea":
        return sea_group(en) or (None if en == "open ocean" else continent(lab, lon, lat, near=True))
    return continent(lab, lon, lat, near=kind == "lake")


# --------------------------------------------------------------------------
# Run
# --------------------------------------------------------------------------

def follow_study(mb, state, r, lic, now_s, room, accepted):
    """Pick the study's animals and fetch their new fixes. Returns how many animals were added."""
    sid = r["id"]
    st = state["studies"].setdefault(sid, {})
    st.update({"name": r.get("name") or "", "license": lic, "citation": r.get("citation") or "",
               "pi": r.get("principal_investigator_name") or r.get("contact_person_name") or ""})
    # licence terms: read them once; accept only the exact terms listed in live_licenses.json
    if not st.get("open"):
        try:
            mb.table(entity_type="event", study_id=sid, **FAR_PAST)
            st["open"] = True
        except LicenseRequired as e:
            md5 = hashlib.md5(e.terms).hexdigest()
            if accepted.get(sid, {}).get("md5") != md5:
                terms = re.sub(r"[\w.+-]+@[\w-]+(\.[\w-]+)+", "[e-mail]", e.terms.decode("utf-8", "replace"))
                state["needsLicense"][sid] = {"name": r.get("name"), "license": lic, "md5": md5, "terms": terms[:6000]}
                print(f"study {sid} {r.get('name')!r}: licence terms not accepted, skipped", file=sys.stderr)
                return 0
            mb.accept(sid, md5)
            st["open"] = True
            print(f"study {sid}: accepted licence terms {md5}", file=sys.stderr)
    group = {k: a for k, a in state["animals"].items() if a["study"] == sid}
    inds = mb.table(entity_type="individual", study_id=sid)
    # a death the researchers noted on the animal ends it here
    noted = {i.get("id"): bool((i.get("death_comments") or "").strip()) for i in inds}
    for a in group.values():
        a["dead"] = a.get("dead") or noted.get(a["ind"], False)
    sending = sum(1 for a in group.values() if listed(a, now_s))
    added = 0
    if room > 0 and sending < PER_STUDY:
        mine = {a["ind"] for a in group.values()}
        fresh = []
        for i in inds:
            end, taxon = ts(i.get("timestamp_end")), (i.get("taxon_canonical_name")
                                                     or i.get("individual_taxon_canonical_name") or "").strip()
            # the summary times can lag a day behind the fixes
            if (i.get("id") in mine or not taxon or not has_gps(i) or end is None or noted.get(i.get("id"))
                    or end < now_s - (LIVE_DAYS + 1) * 86400
                    or state["species"].get(taxon, {}).get("iucn") in HIDE_IUCN):
                continue
            fresh.append((ts(i.get("timestamp_start")) or end, i, taxon))
        fresh.sort(key=lambda f: f[0])  # longest records first
        deps = latest_deployments(mb, sid) if fresh else {}
        for start, i, taxon in fresh:
            if added >= min(PER_STUDY - sending, room):
                break
            d = deps.get(i["id"], {})
            if deployment_ended(d, now_s):
                continue
            born = i.get("exact_date_of_birth") or (
                i.get("earliest_date_born") if i.get("earliest_date_born") == i.get("latest_date_born") else "")
            stage, stage_ko = life_stage(d.get("animal_life_stage"))
            state["animals"][f"mb{sid}-{i['id']}"] = group[f"mb{sid}-{i['id']}"] = {
                "study": sid, "ind": i["id"], "local": i.get("local_identifier") or i["id"], "taxon": taxon,
                "nick": i.get("nick_name") or "", "sex": {"m": "m", "f": "f", "male": "m", "female": "f"}.get(
                    (i.get("sex") or "").lower()), "born": (born or "")[:10], "stage": stage, "stageKo": stage_ko,
                "mass": num(d.get("animal_mass")), "deployOn": ts(d.get("deploy_on_timestamp")), "start": start,
                "since": now_s, "lastT": 0, "lastRaw": 0, "pts": None}
            added += 1
    if not group:
        return 0
    by_local = {a["local"]: k for k, a in group.items()}
    got = {}
    recent_ms = (now_s - TIERS[1][0] * 86400) * 1000
    first = [a["local"] for a in group.values() if a["pts"] is None]
    if first:
        start_ms = max(min(group[by_local[l]]["start"] or now_s for l in first), now_s - HISTORY_DAYS * 86400) * 1000
        if start_ms < recent_ms:  # older fixes, one a day
            for l, fx in mb.locations(sid, first, start_ms, recent_ms, daily=True).items():
                got.setdefault(l, []).extend(fx)
        for l, fx in mb.locations(sid, first, max(start_ms, recent_ms), limit=20000).items():
            got.setdefault(l, []).extend(fx)
    # animals already followed: only fixes after the last one seen, asked together when their last fixes are close
    more = sorted((a["lastRaw"], a["local"]) for a in group.values() if a["pts"] is not None)
    while more:
        batch = [l for t, l in more if t - more[0][0] <= 2 * 86400 * 1000]
        for l, fx in mb.locations(sid, batch, more[0][0] + 1, limit=20000).items():
            got.setdefault(l, []).extend(fx)
        more = more[len(batch):]
    for l, fx in got.items():
        a = group.get(by_local.get(l))
        fx = [f for f in fx if a is not None and f[0] > a["lastRaw"]]
        if not fx:
            continue
        new = fixes_frame(fx)
        if a["pts"] is not None:
            new = pd.concat([pts_frame(a["pts"]), new], ignore_index=True)
        a["frame"], a["lastRaw"] = new, int(max(f[0] for f in fx))
    print(f"study {sid} {r.get('name')!r}: {len(group)} animals (+{added}), "
          f"{sum(len(v) for v in got.values())} fixes", file=sys.stderr)
    return added


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ne", required=True, type=Path, help="Natural Earth GeoJSON folder")
    ap.add_argument("--state", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--api", default=API)
    ap.add_argument("--now", help="pretend it is this UTC time (tests)")
    ap.add_argument("--pause", type=float, default=1.0)
    ap.add_argument("--no-species-lookup", action="store_true")
    ap.add_argument("--licenses", type=Path, default=HERE / "live_licenses.json")
    ap.add_argument("--species", type=Path, default=HERE / "live_species.json")
    args = ap.parse_args()

    user, password = os.environ.get("MOVEBANK_USER"), os.environ.get("MOVEBANK_PASS")
    if not user or not password:
        print("MOVEBANK_USER and MOVEBANK_PASS are not set; nothing to do.", file=sys.stderr)
        return 0
    now = pd.Timestamp(args.now, tz="UTC") if args.now else pd.Timestamp.now(tz="UTC")
    now_s = now.timestamp()
    mb = Movebank(user, password, args.api, args.pause)
    state = json.loads(args.state.read_text()) if args.state.exists() else {}
    for k in ("animals", "studies", "species"):
        state.setdefault(k, {})
    state["needsLicense"] = {}
    load = lambda path: json.loads(path.read_text()) if path.exists() else {}
    accepted, curated = load(args.licenses), load(args.species)

    # 1. studies under an open licence, with GPS, whose animals sent fixes in the last LIVE_DAYS
    try:
        rows = mb.table(entity_type="study", i_have_download_access="true", attributes=",".join([
            "id", "name", "license_type", "is_test", "timestamp_last_deployed_location", "sensor_type_ids",
            "taxon_ids", "citation", "principal_investigator_name", "contact_person_name"]))
    except urllib.error.HTTPError as e:
        body = " ".join(e.read().decode("utf-8", "replace").split())[:300]
        print(f"Movebank refused the study list (HTTP {e.code}): {body!r}", file=sys.stderr)
        # the same address without the account: if this works, Movebank turned the account down, not the address
        try:
            with urllib.request.urlopen(urllib.request.Request(
                    f"{args.api.rstrip('/')}/public/json?entity_type=study&study_id=2911040",
                    headers={"User-Agent": "nabiya-live/1"}), timeout=60) as r:
                print(f"A public request from here works (HTTP {r.status}), so check MOVEBANK_USER and MOVEBANK_PASS, "
                      "and that the account is activated.", file=sys.stderr)
        except Exception as e2:
            print(f"A public request from here fails too ({e2!r}): Movebank may be refusing this address.",
                  file=sys.stderr)
        return 1
    cands = []
    for r in rows:
        lic, last = OPEN_LICENSES.get(norm_license(r.get("license_type"))), ts(r.get("timestamp_last_deployed_location"))
        if (lic and (r.get("is_test") or "").lower() != "true" and has_gps(r) and last
                and last >= now_s - (LIVE_DAYS + 1) * 86400):
            cands.append((r, lic, last))
    followed = {a["study"] for a in state["animals"].values()}
    # studies already followed first, then the most recent, one per taxon group before seconds
    cands.sort(key=lambda c: (c[0]["id"] not in followed, -c[2]))
    seen, first, rest = set(), [], []
    for c in cands:
        key = c[0].get("taxon_ids") or c[0]["id"]
        (first if c[0]["id"] in followed or key not in seen else rest).append(c)
        seen.add(key)
    cands = (first + rest)[:MAX_STUDIES]
    print(f"{len(rows)} studies open to the account, {len(cands)} with an open licence and fixes "
          f"in the last {LIVE_DAYS} days", file=sys.stderr)

    # 2. animals and their new fixes, study by study
    active = sum(1 for a in state["animals"].values() if listed(a, now_s))
    failed = 0
    for r, lic, last in cands:
        if r["id"] not in followed and active >= MAX_ANIMALS:
            continue
        try:
            active += follow_study(mb, state, r, lic, now_s, MAX_ANIMALS - active, accepted)
        except LicenseRequired:
            state["studies"].get(r["id"], {}).pop("open", None)  # terms appeared since; read them next run
            print(f"study {r['id']}: licence terms appeared, will read them next run", file=sys.stderr)
        except (urllib.error.URLError, TimeoutError, ValueError, KeyError) as e:
            failed += 1
            print(f"study {r['id']}: {e!r}", file=sys.stderr)

    # 3. clean and bin; drop animals without a usable track, of a species too threatened to show, or unlisted
    #    for longer than KEEP_DAYS
    for k, a in list(state["animals"].items()):
        sci = a["taxon"]
        if sci not in state["species"] or state["species"][sci].get("retry") or (sci in curated and any(
                state["species"][sci].get(f) != v for f, v in curated[sci].items())):
            state["species"][sci] = lookup_species(sci, curated, net=not args.no_species_lookup)
        if state["species"][sci].get("iucn") in HIDE_IUCN:
            print(f"{k} ({sci}, IUCN {state['species'][sci]['iucn']}): left out", file=sys.stderr)
            del state["animals"][k]
            continue
        df = a.pop("frame", None)
        if df is None and a["pts"] is not None:
            df = pts_frame(a["pts"])
        if df is not None and len(df):
            df = tiered(df, now, VMAX[state["species"][sci]["cls"]])
        if df is None or len(df) < 2:
            del state["animals"][k]
            continue
        a["pts"], a["lastT"], a["still"] = frame_pts(df), int(df.t.iloc[-1].timestamp()), is_still(df)
        if listed(a, now_s):
            a.pop("unlisted", None)
        else:
            a.setdefault("unlisted", now_s)
            if now_s - a["unlisted"] > KEEP_DAYS * 86400 or a["lastT"] < now_s - KEEP_DAYS * 86400:
                del state["animals"][k]

    # 4. records in the data/animals.json format, plus species and sources
    lab = Labeler(args.ne)
    cache, groups = {}, {}

    def labels(lon, lat):
        key = (round(lon, 3), round(lat, 3))
        if key not in cache:
            cache[key] = (lab.label(lon, lat)[0], lab.city_label(lon, lat), lab.region_label(lon, lat))
            pi = cache[key][0]
            if pi not in groups:
                groups[pi] = place_group(lab, lab.places[pi][1], lab.places[pi][2], lon, lat)
        return cache[key]

    animals, species, sources = [], {}, {}
    for k, a in sorted(state["animals"].items(), key=lambda kv: -kv[1]["lastT"]):
        df = pts_frame(a["pts"])
        lbl = [labels(lo, la) for lo, la in zip(df.lon.values, df.lat.values)]
        sp = "mb:" + a["taxon"]
        species[sp] = {key: v for key, v in state["species"][a["taxon"]].items() if key not in ("taxon", "retry")}
        st = state["studies"].get(a["study"], {})
        sources["mb" + a["study"]] = {
            "title": st.get("name") or f"Movebank study {a['study']}", "who": st.get("pi") or "", "via": "Movebank",
            "license": st.get("license") or "", "citation": st.get("citation") or "", "note": "",
            "url": f"https://www.movebank.org/cms/webapp?gwt_fragment=page=studies,path=study{a['study']}"}
        animals.append({
            "id": k, "sp": sp, "src": "mb" + a["study"], "tag": a["local"], "home": lbl[0][0],
            "area": area_of(lab, df.lon.iloc[0], df.lat.iloc[0]), "sex": a.get("sex"), "age": a.get("stage"),
            "ageText": a.get("stageKo"), "nick": a.get("nick") or None, "born": a.get("born") or None,
            "mass": a.get("mass"), "deployOn": int(a["deployOn"]) if a.get("deployOn") else None,
            **track_fields(df, lbl),
            "live": {"study": a["study"], "ind": a["ind"], "since": int(a["since"]), "last": a["lastRaw"] // 1000,
                     "listed": listed(a, now_s), "quiet": a["lastT"] < now_s - LIVE_DAYS * 86400,
                     "dead": bool(a.get("dead")), "still": bool(a.get("still"))}})
    places, regions, cities = lab.tables()
    for rec in animals:
        rec["home"] = places[rec["home"]][0]
    out = {"generated": now.isoformat(), "places": places, "placeGroups": [groups.get(i) for i in range(len(places))],
           "regions": regions, "cities": cities, "sources": sources, "species": species, "animals": animals}
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    state["updated"] = now.isoformat()
    args.state.parent.mkdir(parents=True, exist_ok=True)
    args.state.write_text(json.dumps(state, ensure_ascii=False, separators=(",", ":")))
    print(f"wrote {args.out} ({args.out.stat().st_size} bytes): {len(animals)} animals, "
          f"{sum(1 for r in animals if r['live']['listed'])} listed (alive, moving, sending now); {mb.calls} API calls; "
          f"{len(state['needsLicense'])} studies wait for licence acceptance; {failed} studies failed",
          file=sys.stderr)
    return 1 if cands and failed == len(cands) else 0


if __name__ == "__main__":
    sys.exit(main())
