# NC Zoning Board

**An interactive web map and coordinate registry for Cyberpunk 2077 location modders to claim spaces and prevent overlap.**

## Purpose

As the modding community for Cyberpunk 2077 grows, so does the number of custom locations, apartments, and overhauled zones. This repository serves as a centralized registry where mod authors can "claim" their coordinates to ensure compatibility across different location mods.

The live interactive map visually displays all registered mods to help authors find empty spaces in Night City or coordinate with adjacent builds.

## Live Map

🌍 **[View the Live NC Zoning Board](https://spuddeh.github.io/nc-zoning-board/)**

## How to Submit Your Mod

We use an automated Pull Request system to add new mods to the map.

1. **Fork this repository** to your GitHub account.
2. **Edit `mods.json`** located in the root directory.
3. **Add your mod's data** to the bottom of the JSON array following this format:

```json
{
  "id": "your-unique-mod-id",
  "name": "The Name of Your Mod",
  "author": "Your Alias",
  "coordinates": [Y, X],
  "nexus_link": "https://www.nexusmods.com/cyberpunk2077/mods/XXXX",
  "description": "A short, one-sentence description of what your mod adds here."
}
```

### Coordinate Rules

The `coordinates` field must use the **exact `[Y, X]` output from Cyber Engine Tweaks (CET)**, ignoring the Z-axis (height).

1. **Submit a Pull Request** against the `main` branch of this repository.

Our automated GitHub Action will validate your JSON entry against our schema to ensure no formatting errors exist. Once approved and merged, your mod will instantly appear on the live map!

## Local Development (Testing the Map)

To test changes to the map's UI or logic locally:

1. Clone the repository.
2. Since the app uses `fetch()` to load the JSON data, you must run a local HTTP server (opening `index.html` directly in the browser will result in a CORS error).
   - If you have Python installed: `python -m http.server 8080`
   - If you have Node.js installed: `npx serve`
3. Open a browser to `http://localhost:8080`

## Built With

- **Leaflet.js:** Lightweight interactive map library (`L.CRS.Simple`).
- **Vanilla JS/CSS:** No heavy frameworks, purely static files.
- **GitHub Actions/Pages:** Automated JSON validation and hosting.
