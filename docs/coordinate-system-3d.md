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
- **GLB_Y** = elevation (height) — **but inverted: positive Y = downward in the rendered scene**
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

## Key Finding: GLB Y Axis Is Inverted

Confirmed experimentally by placing test cubes at known Y values:
- **Red cube at Y=-500: appeared ABOVE terrain on screen**
- **Green cube at Y=500: appeared BELOW terrain on screen**

This means positive GLB_Y renders downward in our Three.js scene. Mountains (high GLB_Y) appear as valleys and valleys (low GLB_Y) appear as mountains when the camera is tilted.

### Why This Happens
The camera is set up with `camera.up = (0, 0, -1)` to put CET north (+CET_Y = -GLB_Z) at the top of the screen. This works perfectly for top-down viewing. But when OrbitControls tilts the camera, the `up` vector interacts with the polar angle to invert the Y axis on screen — higher Y values map to lower screen positions.

### Why `scale.y = -1` Doesn't Fix It
Applying `scale.y = -1` to GLB meshes flips the face winding, turning the mesh inside-out. With `DoubleSide` materials the faces still render but the geometry itself is inverted — convex shapes become concave, mountains become craters.

Negating vertex Y positions and flipping face winding also fails because the terrain becomes geographically scrambled (water renders above terrain).

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
Buildings have per-instance quaternion rotations (Block 2 of instance texture). The yaw angle extracted via:
```python
yaw = atan2(2*(qw*qz + qx*qy), 1 - 2*(qy**2 + qz**2))
```
Applied in Three.js as `dummy.rotation.y = yaw` (positive yaw, not negated).

Verified: Biotechnica Flats diagonal building rows match the in-game map orientation exactly.

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
*_data.png (WolvenKit export)
    ↓ build_buildings_3d.py (decode + yaw + brightness from _m texture)
    ↓
data/buildings_3d.json [cetX, cetY, cetZ, width, depth, height, brightness, districtIdx, yaw]
    ↓ fix_building_heights.py (raycast terrain GLB → replace cetZ with terrain surface Y)
    ↓
data/buildings_3d.json [cetX, cetY, terrainY, width, depth, height, brightness, districtIdx, yaw]
    ↓
three-scene.js loadBuildings() → InstancedMesh with position, rotation, scale per instance
```
