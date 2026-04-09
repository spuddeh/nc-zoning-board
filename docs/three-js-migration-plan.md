# Plan: Migrate Schematic View from Leaflet Canvas Overlay to Live Three.js 3D Scene

**Branch:** Create new feature branch `feat/three-js-3d-map` from `main`, then merge in relevant work from `feat/map-data-extraction-terrain`:
- District border overlays (subdistricts.json, overlay.js district/subdistrict layers)
- Building data pipeline outputs (buildings.json, roads.json, metro.json, landmarks.json)
- Terrain render scripts (render_terrain_3d.html/js)
- Map constants (WORLD_MIN/MAX, coordinate transforms)
- Canvas overlay module (overlay.js) — needed for satellite view overlay toggles
- _m texture brightness pipeline (add_building_brightness.py)

Cherry-pick or merge only the commits needed — avoid bringing in experimental/abandoned work (e.g., extract_building_structures.py output).

## Context

The NC Zoning Board currently renders its "schematic" view as a 2D Leaflet canvas overlay: buildings/roads/metro are drawn as flat polygons on a tile grid, and terrain is a pre-rasterized WebP image. This loses 3D structural data — bridges, elevated platforms, building heights, and the _m.xbm texture shading are all flattened. The game's own map is a 3D scene rendered with an orthographic camera, and we have all the original 3D assets (GLB meshes, instance textures, transform data) already exported.

**Goal:** Replace the 2D schematic with a live Three.js 3D scene that starts top-down (identical visual to current) but allows camera tilt/orbit to reveal depth. Keep the Leaflet satellite view as a separate fallback option. Both views share the same location data, sidebar, filtering, and UI.

**Key user decision:** Two views only (not three). "Schematic 3D" is the default; "Satellite" is the fallback. No separate "Schematic Flat" option.

---

## Architecture: Dual Container, Shared Data Layer

```
┌─────────────────────────────────────────────────────┐
│  index.html                                         │
│  ┌───────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  #map     │  │  #map-3d     │  │  Sidebar +   │  │
│  │ (Leaflet) │  │ (Three.js)   │  │  Modals +    │  │
│  │           │  │              │  │  Filters     │  │
│  └───────────┘  └──────────────┘  └──────────────┘  │
│   display:none   display:block     (always visible)  │
│   when 3D        when 3D                             │
└─────────────────────────────────────────────────────┘
         ↑                ↑                ↑
         └────────────────┴────────────────┘
                    Shared data:
              mods[], allMarkers[], filters
```

- **`#map`** (Leaflet): satellite tiles + L.marker pins + clustering + district border overlays (from current feature branch). Unchanged from current except districts are now visible on satellite view too.
- **`#map-3d`** (Three.js): WebGLRenderer + CSS2DRenderer overlay. Terrain/water/roads/metro/buildings GLBs + CSS2D pin elements.
- **Sidebar, modals, filtering**: DOM-based, view-agnostic. Operate on the data model, delegate rendering to whichever view is active.

Only one container visible at a time (`display: none` on the inactive one). Neither is destroyed on switch — Leaflet state persists, Three.js scene stays in GPU memory. The Three.js render loop pauses when hidden.

---

## New Files

| File | Purpose |
|------|---------|
| `assets/js/three-scene.js` | Three.js scene setup, GLB loading, camera/controls, materials, render loop. Namespace: `NCZ.ThreeScene` |
| `assets/js/three-markers.js` | CSS2DRenderer pin management, tooltip/popup system for 3D view, sidebar coordination. Namespace: `NCZ.ThreeMarkers` |

**Load order becomes:**
```
constants.js → utils.js → services.js → overlay.js → three-scene.js → three-markers.js → app.js
```

Three.js loaded via import map (same pattern as existing `render_terrain_3d.html`):
```html
<script type="importmap">
{ "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"
} }
</script>
```

**Note:** three-scene.js and three-markers.js must be `<script type="module">` since they import from the import map. They assign to `window.NCZ.ThreeScene` / `window.NCZ.ThreeMarkers` so app.js (regular script) can access them. The existing 4 files stay as regular scripts.

