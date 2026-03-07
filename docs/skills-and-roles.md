# NC Zoning Board — How You Can Help

This is a passion project built by and for the Cyberpunk 2077 modding community. We don't have a formal hierarchy or a hiring board—if you see something that needs doing and you have the skills, jump in!

Here are the main areas where we could use extra hands:

## 🛠️ Areas of Interest

### Frontend / Web

- **HTML / CSS / JavaScript:** Core site structure, styling, interactivity
- **Leaflet.js:** Map rendering, pins, popups, overlays
- **UX & Design:** Hover states, transitions, Cyberpunk aesthetic, custom pin icons
- **Coordinate system maths:** CET ↔ Leaflet transform calibration
- **SVG / GeoJSON:** Converting district polygons into Leaflet overlays
- **Spatial logic:** Pin conflict detection, clustering nearby mods

### DevOps / Automation

- **GitHub Actions:** Maintaining submission workflows and deployments
- **Discord Webhooks:** Notification embed maintenance
- **Tile generation:** Slicing and regenerating map tiles at higher resolutions (Node.js/sharp)

### Documentation

- **Technical writing:** Keeping docs/ up to date as features ship
- **Contributor guides:** Helping others onboard

---

## 🤝 Project Areas

If you want to take "ownership" of a specific part of the project, here's how things are generally split up:

### 🖥️ Frontend Developer
>
> Owns the site UI, map rendering, and coordinate system.

**Needs:** HTML/CSS/JS, Leaflet.js, responsive design, spatial logic

**Handles:**

- Sidebar/legend with searchable mod list
- Custom & colour-coded pin icons
- Mobile layout and touch optimisation
- District polygon overlays
- Pin clustering and conflict detection
- Coordinate transform calibration

---

### ⚙️ DevOps / Automation
>
> Maintaining the GitHub Actions pipeline, tile generation, and deployment.

**Needs:** GitHub Actions, GitHub API, GitHub Pages, Discord Webhooks, Node.js (sharp), YAML

**Handles:**

- Submission workflow (`auto-pr-submission.yml`)
- Validation pipeline
- Branch protection and secrets
- Tile generation and upgrades (8k → 16k)

---

### 🎨 Visual Design
>
> Polishing the look and feel — icons, layout, and Cyberpunk aesthetic.

**Needs:** Icon/sprite design, dark theme UI, CSS

**Handles:**

- Custom pin icon set (per category)
- Visual consistency with Cyberpunk 2077 aesthetic

---

## 🎯 Current Focus Areas

If you're looking for something to do right now, these are our biggest bottlenecks:

- **District overlays and pin clustering:** This is the most complex outstanding mapping work.
- **Custom CSS map markers:** We need visually distinct Cyberpunk-style pins for different mod categories.
- **Reviewing submissions:** Double-checking coords against Nexus mods before we merge them. See the **[Reviewer Guide](reviewer-guide.md)** for the step-by-step process.
