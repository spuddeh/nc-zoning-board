# Architecture

## File Structure

```
nc-zoning-board/
├── index.html              # Single-page app entry point
├── mods.json               # Registry of all mod locations (CET coordinates)
├── mods.schema.json        # JSON Schema for mods.json validation
├── package.json            # Node.js deps (sharp for tile generation)
│
├── assets/
│   ├── css/style.css       # Cyberpunk-themed styles (Orbitron + Rajdhani fonts)
│   ├── js/app.js           # Main application logic (Leaflet map + coordinate transform)
│   ├── images/             # Static image assets
│   └── tiles/              # Generated map tiles (zoom levels 0-5)
│       └── {z}/{x}/{y}.png
│
├── scripts/
│   └── generate_tiles.js   # Slices 8k source image into 256×256 tiles
│
├── raw maps/               # Source map images (not committed — too large)
│   ├── 4k/night_city.png   # 4096×4096, 27 MB
│   ├── 8k/night_city.png   # 8192×8192, 108 MB (current tile source)
│   ├── 16k/                # 16384×16384 split into 2×2 quadrants
│   └── 32k/                # 32768×32768 split into 4×4 quadrants
│
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   └── mod_submission.yml   # GitHub Issue form for mod submissions
│   └── workflows/
│       ├── auto-pr-submission.yml  # Bot: issue → PR with mods.json update
│       ├── validate-mods.yml       # CI: validates mods.json against schema
│       └── deploy.yml              # CD: deploys to GitHub Pages
│
└── docs/                   # You are here
```

## Data Flow

```
┌─────────────┐     ┌──────────────┐     ┌───────────────┐
│ Mod Author  │────▶│ GitHub Issue  │────▶│  Auto-PR Bot  │
│ submits CET │     │   Form       │     │  (Actions)    │
│ coordinates │     └──────────────┘     └───────┬───────┘
└─────────────┘                                  │
                                                 ▼
                                         ┌──────────────┐
                                         │  mods.json   │
                                         │  [x, y] CET  │
                                         └──────┬───────┘
                                                │
                                                ▼
                                    ┌────────────────────────┐
                                    │      app.js            │
                                    │  cetToLeaflet(x, y)    │
                                    │  → [lat, lng] on map   │
                                    └────────────┬───────────┘
                                                 │
                                                 ▼
                                    ┌────────────────────────┐
                                    │    Leaflet Map         │
                                    │  L.tileLayer (8k)      │
                                    │  L.marker (pins)       │
                                    │  CRS.Simple            │
                                    └────────────────────────┘
```

## Key Components

### Map Layer (`app.js`)

- Uses **Leaflet.js** with `L.CRS.Simple` (non-geographic coordinate reference system)
- Map image is served as **256×256 tiles** at zoom levels 0–5 (8k source), with upscaled zoom to level 8
- At max native zoom (5), the image is 32×32 = 1,024 tiles
- Bounds are calculated via `map.unproject()` to align pixel coordinates with the tile grid

### Coordinate Transform (`app.js`)

- `cetToLeaflet(x, y)` — converts CET game coordinates to Leaflet `[lat, lng]`
- `leafletToCet(lat, lng)` — reverse transform
- Simple linear mapping derived from a 16-point grid calibration
- See [Coordinate System](coordinate-system.md) for full details

### Mod Data (`mods.json`)

- Array of mod objects with `id`, `name`, `author`, `coordinates`, `nexus_link`, `description`
- Coordinates are CET in-game `[X, Y]` — the app transforms them for display
- Validated against `mods.schema.json` in CI

### Styling (`style.css`)

- Cyberpunk theme using CSS custom properties
- Fonts: **Orbitron** (headings), **Rajdhani** (body) from Google Fonts
- Colour palette: `--cb-yellow` (#fcee0a), `--cb-blue` (#00f0ff), `--cb-pink` (#ff003c)
- Custom Leaflet popup and tooltip styling

## Repo Setup (for new maintainers)

The auto-PR pipeline requires one secret to be configured in **repo Settings → Secrets and variables → Actions**:

| Secret | Value |
|--------|-------|
| `ACTIONS_PAT` | A GitHub Personal Access Token (fine-grained) with `Contents: Read/Write` and `Pull requests: Read/Write` on this repo |

> **Why?** GitHub's `GITHUB_TOKEN` cannot trigger other workflow runs (a security design). Using a PAT for `create-pull-request` allows the `validate-json` check to fire automatically on the generated PR.
