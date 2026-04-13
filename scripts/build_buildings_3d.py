"""
build_buildings_3d.py
=====================
Generates data/buildings_3d.json for the Three.js 3D schematic view.

Reads the same *_data.png instance textures as cp2077_extract_footprints.py
but outputs CET world coordinates directly (no Leaflet projection), and
samples each district's *_m.png texture for per-building brightness.

Output format:
  {
    "districts": ["city_center", "watson", ...],
    "instances": [
      [cetX, cetY, cetZ, width, depth, height, brightness, districtIndex, qx, qy, qz, qw],
      ...
    ]
  }

All spatial values are in CET (game world) units.
  cetX, cetY    — building centroid (X east, Y north)
  cetZ          — base elevation
  width         — footprint dimension along X local axis (CET units)
  depth         — footprint dimension along Y local axis (CET units)
  height        — vertical extrusion (CET units)
  brightness    — 0.0–1.0 sampled from _m texture at instance UV (temporary;
                  will be replaced by per-district _m texture in Three.js)
  districtIndex — index into the "districts" array
  qx, qy, qz, qw — full quaternion from _data.xbm rotation block.
                   All four components are kept: pitch and roll are used by
                   the game shader to form wedges, ramps, and gap-fill geometry.

Usage:
  python scripts/build_buildings_3d.py

Dependencies:
  pip install numpy Pillow

Output:
  data/buildings_3d.json  (~5 MB)
"""

import json
import os
import sys
import time

import numpy as np
from PIL import Image

# ── PATHS ──────────────────────────────────────────────────────────────────────

PNG_DIR   = r"D:\Modding\CP2077 Mods\MyMods\map_data_export\source\raw\base\fx\textures\3dmap\static"
ENT_JSON  = r"D:\Modding\CP2077 Mods\MyMods\map_data_export\source\raw\base\entities\cameras\3dmap\3dmap_view.ent.json"

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT  = os.path.dirname(SCRIPT_DIR)
DATA_DIR   = os.path.join(REPO_ROOT, "data")
JSON_OUT   = os.path.join(DATA_DIR, "buildings_3d.json")

# ── DISTRICT WORLD OFFSETS ────────────────────────────────────────────────────
# Source: 3dmap_view.ent.json  localTransform.Position.Bits / 131072.0
# Without these, all districts cluster at the wrong CET location.

DISTRICT_OFFSETS = {
    "westbrook":     (-97.209,    590.849),
    "city_center":   (-2116.637,  106.508),
    "heywood":       (-1576.732, -1002.811),
    "pacifica":      (-2422.441, -2368.156),
    "santo_domingo": (-15.944,  -1610.080),
    "watson":        (-1979.372,  1873.951),
    "ep1_dogtown":   (0.0,         0.0),
    "ep1_spaceport": (-4200.000,  200.000),
}

# ── DISTRICTS ──────────────────────────────────────────────────────────────────
# Metadata from 3dmap_triangle_soup.Material.json
# TRANS_MIN/MAX: world-space decode range for texture colour channels (district-local space)
# CUBE_SIZE: half-extent multiplier
# HEIGHT: texture block height (number of instance rows)
# m_png: _m texture filename for brightness sampling (None = derive from hz)

