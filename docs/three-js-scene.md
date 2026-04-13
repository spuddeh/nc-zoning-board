# Three.js 3D Scene — Reference Documentation

Full documentation for the Three.js schematic view. For the phase-by-phase implementation plan see [`three-js-migration-plan.md`](three-js-migration-plan.md). For the overall app architecture see [`architecture.md`](architecture.md).

---

## Overview

The NC Zoning Board has two map views that share the same sidebar, filters, and mod data:

| View | Container | Technology | Purpose |
|------|-----------|------------|---------|
| Satellite | `#map` | Leaflet.js | Real satellite tile layer with location pins |
| Schematic | `#map-3d` | Three.js | Live 3D scene: terrain, buildings, roads, pins |

Only one container is visible at a time. Neither is destroyed on switch — Leaflet state persists and the Three.js scene stays in GPU memory. The Three.js render loop pauses when `#map-3d` is hidden.

---

## File Structure

```
assets/js/
  constants.js      — NCZ namespace + all shared constants (unchanged)
  utils.js          — Pure utility functions including shared popup/filter logic
  services.js       — Nexus API + data loading (unchanged)
  three-scene.js    — Three.js scene: renderer, camera, GLB loading, materials, render loop
  three-markers.js  — CSS2D pins, tooltips, popups, sidebar coordination
  app.js            — Main app: Leaflet init, DOM events, view switching
```

### Load order in `index.html`

```
constants.js (regular script)
utils.js (regular script)
services.js (regular script)
three-scene.js (type="module")
three-markers.js (type="module")
app.js (regular script)
```

`type="module"` scripts are deferred by default and always execute before the subsequent regular `app.js` script, even though they appear earlier in the file.

### Why two Three.js files

`three-scene.js` owns the renderer — it has no knowledge of mod data. `three-markers.js` owns the pins — it reads mod data and calls into the scene to position things, but doesn't control the renderer. This mirrors the existing `services.js` / `app.js` split: data vs. DOM. You can iterate on hover/click behaviour in `three-markers.js` without touching the scene, and vice versa.

### Namespaces

Both files write to `window.NCZ` so `app.js` (a regular script) can access them:

```javascript
// three-scene.js
window.NCZ.ThreeScene = { init, loadTerrain, startRenderLoop, stopRenderLoop, ... };

// three-markers.js
window.NCZ.ThreeMarkers = { addPin, setVisibility, focusPin, ... };
```

---

## Three.js Setup

### Import map

Three.js is loaded via an import map in `index.html`, matching the pattern used in `scripts/render_terrain_3d.html`:

```html
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"
  }
}
</script>
```

This lets module scripts use bare specifiers without a bundler:

```javascript
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
```

### Renderer

`WebGLRenderer` fills `#map-3d`. A `CSS2DRenderer` is layered on top (same size, `position: absolute`, `pointerEvents: none`) to render pin DOM elements in screen space.

### Camera

Orthographic camera, top-down by default, right-click to tilt (via OrbitControls). Zoom adjusts the frustum dimensions rather than moving the camera position along Z.

```javascript
controls.mouseButtons = { LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE };
controls.minPolarAngle = 0;             // top-down
controls.maxPolarAngle = Math.PI * 0.39; // ~70° max tilt
controls.enableDamping = true;
```

Camera frustum is derived from the terrain mesh bounding box after loading, not from hardcoded WORLD constants. This lets the game geometry define the viewport, matching exactly what the in-game map camera sees.

TweakDB values from `map_data_export/source/raw/nczoning_tweakdb_map_data.json`:
- Default yaw: **-45°** (in-game map is rotated 45° from north)
- Yaw range: -85° to -30°
- Zoom: min=800, max=10500, default=3000
- FOV: 25 (fixed)

The web map defaults to north-up (yaw 0°) rather than -45° because it's more intuitive for comparison with the satellite view.

### Lighting

Hillshade matching the in-game map appearance:
- `DirectionalLight` from NW direction `(-1, 1.5, -1)` for hillshading
- `AmbientLight` at 0.35 intensity

### Theme support

Material colors are read from CSS custom properties at scene init and on theme change:

```javascript
function readThemeColor(varName) {
  return new THREE.Color(
    getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
  );
}
```

When the user switches theme, `NCZ.ThreeScene.updateMaterials()` is called to re-read all CSS vars and update material colors. This means the 3D scene is fully theme-aware — terrain, water, roads, and buildings all respond to theme switches.

---

## Coordinate System

