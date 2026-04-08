# Terrain Generation

How the NC Zoning Board generates its terrain+water base layer from CP2077 game assets.

---

## Overview

The terrain base layer is rendered in 3D using Three.js with a top-down orthographic camera — exactly how the game renders its own in-game world map. This approach solves the coastline problem that plagued every 2D projection attempt: the GPU's Z-buffer handles water/terrain occlusion automatically, so underground terrain geometry never bleeds through.

**Output:** `scripts/output/terrain_background_8k.png` — an 8192×8192 PNG sliced into 256×256 tiles at zoom levels 0–5.

**Renderer:** `scripts/render_terrain_3d.html` (browser, for visual debugging) + `scripts/render_terrain_3d.js` (Puppeteer headless, for automated pipeline).

---

## Source Assets

All files exported from WolvenKit at `base/entities/cameras/3dmap/`:

| File | Size | What it is |
|------|------|------------|
| `3dmap_terrain.glb` | 18 MB | Terrain mesh — 247,927 verts, 96,366 faces, 5 submeshes, height −79 to +878 GLB_Y |
| `3dmap_water.glb` | 13 KB | Flat water plane — 150 verts, all at GLB_Y = −1.0. Land mass cut out as holes. |
| `3dmap_cliffs.glb` | 9.5 MB | Dogtown cliff faces only — NOT general terrain cliffs for the whole map |

---

## Coordinate System

Terrain, water, and cliffs all use **identity transform** in `3dmap_view.ent.json` (position 0,0,0; no rotation):

```
CET_X = +GLB_X
CET_Y = +GLB_Z
Height = +GLB_Y
```

For Three.js rendering (camera at Y=10000 looking down, up vector = -Z):
```javascript
// Marker and mesh positioning:
position.set(CET_X, height, -CET_Y)
//                          ↑ Z negated because THREE Z = -CET_Y
```

### World Render Extent

From the Realistic Map mod terrain quad UV mapping (see `docs/coordinate-system.md`):

```
WORLD_MIN_X = -6298   WORLD_MAX_X = 5815   (width:  12113)
WORLD_MIN_Y = -7684   WORLD_MAX_Y = 4427   (height: 12111)
Centre: (-242, -1628)
```

The orthographic camera frustum matches these bounds exactly. Both the terrain WebP and the satellite WebP use this same projection, so they align when switching base layers.

**Note:** TweakDB `WorldMap.DefaultSettings.CursorBoundary` (-5500,-7300)→(6050,5000) is the in-game pan limit, not the render extent.

---

## Mesh Transforms

Confirmed by walking the full parent chain in `3dmap_view.ent.json`:

| Mesh | Local Position (CET) | Parent | Notes |
|------|---------------------|--------|-------|
| `3dmap_terrain.glb` | (0, 0, 0) | Transform2736 (Z = −2) | −2 unit Z on parent is negligible at map scale |
| `3dmap_water.glb` | (0, 0, 0) | Transform2736 | Same parent as terrain — perfectly aligned |
| `3dmap_cliffs.glb` | (−2255, −3050, 0) | ep1_dogtown_data (pos 0,0,0) | Apply offset in renderer; Dogtown cliffs only |

In Three.js, the cliffs offset is applied as:
```javascript
meshes.cliffs.position.set(-2255, 0, 3050);
// CET(X=-2255, Y=-3050) → THREE(X=-2255, Z=-(-3050)=+3050)
```

---

## Material Colors

From the game's Material.json files:

| Element | RGB | Source |
|---------|-----|--------|
| Terrain base | (86, 108, 136) | `3dmap_terrain.Material.json` → `BaseColorScale` |
| Terrain lines | (109, 138, 176) | `3dmap_terrain.Material.json` → `LinesColor` |
| Water | (28, 179, 191) | `3dmap_water.Material.json` → `Color` |
| Background | (0, 0, 0) black | In-game camera background — shows through where no mesh geometry exists |

The `LinesColor` and `DarkEdgeWidth: 4500` parameters belong to the custom `3d_map_terrain.mt` shader which uses **edge-proximity darkening**, not a directional sun. Our Three.js render approximates this with a Lambert directional light (`flatShading: true`) from the NW — visually similar but not identical.

---

## Hillshade

Sun direction in CET space (NW, above horizon): `(-1.0, 1.0, 1.5)` normalized.

