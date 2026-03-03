# NC Zoning Board

**An interactive web map and coordinate registry for Cyberpunk 2077 location modders to claim spaces and prevent overlap.**

## Purpose

As the modding community for Cyberpunk 2077 grows, so does the number of custom locations, apartments, and overhauled zones. This repository serves as a centralized registry where mod authors can "claim" their coordinates to ensure compatibility across different location mods.

The live interactive map visually displays all registered mods to help authors find empty spaces in Night City or coordinate with adjacent builds.

## Live Map

🌍 **[View the Live NC Zoning Board](https://spuddeh.github.io/nc-zoning-board/)**

## How to Submit Your Mod

We use an automated Issue pipeline to add new mods to the map. You do **not** need to edit any code or JSON files!

1. Go to the **Issues tab** of this repository.
2. Click **New Issue** and select "📍 Submit a New Mod Location".
3. Fill out the simple form with your Mod Name, Author Alias, and the exact `[Y, X]` coordinates from Cyber Engine Tweaks.
4. Click **Submit new issue**.

Our automated bot will instantly read your form, verify the coordinates format, and successfully generate a **Pull Request** on your behalf. Once a maintainer clicks approve, your mod will instantly appear on the live map!

_(Note: You can still log regular bug reports or feature ideas by opening a blank issue or selecting standard issues in the menu)._

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