DISTRICTS = {
    "westbrook": {
        "data_png": "westbrook_data.png",
        "m_png":    "c_westbrook_m.png",
        "TRANS_MIN": (-1078.94739, -1148.69434, -18.4205875),
        "TRANS_MAX": (1155.12,     1562.87903,  507.894714),
        "CUBE_SIZE": 197.0,
        "HEIGHT":    197,
    },
    "city_center": {
        "data_png": "city_center_data.png",
        "m_png":    "city_center_m.png",
        "TRANS_MIN": (-770.609192, -530.549133,  -40.6581497),
        "TRANS_MAX": (1316.82483,   649.75531,   642.893127),
        "CUBE_SIZE": 168.289993,
        "HEIGHT":    204,
    },
    "heywood": {
        "data_png": "heywood_data.png",
        "m_png":    "heywood_m.png",
        "TRANS_MIN": (-1080.35107, -418.153046,  -38.4002304),
        "TRANS_MAX": (1136.94556,  1372.15979,   374.181305),
        "CUBE_SIZE": 197.236832,
        "HEIGHT":    205,
    },
    "pacifica": {
        "data_png": "pacifica_data.png",
        "m_png":    "c_pacifica_m.png",
        "TRANS_MIN": (-4008.396,  -4575.14941,  -51.9539986),
        "TRANS_MAX": (8258.31641,  7254.10059,  264.306946),
        "CUBE_SIZE": 305.600006,
        "HEIGHT":    153,
    },
    "santo_domingo": {
        "data_png": "santo_domingo_data.png",
        "m_png":    "santo_domingo_m.png",
        "TRANS_MIN": (-1328.95288, -1880.02502,  -37.5960007),
        "TRANS_MAX": (1555.26318,  1369.01294,   332.348328),
        "CUBE_SIZE": 139.342102,
        "HEIGHT":    195,
    },
    "watson": {
        "data_png": "watson_data.png",
        "m_png":    "c_watson_m.png",
        "TRANS_MIN": (-1254.46997, -1258.68469,  -24.7028503),
        "TRANS_MAX": (1988.5448,   2032.52405,   475.268005),
        "CUBE_SIZE": 237.175003,
        "HEIGHT":    206,
    },
    "ep1_dogtown": {
        "data_png": "ep1_dogtown_data.png",
        "m_png":    "ep1_dogtown_m.png",
        "TRANS_MIN": (-2650.0,     -3126.6084,   -0.750015974),
        "TRANS_MAX": (-1025.51855, -1803.58118,  493.576111),
        "CUBE_SIZE": 198.020691,
        "HEIGHT":    148,
    },
    "ep1_spaceport": {
        "data_png": "ep1_spaceport_data.png",
        "m_png":    "ep1_spaceport_m.png",
        "TRANS_MIN": (-1168.5874,  -765.104614,  -41.4592323),
        "TRANS_MAX": (1219.45483,  1018.70129,   296.498138),
        "CUBE_SIZE": 115.298218,
        "HEIGHT":    94,
    },
}


def load_data_png(path):
    """Load _data.png as a float64 array normalised to [0, 1]."""
    img = Image.open(path).convert("RGBA")
    return np.array(img, dtype=np.float64) / 255.0


def load_m_png(path):
    """Load _m.png as a uint8 greyscale array."""
    return np.array(Image.open(path).convert("L"), dtype=np.uint8)


def sample_brightness(m_arr, pr, pg):
    """
    Sample raw uint8 brightness from _m texture using position UVs (pr, pg).
    pr and pg are already normalised [0,1] — they ARE the texture UVs.
    Returns raw uint8 value (0–255); caller normalises.
    """
    h, w = m_arr.shape
    mx = min(int(pr * w), w - 1)
    my = min(int(pg * h), h - 1)
    return int(m_arr[my, mx])


