"""
generate_terrain_overlay.py — Terrain background and hillshade overlays for the NC Zoning Board map.

Renders 3dmap_terrain.glb directly using the same axis mapping as cp2077_extract_footprints.py.
Water areas are identified by height threshold (terrain faces at GLB_Y <= WATER_MAX_Y are sea level).
No texture files, UV calibration, or flip detection required.

Outputs:
  scripts/output/terrain_background_8k.png  -- Opaque 8k terrain (hillshaded land + water)
  scripts/output/terrain_hillshade_8k.png   -- Transparent 8k hillshade overlay for compositing
  scripts/output/terrain_contours.svg       -- Contour lines on 8k canvas
  data/terrain_contours.json                -- Elevation isolines as Leaflet lat/lng segments
  data/terrain_hillshade_bounds.json        -- Leaflet imageOverlay corner coordinates

Usage:
  python scripts/generate_terrain_overlay.py

Dependencies (in addition to trimesh, numpy, Pillow already installed):
  pip install scikit-image scipy
"""

import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

# ---------------------------------------------------------------------------
# Paths -- update GLB_DIR if your WolvenKit export location differs
# ---------------------------------------------------------------------------
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_DIR   = os.path.dirname(SCRIPT_DIR)
GLB_DIR    = r"D:\Modding\CP2077 Mods\MyMods\map_data_export\source\raw\base\entities\cameras\3dmap"
OUTPUT_DIR = os.path.join(SCRIPT_DIR, "output")
DATA_DIR   = os.path.join(REPO_DIR, "data")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
IMG_SIZE = 8192

# World extents -- identical to cp2077_extract_footprints.py
WORLD_MIN_X = -6366.06
WORLD_MAX_X =  5903.00
WORLD_MIN_Y = -7724.25
WORLD_MAX_Y =  4458.49

# Colors sourced from game material files (3dmap_terrain.Material.json, 3dmap_water.Material.json)
TERRAIN_BASE = (86,  108, 136)   # BaseColorScale from 3dmap_terrain.Material.json
WATER_COLOR  = (28,  179, 191)   # Color from 3dmap_water.Material.json
BG_COLOR     = (10,   22,  35)   # Dark navy fallback for areas outside the mesh

# Sea level: read at runtime from 3dmap_water.glb (flat plane, all Y = -1.0).
# Used to split terrain faces into land (height > sea level) and sea floor (height <= sea level).
# Strategy: fill canvas with water colour, then paint only land faces on top.
# Sea-floor faces are skipped, leaving the water background visible — no water GLB triangles needed.

# Hillshade: sun from NW, above horizon (in CET space: -X=west, +Y=north, +Z=up)
_sun_raw = np.array([-1.0, 1.0, 1.5], dtype=np.float32)
SUN_DIR  = _sun_raw / np.linalg.norm(_sun_raw)

SHADE_GAMMA = 0.55   # gamma < 1 lifts midtone shadows
AMBIENT     = 0.35   # minimum brightness for fully-shadowed faces

# Contour heightfield grid resolution (face centroids interpolated to this grid)
CONTOUR_GRID   = 512
N_CONTOUR_LEVELS = 12


# ---------------------------------------------------------------------------
# Coordinate helpers
# ---------------------------------------------------------------------------

def cet_to_pixel(cet_x, cet_y):
    """CET world coords -> 8k pixel coords. Y is flipped (north = top of image)."""
    px = (cet_x - WORLD_MIN_X) / (WORLD_MAX_X - WORLD_MIN_X) * IMG_SIZE
    py = (WORLD_MAX_Y - cet_y) / (WORLD_MAX_Y - WORLD_MIN_Y) * IMG_SIZE
    return px, py


def cet_to_leaflet(cet_x, cet_y):
    """CET world coords -> Leaflet [lat, lng]. Same formula as assets/js/utils.js."""
    lat = 0.02101335 * cet_y - 93.68566
    lng = 0.02086230 * cet_x + 132.80160
    return lat, lng


# ---------------------------------------------------------------------------
# Step 1 -- Load terrain mesh and compute per-face data
# ---------------------------------------------------------------------------

