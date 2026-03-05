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
mods.json               # Mod registry
mods.schema.json        # JSON Schema for validation
scripts/
  generate_tiles.js     # Map tile generator (Node.js + sharp)
docs/                   # Architecture, coordinate system, roadmap
.github/
  workflows/            # CI/CD — validation, submission, deployment
  ISSUE_TEMPLATE/       # Mod submission form
```

### Before You Open a PR

- **JSON changes:** run `npx ajv validate -s mods.schema.json -d mods.json` locally
- **Map/coordinate changes:** verify pins still appear in the correct locations
- **Keep PRs focused** — one feature or fix per PR

---

## 🤝 Roles We're Looking For

The project is growing and we're looking for regular contributors. See **[docs/skills-and-roles.md](docs/skills-and-roles.md)** for the full breakdown including recruiting priorities.

| Role | Skills Needed | What You'd Do |
| --- | --- | --- |
| 🗺️ **Map Engineer** | Leaflet.js, Node.js, SVG/GeoJSON, spatial maths | District overlays, pin clustering, conflict detection, tile upgrades |
| 🖥️ **Frontend Developer** | HTML/CSS/JS, Leaflet, responsive design | Sidebar, search, custom pin icons, mobile layout |
| 📋 **Data Curator** | JSON Schema, CP2077 / Nexus Mods knowledge | Reviewing mod submissions for accuracy and schema compliance |
| 🤝 **Community Manager** | CP2077 modding community knowledge, communication | Issue triage, answering questions, promoting the map |
| 🎨 **UX Designer** | Icon design, dark theme UI | Custom pin icon set, UI polish |
| ✍️ **Technical Writer** | Markdown, Git basics | Keeping docs/ current, writing contributor guides |

If you're interested in taking on a regular role, open an issue or reach out to a maintainer.

---

## 📌 Code Standards

- **JavaScript:** Vanilla ES6+, no build step, no frameworks
- **CSS:** Plain CSS — keep the Cyberpunk aesthetic (Orbitron/Rajdhani fonts, dark theme)
- **JSON:** All `mods.json` entries must pass schema validation
- **Commit messages:** Use [Conventional Commits](https://www.conventionalcommits.org/) style (`feat:`, `fix:`, `docs:`, `chore:`)

---

## 🔍 Useful Docs

- [Architecture](docs/architecture.md) — file structure, data flow, secrets
- [Coordinate System](docs/coordinate-system.md) — CET ↔ Leaflet transform, calibration data
- [Adding Mods](docs/adding-mods.md) — schema reference, getting coordinates, submission methods
- [Tile Generation](docs/tile-generation.md) — how the map tiles are generated and upgraded
- [Skills & Roles](docs/skills-and-roles.md) — full role descriptions and recruiting priorities
- [Roadmap](docs/roadmap.md) — what's planned

---

*Night City's got a lot of corners. Help us map them all.* 🌃
