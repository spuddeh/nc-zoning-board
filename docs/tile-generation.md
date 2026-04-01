# Tile Generation

> **Note:** The tile pipeline described here is used by the current production site (satellite tiles). Future versions will use WebP `L.imageOverlay` instead of tiles — the satellite image compresses to 9.6 MB as WebP, and the terrain base layer to 290 KB. See `docs/terrain-generation.md` for the new approach. This document is preserved for reference and backward compatibility.

## Overview

The map image is too large to load as a single PNG file (the 8k source is 108 MB). Instead, we slice it into 256×256 PNG tiles at multiple zoom levels. Leaflet loads only the visible tiles, making the map fast and responsive.

## Source Images

Source images are stored in `raw maps/` (not committed due to size):

| Resolution | File | Size | Status |
|-----------|------|------|--------|
| 4k (4096²) | `4k/night_city.png` | 27 MB | Available |
| **8k (8192²)** | **`8k/night_city.png`** | **108 MB** | **Current tile source** |
| 16k (16384²) | `16k/finalimage-{r}_{c}.png` (2×2) | ~424 MB | Available (split) |
| 32k (32768²) | `32k/finalimage-{r}_{c}.png` (4×4) | ~1.5 GB | Available (split) |

## Generating Tiles

### Prerequisites

```bash
npm install  # Installs sharp (image processing library)
```

### Running the Script

```bash
node scripts/generate_tiles.js
```

This reads `raw maps/8k/night_city.png` and outputs tiles to `assets/tiles/`:

```
assets/tiles/
├── 0/0/0.png          # Zoom 0: 1×1 tile (whole image at 256px)
├── 1/                  # Zoom 1: 2×2 tiles
├── 2/                  # Zoom 2: 4×4 tiles
├── 3/                  # Zoom 3: 8×8 tiles
├── 4/                  # Zoom 4: 16×16 tiles
└── 5/                  # Zoom 5: 32×32 tiles (native 8k resolution)
    ├── 0/
    │   ├── 0.png
    │   ├── 1.png
    │   └── ...
    └── 31/
        └── 31.png
```

**Output:** 1,365 tiles total, ~20–40 MB.

## How It Works

The script (`scripts/generate_tiles.js`) uses [Sharp](https://sharp.pixelplumbing.com/) to:

1. Load the source image
2. For each zoom level (0–5):
   - Resize the image to `(2^z × 256)` pixels
   - Extract each 256×256 tile
   - Save as `assets/tiles/{z}/{x}/{y}.png`

### Tile Coordinates

- `{z}` — zoom level (0 = zoomed out, 5 = native resolution)
- `{x}` — column index (0 = left)
- `{y}` — row index (0 = top)

At zoom 5: 32 columns × 32 rows = 1,024 tiles.

## Leaflet Integration

In `app.js`, the tile layer is configured as:

```javascript
const maxZoom = 5;
const southWest = map.unproject([0, 8192], maxZoom);
const northEast = map.unproject([8192, 0], maxZoom);
const mapBounds = new L.LatLngBounds(southWest, northEast);

L.tileLayer('assets/tiles/{z}/{x}/{y}.png', {
    maxNativeZoom: 5,  // Highest zoom with real tiles
    maxZoom: 8,        // Allow zooming past native (upscaled)
    tileSize: 256,
    noWrap: true,
    bounds: mapBounds
}).addTo(map);
```

- `maxNativeZoom: 5` — Leaflet knows zoom 5 is the best available
- `maxZoom: 8` — Users can zoom 3 levels deeper (tiles are upscaled)
- `bounds` — Calculated via `map.unproject()` to align pixel coords with `CRS.Simple`

## Upgrading to Higher Resolution

To use the 16k or 32k source images:

1. **Stitch the split images** into a single file (e.g., using ImageMagick or Sharp)
2. **Update `generate_tiles.js`:** change `INPUT` path and `MAX_ZOOM`:
   - 16k → `MAX_ZOOM = 6` (64×64 = 4,096 tiles at native)
   - 32k → `MAX_ZOOM = 7` (128×128 = 16,384 tiles at native)
3. **Update `app.js`:** change `maxNativeZoom` to match
4. **Recalibrate** the coordinate transform (the new image may have different bounds)
5. **Regenerate tiles:** `node scripts/generate_tiles.js`

> **Warning:** Higher resolution means significantly more tiles and larger repo size. Consider external hosting (CDN, blob storage) for 16k+.