---

## GLB Assets for Production

**TweakDB reference data:** `map_data_export/source/raw/nczoning_tweakdb_map_data.json` — Contains 132 district records (uiState, hierarchy, gangs), 33 zoom levels (showDistricts/showSubDistricts thresholds), camera settings (zoom/rotation limits). Note: `cursorBoundaryMin/Max` are null in this export — those values need re-extraction or manual verification.

Copy required GLBs to `assets/glb/` in the repo:

| File | Size | Priority | Notes |
|------|------|----------|-------|
| `3dmap_terrain.glb` | 18 MB | Tier 1 (required) | Terrain surface — 247k verts |
| `3dmap_water.glb` | 16 KB | Tier 1 (required) | Water plane with land cutouts |
| `3dmap_cliffs.glb` | 9.5 MB | Tier 1 (with terrain) | Dogtown cliff faces |
| `3dmap_roads.glb` | 6.4 MB | Tier 2 (during idle) | Road surfaces (NOTE: -GLB_X axis) |
| `3dmap_metro.glb` | 1.2 MB | Tier 2 (during idle) | Metro tracks |
| 8 landmark GLBs | ~3 MB total | Tier 3 (on demand) | Obelisk, ferris wheel, etc. |
| `3dmap_roads_borders.glb` | 32 MB | Tier 3 (optional) | Road edge lines — may skip in v1 |

**Total Tier 1+2:** ~35 MB. **With Tier 3:** ~70 MB. Consider Git LFS if repo size exceeds GitHub's soft limit.

---

## Phase 0: Refactor for View-Agnostic Data Layer

**Goal:** Extract Leaflet-specific code from shared logic so both views can consume the same data.

### 0.1 Extract popup HTML generation

Move the popup content template (app.js lines 1199-1226) into a utility function:

```javascript
// utils.js
NCZ.buildPopupHtml = function(mod, catStyle, nexusThumbs, tagsDict) { ... }
```

Both `marker.bindPopup()` (Leaflet) and `CSS2DObject` popup (Three.js) call this.

### 0.2 Extract marker data preparation

Create `NCZ.prepareModRenderData(mod, nexusThumbs, tagsDict)` that returns:
```javascript
{ mod, catStyle, popupHtml, thumbSrc, fullSrc, nexusUrl, nexusLabel, sidebarLi }
```

The Leaflet marker creation loop and Three.js pin creation both consume this.

### 0.3 Extract filter computation

Create `NCZ.computeVisibleMods(allMods, filters)` → returns `Set<modId>`. The existing `applyFilters()` calls this, then delegates visibility to whichever view is active.

### 0.4 Add `#map-3d` container

```html
<!-- index.html, sibling of #map -->
<div id="map-3d" style="display: none;"></div>
```

### 0.5 Add Three.js import map and new script tags

```html
<script type="importmap">{ ... }</script>
<script type="module" src="assets/js/three-scene.js"></script>
<script type="module" src="assets/js/three-markers.js"></script>
```

**Files modified:** `index.html`, `assets/js/utils.js`, `assets/js/app.js`
**No visual changes.** Existing functionality unchanged.

---

## Phase 1: Terrain Scene + View Switching

**Goal:** A working "SCHEMA" button that shows terrain + water in Three.js with camera controls.

**Critical visual fix this phase solves:** The terrain mesh (`3dmap_terrain.glb`) contains the elevated platform foundations, bridges, and structural shapes that are currently invisible in 2D. For example, Morro Rock's runway platform and connecting structures are terrain geometry with real Z-height. In the current map these are flattened into nothing because the terrain is a rasterized WebP. By rendering the terrain mesh live in Three.js with the Z-buffer, these structures appear automatically — no extra work needed. This is the single biggest visual improvement from the 3D migration.

When comparing the in-game Morro Rock (elevated platform with runway, circular structure, connecting bridges to the three rockets) to the current map (rockets floating on dark background with no platform), the terrain mesh is what fills that gap.

