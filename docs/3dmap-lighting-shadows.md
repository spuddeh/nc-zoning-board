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
| Buildings | ✓ | — | Custom depth material required (see below) |

---

## Building Shadow Casting — customDepthMaterial

Buildings use a `RawShaderMaterial` (not a standard Three.js material) and decode their positions via `gl_InstanceID + DataTexture`. This requires a matching `customDepthMaterial` for shadow casting.

### Why customDepthMaterial is needed

Three.js's default `MeshDepthMaterial` reads instance transforms from `instanceMatrix`. Building shaders ignore `instanceMatrix` — they read from `uDataTex` via `gl_InstanceID`. Without `customDepthMaterial`, the shadow pass uses zero-matrices → all instances project to the same point → no visible shadows.

### Why identity matrices are required

`THREE.InstancedMesh` computes its bounding sphere from `instanceMatrix`. With zero-initialised matrices, the bounding sphere degenerates (NaN radius). Three.js's shadow pass silently skips meshes with invalid bounding spheres, even when `castShadow = true`.

**Fix:** fill `instanceMatrix` with identity matrices at load time:

```javascript
const identity = new THREE.Matrix4();
for (let i = 0; i < instanceCount; i++) mesh.setMatrixAt(i, identity);
mesh.instanceMatrix.needsUpdate = true;
```

The shader ignores these matrices; they exist solely for Three.js's internal bounding sphere computation.

### Why frustumCulled = false is required

The bounding sphere computed from identity matrices is a unit cube at world origin (0, 0, 0) — far from Night City. Three.js would frustum-cull it out of the shadow pass. Setting `frustumCulled = false` bypasses this check.

### RGBA depth packing — critical

`PCFSoftShadowMap` reads shadow depth from **RGBA colour channels**, not the depth buffer. The default `MeshDepthMaterial` uses `RGBADepthPacking`. The `customDepthMaterial` fragment shader must output the **exact same** encoding so `unpackRGBAToDepth` in the terrain's shadow receiving shader decodes it correctly.

Three.js r170 uses a `modf`-based algorithm (from `packing.glsl.js`):

```glsl
const float PackUpscale = 256.0 / 255.0;
const float ShiftRight8 = 1.0 / 256.0;
const float Inv255     = 1.0 / 255.0;
const vec4  PackFactors = vec4(1.0, 256.0, 65536.0, 16777216.0);

void main() {
  float v = gl_FragCoord.z;
  if (v <= 0.0) { f = vec4(0.0); return; }
  if (v >= 1.0) { f = vec4(1.0); return; }
  float vuf;
  float af = modf(v * PackFactors.a, vuf);
  float bf = modf(vuf * ShiftRight8, vuf);
  float gf = modf(vuf * ShiftRight8, vuf);
  f = vec4(vuf * Inv255, gf * PackUpscale, bf * PackUpscale, af);
}
```

**Do not substitute the common `fract`-based algorithm** — it produces different byte order and every depth comparison will be wrong, causing mottled shadow acne across all terrain.

### Confirming the shadow pass reaches a mesh

Three.js r170 calls `object.onBeforeShadow()` in the shadow pass (NOT `onBeforeRender`). Use this to verify:

```javascript
mesh.onBeforeShadow = (renderer, obj, camera, shadowCamera) => {
  console.log('shadow pass reached, shadow cam near:', shadowCamera.near); // 10
};
```

If `onBeforeShadow` never fires, the mesh is being skipped (check bounding sphere and frustumCulled).

---

## Building Lambert Lighting

Buildings use a `RawShaderMaterial` with manual Lambert shading:

```glsl
// vertex shader
vWorldNormal = normalize(applyQuat(q_three, normal)); // rotate normal by instance quat

// fragment shader
float diffuse = max(dot(normalize(vWorldNormal), uSunDir), 0.0);
float light   = uAmbient + (1.0 - uAmbient) * diffuse;
vec3  color   = uBaseColor * texBrightness * light;
```

`uSunDir` and `uAmbient` are kept in sync with the directional light via `setSunPosition()`, which updates building shader uniforms alongside `_dirLight.position` and `_ambLight.intensity`.

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

## Future Work — Shadow Receiving and Road/Metro Lighting

### Buildings: switch to MeshLambertMaterial + onBeforeCompile

Buildings currently use `RawShaderMaterial` (can't receive shadows) rather than `MeshLambertMaterial` + `onBeforeCompile` (would receive shadows automatically).

The `onBeforeCompile` fragility concern ("version bumps break patch strings") doesn't hold — we're already pinned to Three.js r170 for all other materials. A version bump requires full testing anyway.

**Path to shadow receiving:**

1. Replace per-district `RawShaderMaterial` with `MeshLambertMaterial`
2. Use `onBeforeCompile` to inject custom vertex transform and UV generation:

```javascript
const mat = new THREE.MeshLambertMaterial({ map: mTex, color: baseColor });
mat.onBeforeCompile = (shader) => {
    // Add DataTexture uniforms
    shader.uniforms.uDataTex  = { value: dataTex };
    shader.uniforms.uBlockW   = { value: blockW };
    shader.uniforms.uTransMin = { value: new THREE.Vector3(...meta.transMin) };
    shader.uniforms.uTransMax = { value: new THREE.Vector3(...meta.transMax) };
    shader.uniforms.uOffset   = { value: new THREE.Vector2(...meta.offset) };
    shader.uniforms.uCubeSize = { value: meta.cubeSize };

    // Replace Three.js's vertex transform with DataTexture-based instancing
    shader.vertexShader = shader.vertexShader
        .replace('#include <begin_vertex>', `/* DataTexture TRS decode via gl_InstanceID */`)
        .replace('#include <project_vertex>', `gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);`);
};
mat.receiveShadow = true; // Three.js injects shadow sampling automatically
```

3. Set `mesh.receiveShadow = true`
4. The `customDepthMaterial` for shadow casting stays unchanged

**Benefits:** buildings receive shadows from terrain, cliffs, and each other. Lambert shading and edge highlight would need to move into the `onBeforeCompile` patches, but the shadow system comes free.

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