def load_terrain():
    """
    Load 3dmap_terrain.glb and compute per-face rendering data.

    Axis mapping (same as entire pipeline):
      CET_X  = -GLB_X
      CET_Y  = +GLB_Z
      height = +GLB_Y  (used for water threshold + face normals)

    Returns a dict with per-face arrays:
      px0/py0, px1/py1, px2/py2 -- 8k pixel coords for each triangle vertex
      fc_x, fc_y                 -- face centroid CET coords
      fc_h                       -- face average GLB_Y height
      shade                      -- hillshade value [0, 1] per face
      is_water                   -- bool mask: True for faces at/below WATER_MAX_Y
    """
    try:
        import trimesh
    except ImportError:
        sys.exit("trimesh not installed -- pip install trimesh")

    glb_path = os.path.join(GLB_DIR, "3dmap_terrain.glb")
    print(f"[1] Loading terrain mesh: {glb_path}")
    mesh = trimesh.load(glb_path, force="mesh")
    verts = np.asarray(mesh.vertices, dtype=np.float32)   # (V, 3)
    faces = np.asarray(mesh.faces,    dtype=np.int32)     # (F, 3)
    print(f"    {len(verts):,} vertices, {len(faces):,} faces")

    # Axis mapping for terrain GLB.
    # Unlike roads/metro (which have a 180 deg world yaw in the ent and need -GLB_X),
    # the terrain mesh is placed at identity transform, so GLB_X IS CET_X directly.
    cet_x  =  verts[:, 0]
    cet_y  =  verts[:, 2]
    height =  verts[:, 1]

    i0, i1, i2 = faces[:, 0], faces[:, 1], faces[:, 2]

    # Per-face centroid and average height
    fc_x = (cet_x[i0]  + cet_x[i1]  + cet_x[i2])  / 3.0
    fc_y = (cet_y[i0]  + cet_y[i1]  + cet_y[i2])  / 3.0
    fc_h = (height[i0] + height[i1] + height[i2])  / 3.0

    # Face normals in GLB space via cross product
    v0_g = verts[i0]
    v1_g = verts[i1]
    v2_g = verts[i2]
    n_glb = np.cross(v1_g - v0_g, v2_g - v0_g)   # (F, 3)

    # Convert normal to CET space: n_cet_x = +n_glb_x, n_cet_y = n_glb_z, n_cet_z = n_glb_y
    # No x negation — terrain uses CET_X = +GLB_X (identity transform, no yaw)
    n_cet = np.stack([n_glb[:, 0], n_glb[:, 2], n_glb[:, 1]], axis=1).astype(np.float32)

    lengths = np.linalg.norm(n_cet, axis=1, keepdims=True)
    lengths = np.where(lengths == 0, 1.0, lengths)
    n_cet /= lengths

    # Hillshade: dot product with sun direction, gamma, clamp
    raw_shade = np.clip(n_cet @ SUN_DIR, 0.0, 1.0)
    shade = raw_shade ** SHADE_GAMMA

    # 8k pixel coords for each vertex
    px0, py0 = cet_to_pixel(cet_x[i0], cet_y[i0])
    px1, py1 = cet_to_pixel(cet_x[i1], cet_y[i1])
    px2, py2 = cet_to_pixel(cet_x[i2], cet_y[i2])

    print(f"    Shade range: [{shade.min():.3f}, {shade.max():.3f}]")
    print(f"    Height range: [{fc_h.min():.1f}, {fc_h.max():.1f}] GLB_Y units")

    return {
        "px0": px0, "py0": py0,
        "px1": px1, "py1": py1,
        "px2": px2, "py2": py2,
        "fc_x": fc_x, "fc_y": fc_y, "fc_h": fc_h,
        "shade": shade,
    }


# ---------------------------------------------------------------------------
# Step 2 -- Load sea level from water GLB
# ---------------------------------------------------------------------------