### 1.1 Create `three-scene.js`

Port the core scene from `scripts/render_terrain_3d.html`:

- `NCZ.ThreeScene.init(containerId)` — lazy init: WebGLRenderer, OrthographicCamera, Scene, lights
- Camera: orthographic, position above scene center, lookAt center, up=(0,0,-1)
- Frustum: computed from loaded terrain mesh bounding box (no hardcoded WORLD constants — let the geometry define the viewport, matching the game)
- Hillshade: DirectionalLight from NW `(-1, 1.5, -1)`, ambient 0.35
- Materials: MeshLambertMaterial (terrain/cliffs), MeshBasicMaterial (water)
- Colors: read from CSS custom properties for theme support (same pattern as overlay.js line 189-201). **Key benefit:** Since terrain is now live-rendered (not a rasterized WebP), all mesh colors (terrain, water, roads, buildings) are fully themeable via CSS custom properties. Each theme can define its own terrain/water palette.

### 1.2 GLB loading (tiered)

```javascript
NCZ.ThreeScene.loadTerrain() → Promise
// Tier 1: terrain.glb + water.glb + cliffs.glb (parallel)
// Tier 2: roads.glb + metro.glb (after Tier 1, during idle)
// Tier 3: landmarks (after Tier 2)
```

Progress events update a loading indicator in the `#map-3d` container.

### 1.3 OrbitControls

```javascript
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

controls.mouseButtons = { LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE };
controls.minPolarAngle = 0;           // top-down
controls.maxPolarAngle = Math.PI * 0.39; // ~70° max tilt
controls.enableDamping = true;
// Pan constrained to TweakDB CursorBoundary (in-game pan limits):
//   NOTE: CursorBoundary was null in TweakDB export — values -5500,-7300 to 6050,5000
//   from previous plan need re-verification. May need manual testing or different extraction.
// Camera frustum uses WORLD render extent (from Realistic Map mod quad UV):
//   X: [-6298, 5815], Y: [-7684, 4427]
// Zoom: adjust orthographic frustum size (TweakDB: zoomMin=800, zoomMax=10500, default=3000)
```

Note: left-click = pan (matches Leaflet drag behavior). Right-click = orbit/tilt.

**Camera rotation discovery from TweakDB (`map_data_export/source/raw/nczoning_tweakdb_map_data.json`):**
- Default yaw: **-45°** (the in-game map is rotated 45° from north!)
- Yaw range: -85° to -30°
- Zoom: min=800, max=10500, default=3000
- FOV: 25 (fixed, min=max)
- Decision needed: Do we match the game's -45° default rotation, or keep north-up (current)? North-up is more intuitive for a web map. The game's rotation is aesthetic but may confuse users comparing locations. **Recommend: start north-up, allow rotation via OrbitControls.**

### 1.4 Extend view switching

In `overlay.js`, extend `NCZ.switchBaseLayer()`:

```javascript
NCZ.switchBaseLayer = function(layerName) {
  if (layerName === activeBaseLayer) return;
  
  // Hide current view container
  if (activeBaseLayer === 'schematic3d') {
    document.getElementById('map-3d').style.display = 'none';
    NCZ.ThreeScene.stopRenderLoop();
  } else {
    // existing Leaflet layer removal
  }
  
  // Show new view
  if (layerName === 'schematic3d') {
    document.getElementById('map').style.display = 'none';
    document.getElementById('map-3d').style.display = 'block';
    NCZ.ThreeScene.init('map-3d'); // lazy, only runs once
    NCZ.ThreeScene.startRenderLoop();
  } else {
    document.getElementById('map-3d').style.display = 'none';
    document.getElementById('map').style.display = 'block';
    // existing Leaflet layer add
  }
  
  activeBaseLayer = layerName;
};
```

### 1.5 Update MapControls

Add "SCHEMA" option to the base layer dropdown. Options stay: `SAT` | `SCHEMA` (same terminology as current, but SCHEMA now activates the Three.js 3D scene instead of the 2D canvas overlay).