For full details on the three coordinate systems (CET, GLB, building instance textures) and how they relate, see [`coordinate-system-3d.md`](coordinate-system-3d.md).

### Camera Up Vector

The camera uses the standard Three.js up vector `up=(0,1,0)`. This ensures correct rendering at all camera angles — when tilted, the Y-axis orientation is preserved and buildings correctly extend upward from terrain.

### CET → Three.js mapping

```javascript
NCZ.cetToThree = function(cetX, cetY, cetZ) {
  return [cetX, cetZ || 0, -cetY];
};
```

CET and GLB share the same XZ coordinate space at 1:1 scale. The terrain GLB extends beyond CET world bounds (extra ocean/outer terrain) but coordinates within the city area match exactly.

---

## GLB Assets

Stored in `assets/glb/`. Loaded in tiers so the scene is interactive as quickly as possible.

| File | Size | Tier | Notes |
|------|------|------|-------|
| `3dmap_terrain.glb` | 18 MB | 1 (required) | Terrain surface, 247k verts |
| `3dmap_water.glb` | 16 KB | 1 (required) | Water plane with land cutouts |
| `3dmap_cliffs.glb` | 9.5 MB | 1 (with terrain) | Dogtown cliff faces |
| `3dmap_roads.glb` | 6.4 MB | 2 (idle) | Road surfaces — has inverted X axis, see below |
| `3dmap_metro.glb` | 1.2 MB | 2 (idle) | Metro tracks |
| Landmark GLBs (×8) | ~3 MB total | 3 (on demand) | Obelisk, ferris wheel, etc. |

Tier 1 loads in parallel on scene init. Tier 2 loads after Tier 1 resolves, during idle. Tier 3 loads after Tier 2.

### Roads axis inversion

`3dmap_roads.glb` (and `3dmap_metro.glb`) have their X axis inverted relative to CET space. After loading:

```javascript
mesh.rotation.y = Math.PI;
```

### Materials

| Layer | Material type | Color source |
|-------|--------------|--------------|
| Terrain | `MeshLambertMaterial` (flatShading, DoubleSide) | `--scene-terrain` CSS var |
| Water | `MeshBasicMaterial` (DoubleSide) | `--scene-water` CSS var |
| Cliffs | `MeshLambertMaterial` (flatShading, DoubleSide) | `--scene-cliffs` CSS var |
| Roads | `MeshBasicMaterial` | `--overlay-road-color` CSS var |
| Metro | `MeshBasicMaterial` | `--overlay-metro-color` CSS var |
| Buildings | `MeshBasicMaterial` | `--scene-terrain` CSS var, per-instance brightness via `setColorAt()` |

---

## Buildings

~254k buildings rendered as GPU-instanced cubes. Each district is one `THREE.InstancedMesh` (8 total, ~5–42k instances each).

### Data pipeline

```
assets/xbm/*_data.xbm.json   (WolvenKit JSON export — 16-bit RGBA base64 pixel data)
    ↓ loadXbmDataTexture()     (three-scene.js)
    ↓   uint16 → float32 [0,1] → THREE.DataTexture (FloatType, NearestFilter)
    ↓
GPU vertex shader reads position/rotation/scale via gl_InstanceID + texelFetch()

assets/xbm/*_m.xbm.json      (WolvenKit JSON export — BC4-compressed greyscale)
    ↓ loadXbmMTexture()        (three-scene.js)
    ↓   JS BC4 decompressor → float DataTexture (mip 0, generateMipmaps: true)
    ↓
GPU fragment shader samples surface detail via world-space planar UV
```

No intermediate JSON. No CPU matrix computation. Game assets load directly to GPU.

### Texture format

`_data.xbm.json` contains raw 16-bit RGBA pixel data (base64) in `textureData.Bytes`. Each pixel row encodes one building instance across three equal horizontal blocks:

| Block | X range | Channels | Encodes |
|-------|---------|----------|---------|
| Position | 0..blockW | RGB=XYZ (0→1 → transMin→transMax + offset), A=validity | CET world position |
| Rotation | blockW..2×blockW | RGBA=quaternion (0→1 → -1→1) | Full 3D rotation |
| Scale | 2×blockW..3×blockW | RGB=XYZ half-extents × cubeSize | Box dimensions |

8-bit PNG exports from WolvenKit lose precision (~9 CET units position error for spaceport district). The `.xbm.json` Bytes field retains full 16-bit precision (~0.036 CET units).

### Vertex shader (GPU instancing)