def extract_coastline(verts, faces):
    """
    Trace boundary edge loops from the water GLB and return them as pixel-space polygons.

    Boundary edges (edges belonging to exactly 1 face) form the land/water boundary.
    Each loop is a list of (px, py) tuples in 8k pixel space.
    Returns only loops with > 10 points (filters noise/degenerate edges).

    TODO(human): implement this function
    Steps:
      1. Build all edges from faces, sort each (a,b) so a<b
      2. Count occurrences per unique edge — boundary edges have count == 1
      3. Build adjacency dict from boundary edges
      4. Walk adjacency to trace closed loops
      5. Convert each loop's GLB vertices to pixel coords:
           cet_x = verts[v, 0]  (CET_X = +GLB_X, identity transform)
           cet_y = verts[v, 2]  (CET_Y = +GLB_Z)
           px, py = cet_to_pixel(cet_x, cet_y)
      6. Return list of loops, each a list of (px, py) tuples
    """
    pass   # replace with your implementation


def load_sea_level():
    """Return the Y-axis sea level from 3dmap_water.glb (a flat plane at constant GLB_Y)."""
    try:
        import trimesh
    except ImportError:
        sys.exit("trimesh not installed -- pip install trimesh")

    path = os.path.join(GLB_DIR, "3dmap_water.glb")
    loaded = trimesh.load(path, force="mesh")
    # trimesh.load may return a Trimesh or a Scene depending on version; handle both
    v = getattr(loaded, "vertices", None)
    if v is None:
        geoms = getattr(loaded, "geometry", {})
        v = np.concatenate([getattr(g, "vertices") for g in geoms.values()])
    sea_level = float(np.asarray(v, dtype=np.float32)[:, 1].mean())
    print(f"[2] Sea level from water GLB: GLB_Y = {sea_level:.4f}")
    return sea_level


# ---------------------------------------------------------------------------
# Step 3 -- Output A: terrain_background_8k.png (opaque)
# ---------------------------------------------------------------------------

def save_terrain_background(d, sea_level):
    """
    Render terrain as hillshaded land using an inverse (water-first) strategy:

      1. Fill canvas with WATER_COLOR.
      2. Paint only terrain faces where fc_h > sea_level (land faces).
      3. Sea-floor faces (fc_h <= sea_level) are skipped — the water background
         shows through, producing correct water bodies without needing to render
         the water GLB triangles (which span off-canvas and flood when clipped).

    Saves terrain_background_8k.png.
    """
    print("[3] Rendering terrain_background_8k.png ...")

    img  = Image.new("RGB", (IMG_SIZE, IMG_SIZE), WATER_COLOR)
    draw = ImageDraw.Draw(img)

    # Render ALL faces low-to-high (painter's algorithm).
    # Sub-sea faces  → flat WATER_COLOR  (ocean floor; above-sea faces never cover ocean)
    # Above-sea faces → hillshaded land  (paints over any sub-sea face at same 2D pos)
    #
    # This correctly handles city-centre underground geometry: those sub-sea faces
    # get water colour first, but the above-sea street/building faces paint land on top.
    # True ocean pixels have only sub-sea faces and remain WATER_COLOR.
    order = np.argsort(d["fc_h"])
    n = len(order)
    n_water = int((d["fc_h"] <= sea_level).sum())
    print(f"    Total faces: {n:,}  (sea-floor: {n_water:,}, land: {n - n_water:,})")

    R0, G0, B0 = TERRAIN_BASE
    for idx, fi in enumerate(order):
        if idx % 20000 == 0:
            print(f"    {idx:,}/{n:,} faces ...", end="\r")
        pts = (
            (float(d["px0"][fi]), float(d["py0"][fi])),
            (float(d["px1"][fi]), float(d["py1"][fi])),
            (float(d["px2"][fi]), float(d["py2"][fi])),
        )
        if d["fc_h"][fi] <= sea_level:
            draw.polygon(pts, fill=WATER_COLOR)
        else:
            b = float(AMBIENT + (1.0 - AMBIENT) * float(d["shade"][fi]))
            draw.polygon(pts, fill=(min(255, int(R0 * b)),
                                    min(255, int(G0 * b)),
                                    min(255, int(B0 * b))))
    print()

    out_path = os.path.join(OUTPUT_DIR, "terrain_background_8k.png")
    img.save(out_path)
    print(f"    Saved -> {out_path}")