**Files created:** `assets/js/three-scene.js`
**Files modified:** `assets/js/overlay.js`, `index.html`
**Result:** You can switch to "3D" and see the terrain/water/cliffs with camera tilt controls.

---

## Phase 2: Roads, Metro, District Borders in 3D

**Goal:** Full schematic overlay data visible in the Three.js scene.

### 2.1 Roads GLB

- Load `3dmap_roads.glb` (6.4 MB) in Tier 2
- **Critical:** Roads GLB has inverted X axis. Apply `mesh.rotation.y = Math.PI` or negate X vertices
- Material: MeshBasicMaterial with theme color from `--overlay-road` CSS var
- Reduced opacity to match 2D appearance

### 2.2 Metro GLB

- Load `3dmap_metro.glb` (1.2 MB) in Tier 2
- Standard axis mapping (no inversion)
- Material: MeshBasicMaterial with `--overlay-metro` CSS var color

### 2.3 District borders

- Reuse `data/subdistricts.json` (already loaded by overlay.js)
- Convert CET polygon coordinates to Three.js: `(CET_X, 5, -CET_Y)` (float above terrain)
- Render as `THREE.Line` with `LineBasicMaterial` per-district colors from `NCZ.DISTRICT_COLORS`
- Implement zoom-based switching: camera distance threshold maps to district vs subdistrict display

### 2.4 Overlay toggle integration

`NCZ.toggleOverlay()` extended: when in 3D mode, calls `NCZ.ThreeScene.setLayerVisibility(layerName, visible)` instead of manipulating Leaflet layers.

**Files modified:** `assets/js/three-scene.js`, `assets/js/overlay.js`

---

## Phase 3: Buildings as Instanced Cubes

**Goal:** Render ~255k buildings as 3D cubes with height from _m texture brightness.

**How this completes the in-game look (with Phase 1 terrain):**

The in-game map at Morro Rock shows three layers working together:
1. **Terrain mesh** (Phase 1): provides the elevated platform, runway, foundation shapes — the "ground" structures sit on
2. **Building cubes** (this phase): instanced boxes sitting ON the terrain at their correct Z heights, shaded by _m brightness — these are the detailed structures (rockets, buildings, surface features)
3. **_m texture brightness** (this phase): controls cube height AND color intensity — taller buildings are brighter, matching the game's shading

Without Phase 1's terrain, the buildings would float. Without Phase 3's buildings, the terrain platform would be featureless. Together they recreate the full structural detail visible in the in-game map.

### 3.1 Data format decision

**Current state:**
- `data/buildings.json` (32 MB): 255k polygons with `pts` (Leaflet coords), `hz` (height), `b` (brightness 0-1) — **this is the authoritative source**
- `data/building_structures.json` (692 KB): height-band contour polygons from _m texture — this was an experimental attempt to vectorise _m texture regions into structural polygons. **It did not work correctly** (adjacent structures merge into blobs). Do NOT use as a data source for 3D buildings.

**For 3D, create a new compact format** via a build script from `buildings.json`:

```javascript
// data/buildings_3d.json (~5 MB estimated)
{
  "instances": [
    [cetX, cetY, cetZ, width, depth, height, brightness, districtIndex],
    ...
  ],
  "districts": ["city_center", "watson", ...]
}
```

Build script extracts centroid, bounding box width/depth from each polygon in `buildings.json`, keeps `hz` as height and `b` as brightness. This reduces 32 MB → ~5 MB.

### 3.2 InstancedMesh rendering

```javascript
const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshLambertMaterial({ vertexColors: false });
const mesh = new THREE.InstancedMesh(geometry, material, instanceCount);

// For each building instance:
const matrix = new THREE.Matrix4();
matrix.compose(
  new THREE.Vector3(cetX, height/2, -cetY),  // position (base at y=0)
  new THREE.Quaternion(),                     // no rotation (axis-aligned cubes)
  new THREE.Vector3(width, height, depth)     // scale
);
mesh.setMatrixAt(i, matrix);
mesh.setColorAt(i, brightnessColor);  // brightness → grayscale tint of theme building color
```