The vertex shader reads per-instance data directly from the DataTexture:

```glsl
int tx = gl_InstanceID % int(uBlockW);
int ty = gl_InstanceID / int(uBlockW);
vec4 posRaw = texelFetch(uDataTex, ivec2(tx, ty), 0);           // position + validity
vec4 rotRaw = texelFetch(uDataTex, ivec2(tx + bw, ty), 0);      // quaternion
vec4 sclRaw = texelFetch(uDataTex, ivec2(tx + 2*bw, ty), 0);    // scale
```

Full TRS applied in shader — full quaternion (all 4 components), CET→Three.js axis remap. See `coordinate-system-3d.md` for remap formula.

### Fragment shader

Lambert diffuse + `_m.xbm` surface texture via world-space planar UV + edge highlight:

```glsl
float m = texture(uMTex, vMUv).r;           // _m.xbm surface detail [0,1]
float diffuse = max(dot(vWorldNormal, uSunDir), 0.0);
float light = uAmbient + (1.0 - uAmbient) * diffuse;
vec3 color = uBaseColor * (0.3 + m * 0.7) * light;
// edge highlight from 3d_map_cubes.mt EdgeColor/EdgeThickness/EdgeSharpnessPower
```

### District metadata (DISTRICT_META in three-scene.js)

Each district entry specifies dataTex/mTex paths, cubeSize, transMin/transMax (3D XYZ), and world XY offset. Values sourced from `3dmap_triangle_soup.Material.json`.

For lighting and shadow implementation details see [`3dmap-lighting-shadows.md`](3dmap-lighting-shadows.md).

---

## Location Pins

Pins are `CSS2DObject` instances from Three.js's `CSS2DRenderer`. They use the same CSS classes as the Leaflet markers (`category-marker`, `marker-pin`, `marker-pin--location-overhaul`, etc.) so they are visually identical and theme-aware automatically.

```javascript
const div = document.createElement('div');
div.className = 'category-marker';
div.innerHTML = `<div class="marker-pin ${catStyle.class}"></div>`;
const pin = new CSS2DObject(div);
pin.position.set(cetX, cetZ || 0, -cetY);
```

Popup HTML is generated by `NCZ.buildPopupHtml()` (in `utils.js`) — the same function used by the Leaflet view, so both views produce identical popups.

### Clustering

Screen-space proximity clustering, recalculated on camera change. Pins within 40px (matching Leaflet's `maxClusterRadius`) are grouped into a single cluster element using the same `.marker-cluster-step-N` CSS classes. The `#cluster-panel` DOM element is shared between both views.

### Filter integration

`applyFilters()` in `app.js` calls `NCZ.computeVisibleMods(mods, filters)` to get a `Set<modId>`, then delegates:
- Leaflet view: adds/removes markers from `markerClusterGroup`
- Three.js view: calls `NCZ.ThreeMarkers.setVisibility(visibleIds)` which toggles `pin.visible`

---

## Shared Utility Functions

All in `utils.js`. Both views call these — nothing view-specific lives here.

| Function | Description |
|----------|-------------|
| `NCZ.isRecentlyUpdated(mod)` | True if mod was updated on Nexus within `NCZ.RECENTLY_UPDATED_DAYS` |
| `NCZ.cetToThree(cetX, cetY, cetZ)` | CET → Three.js `[x, y, z]` |
| `NCZ.buildPopupHtml(mod, catStyle, nexusThumbs, tagsDict)` | Full popup HTML string, used by both views |
| `NCZ.prepareModRenderData(mod, nexusThumbs, tagsDict)` | Returns `{ catStyle, popupHtml, thumbSrc, fullSrc, nexusUrl, nexusLabel }` |
| `NCZ.computeVisibleMods(allMods, filters)` | Returns `Set<modId>` of mods passing all active filters |

---

## View Switching

Handled in `overlay.js` via `NCZ.switchBaseLayer(layerName)`. On switch:

1. The outgoing container is hidden (`display: none`), its render loop paused
2. The incoming container is shown, its init called (lazy — only runs once)

Camera state is synced on switch via coordinate transform: Leaflet center → inverse `cetToLeaflet()` → CET coords → `cetToThree()` → Three.js camera target, and vice versa. Zoom is mapped proportionally between Leaflet zoom levels and Three.js frustum size.

---

## WebGL Fallback

On page load, `WebGL2RenderingContext` is checked. If unavailable, the "3D" view option is hidden and the satellite view is the only option.
