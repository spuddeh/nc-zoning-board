# Three.js 3D Scene — Coordinate System Reference

Everything discovered about how CP2077's 3D map assets relate to CET game coordinates and how they should map into Three.js.

## The Three Coordinate Systems

### A. CET / Gameplay Coordinates
What `GetPlayer():GetWorldPosition()` returns. What mod authors use. What our location JSON files store.
- **X** = east/west
- **Y** = north/south  
- **Z** = height above sea level (elevation)
- World extent: X[-6298, 5815], Y[-7684, 4427], Z[0, ~500]
- This is our **source of truth** — all NC Zoning Board data uses CET coordinates.

### B. GLB / Engine Rendering Coordinates
What the WolvenKit-exported GLB meshes (terrain, roads, water, cliffs, metro) use internally.
- **GLB_X** = CET_X (east/west, same axis, same units, same origin)
- **GLB_Z** = -CET_Y (north/south, negated)
- **GLB_Y** = elevation (height) — positive Y is upward (correct rendering)
- Terrain bbox: X[-8000, 8000], Y[-99, 879], Z[-8000, 8001]
- The terrain covers MORE area than the CET world bounds (extra ocean and outer badlands). CET coordinates sit inside the terrain's XZ range at 1:1 scale — **there is no scaling factor**, the terrain just extends further.

### C. Building Instance Texture Coordinates
Decoded from `*_data.png` textures via `TRANS_MIN/MAX` and `CUBE_SIZE` values.
- Position: `cetX = TRANS_MIN_X + (TRANS_MAX_X - TRANS_MIN_X) * R_channel + DISTRICT_OFFSET_X`
- Position: `cetY = TRANS_MIN_Y + (TRANS_MAX_Y - TRANS_MIN_Y) * G_channel + DISTRICT_OFFSET_Y`
- Position: `cetZ = TRANS_MIN_Z + (TRANS_MAX_Z - TRANS_MIN_Z) * B_channel` (no Z offset)
- Scale: `half_width = R_scale * CUBE_SIZE`, `half_depth = G_scale * CUBE_SIZE`, `half_height = B_scale * CUBE_SIZE`
- Rotation: quaternion from Block 2, used for yaw extraction
- These decode directly to **CET coordinates** — verified against player CET Z positions (within 1–6 units).

## Coordinate System Validation

The GLB Y axis correctly represents elevation (positive = upward). Terrain and building positions render at the correct heights with proper shading and ordering.

## Verified Data Relationships

### CET XZ vs Terrain GLB XZ
Terrain GLB XZ coordinates ARE CET coordinates at 1:1 scale. The "1.32× ratio" previously observed was simply the terrain mesh extending 1700 units beyond the CET playable bounds on each side (ocean/outer terrain). Verified by:
- District borders (CET coordinates) aligning correctly with terrain features
- Building XY positions matching in-game map layout exactly (Biotechnica Flats diagonal rows)
- Known CET locations (Koi Fish, Pier, Nash Hideout) corresponding to correct terrain positions

### CET Z vs Terrain GLB Y (elevation)
These are NOT in the same units. Measured at 3 ground-truth locations:

| Location | Player CET Z | Building cetZ | Terrain GLB Y (raycast) | Gap |
|----------|-------------|---------------|------------------------|-----|
| Pier (Heywood) | 7.8 | 2.0 | -0.13 | ~8m |
| Koi Fish (City Center) | 30.3 | 29.0 | 7.13 | ~23m |
| Nash Hideout (Badlands) | 68.2 | 85.7 | 60.98 | ~7m |

The gap varies because the terrain mesh represents the **geological base** (rock, soil), while CET Z and building cetZ represent the **gameplay surface** (which includes elevated concrete platforms, bridges, pier structures). The 23m gap at City Center is the height of the Corpo Plaza elevated platform.

### Building Rotation
Buildings have per-instance quaternion rotations (Block 2 of instance texture). All four components (qx, qy, qz, qw) are kept — pitch and roll are used by the game shader to form non-upright primitives (wedges, ramps, bridges, gap-fillers), not just upright buildings.

Applied in Three.js with CET→Three.js axis remapping:

```javascript
dummy.quaternion.set(gQx, gQz, -gQy, gQw);
// CET X → Three.js X (unchanged)
// CET Z → Three.js Y (CET up becomes Three.js up)
// CET Y → Three.js -Z (CET north becomes Three.js -forward)
```

Verified: yaw-only case (gQx≈0, gQy≈0) reduces to `set(0, sin(θ/2), 0, cos(θ/2))` — a pure Three.js Y rotation matching the previously verified Biotechnica Flats orientation.

## The HLSL Shader (`minimap_instance_shader.hlsl`)

The game's vertex shader decodes building positions from the instance texture and transforms them through matrix `_25_m0` (entity world transform, a runtime constant buffer we can't export from WolvenKit). Key lines:

```hlsl
// Decode instance center from texture
_243 = (TRANS_RANGE_X * texture_R) + TRANS_MIN_X;  // center X
_244 = (TRANS_RANGE_Y * texture_G) + TRANS_MIN_Y;  // center Y (CET north)
_245 = (TRANS_RANGE_Z * texture_B) + TRANS_MIN_Z;  // center Z (elevation)

// Apply cube vertex offset (rotated + scaled by CUBE_SIZE)
_414 = vertex_offset_x * CUBE_SIZE + _243;
_415 = vertex_offset_y * CUBE_SIZE + _244;
_416 = vertex_offset_z * CUBE_SIZE + _245;

// Transform through world matrix (_25_m0) then view-projection (_15_m0)
```

The `_25_m0` matrix handles the CET→engine coordinate conversion that we bypass.

## Available Texture Assets

In `map_data_export/source/raw/base/worlds/03_night_city/sectors/`:

| File | Size | Format | Description |
|------|------|--------|-------------|
| `world_map_albedo.png` | 2.1 MB | 1008×1016 RGBA | Base color texture |
| `world_map_depth.png` | 243 KB | 1008×1016 Greyscale | Height/elevation map |
| `world_map_normal.png` | 1.5 MB | 1008×1016 RGBA | Normal map |

The depth map provides CET Z approximations at any XY location (linear fit: `CET_Z ≈ 0.83 * pixel_value - 7.6`, errors ±5 units).

## Decompiled Script References

From `cyberpunk-decompiled-scripts/cyberpunk/UI/fullscreen/map/worldMap.swift`:
- Camera modes: TopDown (orthographic) and ZoomLevels
- Max tilt: ~70° (TweakDB maxPolarAngle)
- Default yaw: -45° (game map rotated 45° from north, we use 0° = north-up)
- Zoom range: 800 (in) to 15000 (out), default 3000
- District view states: None, Districts, SubDistricts

## Current Data Pipeline

```
*_data.png + *_m.png (WolvenKit export)
    ↓ build_buildings_3d.py (decode position/rotation/scale from _data, brightness from _m)
    ↓
data/buildings_3d.json [cetX, cetY, cetZ, width, depth, height, brightness, districtIdx, qx, qy, qz, qw]
    ↓
three-scene.js loadBuildings() → InstancedMesh with full quaternion rotation per instance
```

`fix_building_heights.py` (terrain raycast) was removed from the pipeline. The game shader
places cubes directly from decoded texture coordinates without any terrain intersection.
The cetZ field is the cube center in CET world space — used directly as Three.js Y.
