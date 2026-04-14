# 3D Map — Lighting and Shadows

Reference for the sun/shadow/lighting system in the Three.js schematic view.

---

## Sun and Ambient Light

The scene uses a single `DirectionalLight` (sun) and an `AmbientLight`.

```javascript
const SUN_DIR  = new THREE.Vector3(-1, 1.5, -1).normalize(); // default NW direction
const AMBIENT_INTENSITY = 0.35;

_dirLight = new THREE.DirectionalLight(0xffffff, 1.0 - AMBIENT_INTENSITY);
_dirLight.position.copy(SUN_DIR).multiplyScalar(8000);
_dirLight.target.position.set(WORLD_CX, 0, -WORLD_CY); // Night City centre

_ambLight = new THREE.AmbientLight(0xffffff, AMBIENT_INTENSITY);
```

### Updating sun position

`NCZ.ThreeScene.setSunPosition(azimuthRad, altitudeRad)` repositions the light and updates:

- Light position and intensity (dims near horizon, full above ~30°)
- Light colour (warm orange at horizon → neutral white above ~20°)
- `_dirLight.castShadow` (disabled below 5° elevation to avoid degenerate shadow projections)
- Building shader `uSunDir` / `uAmbient` uniforms (kept in sync so building Lambert shading matches terrain/water)
- Current azimuth/altitude stored in `_sunAz` / `_sunEl` for `getCameraState()`

The showcase flyover drives `setSunPosition()` automatically during its animation.

### TweakDB camera reference

From `map_data_export/source/raw/nczoning_tweakdb_map_data.json`:

| Parameter | Value | Notes |
|-----------|-------|-------|
| Default yaw | -45° | Web map uses 0° (north-up) instead |
| Yaw range | -85° to -30° | |
| Zoom | 800–10500, default 3000 | |
| FOV | 25 (fixed) | |
| Camera tilt | Varies with zoom (`pitchRelativeToZoom: 1`) | Not purely top-down |

---

## Shadow Map Setup

```javascript
renderer.shadowMap.enabled = true;
renderer.shadowMap.type    = THREE.PCFSoftShadowMap;

_dirLight.shadow.mapSize.set(4096, 4096);
_dirLight.shadow.camera.left   = -7000;
_dirLight.shadow.camera.right  =  7000;
_dirLight.shadow.camera.top    =  7000;
_dirLight.shadow.camera.bottom = -7000;
_dirLight.shadow.camera.near   =    10;
_dirLight.shadow.camera.far    = 25000;
_dirLight.shadow.bias          = -0.001;
_dirLight.shadow.normalBias    =  0.02;
```

Shadows are toggled via a UI checkbox (`setShadowsEnabled()`). They are automatically disabled when the sun elevation is below 5° to avoid infinitely long projections.

### Which objects cast and receive shadows

| Object | castShadow | receiveShadow | Notes |
|--------|-----------|---------------|-------|
| Terrain | ✓ | ✓ | Full shadow support via MeshLambertMaterial |
| Water | — | ✓ | Receives terrain shadows, doesn't cast |
| Cliffs | ✓ | ✓ | Full shadow support |
| Roads | — | — | MeshBasicMaterial — no shadow involvement |
| Metro | — | — | MeshBasicMaterial — no shadow involvement |
| Buildings | ✓ | ✓ | MeshLambertMaterial — standard shadow support |

---

## Building Lighting and Shadows

Buildings use `MeshLambertMaterial` with `onBeforeCompile` patches. Standard Three.js
handles shadow casting (`castShadow = true`) and receiving (`receiveShadow = true`)
automatically via the default `MeshDepthMaterial` — no `customDepthMaterial` needed.

Lambert shading responds to scene lights automatically. `setSunPosition()` updates
`_dirLight` and `_ambLight`; buildings pick up the changes with no extra uniform syncing.

The `onBeforeCompile` patches add:
1. **World-space planar UV** — computed from `instanceMatrix * vertex` world position in
   the `project_vertex` chunk, sent as `vMUv` to the fragment shader
2. **`_m.dds` surface modulation** — `diffuseColor.rgb *= 0.3 + mVal * 0.7` in
   `color_fragment`, applied before Lambert lighting
3. **Edge highlight** — injected after `output_fragment` using `vLocalUv` (BoxGeometry
   face UV) and the `uEdgeColor / uEdgeThickness / uEdgeSharpness` uniforms

---

### Historical: RawShaderMaterial + customDepthMaterial (Gen 2 — replaced)

The previous GPU instancing approach used `RawShaderMaterial` with `gl_InstanceID` +
`texelFetch()` to decode instance data directly in the vertex shader. This required:

- **`customDepthMaterial`** with a custom vertex shader — default `MeshDepthMaterial`
  reads `instanceMatrix` which was unused, so all shadows projected to origin
- **Identity matrices** to give Three.js a valid bounding sphere (zero matrices → NaN
  bounding sphere → shadow pass silently skips the mesh)
- **`frustumCulled = false`** because identity-matrix bounding sphere is at world origin
- **Exact `packDepthToRGBA` algorithm** matching Three.js's `modf`-based implementation
  from `packing.glsl.js` — the common `fract`-based substitute produces mismatched byte
  order causing mottled shadow acne across all terrain

All of these workarounds are eliminated by the DDS + CPU matrix + `MeshLambertMaterial`
pipeline.

---

## Camera State API

```javascript
// Capture camera position + sun state (copy to clipboard)
copy(JSON.stringify(NCZ.ThreeScene.getCameraState()));
// → { target, position, zoom, polar, azimuth, sunAz, sunEl }

// Restore
NCZ.ThreeScene.setCameraState(JSON.parse('...'));
// Restores camera orbit AND calls setSunPosition(sunAz, sunEl)
```

Useful for taking consistent comparison screenshots. If the showcase flyover is running, pause it before restoring sun state — the flyover will override it on the next tick.

---

## Future Work — Road/Metro Lighting

### ~~Buildings: switch to MeshLambertMaterial + onBeforeCompile~~ ✅ Done

Buildings now use `MeshLambertMaterial` + `onBeforeCompile` with CPU matrix decode from
DDS files. Shadow casting and receiving both work. See `buildBuildingMaterial()` in
`three-scene.js`.

### Roads and Metro: switch to MeshLambertMaterial

Roads and metro currently use `MeshBasicMaterial` — they don't respond to the directional light at all. On a tilted camera they look flat compared to Lambert-shaded terrain.

**Path:**

```javascript
roadsMat = new THREE.MeshLambertMaterial({
    color: readThemeColor('--overlay-road-color', '#504b41'),
    flatShading: true,
});
roadsScene.traverse(c => {
    if (c.isMesh) {
        c.material = roadsMat;
        c.castShadow    = true;  // roads cast shadows onto terrain below (bridges, elevated)
        c.receiveShadow = true;  // roads receive building shadows
    }
});
```

**Note on elevated roads:** `3dmap_roads.glb` contains elevated road segments (bridges, overpasses). These would cast visible shadows onto terrain beneath them — a real visual improvement. Metro tracks similarly sit on elevated structures in some districts.

**Theme update:** `updateMaterials()` already handles `roadsMat` and `metroMat` via `.color.copy()`. Switching material type requires updating those references.

Shadow casting on roads is particularly worthwhile — elevated road sections are some of the most visually prominent structures in the city and their shadows would significantly improve depth perception on the tilted view.
