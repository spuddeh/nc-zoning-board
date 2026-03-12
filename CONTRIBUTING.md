# Contributing to NC Zoning Board

Thanks for wanting to help! There are a few different ways to contribute depending on your skills.

---

## 🗺️ Submitting a Mod Location

This is the most common contribution. See **[docs/adding-mods.md](docs/adding-mods.md)** for full instructions.

**Short version:**

1. Get your in-game coordinates from the CET console: `print(GetPlayer():GetWorldPosition())`
2. Go to [Issues → New Issue → 📍 Submit a New Mod Location](https://github.com/spuddeh/nc-zoning-board/issues/new/choose)
3. Fill in the form — the bot creates a PR automatically
4. A maintainer reviews and merges it → your pin appears on the live map

> **No Git knowledge required** for this method.

---

## 🛠️ Contributing Code or Docs

### Getting Started

```powershell
# Fork the repo on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/nc-zoning-board.git
cd nc-zoning-board

# Run locally
npx serve .
# Open http://localhost:3000
```

### Project Structure

```text
index.html              # Entry point
assets/
  js/app.js             # Map logic (Leaflet, pins, popups)
  css/style.css         # Cyberpunk-themed styles
data/
  locations/            # Individual mod JSON files
  tags.json             # Global tag registry
mods.json               # Compiled mod registry (Git ignored)
mods.schema.json        # JSON Schema for validation (Array version)
scripts/
  build_mods.js         # Compiles data/locations/*.json -> mods.json
  validate_tags.js      # Validates used tags against tags.json
  generate_tiles.js     # Map tile generator (Node.js + sharp)
docs/                   # Architecture, coordinate system, roadmap
.github/
  workflows/            # CI/CD — validation, submission, deployment
  ISSUE_TEMPLATE/       # Mod submission form
```

### Before You Open a PR

- **Data Integrity:** run `node scripts/build_mods.js` and ensure it passes.
- **Validation:** run `node scripts/validate_tags.js` and `npx ajv validate -s mods.schema.json -d mods.json`.
- **Map/coordinate changes:** verify pins still appear in the correct locations
- **Keep PRs focused** — one feature or fix per PR

---

## 🤝 Ways to Help

This is a community passion project. If you've got skills and want to help out, we'd love the extra hands! Here are the main areas where we could use some help:

| Area | Skills | Example Tasks |
| --- | --- | --- |
| 🖥️ **Frontend** | HTML/CSS/JS, Leaflet, SVG/GeoJSON, spatial maths | District overlays, pin clustering, sidebar, search, custom pin icons |
| ⚙️ **DevOps & Tools** | GitHub Actions, Node.js | Submission workflows, tile generation, Discord webhooks |
| 🎨 **Design** | Icon design, dark theme UI | Custom pin icon set, UI polish |
| ✍️ **Documentation** | Markdown, Git basics | Keeping docs/ current, writing contributor guides |

If you're interested in helping out with any of these, just open an issue or ping a maintainer.

---

## 📌 Code Standards

- **JavaScript:** Vanilla ES6+, no build step, no frameworks
- **CSS:** Plain CSS — keep the Cyberpunk aesthetic (Orbitron/Rajdhani fonts, dark theme)
- **JSON:** All `mods.json` entries must pass schema validation
- **Commit messages:** Use [Conventional Commits](https://www.conventionalcommits.org/) style (`feat:`, `fix:`, `docs:`, `chore:`)

---

## 🔍 Useful Docs

- [Architecture](docs/architecture.md) — file structure, data flow, secrets
- [Submission Pipeline](docs/submission-pipeline.md) — how GitHub Actions handles new mod entries
- [Coordinate System](docs/coordinate-system.md) — CET ↔ Leaflet transform, calibration data
- [Adding Mods](docs/adding-mods.md) — schema reference, getting coordinates, submission methods
- [Tag Registry](docs/tags.md) — current tags, and how to add, modify, or remove tags
- [Tile Generation](docs/tile-generation.md) — how the map tiles are generated and upgraded
- [Skills & Roles](docs/skills-and-roles.md) — full role descriptions and recruiting priorities
- [Roadmap](docs/roadmap.md) — what's planned

---

*Night City's got a lot of corners. Help us map them all.* 🌃
