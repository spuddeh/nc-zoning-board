# Architecture

## File Structure

```text
nc-zoning-board/
├── index.html              # Single-page app entry point
├── data/
│   ├── locations/          # Individual mod JSON files (tracked by Git)
│   └── tags.json           # Registry of all valid tags and definitions
├── mods.json               # Compiled registry (Git-ignored, built in CI)
├── mods.schema.json        # JSON Schema for compiled data
├── package.json            # Node.js deps (sharp, build scripts)
│
├── assets/
│   ├── css/style.css       # Cyberpunk-themed styles (Orbitron + Rajdhani fonts)
│   ├── js/
│   │   ├── constants.js    # Shared constants (NCZ namespace)
│   │   ├── utils.js        # Pure utility functions (coordinate transform, cache, positioning)
│   │   ├── services.js     # API/fetch functions (Nexus thumbnails, auto-discovery, data loading)
│   │   └── app.js          # Main app logic (map init, DOM events, sidebar, modals)
│   ├── images/             # Static image assets
│   └── tiles/              # Generated map tiles (zoom levels 0-5)
│       └── {z}/{x}/{y}.png
│
├── scripts/
│   ├── build_mods.js       # Compiles data/locations/*.json -> mods.json
│   ├── validate_tags.js    # Validates tags in data/ against tags.json
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
│   │   ├── mod_submission.yml      # GitHub Issue form for mod submissions
│   │   └── suggest_edit.yml        # GitHub Issue form for suggesting edits
│   └── workflows/
│       ├── auto-pr-submission.yml       # Bot: submission issue → PR with new JSON
│       ├── modify-location-submission.yml # Bot: edit issue → PR with modified JSON
│       ├── validate-mods.yml            # CI: validates mods.json against schema
│       └── deploy.yml                   # CD: deploys to GitHub Pages
│
└── docs/                   # You are here
```

## Data Flow

> For a full breakdown of the bot implementation, see the [Submission Pipeline](submission-pipeline.md) documentation.

```text
┌─────────────┐     ┌──────────────┐     ┌───────────────┐
│ Mod Author  │────▶│ GitHub Issue  │────▶│  Auto-PR Bot  │
│ submits CET │     │   Form       │     │  (Actions)    │
│ coordinates │     └──────────────┘     └───────┬───────┘
└─────────────┘                                  │
                                                 ▼
                                         ┌──────────────┐
                                         │ data/locations│
                                         │ <UUID>.json  │
                                         └──────┬───────┘
                                                │
                                                ▼
                                         ┌──────────────┐
                                         │  build_mods  │
                                         │  → mods.json │
                                         └──────┬───────┘
                                                │
                                                ▼
                                    ┌────────────────────────┐
                                    │     services.js        │
                                    │  cetToLeaflet(x, y)    │
                                    │  → [lat, lng] on map   │
                                    └────────────┬───────────┘
                                                 │
                                                 ▼
                                    ┌────────────────────────┐
                                    │    Leaflet Map         │
                                    │  Sidebar GUI           │
                                    │  Category Filtering    │
                                    │  L.marker (pins)       │
                                    └────────────────────────┘
```

## Key Components

### JavaScript Architecture

Frontend JS is split into four files loaded via `<script>` tags (no ES modules, no bundler). All shared symbols live on the `window.NCZ` namespace.

| File | Role |
| --- | --- |
| `constants.js` | All config values — category styles, API endpoints, cache keys, UI sizing |
| `utils.js` | Pure functions — `escapeHtml`, `cetToLeaflet`, `clamp`, positioning algorithm, BBCode parser |
| `services.js` | Fetch functions — Nexus thumbnail API, auto-discovery, `fetchModData()` |
| `app.js` | DOM logic — map init, sidebar, cluster panel, modals, image gallery |

Load order (linear dependency chain, no circular refs): `constants.js` → `utils.js` → `services.js` → `app.js`

### Map Layer (`app.js`)

- Uses **Leaflet.js** with `L.CRS.Simple` (non-geographic coordinate reference system)
- Map image is served as **256×256 tiles** at zoom levels 0–5 (8k source), with upscaled zoom to level 8
- At max native zoom (5), the image is 32×32 = 1,024 tiles
- Bounds are calculated via `map.unproject()` to align pixel coordinates with the tile grid

### Coordinate Transform (`utils.js`)

- `NCZ.cetToLeaflet(x, y)` — converts CET game coordinates to Leaflet `[lat, lng]`
- Simple linear mapping derived from a grid calibration
- See [Coordinate System](coordinate-system.md) for full details

### Mod Data (`data/locations/*.json`)

- Individual JSON files per mod to prevent merge conflicts.
- **Attributes**: `id` (UUID), `name`, `authors` (array), `coordinates` ([X, Y]), `nexus_id` (ID string, "WIP", or "Dummy"), `category`, `tags` (array), and `description`.
- **Credits**: Optional field for team-based acknowledgments.
- **Validation**: Individual tags are checked against `data/tags.json` and the final compiled `mods.json` is validated against `mods.schema.json` in CI.

### Styling (`style.css`)

- Cyberpunk theme using CSS custom properties (all prefixed `--`)
- Fonts: **Orbitron** (headings), **Rajdhani** (body) from Google Fonts
- Colour palette: `--primary` (#0a192f), `--secondary` (#00f0ff), `--tertiary` (#ffb300), `--white` (#e6f1ff), `--gray` (#8892b0)
- Custom Leaflet popup, tooltip, and cluster styling
- MarkerCluster CSS is inlined (no external CDN dependency)
- Uses native CSS nesting — see [browser support](https://caniuse.com/css-nesting)

## Repo Setup (for new maintainers)

The auto-PR pipeline and Discord notifications require two secrets configured in **repo Settings → Secrets and variables → Actions**:

| Secret | Value |
| --- | --- |
| `ACTIONS_PAT` | A GitHub Personal Access Token (fine-grained) with `Contents: Read/Write` and `Pull requests: Read/Write` on this repo |
| `DISCORD_WEBHOOK_URL` | A Discord channel webhook URL (channel Settings → Integrations → Webhooks) |

> **Why ACTIONS_PAT?** GitHub's `GITHUB_TOKEN` cannot trigger other workflow runs (a security design). Using a PAT for `create-pull-request` allows the `validate-json` check to fire automatically on the generated PR.

### Discord Notifications

Two workflows handle Discord messaging:

- **`auto-pr-submission.yml`** — Posts a new embed when a submission PR is created (status: ⏳ Awaiting review). Stores the Discord message ID as a hidden comment on the issue.
- **`notify-discord-pr-status.yml`** — When the PR is merged or closed, edits the original embed in-place to show the outcome (✅ Approved or ❌ Closed).
