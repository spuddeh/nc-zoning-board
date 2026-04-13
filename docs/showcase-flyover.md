# Showcase Flyover

A cinematic flyover of Night City synced to the in-game radio broadcast *Good Morning Night City*. Implemented as an opt-in module (`flyover.js`) — add or remove the `<script>` tag in `index.html` to include or exclude the feature.

## Activation

Click the **Showcase** button in the 3D scene controls. The browser enters native fullscreen, the scene fades in from black, and the audio begins. Press **Esc** or click **Exit showcase** to exit early. The showcase runs once and exits automatically when the audio ends.

## Audio

`assets/audio/GMNC.mp3` — *Good Morning Night City*, a Cyberpunk 2077 radio broadcast (~800 KB, ~57 s). The audio clock (`audio.currentTime`) drives:

- Beat-triggered theme transitions
- Sun position (sunrise → sunset arc)
- End-of-showcase fade (triggered by `audio.ended`, not a timer)

## Waypoints

11 camera positions spanning 57.417 s, timed to Audacity label timestamps so the camera is over the named district exactly when the announcer mentions it.

| WP | Time (s) | Location | Note |
|----|----------|----------|------|
| 0 | 0.000 | Open ocean | Build-up music; bare terrain, sun rising |
| 1 | 6.948 | Western coastline | "Good Morning Night City" |
| 2 | 10.948 | Watson | Low sweep south |
| 3 | 14.842 | Heywood | Top-down |
| 4 | 20.842 | City Center | Banking sweep west |
| 5 | 26.977 | Santo Domingo | Low sweep, city skyline ahead |
| 6 | 34.743 | Westbrook | Approach from east |
| 7 | 43.377 | Pacifica | Top-down |
| 8 | 48.077 | Dogtown | Low sweep |
| 9 | 52.747 | Badlands | Rising, looking east — districts off |
| 10 | 57.417 | Rocky Ridge | High, city silhouette on the horizon |

Waypoint positions are in GLB space (`X = CET_X`, `Y = elevation`, `Z = -CET_Y`). Edit `FLYOVER_WAYPOINTS` in `flyover.js` to adjust.

## Beat-Driven Theme Visualiser

33 bass-beat timestamps from an Audacity beat-finder export fire a theme cross-dissolve every ~1.34 s (the track's tempo), cycling through all five themes:

**Night Corp → Militech → Arasaka → Aldecaldos → Synthwave → repeat**

The dissolve uses `NCZ.ThreeScene.transitionToColors()` — Three.js material colors only, no CSS update, no building retint — so it runs at near-zero overhead and never causes a frame drop.

Beat timestamps are defined in `BEAT_TIMESTAMPS_MS` in `flyover.js`. To update them, re-export from Audacity (**Analyze → Beat Finder**) and paste the cluster-start values.

## Layer Reveal

At the start of each loop, all overlays are off. They stagger in during the 6.9 s ocean approach:

| Time | Layer |
|------|-------|
| +1.5 s | Roads |
| +3.0 s | Metro |
| +4.5 s | Buildings |
| ~~+6.0 s~~ | ~~Districts~~ (omitted — cleaner showcase without boundary lines) |

## Sun Animation

`updateFlyoverSun(audio.currentTime)` is called every frame. It maps `audio.currentTime / 57.417` to the summer solstice (June 21) sunrise→sunset window at **Morro Bay, CA** (35.37°N, 120.85°W) — Night City's real-world location — via SunCalc.

- Directional light colour: warm orange at the horizon, neutral white overhead
- Sun sphere: visible orb in the sky, tracks the exact sun direction, rises from below terrain at sunrise and sets below it at sunset

## Shadows

Shadows are always enabled during the showcase (regardless of the overlay checkbox), then restored to the user's checkbox state on exit. The directional light shadow map (4096×4096, PCFSoft) provides terrain self-shadowing and building shadows on terrain.

## Fade In / Out

The overlay div (`#flyover-fade`) is **created dynamically** when the showcase starts and **removed from the DOM** on exit — it does not exist outside of an active showcase.

- Fade in: 2 s (black → scene)
- Fade to black: 2 s at natural end, triggered by `audio.ended`
- Escape / early exit: instant reset, no fade-to-black

## Theme Save / Restore

The user's active theme is saved before the showcase and restored via cross-dissolve on exit. Theme changes during the showcase use `NCZ.applyTheme(id, { persist: false })` so they never overwrite the user's stored preference.

## Audacity Label Files

Beat-finder and label-track files used to sync this showcase are kept at:

```
E:\Audio\Cyberpunk 2077\GMNC - beat finder.txt
E:\Audio\Cyberpunk 2077\GMNC - District beats.txt
```

## NCZ.ThreeScene API used by flyover.js

| Method | Purpose |
|--------|---------|
| `stopRenderLoop()` / `startRenderLoop()` | Pause/resume the ortho render loop |
| `setControlsEnabled(bool)` | Disable OrbitControls during flyover |
| `renderFrame(camera)` | Render one frame with the perspective camera |
| `getCanvasElement()` | Size the perspective camera on creation |
| `captureColors()` | Snapshot material colors before a theme transition |
| `transitionMaterials(from, ms)` | Lerp materials to new CSS theme values |
| `transitionToColors(from, to, ms)` | Lerp materials to explicit colors (beat cycle) |
| `setLayerVisibility(name, bool)` | Toggle roads/metro/buildings/districts |
| `setSunPosition(az, alt)` | Move directional light + sun sphere |
| `setShadowsEnabled(bool)` | Toggle shadow casting |
| `setSunSphereVisible(bool)` | Show/hide the visible sun orb |
