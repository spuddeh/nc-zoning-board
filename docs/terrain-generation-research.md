# Terrain Background Generation — Research Notes

This document records all investigation and attempts to generate a terrain background image
for the NC Zoning Board map, including what was tried, why each approach failed, and
recommendations for anyone who wants to pick this up in the future.

**Status:** Contour lines work and are in production. Terrain background image is unsolved.

---

## Goal

Generate two optional assets from the game's 3dmap source files:

| Asset | Purpose |
| --- | --- |
| `scripts/output/terrain_background_8k.png` | Opaque 8192×8192 background: hillshaded land + coloured water bodies |
| `scripts/output/terrain_hillshade_8k.png` | Transparent RGBA overlay — grey slope shadows for compositing over `combined_8k.png` |
| `data/terrain_contours.json` | Elevation isolines as Leaflet lat/lng segments **[WORKING]** |
| `scripts/output/terrain_contours.svg` | SVG version of contour lines **[WORKING]** |

---

## Source Files

All files are under `<export_root>/base/entities/cameras/3dmap/`.

| File | What it is | Useful? |
| --- | --- | --- |
| `3dmap_terrain.glb` | 18 MB terrain mesh — 247,927 verts, 96,366 faces, 5 submeshes, height range −79 to +878 GLB_Y | Partially — normals work for hillshade, contour heights work; land/water split does not |
| `3dmap_water.glb` | 13 KB flat water plane — 150 verts, 128 faces, all at GLB_Y = −1.0 | Boundary edges useful as coastline data; triangle fill floods canvas |
| `3dmap_cliffs.glb` | 9.5 MB cliff geometry, bounds ≈ CET_X [−457, +562] / CET_Y [−250, +216] — city centre cliff walls | Could supplement terrain, all faces above sea level |
| `world_map_albedo.tiff` | PBR albedo texture 1008×1016 — base terrain reflectivity colour, no sRGB | Has UV-to-CET calibration issues (see below); dark |
| `world_map_normal.tiff` | PBR normal map 1008×1016 — tangent-space normals | Can produce hillshade but low contrast (simplified mesh) |
| `world_map_depth.tiff` | PBR depth map 1008×1016 — HDR float grayscale | Height data, but 8-bit export loses precision |

**Critical note on texture exports:** WolvenKit applies sRGB gamma correction to PNG exports,
corrupting the encoded data in these maps. Always load `.tiff` or `.bmp`; never `.png`.

---

## Coordinate System

Same as the rest of the pipeline:

```
CET_X = +GLB_X   (terrain GLB — identity transform in ent, no yaw)
CET_Y = +GLB_Z
Height = +GLB_Y

lat = 0.02101335 * CET_Y − 93.68566
lng = 0.02086230 * CET_X + 132.80160
```

**Important distinction:** Road and metro GLBs use `CET_X = −GLB_X` because they have a
180° world yaw in the ent that the negation corrects. The terrain, water, and cliffs meshes
are placed at identity transform (position 0,0,0; quaternion r=1,i=j=k=0) and do NOT need
the negation. Applying `−GLB_X` to terrain produces a horizontally mirrored image.

Parent chain investigation (from `3dmap_view.ent.json`):
- `terrain_mesh` component: local pos (0,0,0), parent HandleRefId 8 = `pacifica_data0633` at (−2422, −2368, 0)
- `water_mesh` component: local pos (0,0,0), parent HandleRefId 9 = `3dmap_roads` at (0,0,0)
- All parent Z offsets are 0.0 — no vertical offset in the chain for either mesh.

---

## Approach 1 — PBR Texture Mapping (world_map_*)

**Idea:** Use `world_map_albedo` for colour, `world_map_normal` for hillshade, `world_map_depth`
for contours and water threshold. UV coordinates from `3dmap_terrain.glb` map GLB vertices to
texture pixels.

**What was tried:**
- Loaded all three textures as TIFF (not PNG)
- Used linear regression on terrain GLB UV coordinates vs CET vertex positions to determine
  texture orientation (slope sign of `u → CET_X` and `v → CET_Y`)