InstancedMesh with 255k instances = ~5 draw calls total. Well within GPU capability.

### 3.3 Theme-aware coloring

Base building color from `--overlay-building-fill` CSS var, modulated per-instance by brightness value (0.88-1.00 range, same remapping as current 2D overlay).

**Files modified:** `assets/js/three-scene.js`
**New build script:** `scripts/build_buildings_3d.js` (converts buildings.json → buildings_3d.json)

---

## Phase 4: Location Pins in 3D

**Goal:** All location pins visible in the Three.js view — both manual registry mods (~207) AND Nexus auto-discovered mods (fetched via GraphQL API) — with tooltips, popups, sidebar coordination, and clustering.

### 4.1 CSS2DRenderer setup

```javascript
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const css2dRenderer = new CSS2DRenderer();
css2dRenderer.setSize(W, H);
css2dRenderer.domElement.style.position = 'absolute';
css2dRenderer.domElement.style.top = '0';
css2dRenderer.domElement.style.pointerEvents = 'none';
document.getElementById('map-3d').appendChild(css2dRenderer.domElement);
```

### 4.2 Pin creation (`three-markers.js`)

```javascript
NCZ.ThreeMarkers.addPin = function(mod, catStyle) {
  const div = document.createElement('div');
  div.className = 'category-marker';
  div.innerHTML = `<div class="marker-pin ${catStyle.class}"></div>`;
  div.style.pointerEvents = 'auto';  // enable click/hover on this pin
  
  const pin = new CSS2DObject(div);
  const [x, y, z] = mod.coordinates;
  pin.position.set(x, (z || 0), -y);  // CET → Three.js
  pin.modData = mod;
  scene.add(pin);
};
```

Same CSS classes as Leaflet markers → identical visual appearance, theme-aware automatically.

### 4.3 Tooltips

Reuse the singleton tooltip pattern from app.js (`createPinTooltipController`). On mouseenter of pin DOM element, position the tooltip near the pin's projected screen coordinates.

### 4.4 Popups

On pin click:
1. Generate popup HTML via `NCZ.buildPopupHtml()` (from Phase 0)
2. Create a DOM div with the popup content
3. Position near the pin using screen-space projection
4. The popup is a fixed-position DOM element (NOT a CSS2DObject) — this prevents it from moving with the camera

### 4.5 Clustering in 3D

Clustering is required — multiple mods target the same coordinates (e.g., apartment overhauls of base game locations). Without clustering, these pins stack on top of each other.

**Approach:** Screen-space proximity clustering, recalculated on camera change:

