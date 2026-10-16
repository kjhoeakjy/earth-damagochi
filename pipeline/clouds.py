"""Clouds as they are now: the newest NOAA Global Mosaic of Geostationary Satellite Imagery (GMGSI, longwave
infrared, hourly; NOAA Open Data Dissemination on AWS) drawn as the grey cloud maps of js/globe.js.

Writes clouds-2k.jpg and clouds-4k.jpg (equirectangular, 180°W at the left, north at the top; brighter = more
cloud) and clouds.json (when the satellites took it) into --out. Cold cloud tops are bright in the infrared and
warm ground and sea dark, so this works by night too. The mosaic reaches 72.7° north and south; nearer the poles
there's no cloud, and the few places no satellite saw are left clear.

    python3 pipeline/clouds.py --out live
"""
import argparse
import datetime
import json
import re
import sys
import tempfile
import urllib.request
from pathlib import Path

import h5py
import numpy as np
from PIL import Image

BUCKET = "https://noaa-gmgsi-pds.s3.amazonaws.com"
UA = "nabiya-clouds/1 (https://github.com/kjhoeakjy/earth-damagochi)"
LO, HI = 132, 228  # the mosaic's 0-255 infrared brightness: below LO clear, above HI thick cloud
SIZES = {"clouds-2k.jpg": 2048, "clouds-4k.jpg": 4096}


def get(url, timeout=180):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=timeout) as r:
        return r.read()


def newest(now, hours=6):
    """The key of the newest longwave mosaic in the last `hours` hours."""
    for h in range(hours):
        t = now - datetime.timedelta(hours=h)
        xml = get(f"{BUCKET}/?list-type=2&prefix=GMGSI_LW/{t:%Y/%m/%d/%H}/").decode("utf-8", "replace")
        keys = sorted(re.findall(r"<Key>([^<]+\.nc)</Key>", xml))
        if keys:
            return keys[-1]
    return None


def edges(centres):
    """Cell boundaries around increasing cell centres."""
    mid = (centres[1:] + centres[:-1]) / 2
    return np.concatenate([[2 * centres[0] - mid[0]], mid, [2 * centres[-1] - mid[-1]]])


def box(a, src_edges, dst_edges, axis):
    """Average of `a` over each destination cell along `axis`; cells are given by increasing boundaries."""
    a = np.moveaxis(a, axis, 0)
    pos = np.interp(dst_edges, src_edges, np.arange(len(src_edges)))  # fractional source cell index
    cum = np.concatenate([np.zeros((1,) + a.shape[1:]), np.cumsum(a, axis=0)])
    i = np.minimum(pos.astype(int), len(a) - 1)
    at = cum[i] + (pos - i)[:, None] * a[i]  # prefix sum up to each boundary
    width = np.maximum(np.diff(pos), 1e-9)[:, None]
    return np.moveaxis((at[1:] - at[:-1]) / width, 0, axis)


def cloud_map(path, width):
    with h5py.File(path, "r") as f:
        v = f["data"][0].astype(np.float64)
        q = f["dqf"][0]
        lat = f["lat"][:, 0].astype(np.float64)
        lon = f["lon"][0, :].astype(np.float64)
    lon[0] -= 360 if lon[0] > 179 else 0  # the first column is 180°W
    # 0 is a good value; 20 marks what no satellite saw (stored as 255)
    dens = np.where((q == 0) | (q == 10), np.clip((v - LO) / (HI - LO), 0, 1), 0.0)
    # the mosaic's rows are Mercator, north first: average into equal-angle rows, then columns
    h = width // 2
    out_lat = np.linspace(90, -90, h + 1)  # row boundaries, north first
    rows = box(dens[::-1], edges(lat[::-1]), out_lat[::-1], 0)[::-1]
    covered = (out_lat[1:] < lat.max()) & (out_lat[:-1] > lat.min())
    rows[~covered] = 0
    cols = box(rows, edges(lon), np.linspace(-180, 180, width + 1), 1)
    # fade out toward the mosaic's edge, where the satellites look at a slant and cold ice reads as cloud
    mid = (out_lat[1:] + out_lat[:-1]) / 2
    fade = np.clip((71 - np.abs(mid)) / 13, 0, 1)
    fade = fade * fade * (3 - 2 * fade)
    return (np.clip(cols * fade[:, None], 0, 1) * 255).round().astype(np.uint8)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--file", type=Path, help="a mosaic already downloaded (for testing)")
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    now = datetime.datetime.now(datetime.timezone.utc)
    key = None
    if args.file:
        path = args.file
    else:
        key = newest(now)
        if not key:
            print("no mosaic in the last six hours; the clouds stay as they were", file=sys.stderr)
            return 0
        tmp = tempfile.NamedTemporaryFile(suffix=".nc", delete=False)
        tmp.write(get(f"{BUCKET}/{key}"))
        tmp.close()
        path = Path(tmp.name)
    m = re.search(r"_s(\d{12})", key or path.name)
    taken = datetime.datetime.strptime(m.group(1), "%Y%m%d%H%M").replace(tzinfo=datetime.timezone.utc) if m else now
    for name, width in SIZES.items():
        Image.fromarray(cloud_map(path, width), "L").save(args.out / name, quality=84, optimize=True)
    (args.out / "clouds.json").write_text(json.dumps({
        "taken": taken.isoformat(timespec="minutes"), "files": {"s": "clouds-2k.jpg", "l": "clouds-4k.jpg"},
        "source": "NOAA/NESDIS GMGSI longwave infrared", "key": key or path.name}, indent=1))
    print(f"clouds from {key or path} taken {taken:%Y-%m-%d %H:%M}Z", file=sys.stderr)
    if not args.file:
        path.unlink()
    return 0


if __name__ == "__main__":
    sys.exit(main())