- Result: `flip_x = True` (east at column 0, needs horizontal flip), `flip_y = False`
- Hillshade computed from tangent-space normals: decoded as `nx,ny,nz = RGB/127.5 − 1`, dot with NW sun direction
- Raw shade max was only 0.148 (simplified flat minimap terrain); normalised to [0,1]
- Albedo averaged ~60/255 (very dark); applied gamma=0.5 brighten

**Why it failed:**
- The terrain texture covers ±8000 CET units but the pipeline world is ±6366/5903; mismatched
  bounds mean the 8k output is zoomed out and doesn't align with `combined_8k.png`
- UV calibration using multi-submesh regression gives correct orientation but inaccurate extent
  (intercepts are biased by uneven vertex distribution across 5 submeshes)
- Albedo is a PBR reflectivity map, not a colour photograph — it's inherently desaturated and
  requires a proper lighting pipeline to look good
- Water is not in the albedo (it's terrain-only); depth thresholding for water bodies also failed
  (the depth map has no clear sea-level boundary)

**Files produced (not committed):** `scripts/output/terrain_background_8k.png` (early versions)

---

## Approach 2 — Water GLB Direct Rendering

**Idea:** Render `3dmap_water.glb` triangles as filled polygons directly onto the terrain image.

**Why it failed:**
The water mesh is a large flat plane (world-scale, ~±8000 units) with the Night City land
mass cut out as "holes." The triangulation connects coastline vertices to the far outer boundary
with very large triangles. When any triangle vertex falls outside the pipeline world bounds
(e.g. CET_X = 7439 >> WORLD_MAX_X = 5903), PIL clips the polygon at the canvas edge — but the
clipping creates a filled rectangle from the coastline to the right edge, flooding the entire
eastern part of the image (Badlands, Arroyo, etc.) with water colour.

This is a fundamental geometry issue: the triangulation is correct in 3D (each triangle is
genuinely within a water area), but it cannot be rendered to a 2D clip rectangle without
proper polygon clipping against the world boundary polygon.

**Vertex data that shows the problem** (first face spanning land):
```
f 39: verts=[135, 58, 121]  GLB_X = [−126, 7439.5]  → CET_X = [−126, 7439.5]
```
This single triangle spans from near the city centre to far off-canvas east.

---

## Approach 3 — Terrain Height Threshold

**Idea:** Fill canvas with `WATER_COLOR`, render only terrain faces with `fc_h > −1.0` (sea level
derived from water GLB Y value) as land. Sea-floor faces left unrendered expose water background.

**What was tried:** Multiple threshold offsets (`WATER_DEPTH_OFFSET` of 0, 3, 5).

**Why it failed:**

1. **5 submeshes, each full-world:** `3dmap_terrain.glb` has 5 submeshes
   (`submesh_00_LOD_1` through `submesh_04_LOD_1`), each covering the full world extent
   (±7978–7998 in both axes). They are NOT geographic sectors or LOD regions.

2. **Sub-sea faces in city areas:** Each submesh has ~12–13% sub-sea faces globally. Because all
   5 submeshes cover the full world, city areas accumulate sub-sea faces from submeshes whose
   "primary" coverage is elsewhere. Diagnostic by region:

   | Region | Total faces | Sub-sea (≤ −1) | % |
   | --- | --- | --- | --- |
   | City Centre | 7,614 | 2,151 | 28% |
   | Heywood | 8,282 | 1,858 | 22% |
   | Pacifica | 4,262 | 1,595 | 37% |
   | Watson/Kabuki | 14,587 | 1,193 | 8% |
   | Santo Domingo | 4,962 | 0 | 0% |

3. **Height does not reliably identify water:** Low-lying inland terrain (industrial flats,
   badlands depressions, underground geometry) also has `GLB_Y ≤ −1`, so any threshold
   incorrectly classifies inland areas as water. The water body location is not purely determined
   by height — it's determined by where the water mesh actually sits.

---

## Approach 4 — Painter's Algorithm (All Faces)

**Idea:** Render ALL 96,366 faces sorted low-to-high. Sub-sea faces get `WATER_COLOR`; above-sea
faces get hillshaded terrain colour. Above-sea faces should cover sub-sea faces at the same 2D
position (city centre), leaving only genuine ocean areas as water.

**Why it still failed:**
The 5 full-world submeshes each contribute faces across the entire terrain. In City Centre,
2,151 faces (28%) are genuinely below sea level in the terrain model — these represent flat
basin geometry, underground tunnels, and low-lying areas. They occupy 2D positions where no
above-sea face exists, so they remain water-coloured even after the painter's algorithm.
The high sub-sea percentage in the Pacifica region (37%) compounds this, as that area is both
coastal and has low terrain.

---

## Approach 5 — Water GLB Boundary Loops (attempted, not completed)

**Idea:** Instead of rendering water triangles, extract the **boundary edges** of `3dmap_water.glb`
(edges belonging to exactly 1 face). These form closed loops: an outer rectangle (ocean
boundary) and inner loops (the Night City coastline). Fill the canvas with `WATER_COLOR`, then
fill inside the inner coastline loops with terrain colour.

**Why it was not completed:**
The `extract_coastline()` function stub exists in `generate_terrain_overlay.py` but was not
implemented due to complexity. The water mesh has only 150 vertices, giving a very coarse
coastline that may not match the visible game coastline well enough to be useful.

**Recommended approach for future work:** This is likely the most correct approach. Steps:

1. Build all edges from faces: `edges = faces[:, [[0,1],[1,2],[2,0]]].reshape(-1, 2)`
2. Sort each edge so `a < b`: `edges = np.sort(edges, axis=1)`
3. Find unique edges with `count == 1` (boundary edges):
   ```python
   unique, counts = np.unique(edges, axis=0, return_counts=True)
   boundary = unique[counts == 1]
   ```
4. Build adjacency dict and trace closed loops via graph walk
5. Classify loops: outer loop has vertices at GLB_X = ±7998 or ±7439 extremes;
   inner loops are the Night City coastline
6. Fill canvas: `WATER_COLOR` background → filled land polygons (inner loops) → hillshade

The coastline polygon in pixel space will have ~60–80 vertices (coarse), but combined with
hillshade from the terrain normals it should give a clean, game-accurate result.

---

## What Works: Contour Lines

`save_contours()` in `generate_terrain_overlay.py` correctly produces elevation isolines:

- Loads `3dmap_terrain.glb`, computes face centroid heights
- Clips to pipeline world bounds, interpolates to a 512×512 grid via `scipy.griddata`
- Extracts 12 contour levels via `skimage.measure.find_contours`
- Outputs `data/terrain_contours.json` (239 segments, Leaflet lat/lng format)
- Outputs `scripts/output/terrain_contours.svg`

These are used as an optional overlay layer on the map website. The contour format matches
`data/metro.json` — each entry is `{"level": float, "pts": [[lat, lng], ...]}`.

---

## Recommendations for Future Work

### Quick win: coastline boundary loop approach
Implement `extract_coastline()` as described in Approach 5. The function stub is already in
`generate_terrain_overlay.py`. Expected to give a clean result in a few hours.

### Better terrain colour
The game material files contain the exact colours used in the 3dmap:
- `3dmap_terrain.Material.json`: `BaseColorScale = RGB(86, 108, 136)` — blue-grey land
- `3dmap_water.Material.json`: `Color = RGB(28, 179, 191)` — teal water

Both are already used as `TERRAIN_BASE` and `WATER_COLOR` constants in the script.

### Hillshade
The terrain mesh normals produce good hillshade. The `compute_hillshade` logic in the script
is correct. Once land/water masking is solved, the hillshade can be applied per-face to only
land areas (faces inside the coastline polygon bounding box).

### Per-pixel approach (higher quality but slower)
Rasterise terrain face heights to a 1024×1024 grid (reuse the contour grid). Find all pixels
at `height ≤ −1.0` that are **connected to the canvas edge** via 4-connectivity (flood fill
from the south edge pixel, which is definitely ocean at CET_Y = −7724). This connected-water
mask, upscaled to 8k, would correctly handle the city-centre sub-sea pockets by isolating them
from the true ocean. Requires `scipy.ndimage.label`.

### Alignment
`data/terrain_hillshade_bounds.json` already stores the correct Leaflet `[[sw_lat, sw_lng], [ne_lat, ne_lng]]`
bounds aligned to the pipeline world extent, ready for a Leaflet `imageOverlay` once the image
quality is good enough to use.