1. Each frame (or on camera move/zoom), project all visible pin world positions to screen coordinates
2. Group pins within a configurable pixel radius (e.g., 40px, matching Leaflet's `maxClusterRadius`)
3. When pins cluster: hide individual CSS2D pin elements, show a single cluster element with the same `.marker-cluster-step-N` CSS classes used by Leaflet (visual parity)
4. Click on cluster: show cluster panel (same `#cluster-panel` DOM element used by Leaflet view)
5. On zoom in / camera closer: clusters split as screen distance increases

**Performance:** With ~250 total pins (manual + auto-discovered), screen-space projection + distance checks is O(n^2) but n is small enough (~250^2 = 62k comparisons) to run every frame. If needed, throttle to camera change events only.

**Reuse:** The cluster panel DOM (`#cluster-panel`, `#cluster-mod-list`) is shared between both views — same HTML, same click handlers. Only the "which pins are clustered" logic differs (Leaflet uses its plugin, Three.js uses screen-space proximity).

### 4.6 Sidebar click → focus pin

```javascript
NCZ.ThreeMarkers.focusPin = function(modId) {
  const pin = pinsMap.get(modId);
  controls.target.set(pin.position.x, 0, pin.position.z);
  // Optionally animate zoom closer
  openPopup(pin);
};
```

### 4.7 Filter integration

`applyFilters()` calls `NCZ.ThreeMarkers.setVisibility(visibleModIds)` which toggles `pin.visible` on each CSS2DObject.

**Files created:** `assets/js/three-markers.js`
**Files modified:** `assets/js/app.js` (extend marker creation, filtering, sidebar click)

---

## Phase 5: Landmarks

**Goal:** Load and position all 8 landmark GLBs.

- Load in Tier 3 (after terrain + roads)
- Apply world transforms from extraction pipeline (positions and quaternion rotations documented in `docs/3dmap-asset-reference.md`)
- Material: MeshLambertMaterial, district-colored (classify by position like 2D pipeline)
- Toggle with buildings (single "Buildings" layer group)

**Files modified:** `assets/js/three-scene.js`

---

## Phase 6: Polish and Integration

### 6.1 Camera state sync on view switch

The two views use independent coordinate systems (Leaflet: 256×256 tile space from Realistic Map mod; Three.js: native CET space from game meshes). On switch:

- Leaflet → 3D: convert Leaflet center via inverse `cetToLeaflet()` to get CET coords, set Three.js camera target. Convert Leaflet zoom to camera frustum size proportionally.
- 3D → Leaflet: convert Three.js camera target CET coords via `cetToLeaflet()`, set Leaflet view.

This bridge uses the existing `cetToLeaflet()` / inverse transform — the only place both coordinate systems meet.

### 6.2 Deep link support (`?mod=123`)

URL parameter handling in app.js delegates to `NCZ.ThreeMarkers.focusPin()` when in 3D mode.

### 6.3 Theme switching in 3D

`applyThemeById()` already calls `NCZ._clearOverlayCache()`. Extend to call `NCZ.ThreeScene.updateMaterials()` which re-reads CSS vars and updates all material colors.

### 6.4 Loading indicator

Progress bar during GLB loading (terrain is 18 MB, takes a few seconds).

### 6.5 WebGL fallback

On page load: check `WebGL2RenderingContext`. If unavailable, hide "3D" option, default to satellite.

### 6.6 Keyboard/mouse parity

- Escape closes popup in 3D
- Scroll wheel = zoom (already handled by OrbitControls)
- Map controls panel works in both views

### 6.7 Contour lines (optional)

Convert `terrain_contours.json` to `THREE.Line` objects at their elevation Y values. Low priority — contours are a minor feature.

---

## Key Technical Details

### Coordinate systems — decoupled

The Three.js view and Leaflet view use **completely separate coordinate systems**. They do NOT need to agree on world extent.

**Leaflet (satellite view only):**
- Uses WORLD_MIN/MAX constants from Realistic Map mod quad UV mapping (-6298 to 5815, -7684 to 4427)
- These constants exist solely to align CET coords with the satellite tile layer pixels
- `cetToLeaflet()` projects into 256×256 tile space
- This is unchanged — satellite view works exactly as before

**Three.js (schematic view):**
- Uses CET coordinates **directly** — no projection needed
- GLB meshes are already in CET space (terrain, water, roads, buildings)
- Pins positioned at `(CET_X, CET_Z, -CET_Y)` — native game coordinates
- Camera frustum determined by the terrain mesh's actual bounding box, or TweakDB camera settings
- No dependency on the Realistic Map mod constants at all
- The camera sees whatever the game's map camera sees

New utility in utils.js:
```javascript
NCZ.cetToThree = function(cetX, cetY, cetZ) {
  return [cetX, cetZ || 0, -cetY];
};
```

**Camera frustum for Three.js:** Instead of hardcoding WORLD_MIN/MAX, compute from the loaded terrain mesh's bounding box:
```javascript
const box = new THREE.Box3().setFromObject(terrainMesh);
// Use box.min/max to set camera frustum
```
Or use TweakDB CursorBoundary values (if re-extracted) as the viewport bounds, matching the game exactly.

### Roads axis inversion

`3dmap_roads.glb` and `3dmap_metro.glb` have `-GLB_X → CET_X` (180° yaw). Apply `mesh.rotation.y = Math.PI` after loading.

### Orthographic camera zoom

Zoom = adjust frustum dimensions proportionally:
```javascript
function setZoom(level) {
  const scale = Math.pow(2, maxZoom - level);
  camera.left = -WORLD_W/2 * scale;
  camera.right = WORLD_W/2 * scale;
  camera.top = WORLD_H/2 * scale;
  camera.bottom = -WORLD_H/2 * scale;
  camera.updateProjectionMatrix();
}
```

### Theme color reading

```javascript
function readThemeColor(varName) {
  const style = getComputedStyle(document.documentElement);
  const raw = style.getPropertyValue(varName).trim();
  return new THREE.Color(raw);
}
```

---

## What Changes vs. What Stays

| Component | Changes? | Details |
|-----------|----------|---------|
| Satellite view (Leaflet) | **Minor** | Unchanged except district borders now visible on satellite too |
| Sidebar + filtering | **Minor** | Delegates to active view renderer |
| Modals (about, BBCode, etc.) | **No** | DOM-based, view-independent |
| Nexus API / services.js | **No** | Data layer, not view layer |
| Theme system | **Minor** | Extended to update Three.js materials |
| Overlay toggle buttons | **Minor** | Delegate to Three.js layer visibility when in 3D |
| Canvas overlay (overlay.js) | **No** | Still used for satellite view's terrain mode |
| Marker creation (app.js) | **Refactored** | Split into data prep + view-specific rendering |
| URL deep links | **Minor** | Delegate focus to active view |

---

## Verification Plan

### Per-phase testing

1. **Phase 0:** All existing functionality unchanged. Run `npx serve .`, verify satellite view, popups, filtering, clustering all work.
2. **Phase 1:** Switch to "3D" → see terrain/water/cliffs with hillshade. Tilt camera with right-drag. Verify no Leaflet errors when hidden.
3. **Phase 2:** Toggle roads/metro/districts in 3D view. Verify axis alignment (roads should overlay terrain correctly). District borders should match 2D view.
4. **Phase 3:** Buildings visible as 3D cubes. Tilt camera — buildings should have visible height. Brighter buildings taller. Theme switch should update colors.
5. **Phase 4:** All 207 pins visible. Hover shows tooltip. Click shows popup. Sidebar click focuses pin. Filters hide/show pins.
6. **Phase 5:** Landmarks visible (ferris wheel, obelisk, etc.) at correct positions.
7. **Phase 6:** Switch between Satellite ↔ 3D preserves approximate viewport. Deep links work. Loading indicator shows during GLB fetch.

### Visual validation

- Compare top-down 3D view with existing terrain_8k.webp — should be visually identical
- Compare building positions with satellite tile layer — pins should align
- Tilt camera — verify Morro Rock elevated platform has visible height
- Verify water doesn't flood inland (Z-buffer test)

### Performance targets

- First render (terrain only): < 5 seconds on broadband
- Full scene with buildings: < 10 seconds
- Render loop: 60 fps on discrete GPU, 30+ fps on integrated
- Memory: < 200 MB total

---

## Resolved Decisions

1. **Building heights:** Match game heights exactly. Extract actual CUBE_SIZE and HEIGHT values from `3dmap_triangle_soup.Material.json`. Each district has its own scale parameters — the build script must use these to compute per-building height in CET units.

2. **Roads borders GLB (32 MB):** Deferred to v2. `roads.glb` (6.4 MB) alone provides road surfaces. Road borders can be added later if visual feels incomplete.

3. **Default view on page load:** 3D is the default. Show loading indicator during GLB download. Satellite is the fallback for users who prefer it or lack WebGL2.

4. **Building data format:** New compact format. Build script (`scripts/build_buildings_3d.js`) extracts centroid + bounding box + height + brightness per building from `buildings.json` → `data/buildings_3d.json` (~5 MB). Each building is an individual instanced cube.
