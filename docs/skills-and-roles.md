# NC Zoning Board — Skills & Roles

## Required Skills

### Frontend / Web

| Skill | Why Needed |
| --- | --- |
| HTML / CSS / JavaScript | Core site structure, styling, interactivity |
| Leaflet.js | Map rendering, pins, popups, overlays |
| Responsive / Mobile layout | Touch-friendly markers, responsive sidebar |
| UI animation & polish | Hover states, transitions, Cyberpunk aesthetic |

### Map / GIS

| Skill | Why Needed |
| --- | --- |
| Tile generation (Node.js / sharp) | Slicing and regenerating map tiles at higher resolutions |
| Coordinate system maths | CET ↔ Leaflet transform calibration |
| SVG / GeoJSON parsing | Converting district SVG polygons into Leaflet overlays |
| Spatial logic | Pin conflict detection, clustering nearby mods |

### Data / Schema

| Skill | Why Needed |
| --- | --- |
| JSON Schema (draft-07) | Maintaining and extending `mods.schema.json` |
| Data curation & QA | Reviewing submitted mod entries for accuracy |
| AJV / schema validation | CI validation pipeline maintenance |

### DevOps / Automation

| Skill | Why Needed |
| --- | --- |
| GitHub Actions | Maintaining submission, validation, and deploy workflows |
| GitHub API / PAT management | PR automation, issue form → PR pipeline |
| GitHub Pages | Static site deployment and config |
| Discord Webhooks | Notification embed maintenance |

### UX / Design

| Skill | Why Needed |
| --- | --- |
| Icon / sprite design | Custom pin icons per mod category |
| Dark theme UI design | Cyberpunk aesthetic consistency |
| Information architecture | Sidebar layout, search/filter UX |

### Community / Project Management

| Skill | Why Needed |
| --- | --- |
| PR review | Reviewing mod submissions for schema compliance |
| Issue triage | Handling malformed submissions, questions, bug reports |
| Nexus Mods familiarity | Verifying mod links and author details |
| CP2077 modding knowledge | Understanding CET, mod categories, the community |

### Documentation

| Skill | Why Needed |
| --- | --- |
| Technical writing | Keeping docs/ up to date as features ship |
| Contributor guides | Onboarding new contributors |

---

## Roles

### 🗺️ Map Engineer
>
> Owns the map rendering, tile pipeline, and coordinate system.

**Needs:** Leaflet.js, Node.js (sharp), coordinate maths, SVG/GeoJSON, spatial logic

**Handles:**

- Tile generation and upgrades (8k → 16k)
- District polygon overlays
- Pin clustering and conflict detection
- Coordinate transform calibration

---

### 🖥️ Frontend Developer
>
> Owns the site UI — sidebar, search, pin icons, mobile layout.

**Needs:** HTML/CSS/JS, Leaflet.js, responsive design, UI animation

**Handles:**

- Sidebar/legend with searchable mod list
- Custom & colour-coded pin icons
- Mobile layout and touch optimisation
- Dark/light theme toggle
- Contributors page

---

### ⚙️ DevOps / Automation Engineer
>
> Owns the GitHub Actions pipeline and deployment.

**Needs:** GitHub Actions, GitHub API, GitHub Pages, Discord Webhooks, YAML

**Handles:**

- Submission workflow (`auto-pr-submission.yml`)
- Validation pipeline (`validate-mods.yml`)
- Discord notification workflow
- Branch protection rules and secrets management

---

### 📋 Data Curator / Validator
>
> Owns the integrity of `mods.json` and the schema.

**Needs:** JSON Schema, AJV, CP2077 modding knowledge, Nexus Mods familiarity

**Handles:**

- Schema evolution (new fields, categories)
- Reviewing and merging mod submissions
- Manual data QA and conflict checks
- Maintaining `mods.schema.json`

---

### 🎨 UX / Visual Designer
>
> Owns the look and feel — icons, layout, and Cyberpunk aesthetic.

**Needs:** Icon/sprite design, dark theme UI, Figma or equivalent

**Handles:**

- Custom pin icon set (per category)
- Sidebar and UI component design
- Visual consistency with Cyberpunk 2077 aesthetic

---

### 🤝 Community Manager
>
> Owns the relationship with mod authors and the CP2077 community.

**Needs:** CP2077 modding knowledge, PR review, issue triage, communication skills

**Handles:**

- Triaging issue submissions and answering questions
- First-pass review of mod PRs for legitimacy
- Promoting the project on Nexus Mods / Discord
- Collecting feedback from mod authors

---

### ✍️ Technical Writer *(can be shared)*
>
> Keeps docs current and contributor guides accessible.

**Needs:** Markdown, Git basics, understanding of the project architecture

**Handles:**

- Updating `docs/` as features ship
- Contributor onboarding guide
- Keeping `roadmap.md` current

---

## Role Priority for Recruiting

| Priority | Role | Reason |
| --- | --- | --- |
| 🔴 High | **Map Engineer** | District overlays, clustering, and conflict detection are the most complex outstanding work |
| 🔴 High | **Community Manager** | Submissions will increase as the project gets shared — needs a human in the loop |
| 🟡 Medium | **Frontend Developer** | Sidebar and custom pins are high-value UX improvements |
| 🟡 Medium | **Data Curator** | PR review load will grow with more submitters |
| 🟢 Low | **UX / Visual Designer** | Nice to have, but CSS skills can carry this short-term |
| 🟢 Low | **DevOps Engineer** | Pipeline is stable; only needed for major workflow changes |
| 🟢 Low | **Technical Writer** | Can be shared across any contributor |
