# Phase 3 Fix Plan: Scene Group Rotation

## ⚠️ Status: Superseded

**This plan proposed a complex scene group rotation. A simpler solution was found: changing the camera's up vector from `(0,0,-1)` to `(0,1,0)` fixed the issue completely, without any coordinate system changes.**

See `three-js-scene.js` line 112 and the commit history for the actual implementation.

---

## Problem (Original)

The camera `up=(0,0,-1)` inverts the Y axis on screen when tilted. Buildings and terrain elevation both appear upside down from any non-top-down angle. This is unfixable by negating individual Y values — it requires changing which axis represents elevation in the Three.js scene.

## Solution
Rotate the entire scene 90° around the X axis so that **elevation (GLB_Y) maps to Three.js Z** instead of Y. The camera then uses standard `up=(0,1,0)` and OrbitControls work naturally.

### Axis mapping after rotation

```
BEFORE (current, broken when tilted):
  Three.js X = CET_X (east)          — screen horizontal ✓
  Three.js Y = GLB_Y = elevation     — inverted on screen when tilted ✗
  Three.js Z = -CET_Y (south)        — depth when top-down

AFTER (scene group rotation -90° around X):
  Three.js X = CET_X (east)          — screen horizontal ✓
  Three.js Y = -GLB_Z = CET_Y (north) — screen vertical when tilted ✓
  Three.js Z = GLB_Y = elevation      — depth when top-down, screen vertical never inverted ✓
```

Rotation matrix for -90° around X: `(x, y, z) → (x, z, -y)`
- old GLB (X, Y_elev, Z_neg_north) → new (X, Z_neg_north, -Y_elev) = (CET_X, -CET_Y, -elevation)

### Camera setup
```javascript
// Camera above the scene looking down -Z (elevation axis)
camera.position.set(WORLD_CX, -WORLD_CY, -10000); // X=CET_X centre, Y=-CET_Y centre, Z=high negative
camera.lookAt(WORLD_CX, -WORLD_CY, 0);
camera.up.set(0, 1, 0);  // standard Three.js up — north (+CET_Y = +Y after rotation) is up on screen
```

Note: camera Z is NEGATIVE because elevation after rotation is -GLB_Y. Mountains at GLB_Y=879 → Z=-879. Camera needs to be at Z < -879 to see from above. Use Z=-10000.

### OrbitControls
```javascript
controls.mouseButtons = { LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE };
controls.minPolarAngle = 0;            // top-down (looking straight down -Z)
controls.maxPolarAngle = Math.PI * 0.39; // ~70° max tilt
controls.enableDamping = true;
controls.screenSpacePanning = true;
controls.target.set(WORLD_CX, -WORLD_CY, 0);
```

### Hillshade light direction
Original: `SUN_DIR = (-1, 1.5, -1)` in old space (X, Y_elev, Z_neg_north)
After rotation: `SUN_DIR = (-1, -1, -1.5)` in new space (X, Y_neg_north, Z_neg_elev)

Or more precisely: apply the same rotation to the light direction vector.

## Implementation Checklist

### Step 1: Create scene root group
```javascript
const sceneRoot = new THREE.Group();
sceneRoot.rotation.x = -Math.PI / 2;
scene.add(sceneRoot);
```
Add ALL visual objects to `sceneRoot` instead of `scene`:
- terrainScene, waterScene, cliffsScene
- roadsGroup, metroGroup
- district line groups (districts, subdistricts)
- building InstancedMesh

### Step 2: Update camera and controls
- Camera position: `(WORLD_CX, -WORLD_CY, -10000)`
- Camera lookAt: `(WORLD_CX, -WORLD_CY, 0)`
- Camera up: `(0, 1, 0)`
- Camera near/far: keep large range (-50000, 50000)
- Controls target: `(WORLD_CX, -WORLD_CY, 0)`

### Step 3: Update fitCameraToBox
After getting the terrain bbox (which is in the ROTATED group space):
```javascript
const box = new THREE.Box3().setFromObject(terrainScene);
// box is in group-local space. In world space after rotation:
// world_X = local_X, world_Y = local_Z, world_Z = -local_Y
const worldCenter = new THREE.Vector3(center.x, center.z, -center.y);
// frustum based on max(size.x, size.z) in LOCAL space = max(size.x, size.y) in WORLD space
```

### Step 4: Update resetCamera
Same logic as fitCameraToBox but with WORLD constants.

### Step 5: Building positions
Buildings are added to `sceneRoot`, so their positions are in **group-local space** = the OLD coordinate system:
```javascript
// In group-local space (old system):
dummy.position.set(cetX, surfY + h/2, -cetY);
// The group rotation converts this to world space automatically
```
**No position changes needed for buildings** — they use the same coordinates as before, the group rotation handles the conversion.

### Step 6: District line positions
District lines are also in `sceneRoot`. Their CET polygon points currently use:
```javascript
// buildLine: positions.push(pt[0], 0, -pt[1]);  // X, Y=0, Z=-cetY
```
**No changes needed** — same group-local coordinates, group rotation converts.

### Step 7: Update tilt display
With standard up=(0,1,0) and looking down -Z:
- Polar angle 0 = looking along +Y (from south) = max tilt
- Polar angle π/2 = looking along -Z (top-down)
```javascript
const tilt = Math.round((Math.PI/2 - controls.getPolarAngle()) * 180 / Math.PI);
```

### Step 8: Test
- Top-down: terrain geography correct, buildings visible on terrain
- Tilt: mountains go UP, buildings extend UP from terrain
- District borders align with terrain features
- Roads/metro overlay correctly
- Building rotation (yaw) matches in-game map
- Reset view returns to top-down at 0° tilt

### Step 9: Revert experimental changes
Remove ALL Y-flip code from three-scene.js:
- Remove vertex Y negation loops
- Remove face winding flip loops
- Remove `scale.y = -1`
- Remove `depthTest: false` on building material
- Restore `SUN_DIR = (-1, 1.5, -1)` (will be re-derived for the new space in step 2)
- Regenerate buildings_3d.json without negated terrain Y

## Risk
The group rotation adds one matrix multiplication per frame for every object in the group. With 254k instanced buildings this is negligible — InstancedMesh renders in ~5 draw calls regardless of the parent transform.

## What NOT to Change
- `build_buildings_3d.py` — building extraction stays in CET space
- `fix_building_heights.py` — terrain raycast stays in GLB space (buildings_3d.json stores raw terrain Y, not negated)
- `overlay.js` — Leaflet SAT district borders don't change
- `data/subdistricts.json` — CET coordinates, unchanged
- `constants.js` — all CET constants unchanged