Converting to Three.js space:
```javascript
new THREE.Vector3(-1, 1.5, -1).normalize()
// THREE_X = CET_X = -1
// THREE_Y = CET_Z (height) = 1.5
// THREE_Z = -CET_Y = -1
```

Ambient: **0.35** (35% minimum brightness for fully shadowed faces).

---

## Three.js Scene Setup

```javascript
// Orthographic camera — top-down view
const camera = new THREE.OrthographicCamera(
  -frustumW, frustumW, frustumH, -frustumH, -50000, 50000
);
camera.position.set(WORLD_CX, 10000, -WORLD_CY);
camera.lookAt(WORLD_CX, 0, -WORLD_CY);
camera.up.set(0, 0, -1);  // north = -Z in GLB space

// Layer order:
// 1. Background (black)
// 2. Water mesh at GLB_Y = -1.0 (behind terrain via Z-buffer)
// 3. Terrain mesh (above water — Z-buffer occludes water where land exists)
// 4. Cliffs mesh (offset to Dogtown position)
```

---

## Why Previous 2D Approaches Failed

Five approaches were tried in `generate_terrain_overlay.py`, all failing for the same root cause: the terrain mesh has 5 full-world overlapping submeshes, each contributing sub-sea faces from underground geometry. Without a depth buffer, these faces can't be occluded by the land faces above them, causing inland areas to show as water.

| Approach | Core Problem |
|----------|-------------|
| PBR texture mapping | UV extent mismatch, water absent from texture |
| Water GLB direct render | Off-canvas triangles flood canvas when clipped |
| Height threshold | Underground geometry causes inland flooding |
| Painter's algorithm (all faces) | Sub-sea inland faces never covered by above-sea faces |
| Water boundary loops | Coarse coastline (150 verts), not implemented |

The 3D render eliminates all of these — the Z-buffer is the correct tool.

---

## What Still Works from the Old Python Pipeline

`generate_terrain_contours.py` remains in production use:

- **`data/terrain_contours.json`** — elevation isolines in Leaflet lat/lng format (optional overlay)
- **`scripts/output/terrain_contours.svg`** — SVG version

`data/terrain_hillshade_bounds.json` stores `[[sw_lat, sw_lng], [ne_lat, ne_lng]]` aligned to the pipeline world extent, ready for a Leaflet `imageOverlay`.

---

## Generating the Terrain WebP

### Step 1: Visual debugging (browser)

```bash
npx serve D:/ -p 3001
# Open: http://localhost:3001/Modding/cp2077-location-mods-map/scripts/render_terrain_3d.html
```

Toggle terrain, water, cliffs, hillshade, and reference markers to verify the render looks correct.

### Step 2: Headless 8k capture

```bash
node scripts/render_terrain_3d.js
```

Output: `scripts/output/terrain_background_8k.png` (~9.5 MB PNG)

### Step 3: Export to WebP

The PNG is converted to WebP for the production site:

```bash
python3 -c "
from PIL import Image
img = Image.open('scripts/output/terrain_background_8k.png').convert('RGB')
img.save('assets/img/terrain_8k.webp', 'WEBP', quality=80, method=6)
"
```

Output: `assets/img/terrain_8k.webp` (~290 KB)

### Delivery: L.imageOverlay (no tiles)

Both base layers are served as single WebP files via Leaflet's `L.imageOverlay`:

| File | Size | Notes |
|------|------|-------|
| `assets/img/terrain_8k.webp` | 290 KB | Schematic terrain, RGB, neutral dark grey |
| `assets/img/satellite_8k.webp` | 9.6 MB | Satellite photograph, RGBA with transparency |

This eliminates the tile generation pipeline entirely. WebP compresses the mostly-two-colour terrain down to 290 KB, which loads faster than a tile set.

The Leaflet bounds for the imageOverlay are derived from the world extent:
```javascript
const bounds = [
  [NCZ.cetToLeaflet(NCZ.WORLD_MIN_X, NCZ.WORLD_MIN_Y)],  // SW corner
  [NCZ.cetToLeaflet(NCZ.WORLD_MAX_X, NCZ.WORLD_MAX_Y)]    // NE corner
];
// = [[-256, 0], [0, 256]] in Leaflet CRS.Simple
```
