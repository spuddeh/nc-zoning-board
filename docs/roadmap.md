# Roadmap

## Current Status

The NC Zoning Board is a **proof of concept** interactive map for Cyberpunk 2077 location mods.

### What Works

- ✅ 8k tiled map with zoom levels 0–8 (native to 5, upscaled to 8)
- ✅ CET coordinate transform (16-point calibrated, linear, accurate)
- ✅ Mod pins with clickable popups (name, autores, description, Nexus link)
- ✅ Cyberpunk-themed UI (Orbitron/Rajdhani fonts, dark theme)
- ✅ mods.json schema validation (CI via GitHub Actions)
- ✅ Automated mod submission via GitHub Issue form -> PR pipeline
- ✅ GitHub Pages deployment
- ✅ Tile generation script (`scripts/generate_tiles.js`)
- ✅ **Data refactor**: Split `mods.json` into individual JSON files for cleaner management.
- ✅ **Persistent Changelog**: Following SemVer and Keep a Changelog.
- ✅ **Tagging System**: Dynamic filters with hover tooltips and definitions.
- ✅ **Multi-Author & Credits**: Support for authorship arrays and team credits.
- ✅ **URL optimization**: Store only the Nexus mod ID and generate links dynamically.

### Known Limitations

- Mod pins use default Leaflet markers — no custom icons yet
- District overlay is disabled (SVG source needs rework)
- No mobile-specific optimizations

## Planned Features

### High Priority

- [ ] **Custom pin icons** — colour-coded by mod category or author
- [ ] **Conflict detection** — warn when two mods claim nearby coordinates

### Medium Priority

- [ ] **Pin clustering** — group nearby pins at low zoom levels
- [ ] **District overlays** — semi-transparent coloured district boundaries

### Low Priority / Nice to Have

- [ ] **16k tile support** — upgrade from 8k for higher zoom fidelity
- [ ] **Contributors page** — acknowledge mod authors
- [ ] **Dark/light theme toggle**
- [ ] **Mobile layout** — responsive sidebar and touch-friendly markers
- [ ] **Add support for images** — allow mod authors to upload images for their mods