# ---------------------------------------------------------------------------
# Step 4 -- Output B: terrain_hillshade_8k.png (transparent overlay)
# ---------------------------------------------------------------------------

def save_hillshade_overlay(d):
    """Transparent hillshade overlay — all terrain faces, water areas left transparent."""
    print("[4] Rendering terrain_hillshade_8k.png ...")

    img  = Image.new("RGBA", (IMG_SIZE, IMG_SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    order = np.argsort(d["fc_h"])
    n = len(order)

    for idx, fi in enumerate(order):
        if idx % 20000 == 0:
            print(f"    {idx:,}/{n:,} faces ...", end="\r")
        pts = (
            (float(d["px0"][fi]), float(d["py0"][fi])),
            (float(d["px1"][fi]), float(d["py1"][fi])),
            (float(d["px2"][fi]), float(d["py2"][fi])),
        )
        alpha = int(float(d["shade"][fi]) * 180)
        draw.polygon(pts, fill=(200, 200, 200, alpha))

    print()
    path = os.path.join(OUTPUT_DIR, "terrain_hillshade_8k.png")
    img.save(path)
    print(f"    Saved -> {path}")


# ---------------------------------------------------------------------------
# Step 4 -- Output C: contour lines (JSON + SVG)
# ---------------------------------------------------------------------------

def save_contours(d):
    """
    Interpolate terrain face heights to a regular grid, then extract elevation
    isolines via skimage.measure.find_contours.

    Uses scipy.interpolate.griddata for scattered-point-to-grid interpolation,
    which correctly handles the sparse face centroid distribution.
    """
    try:
        from skimage.measure import find_contours
    except ImportError:
        print("[4] scikit-image not installed -- skipping contours (pip install scikit-image)")
        return

    try:
        from scipy.interpolate import griddata
    except ImportError:
        print("[4] scipy not installed -- skipping contours (pip install scipy)")
        return

    print("[4] Building terrain heightfield for contours ...")

    # Only use faces within the pipeline world extent
    in_bounds = (
        (d["fc_x"] >= WORLD_MIN_X) & (d["fc_x"] <= WORLD_MAX_X) &
        (d["fc_y"] >= WORLD_MIN_Y) & (d["fc_y"] <= WORLD_MAX_Y)
    )
    pts_xy  = np.stack([d["fc_x"][in_bounds], d["fc_y"][in_bounds]], axis=1)
    pts_h   = d["fc_h"][in_bounds]
    print(f"    {in_bounds.sum():,} faces within world bounds for contouring")

    G = CONTOUR_GRID
    gx = np.linspace(WORLD_MIN_X, WORLD_MAX_X, G)
    gy = np.linspace(WORLD_MAX_Y, WORLD_MIN_Y, G)   # north at row 0
    gxx, gyy = np.meshgrid(gx, gy)

    print(f"    Interpolating to {G}x{G} grid ...")
    H = griddata(pts_xy, pts_h, (gxx, gyy), method="linear", fill_value=np.nan)
    # Fill remaining NaN (outside convex hull) with nearest-neighbour
    nan_mask = np.isnan(H)
    if nan_mask.any():
        H_near = griddata(pts_xy, pts_h, (gxx, gyy), method="nearest")
        H = np.where(nan_mask, H_near, H)

    # Normalise to [0, 1] using percentile clip to exclude edge artefacts
    lo, hi = np.percentile(H, 5), np.percentile(H, 95)
    if hi == lo:
        print("    [!] Heightfield has no variation -- skipping contours")
        return
    H_norm = np.clip((H - lo) / (hi - lo), 0.0, 1.0)

    levels = np.linspace(0.05, 0.95, N_CONTOUR_LEVELS)
    print(f"    Extracting {N_CONTOUR_LEVELS} contour levels ...")

    json_features = []
    svg_lines = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{IMG_SIZE}" height="{IMG_SIZE}" '
        f'viewBox="0 0 {IMG_SIZE} {IMG_SIZE}">',
        '  <g id="terrain_contours" fill="none" stroke="#8892b0" stroke-width="1.2" opacity="0.5">',
    ]
    total_segs = 0

    for level in levels:
        contours = find_contours(H_norm, level)
        for contour in contours:
            if len(contour) < 5:
                continue

            rows_c, cols_c = contour[:, 0], contour[:, 1]

            latlon_pts = []
            px_pts     = []
            for r, c in zip(rows_c, cols_c):
                cx = WORLD_MIN_X + (c / G) * (WORLD_MAX_X - WORLD_MIN_X)
                cy = WORLD_MAX_Y - (r / G) * (WORLD_MAX_Y - WORLD_MIN_Y)
                lat, lng = cet_to_leaflet(cx, cy)
                latlon_pts.append([round(lat, 6), round(lng, 6)])
                spx, spy = cet_to_pixel(cx, cy)
                px_pts.append((round(spx, 1), round(spy, 1)))

            json_features.append({"level": round(float(level), 4), "pts": latlon_pts})
            pts_str = " ".join(f"{x},{y}" for x, y in px_pts)
            svg_lines.append(f'    <polyline points="{pts_str}"/>')
            total_segs += 1

    svg_lines += ["  </g>", "</svg>"]

    json_path = os.path.join(DATA_DIR, "terrain_contours.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(json_features, f, separators=(",", ":"))
    print(f"    Saved -> {json_path}  ({total_segs} segments)")

    svg_path = os.path.join(OUTPUT_DIR, "terrain_contours.svg")
    with open(svg_path, "w", encoding="utf-8") as f:
        f.write("\n".join(svg_lines))
    print(f"    Saved -> {svg_path}")


# ---------------------------------------------------------------------------
# Step 5 -- Bounds JSON aligned to the pipeline world extent
# ---------------------------------------------------------------------------

def save_bounds():
    """
    Save Leaflet imageOverlay bounds. These use the same WORLD_MIN/MAX as the
    pipeline tile set, so terrain_background_8k.png aligns perfectly with
    combined_8k.png and the existing 256px tile pyramid.
    """
    sw_lat, sw_lng = cet_to_leaflet(WORLD_MIN_X, WORLD_MIN_Y)
    ne_lat, ne_lng = cet_to_leaflet(WORLD_MAX_X, WORLD_MAX_Y)
    bounds = [
        [round(sw_lat, 6), round(sw_lng, 6)],
        [round(ne_lat, 6), round(ne_lng, 6)],
    ]
    path = os.path.join(DATA_DIR, "terrain_hillshade_bounds.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(bounds, f)
    print(f"[5] Saved bounds -> {path}")
    print(f"    SW={bounds[0]}  NE={bounds[1]}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    os.makedirs(DATA_DIR,   exist_ok=True)

    print("=== NC Zoning Board -- Terrain Overlay Generator (v2, mesh-based) ===\n")
    print(f"    Source: {GLB_DIR}")
    print(f"    World extent: X [{WORLD_MIN_X}, {WORLD_MAX_X}]  Y [{WORLD_MIN_Y}, {WORLD_MAX_Y}]\n")

    sea_level = load_sea_level()
    print()
    data = load_terrain()
    print()
    save_terrain_background(data, sea_level)
    print()
    save_hillshade_overlay(data)
    print()
    save_contours(data)
    print()
    save_bounds()

    print("\n=== Done ===")
    print("  terrain_background_8k.png     -> scripts/output/")
    print("  terrain_hillshade_8k.png      -> scripts/output/")
    print("  terrain_contours.svg          -> scripts/output/")
    print("  terrain_contours.json         -> data/")
    print("  terrain_hillshade_bounds.json -> data/")
    print()
    print("Verify: open terrain_background_8k.png and check:")
    print("  - Bay/coast (Pacifica, west) shows as teal water")
    print("  - Mountain ridges (north, east, south) show darker hillshade")
    print("  - Night City basin (center) is flat and lighter")
    print("  - Alignment with combined_8k.png: street grid overlaps flat basin")


if __name__ == "__main__":
    main()
