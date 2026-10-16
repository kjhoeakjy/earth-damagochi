"""Night sky for the globe: real stars (Hipparcos, via d3-celestial's stars.8.json) and a soft Milky Way
texture rasterised from d3-celestial's mw.json outlines. Both are in equatorial coordinates (RA as
longitude, Dec as latitude); the page turns the sky by Greenwich sidereal time so it matches the sun.

usage: python3 make_sky.py <d3-celestial/data dir> <out data dir> <out tex dir>
"""
import json, sys, pathlib
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

src, out_data, out_tex = map(pathlib.Path, sys.argv[1:4])
MAGLIM = 7.0

stars = json.load(open(src / "stars.8.json"))["features"]
flat = []
for f in stars:
    m = float(f["properties"]["mag"])
    if m > MAGLIM:
        continue
    ra, dec = f["geometry"]["coordinates"]
    try:
        bv = float(f["properties"].get("bv") or 0.6)
    except ValueError:
        bv = 0.6
    flat += [round(ra * 100), round(dec * 100), round(m * 100), round(bv * 100)]
(out_data / "sky.json").write_text(json.dumps({"mag_limit": MAGLIM, "stars": flat}, separators=(",", ":")))
print("stars", len(flat) // 4)

# Milky Way glow, modelled in galactic coordinates (bright bulge toward Sagittarius, the Great Rift,
# clumpy star clouds) and resampled to an equatorial RA/Dec grid. R = brightness, G = warmth.
W, H = 2048, 1024
ra = (np.arange(W) + 0.5) / W * 360 - 180
dec = 90 - (np.arange(H) + 0.5) / H * 180
RA, DEC = np.meshgrid(np.radians(ra), np.radians(dec))
xe, ye, ze = np.cos(DEC) * np.cos(RA), np.cos(DEC) * np.sin(RA), np.sin(DEC)
M = np.array([[-0.0548755604, -0.8734370902, -0.4838350155],
              [0.4941094279, -0.4448296300, 0.7469822445],
              [-0.8676661490, -0.1980763734, 0.4559837762]])
xg = M[0, 0] * xe + M[0, 1] * ye + M[0, 2] * ze
yg = M[1, 0] * xe + M[1, 1] * ye + M[1, 2] * ze
zg = M[2, 0] * xe + M[2, 1] * ye + M[2, 2] * ze
l = np.degrees(np.arctan2(yg, xg))          # -180..180, 0 = galactic centre
b = np.degrees(np.arcsin(np.clip(zg, -1, 1)))

rng = np.random.default_rng(7)
def noise(scale, octaves=4):
    out = np.zeros_like(l)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        n = int(scale * 2 ** o)
        grid = rng.random((n + 1, 2 * n + 1))
        gy = (b + 90) / 180 * n
        gx = (l + 180) / 360 * 2 * n
        x0, y0 = np.floor(gx).astype(int), np.floor(gy).astype(int)
        fx, fy = gx - x0, gy - y0
        fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
        x1, y1 = np.minimum(x0 + 1, 2 * n), np.minimum(y0 + 1, n)
        v = (grid[y0, x0] * (1 - fx) + grid[y0, x1] * fx) * (1 - fy) + (grid[y1, x0] * (1 - fx) + grid[y1, x1] * fx) * fy
        out += v * amp; tot += amp; amp *= 0.55
    return out / tot

width = 7.5 + 7 * np.exp(-(l / 55) ** 2)
band = np.exp(-(b / width) ** 2)
along = 0.38 + 0.62 * np.exp(-(l / 75) ** 2)
bulge = np.exp(-(l ** 2 + (b * 1.5) ** 2) / (2 * 11 ** 2))
clump = 0.35 + 1.3 * noise(14) ** 1.5
rift = 1 - 0.62 * np.exp(-((b - 1.2) / 2.4) ** 2) * np.exp(-((l - 15) / 45) ** 2)
glow = (band * along * clump * rift + bulge * 0.45) * 0.85 + np.exp(-(b / 30) ** 2) * 0.05
R = np.clip(glow * 255, 0, 255)
G = np.clip((bulge * 1.6 + 0.15 * band) * 255, 0, 255)
img = np.stack([R, G, np.zeros_like(R)], -1).astype(np.uint8)
gc = (np.unravel_index(np.argmax(bulge), bulge.shape))
print("galactic centre at RA/Dec", ra[gc[1]], dec[gc[0]])
Image.fromarray(img).filter(ImageFilter.GaussianBlur(1.2)).save(out_tex / "milkyway.jpg", quality=88)
print("milkyway", W, H)
