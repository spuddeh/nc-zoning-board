# NC Zoning Board

**An interactive web map and coordinate registry for Cyberpunk 2077 location modders to claim spaces and prevent overlap.**

🌍 **[View the Live Map](https://spuddeh.github.io/nc-zoning-board/)**

## What is This?

As the CP2077 modding community grows, so does the number of custom locations, apartments, and overhauled zones. This repository is a centralized registry where mod authors can **"claim" their in-game coordinates** to ensure compatibility across location mods.

The live interactive map displays all registered mods on an 8k Night City map, allowing authors to find empty spaces or coordinate with adjacent builds.

## Quick Start

### Viewing the Map

Just visit the [Live Map](https://spuddeh.github.io/nc-zoning-board/) — no setup needed.

### Running Locally

```bash
# Clone the repo
git clone https://github.com/spuddeh/nc-zoning-board.git
cd nc-zoning-board

# Install dependencies (only needed for tile generation)
npm install

# Start a local server
npx serve .
# Open http://localhost:3000
```

> **Note:** The app uses `fetch()` to load mod data, so you need a local HTTP server — opening `index.html` directly will cause CORS errors.

### Regenerating Map Tiles

If you have a new map source image, regenerate the tiles:

```bash
# Place your 8k source image at: raw maps/8k/night_city.png
node scripts/generate_tiles.js
# Tiles are generated in assets/tiles/
```

See [Tile Generation Guide](docs/tile-generation.md) for details.

## Submitting Your Mod

### Quick Method (GitHub Issue)

1. Go to the **Issues** tab → **New Issue** → **"📍 Submit a New Mod Location"**
2. Fill in your mod name, author, CET coordinates, and Nexus link
3. An automated bot creates a PR — a maintainer approves and your mod appears on the live map

### Manual Method

Edit `mods.json` directly and submit a PR. See the [Adding Mods Guide](docs/adding-mods.md) for the full schema and how to get your CET coordinates.

## Documentation

| Guide | Description |
|-------|-------------|
| [Architecture](docs/architecture.md) | File structure, data flow, tech stack |
| [Coordinate System](docs/coordinate-system.md) | CET ↔ Leaflet transform, calibration data |
| [Adding Mods](docs/adding-mods.md) | mods.json schema, getting coordinates |
| [Tile Generation](docs/tile-generation.md) | Map tiling, source images, upgrading resolution |
| [Roadmap](docs/roadmap.md) | Current status, planned features |

## Tech Stack

- **[Leaflet.js](https://leafletjs.com/)** — Interactive map (`L.CRS.Simple` with custom tiles)
- **Vanilla JS / CSS** — No frameworks, purely static files
- **[Sharp](https://sharp.pixelplumbing.com/)** — 8k map tile generation (dev dependency)
- **GitHub Actions** — Automated JSON validation and PR pipeline
- **GitHub Pages** — Static hosting

## License

ISC
