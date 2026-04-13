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
*_data.xbm.json (WolvenKit export — 16-bit RGBA base64 in textureData.Bytes)
    ↓ loadXbmDataTexture() in three-scene.js
    ↓ Uint16 → Float32 normalised [0,1] → THREE.DataTexture (FloatType)
    ↓
GPU vertex shader reads per-instance data via gl_InstanceID + texelFetch()
    → position decoded: transMin + (transMax - transMin) × posRaw.rgb + offset
    → quaternion decoded: rotRaw * 2.0 - 1.0 (remap [0,1] → [-1,1])
    → scale decoded: sclRaw.rgb × cubeSize (half-extents)
    → full TRS applied in shader, no CPU matrix loop

*_m.xbm.json (BC4/RGTC1 compressed, 10 mip levels in textureData.Bytes)
    ↓ loadXbmMTexture() in three-scene.js
    ↓ EXT_texture_compression_rgtc → THREE.CompressedTexture (all mips, GPU decompression)
    ↓ (fallback: JS BC4 decompressor → float DataTexture, mip 0 only)
    ↓
Fragment shader samples surface detail via world-space planar UV
```

### Why this replaces the old pipeline

The old pipeline (build_buildings_3d.py → buildings_3d.json → InstancedMesh) decoded
16-bit textures through 8-bit PNG exports, introducing ~9.4 CET units of position error
for the spaceport district. At 16-bit the error is ~0.036 CET units. This was visible as
circular ring structures appearing jumbled instead of perfectly formed.

The xbm.json Bytes field contains the raw pixel data at full game precision:
- `_data.xbm`: 8 bytes/pixel (16-bit RGBA), 1 mip level — raw instance data
- `_m.xbm`: BC4 compressed, 10 mip levels — surface detail texture

No intermediate files needed. The game asset is loaded directly to GPU.

**Obsolete scripts**: `build_buildings_3d.py`, `fix_building_heights.py`
**Obsolete data**: `data/buildings_3d.json`, `assets/img/3dmap/*.png`
**New assets**: `assets/xbm/*_data.xbm.json`, `assets/xbm/*_m.xbm.json`
