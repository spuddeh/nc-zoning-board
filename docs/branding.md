# NC Zoning Board — Brand Guidelines

## 1. Lore & Background (Night Corp Interface)

> *"What IS Night Corporation? Richard Night's legacy. The foundation stone of Night City. Its silent, watchful guardian."* — Night Corp netsite

The **NC Zoning Board** map is presented as an internal tool operated by **Night Corp**, the megacorporation dedicated to preserving and executing Richard Night's original vision for the city. Founded by Miriam Night after Richard's death, Night Corp acts as the largest contractor of public procurements within Night City—building roads, bridges, tunnels, and overseeing all civic development. 

As a Night Corp interface, the application should feel:
- **Bureaucratic but High-Tech:** Clean lines, structured data, and an undeniable corporate authority. It's the silent, watchful guardian of the city's infrastructure.
- **Civic-Minded:** Designed "for the public good". We manage the city's growth, infrastructure, and zoning.
- **Secretive & Protected:** Night Corp is known for its tight security and secretive policies. The interface should feel strictly authorized.

### Voice & Tone
- *In UI Copy:* Official, authoritative, and slightly sterile. 
  - *"Welcome to the NC Zoning Board internal repository."*
  - *"Unauthorized modification of zoning data is a Class 3 Corporate Offense."*
- *In Error States:* Emotionless bureaucracy. 
  - *"Error 404: Location data expunged or missing. Please contact your Night Corp liaison."*

---

## 2. Color Palette

Night Corp's aesthetic relies on conveying trust, stability, and control, contrasting with the neon-drenched chaos of the rest of the city.

| Name | Hex Code | Usage |
| :--- | :--- | :--- |
| **Corporate Navy (Primary)** | `#0a192f` | Deep backgrounds, establishing a solid, authoritative base. |
| **Zoning Cyan (Accent)** | `#00f0ff` | Primary buttons, active tabs, and critical highlights (The classic Cyberpunk UI cyan). |
| **Concrete Gray (Secondary)** | `#8a8d91` | Secondary text, inactive borders, and disabled states. |
| **Archival White (Text)** | `#e6f1ff` | Primary text. Not pure white to reduce eye strain on dark backgrounds. |
| **Warning Amber (Alerts)** | `#ffb300` | Warning states, overlaps, or critical alerts (like the "New Location" category). CSS: `--tertiary`. |
| **Approval Green (Success)** | `#00ff9d` | Success states, verified locations, or "Safe" zones. |

*Note: The map pins should utilize this palette, with specific colors assigned to different zoning categories (e.g., Apartments, Overhauls, New Structures).*

---

## 3. Typography

To maintain the Cyberpunk aesthetic while adhering to corporate readability:

- **Primary Heading Font:** `Orbitron` (For titles, stats, and major UI elements). It provides that unmistakable shape and tech-forward feel.
- **Body & Data Font:** `Rajdhani` (For tooltips, descriptions, and lists). Squarish but highly legible for dense data.
- **Monospace (Logs/Coords):** `Fira Code` or generic `monospace` for coordinates and system outputs to look like raw terminal logic.

---

## 4. UI Elements & Styling

### Logos & Branding
- **Primary Logo:** `assets/img/nightcorp-logo.webp`. Used in the header to establish immediate corporate identity.
- **Favicon:** The standard `assets/img/favicon.ico` is used as the site favicon to maintain presence in the browser tab.

### Buttons & Toggles
- Sharp corners, no border radius (0px). Night Corp doesn't do "soft."
- Hover states should feel responsive, perhaps with a subtle glitch effect or a sharp color inversion (e.g., from Dark Navy with Cyan border to solid Cyan background with Navy text).

### Windows & Popups (The Map Overlay)
- **Borders:** Thin, 1px solid borders using the Cyan accent or a muted gray, perhaps with subtle "corner brackets" (e.g., `[ ]`) framing the corners.
- **Backgrounds:** Distinctly dark (Corporate Navy) with a slight, frosted-glass opacity `rgba(10, 25, 47, 0.9)` so the map is faintly visible beneath.

### Map Markers (Pins)
- Vector shapes. Clean geometric vectors over traditional rounded map pins.
- Diamonds, hexagons, or sharp squares.
- Icons should be minimalist line-art (SVG), not overly detailed illustrations.

---

## 5. The "Welcome" Modal

When a user first loads the map, they should be greeted by a Night Corp modal:

> **NIGHT CORP // URBAN PLANNING DIVISION**
> **Terminal ID:** NC-ZB-01
> 
> *Welcome to the NC Zoning Board prototype interface. This tool aggregates structural modifications and spatial anomalies across the Greater Night City area.*
> *This interface is currently in ALPHA. Data integrity is not guaranteed.*
>
> [ ACCESS TERMINAL ]
