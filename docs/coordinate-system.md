# Coordinate System

## Overview

The map uses two coordinate systems that are linked by a simple linear transform:

1. **CET Coordinates** — the in-game `[X, Y]` values from Cyber Engine Tweaks
2. **Leaflet Coordinates** — the `[lat, lng]` values used internally by the map

Mod authors only need to know CET coordinates. The app handles the conversion automatically.

## Getting CET Coordinates

### Using Cyber Engine Tweaks (CET)

1. Install [Cyber Engine Tweaks](https://www.nexusmods.com/cyberpunk2077/mods/107)
2. In-game, press `~` to open the CET console
3. Run: `print(GetPlayer():GetWorldPosition())`
4. Note the **X** and **Y** values (ignore Z — that's height)

### Using Simple Location Manager (Recommended)

[Simple Location Manager](https://www.nexusmods.com/cyberpunk2077/mods/26454) (SLM) is a CET mod that lets you save, name, and teleport to locations.

## World Extent

The full 8192×8192 pixel canvas maps to this CET area:

```
WORLD_MIN_X = -6298    WORLD_MAX_X = 5815     (width:  12113 CET units)
WORLD_MIN_Y = -7684    WORLD_MAX_Y = 4427     (height: 12111 CET units)
Centre: (-242, -1628)
```

**Source:** The [Realistic Map 8k mod](https://www.nexusmods.com/cyberpunk2077/mods/17811) replaces the game's 5-submesh terrain with a single 4-vertex quad. This quad's UV→world mapping defines the authoritative projection for the satellite image (`night_city_8k_transparent.png`) and our terrain tiles. The quad uses `CET_Y = -GLB_Z` (flipped Y vs base game meshes).

The base game's 5-submesh terrain has inconsistent per-submesh UV mappings (±130 CET unit std dev), making them unusable for a single linear projection. The mod author's clean quad is the correct reference.

**Note:** TweakDB `WorldMap.DefaultSettings.CursorBoundary` values (-5500,-7300)→(6050,5000) define the in-game **pan limit** (how far the player can scroll the map), NOT the render extent. The camera can view beyond those bounds.

## The Transform

### Formulas

The mapping is a simple linear transform derived from the world extent constants. Latitude depends only on CET Y, and longitude depends only on CET X:

```
Leaflet lng = (CET_X − WORLD_MIN_X) / (WORLD_MAX_X − WORLD_MIN_X) × 256
Leaflet lat = (CET_Y − WORLD_MAX_Y) / (WORLD_MAX_Y − WORLD_MIN_Y) × 256
```

Which expands to:

```
Leaflet lng = (CET_X + 6298) / 12113 × 256 = 0.02113734 × CET_X + 133.1548
Leaflet lat = (CET_Y − 4427) / 12111 × 256 = 0.02113385 × CET_Y − 93.5662
```

Inverse:

```
CET_X = lng / 256 × 12113 + (−6298) = (lng − 133.1548) / 0.02113734
CET_Y = lat / 256 × 12111 + 4427    = (lat + 93.5662) / 0.02113385
```

### Implementation

In `constants.js` and `utils.js` (exposed as `NCZ.cetToLeaflet`):

```javascript
// constants.js
NCZ.WORLD_MIN_X = -6298;
NCZ.WORLD_MAX_X =  5815;
NCZ.WORLD_MIN_Y = -7684;
NCZ.WORLD_MAX_Y =  4427;

// utils.js
NCZ.cetToLeaflet = function (cetX, cetY) {
  const lng = (cetX - NCZ.WORLD_MIN_X) / (NCZ.WORLD_MAX_X - NCZ.WORLD_MIN_X) * 256;
  const lat = (cetY - NCZ.WORLD_MAX_Y) / (NCZ.WORLD_MAX_Y - NCZ.WORLD_MIN_Y) * 256;
  return [lat, lng];
};
```

Python equivalent in `scripts/map_constants.py`:

```python
def cet_to_leaflet(cet_x, cet_y):
    lng = (cet_x - WORLD_MIN_X) / WORLD_WIDTH * LEAFLET_EXTENT
    lat = (cet_y - WORLD_MAX_Y) / WORLD_HEIGHT * LEAFLET_EXTENT
    return [lat, lng]
```

### Leaflet Coordinate Space

The map uses `L.CRS.Simple` — a flat, non-geographic coordinate reference system. The 8192×8192px image is mapped to:

- **Latitude:** −256 (bottom/south) to 0 (top/north)
- **Longitude:** 0 (left/west) to 256 (right/east)

## How the World Extent Was Derived

### Previous approach (legacy)

The original transform was calibrated from a 16-point in-game survey grid (see below). This gave coefficients that were close but not exact, with ±12 lat / ±44 lng measurement noise at map edges.

### Current approach (from game data)

The Realistic Map 8k mod's terrain mesh is a 4-vertex quad with exact UV coordinates:

| Vertex | UV | CET_X (GLB_X) | CET_Y (-GLB_Z) |
|--------|-----|-------|-------|
| Top-left | (0, 0) | -6298 | 4427 |
| Top-right | (1, 0) | 5815 | 4427 |
| Bottom-left | (0, 1) | -6298 | -7684 |
| Bottom-right | (1, 1) | 5815 | -7684 |

UV (0,0) = top-left of the texture = pixel (0,0) = Leaflet (0, 0) = CET (-6298, 4427).

This gives a mathematically exact linear mapping — no calibration noise. The centre (-242, -1628) is within 10 CET units of the old 16-point calibration, validating both approaches independently.

### Why not TweakDB bounds?

TweakDB `WorldMap.DefaultSettings` has `CursorBoundaryMin` (-5500, -7300) and `CursorBoundaryMax` (6050, 5000). These define the in-game **pan limit** — how far the player can scroll the map. The actual rendered area extends beyond these limits, as confirmed by comparing terrain renders at different extents against the satellite image overlay.

### Why not base game terrain mesh UVs?

The base game's terrain mesh has 5 overlapping submeshes, each with slightly different UV→world linear mappings (±130 CET unit std dev across submeshes). There is no single correct linear projection from these UVs. The mod author solved this by replacing the mesh with a clean quad.

## Legacy Calibration Data

### 16-Point Grid Survey

The original transform was calibrated by placing 16 markers in a 4×4 grid on the Leaflet map, then visiting each location in-game to record CET coordinates using Simple Location Manager.

| # | Leaflet (lat, lng) | CET (X, Y) |
|---|-------------------|-------------|
| 1 | (−500, −1500) | (−2268.28, −2393.62) |
| 2 | (−500, −500) | (−924.68, −2378.91) |
| 3 | (−500, 500) | (455.64, −2394.80) |
| 4 | (−500, 1500) | (1818.54, −2406.42) |
| 5 | (500, −1500) | (−2267.30, −868.50) |
| 6 | (500, −500) | (−900.01, −871.98) |
| 7 | (500, 500) | (432.02, −880.76) |
| 8 | (500, 1500) | (1800.93, −881.22) |
| 9 | (1500, −1500) | (−2265.67, 661.54) |
| 10 | (1500, −500) | (−918.30, 654.03) |
| 11 | (1500, 500) | (457.61, 669.93) |
| 12 | (1500, 1500) | (1777.27, 640.55) |
| 13 | (2500, −1500) | (−2293.66, 2170.64) |
| 14 | (2500, −500) | (−904.17, 2162.13) |
| 15 | (2500, 500) | (443.61, 2172.88) |
| 16 | (2500, 1500) | (1874.82, 2182.31) |

> **Note:** The Leaflet coordinates in this table reference the **original calibration bounds** (`[-4000, -4500]` to `[4000, 4500]`), not the current tile bounds. The transform coefficients were scaled to the tile coordinate system (`[-256, 0]` to `[0, 256]`).

This data is preserved for reference. The current coordinate system is derived from the mod quad UV mapping (see above), which matches the calibration data within 10 CET units.

### Importing the Calibration Preset

A pre-built SLM preset containing all 16 calibration grid points is available for validation:

1. Install Simple Location Manager
2. Open the SLM interface in-game
3. Click **Import**
4. Paste the following export string:

<details>
<summary>Click to expand export string</summary>

```
eyJjYXRlZ29yaWVzIjpbeyJuYW1lIjoiTkMgWm9uaW5nIiwiaWNvbiI6IkZsb29yUGxhbiJ9LHsibmFtZSI6Ik5DIFpvbmluZyIsImljb24iOiJGbG9vclBsYW4ifSx7Im5hbWUiOiJOQyBab25pbmciLCJpY29uIjoiRmxvb3JQbGFuIn0seyJuYW1lIjoiTkMgWm9uaW5nIiwiaWNvbiI6IkZsb29yUGxhbiJ9LHsibmFtZSI6Ik5DIFpvbmluZyIsImljb24iOiJGbG9vclBsYW4ifSx7Im5hbWUiOiJOQyBab25pbmciLCJpY29uIjoiRmxvb3JQbGFuIn0seyJuYW1lIjoiTkMgWm9uaW5nIiwiaWNvbiI6IkZsb29yUGxhbiJ9LHsibmFtZSI6Ik5DIFpvbmluZyIsImljb24iOiJGbG9vclBsYW4ifSx7Im5hbWUiOiJOQyBab25pbmciLCJpY29uIjoiRmxvb3JQbGFuIn0seyJuYW1lIjoiTkMgWm9uaW5nIiwiaWNvbiI6IkZsb29yUGxhbiJ9LHsibmFtZSI6Ik5DIFpvbmluZyIsImljb24iOiJGbG9vclBsYW4ifSx7Im5hbWUiOiJOQyBab25pbmciLCJpY29uIjoiRmxvb3JQbGFuIn0seyJuYW1lIjoiTkMgWm9uaW5nIiwiaWNvbiI6IkZsb29yUGxhbiJ9LHsibmFtZSI6Ik5DIFpvbmluZyIsImljb24iOiJGbG9vclBsYW4ifSx7Im5hbWUiOiJOQyBab25pbmciLCJpY29uIjoiRmxvb3JQbGFuIn0seyJuYW1lIjoiTkMgWm9uaW5nIiwiaWNvbiI6IkZsb29yUGxhbiJ9XSwidHlwZSI6ImJhdGNoIiwiZGF0YSI6W3siZGVzYyI6IkNhbGlicmF0aW9uIHBvaW50IiwiYyI6Ik5DIFpvbmluZyIsInAiOlstMjI2OC4yOCwtMjM5My42MTcsNDUuMl0sInIiOi0yOS40NTYsInMiOjE1LCJpIjoiMTc3MjU4Mzk2NS0zMTc4IiwiZCI6NiwibiI6IiMwMSJ9LHsiZGVzYyI6IkNhbGlicmF0aW9uIHBvaW50IiwiYyI6Ik5DIFpvbmluZyIsInAiOlstOTI0LjY3NywtMjM3OC45MDcsMTQuMjM0XSwiciI6LTMwLjM2OSwicyI6MjQsImkiOiIxNzcyNTg0MTQ2LTM0OTciLCJkIjo3LCJuIjoiIzAyIn0seyJkZXNjIjoiQ2FsaWJyYXRpb24gcG9pbnQiLCJjIjoiTkMgWm9uaW5nIiwicCI6WzQ1NS42MzUsLTIzOTQuODAzLDE3OS4yMV0sInIiOjIxLjAyNCwicyI6MTQsImkiOiIxNzcyNTg0MzEzLTkwNDQiLCJkIjo1LCJuIjoiIzAzIn0seyJkZXNjIjoiQ2FsaWJyYXRpb24gcG9pbnQiLCJjIjoiTkMgWm9uaW5nIiwicCI6WzE4MTguNTQxLC0yNDA2LjQyNCwyMzMuNTk2XSwiciI6MzAuNjAzLCJzIjoyMCwiaSI6IjE3NzI1ODQ0OTEtNDU2MyIsImQiOjcsIm4iOiIjMDQifSx7ImRlc2MiOiJDYWxpYnJhdGlvbiBwb2ludCIsImMiOiJOQyBab25pbmciLCJwIjpbLTIyNjcuMzA1LC04NjguNTA0LDY3LjU4Ml0sInIiOjkzLjkwNiwicyI6MTAsImkiOiIxNzcyNTg0NjM0LTk4NTQiLCJkIjo0LCJuIjoiIzA1In0seyJkZXNjIjoiQ2FsaWJyYXRpb24gcG9pbnQiLCJjIjoiTkMgWm9uaW5nIiwicCI6Wy05MDAuMDA3LC04NzEuOTgzLC0wLjkyMV0sInIiOjQ0LjM4LCJzIjoxMywiaSI6IjE3NzI1ODQ3NTktNjExNyIsImQiOjUsIm4iOiIjMDYifSx7ImRlc2MiOiJDYWxpYnJhdGlvbiBwb2ludCIsImMiOiJOQyBab25pbmciLCJwIjpbNDMyLjAxNywtODgwLjc2MiwyNC42MDRdLCJyIjowLjc2NSwicyI6MTQsImkiOiIxNzcyNTg0ODYxLTc1MTQiLCJkIjo1LCJuIjoiIzA3In0seyJkZXNjIjoiQ2FsaWJyYXRpb24gcG9pbnQiLCJjIjoiTkMgWm9uaW5nIiwicCI6WzE4MDAuOTI2LC04ODEuMjE2LDU4LjI5NF0sInIiOjIyLjQ3MiwicyI6MjMsImkiOiIxNzcyNTg0OTk3LTE0ODMiLCJkIjo3LCJuIjoiIzA4In0seyJkZXNjIjoiQ2FsaWJyYXRpb24gcG9pbnQiLCJjIjoiTkMgWm9uaW5nIiwicCI6Wy0yMjY1LjY2Nyw2NjEuNTM5LC0wLjkxOV0sInIiOi0xNzcuMzY5LCJpIjoiMTc3MjU4NTEwNi0zMTI5IiwiZCI6MywibiI6IiMwOSJ9LHsiZGVzYyI6IkNhbGlicmF0aW9uIHBvaW50IiwiYyI6Ik5DIFpvbmluZyIsInAiOlstOTE4LjMwMSw2NTQuMDMxLC0wLjkyMV0sInIiOi0xNDQuMjM4LCJzIjo1LCJpIjoiMTc3MjU4NTI0Ni0xMjQzIiwiZCI6MiwibiI6IiMxMCJ9LHsiZGVzYyI6IkNhbGlicmF0aW9uIHBvaW50IiwiYyI6Ik5DIFpvbmluZyIsInAiOls0NTcuNjEyLDY2OS45MzEsMTUxLjM2M10sInIiOjkwLjExNywicyI6NywiaSI6IjE3NzI1ODU1MTEtMTU4MiIsImQiOjIsIm4iOiIjMTEifSx7ImRlc2MiOiJDYWxpYnJhdGlvbiBwb2ludCIsImMiOiJOQyBab25pbmciLCJwIjpbMTc3Ny4yNzMsNjQwLjU1MiwxNTcuNjgxXSwiciI6ODcuODc2LCJzIjoyMywiaSI6IjE3NzI1ODU3MTgtNzc2OCIsImQiOjcsIm4iOiIjMTIifSx7ImRlc2MiOiJDYWxpYnJhdGlvbiBwb2ludCIsImMiOiJOQyBab25pbmciLCJwIjpbLTIyOTMuNjU4LDIxNzAuNjQ0LDguOTkzXSwiciI6LTkuNDE2LCJzIjo0LCJpIjoiMTc3MjU4NTgyOC0yNDg4IiwiZCI6MSwibiI6IiMxMyJ9LHsiZGVzYyI6IkNhbGlicmF0aW9uIHBvaW50IiwiYyI6Ik5DIFpvbmluZyIsInAiOlstOTA0LjE2NiwyMTYyLjEzMyw1MS4wMzRdLCJyIjoxNzkuNDM4LCJzIjoyLCJpIjoiMTc3MjU4NTk5Mi0zNzk4IiwiZCI6MSwibiI6IiMxNCJ9LHsiZGVzYyI6IkNhbGlicmF0aW9uIHBvaW50IiwiYyI6Ik5DIFpvbmluZyIsInAiOls0NDMuNjA3LDIxNzIuODgyLDE1Ny43ODhdLCJyIjotMTc5LjQxOCwicyI6MTgsImkiOiIxNzcyNTg2MTQzLTU1MjYiLCJkIjo3LCJuIjoiIzE1In0seyJkZXNjIjoiQ2FsaWJyYXRpb24gcG9pbnQiLCJjIjoiTkMgWm9uaW5nIiwicCI6WzE4NzQuODIxLDIxODIuMzA2LDE3Ni42MjRdLCJyIjoxNzkuNzk0LCJzIjoxOCwiaSI6IjE3NzI1ODYzNjEtNjEwOSIsImQiOjcsIm4iOiIjMTYifV0sInYiOjJ9
```

</details>