def decode_district(name, d):
    """
    Decode all valid building instances from a district's _data.png.
    Returns list of [cetX, cetY, cetZ, width, depth, height, pr, pg]
    where pr/pg are raw UV coords for _m texture sampling.
    """
    data_path = os.path.join(PNG_DIR, d["data_png"])
    if not os.path.exists(data_path):
        print(f"  [SKIP] {name}: data PNG not found — {data_path}")
        return []

    print(f"  Loading {d['data_png']}...", end=" ", flush=True)
    t0 = time.time()
    px = load_data_png(data_path)
    print(f"{px.shape[1]}×{px.shape[0]} ({time.time()-t0:.1f}s)")

    block_w = px.shape[1] // 3
    block_h = min(px.shape[0], d["HEIGHT"])

    tmin_x, tmin_y, tmin_z = (np.float64(v) for v in d["TRANS_MIN"])
    tmax_x, tmax_y, tmax_z = (np.float64(v) for v in d["TRANS_MAX"])
    cube_val = np.float64(d["CUBE_SIZE"])
    off_x, off_y = (np.float64(v) for v in DISTRICT_OFFSETS.get(name, (0.0, 0.0)))

    instances = []
    for y in range(block_h):
        for x in range(block_w):
            # Skip invalid instances (alpha == 0)
            if px[y, x, 3] < 0.01:
                continue

            # Position channels → CET world coordinates
            pr, pg, pb = px[y, x, 0], px[y, x, 1], px[y, x, 2]
            cx = tmin_x + (tmax_x - tmin_x) * pr + off_x
            cy = tmin_y + (tmax_y - tmin_y) * pg + off_y
            cz = tmin_z + (tmax_z - tmin_z) * pb

            # Scale channels → half-extents in CET units
            sr = px[y, x + 2 * block_w, 0]
            sg = px[y, x + 2 * block_w, 1]
            sb = px[y, x + 2 * block_w, 2]
            hx = sr * cube_val  # half-width
            hy = sg * cube_val  # half-depth
            hz = sb * cube_val  # height

            if hx == 0.0 and hy == 0.0:
                continue

            # Full quaternion from Block 2 (XYZW order, remapped from [0,1] → [-1,1])
            rr, rg, rb, ra = (px[y, x + block_w, c] for c in range(4))
            qx_ = rr * 2.0 - 1.0
            qy_ = rg * 2.0 - 1.0
            qz_ = rb * 2.0 - 1.0
            qw_ = ra * 2.0 - 1.0
            # Keep all four components — pitch and roll are used by the game shader
            # to form non-upright primitives (wedges, ramps, bridges, gap-fillers).

            # Store pr, pg as raw UVs for _m sampling.
            # hx/hy/hz are all half-extents; store full extents (×2) for consistency.
            instances.append([
                float(cx), float(cy), float(cz),
                float(hx * 2), float(hy * 2), float(hz * 2),
                float(pr), float(pg),
                round(float(qx_), 4), round(float(qy_), 4),
                round(float(qz_), 4), round(float(qw_), 4),
            ])

    print(f"    -> {len(instances):,} instances")
    return instances


def main():
    print("Building buildings_3d.json for Three.js schematic view")
    print("=" * 60)

    district_names = list(DISTRICTS.keys())
    all_instances = []

    for name, d in DISTRICTS.items():
        dist_idx = district_names.index(name)
        print(f"\n[{name}] (district {dist_idx})")

        raw = decode_district(name, d)
        if not raw:
            continue

        # Load _m texture for brightness
        m_arr = None
        m_path = os.path.join(PNG_DIR, d["m_png"]) if d.get("m_png") else None
        if m_path and os.path.exists(m_path):
            m_arr = load_m_png(m_path)
            print(f"    Brightness from {d['m_png']} ({m_arr.shape[1]}×{m_arr.shape[0]})")

            # Normalise _m range so the brightest building in the district = 1.0
            m_min = int(m_arr.min())
            m_max = int(m_arr.max())
            m_range = (m_max - m_min) if m_max > m_min else 1
        else:
            print(f"    No _m texture — deriving brightness from hz")
            hz_vals = [inst[5] for inst in raw]
            hz_min = min(hz_vals)
            hz_max = max(hz_vals)
            hz_range = (hz_max - hz_min) if hz_max > hz_min else 1.0

        for inst in raw:
            cx, cy, cz, w, dep, hz, pr, pg, qx, qy, qz, qw = inst

            if m_arr is not None:
                raw_b = sample_brightness(m_arr, pr, pg)  # uint8 0-255
                brightness = (raw_b - m_min) / m_range
            else:
                brightness = (hz - hz_min) / hz_range

            brightness = round(max(0.0, min(1.0, brightness)), 3)

            all_instances.append([
                round(cx, 2), round(cy, 2), round(cz, 2),
                round(w, 2), round(dep, 2), round(hz, 2),
                brightness, dist_idx,
                qx, qy, qz, qw,
            ])

    os.makedirs(DATA_DIR, exist_ok=True)

    out = {
        "districts": district_names,
        "instances": all_instances,
    }

    print(f"\nWriting {len(all_instances):,} instances to {JSON_OUT}...")
    with open(JSON_OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"))

    size_mb = os.path.getsize(JSON_OUT) / (1024 * 1024)
    print(f"Done — {size_mb:.1f} MB")


if __name__ == "__main__":
    main()
