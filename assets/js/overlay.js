/**
 * NC Zoning Board — Overlay Module
 *
 * Manages ALL map overlay layers:
 * - Canvas GridLayer for roads/buildings/landmarks/metro (380k+ features)
 * - District/subdistrict GeoJSON borders with zoom-based switching
 * - Terrain contour lines
 * - Base layer switching (satellite <-> terrain)
 *
 * app.js creates the UI controls and calls NCZ.initOverlays(), NCZ.switchBaseLayer(),
 * and NCZ.toggleOverlay(). This module handles all rendering logic.
 *
 * Depends on: constants.js, utils.js (via NCZ namespace).
 * Load order: after utils.js, before app.js.
 */

// ── Canvas Overlay Renderer (roads/buildings/landmarks/metro) ────────

NCZ.OverlayRenderer = L.GridLayer.extend({
  options: {
    tileSize: 256,
    minZoom: 0,
    maxZoom: 8,
    updateWhenIdle: true,
    updateWhenZooming: false,
    updateInterval: 500,
    keepBuffer: 4,
    showRoads: true,
    showBuildings: true,
    showMetro: true,
  },

  initialize: function (options) {
    L.Util.setOptions(this, options);
    this._features = [];
    this._loaded = false;
    this._grid = {};
    this._gridZoom = 5;
    this._tileCache = {};
    this._tileCacheMax = 200;
  },

  loadData: async function () {
    const [buildings, roads, metro, landmarks] = await Promise.all([
      fetch("data/buildings.json").then((r) => r.json()),
      fetch("data/roads.json").then((r) => r.json()),
      fetch("data/metro.json").then((r) => r.json()),
      fetch("data/landmarks.json").then((r) => r.json()),
    ]);

    const features = [];

    for (const r of roads) {
      features.push({ t: "r", z: r.z, p: r.pts, s: this._polySize(r.pts) });
    }
    for (const dg of buildings) {
      for (const b of dg.polygons) {
        features.push({ t: "b", z: b.z, p: b.pts, s: this._polySize(b.pts) });
      }
    }
    for (const [, lm] of Object.entries(landmarks)) {
      if (lm.faces) {
        for (const face of lm.faces) {
          features.push({ t: "b", z: face.z, p: face.pts, s: this._polySize(face.pts) });
        }
      }
    }
    for (const m of metro) {
      features.push({ t: "m", z: m.z, p: m.pts, s: this._lineSize(m.pts) });
    }

    features.sort((a, b) => a.z - b.z);
    this._features = features;
    this._loaded = true;
    this._buildGrid();
    return features.length;
  },

  _polySize: function (pts) {
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    for (const pt of pts) {
      if (pt[0] < minLat) minLat = pt[0];
      if (pt[0] > maxLat) maxLat = pt[0];
      if (pt[1] < minLng) minLng = pt[1];
      if (pt[1] > maxLng) maxLng = pt[1];
    }
    return Math.max(maxLat - minLat, maxLng - minLng);
  },

  _lineSize: function (pts) {
    if (pts.length < 2) return 0;
    const dx = pts[1][1] - pts[0][1];
    const dy = pts[1][0] - pts[0][0];
    return Math.sqrt(dx * dx + dy * dy);
  },

  _buildGrid: function () {
    const gz = this._gridZoom;
    const scale = Math.pow(2, gz);
    const ts = this.options.tileSize;
    const grid = {};
    for (let i = 0; i < this._features.length; i++) {
      const f = this._features[i];
      let minPx = Infinity, minPy = Infinity, maxPx = -Infinity, maxPy = -Infinity;
      for (const pt of f.p) {
        const px = pt[1] * scale;
        const py = -pt[0] * scale;
        if (px < minPx) minPx = px;
        if (py < minPy) minPy = py;
        if (px > maxPx) maxPx = px;
        if (py > maxPy) maxPy = py;
      }
      const txMin = Math.floor(minPx / ts);
      const txMax = Math.floor(maxPx / ts);
      const tyMin = Math.floor(minPy / ts);
      const tyMax = Math.floor(maxPy / ts);
      for (let tx = txMin; tx <= txMax; tx++) {
        for (let ty = tyMin; ty <= tyMax; ty++) {
          const key = tx + "," + ty;
          if (!grid[key]) grid[key] = [];
          grid[key].push(i);
        }
      }
    }
    this._grid = grid;
  },

  createTile: function (coords, done) {
    const tile = document.createElement("canvas");
    const ts = this.options.tileSize;
    tile.width = ts;
    tile.height = ts;

    if (!this._loaded || !this._map) {
      setTimeout(() => done(null, tile), 0);
      return tile;
    }

    const cacheKey = coords.x + "," + coords.y + "," + coords.z;
    const cached = this._tileCache[cacheKey];
    if (cached) {
      const ctx = tile.getContext("2d");
      ctx.drawImage(cached, 0, 0);
      setTimeout(() => done(null, tile), 0);
      return tile;
    }

    const ctx = tile.getContext("2d");
    const zoom = coords.z;
    const scale = Math.pow(2, zoom);

    const nw = this._map.unproject(L.point(coords.x * ts, coords.y * ts), zoom);
    const se = this._map.unproject(L.point((coords.x + 1) * ts, (coords.y + 1) * ts), zoom);
    const originX = nw.lng * scale;
    const originY = -nw.lat * scale;

    const gz = this._gridZoom;
    const gScale = Math.pow(2, gz);
    const refTxMin = Math.floor(nw.lng * gScale / ts);
    const refTxMax = Math.floor((se.lng * gScale - 0.001) / ts);
    const refTyMin = Math.floor(-nw.lat * gScale / ts);
    const refTyMax = Math.floor((-se.lat * gScale - 0.001) / ts);

    const seen = new Set();
    const indices = [];
    for (let tx = refTxMin; tx <= refTxMax; tx++) {
      for (let ty = refTyMin; ty <= refTyMax; ty++) {
        const bucket = this._grid[tx + "," + ty];
        if (!bucket) continue;
        for (const idx of bucket) {
          if (!seen.has(idx)) { seen.add(idx); indices.push(idx); }
        }
      }
    }

    if (indices.length === 0) {
      setTimeout(() => done(null, tile), 0);
      return tile;
    }

    indices.sort((a, b) => this._features[a].z - this._features[b].z);

    const minSize = 1.0 / scale;
    const showRoads = this.options.showRoads;
    const showBuildings = this.options.showBuildings;
    const showMetro = this.options.showMetro;

    const style = getComputedStyle(document.documentElement);
    const roadColor = style.getPropertyValue("--overlay-road").trim() || "rgba(110,100,85,0.47)";
    const buildingFill = style.getPropertyValue("--overlay-building-fill").trim() || "rgba(150,155,170,0.94)";
    const metroColor = style.getPropertyValue("--overlay-metro").trim() || "rgba(200,180,60,0.9)";
    const metroWidth = zoom >= 5 ? 2 : 1;

    requestAnimationFrame(() => {
      let currentStyle = "";
      let currentIsStroke = false;

      for (const idx of indices) {
        const f = this._features[idx];
        if (f.s < minSize) continue;
        if (f.t === "r" && !showRoads) continue;
        if (f.t === "b" && !showBuildings) continue;
        if (f.t === "m" && !showMetro) continue;

        const pts = f.p;

        if (f.t === "m") {
          if (pts.length < 2) continue;
          if (!currentIsStroke || currentStyle !== metroColor) {
            ctx.strokeStyle = metroColor;
            ctx.lineWidth = metroWidth;
            currentStyle = metroColor;
            currentIsStroke = true;
          }
          ctx.beginPath();
          ctx.moveTo(pts[0][1] * scale - originX, -pts[0][0] * scale - originY);
          ctx.lineTo(pts[1][1] * scale - originX, -pts[1][0] * scale - originY);
          ctx.stroke();
        } else if (f.t === "r") {
          if (pts.length < 3) continue;
          if (currentIsStroke || currentStyle !== roadColor) {
            ctx.fillStyle = roadColor;
            currentStyle = roadColor;
            currentIsStroke = false;
          }
          ctx.beginPath();
          ctx.moveTo(pts[0][1] * scale - originX, -pts[0][0] * scale - originY);
          for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i][1] * scale - originX, -pts[i][0] * scale - originY);
          }
          ctx.fill();
        } else {
          if (pts.length < 3) continue;
          if (currentIsStroke || currentStyle !== buildingFill) {
            ctx.fillStyle = buildingFill;
            currentStyle = buildingFill;
            currentIsStroke = false;
          }
          ctx.beginPath();
          ctx.moveTo(pts[0][1] * scale - originX, -pts[0][0] * scale - originY);
          for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i][1] * scale - originX, -pts[i][0] * scale - originY);
          }
          ctx.fill();
        }
      }

      createImageBitmap(tile).then((bitmap) => {
        const keys = Object.keys(this._tileCache);
        if (keys.length >= this._tileCacheMax) {
          for (let i = 0; i < 50; i++) { this._tileCache[keys[i]].close(); delete this._tileCache[keys[i]]; }
        }
        this._tileCache[cacheKey] = bitmap;
      }).catch(() => {});

      done(null, tile);
    });

    return tile;
  },

  setVisibility: function (opts) {
    let changed = false;
    for (const [k, v] of Object.entries(opts)) {
      if (this.options[k] !== v) { this.options[k] = v; changed = true; }
    }
    if (changed) {
      for (const k in this._tileCache) { this._tileCache[k].close(); }
      this._tileCache = {};
      this.redraw();
    }
  },

  clearCache: function () {
    for (const k in this._tileCache) { this._tileCache[k].close(); }
    this._tileCache = {};
    if (this._map && this._map.hasLayer(this)) this.redraw();
  },
});

// ── Overlay Manager ──────────────────────────────────────────────────
// Central controller for all overlay layers. Called by app.js UI controls.

NCZ.initOverlays = function (map, mapBounds) {
  const DISTRICT_ZOOM_MAX = 3;

  // Panes
  map.createPane("overlayPane");
  map.getPane("overlayPane").style.zIndex = 450;
  map.createPane("districtPane");
  map.getPane("districtPane").style.zIndex = 460;

  // ── Canvas overlay (roads/buildings/metro) ──────────────────────────
  const canvasLayer = new NCZ.OverlayRenderer({ pane: "overlayPane" });

  canvasLayer.loadData().then((count) => {
    console.log(`[NCZ] Overlay: ${count.toLocaleString()} features loaded`);
    canvasLayer.redraw();
  });

  // ── District/subdistrict borders ───────────────────────────────────
  let districtLayer = null;
  let subDistrictLayer = null;
  let districtsEnabled = true;  // Districts shown by default on both map types

  fetch("data/subdistricts.json")
    .then((r) => r.json())
    .then((data) => {
      const districtFeatures = [];
      const subDistrictFeatures = [];

      for (const dist of data.districts) {
        const color = NCZ.DISTRICT_COLORS[dist.id] || "#ffffff";

        if (dist.polygon) {
          const ring = dist.polygon.map((pt) => {
            const ll = NCZ.cetToLeaflet(pt[0], pt[1]);
            return [ll[1], ll[0]];
          });
          ring.push(ring[0]);
          districtFeatures.push({
            type: "Feature",
            properties: { name: dist.name, id: dist.id, color },
            geometry: { type: "Polygon", coordinates: [ring] },
          });
        }

        for (const sub of dist.subdistricts || []) {
          if (!sub.polygon) continue;
          const subRing = sub.polygon.map((pt) => {
            const ll = NCZ.cetToLeaflet(pt[0], pt[1]);
            return [ll[1], ll[0]];
          });
          subRing.push(subRing[0]);
          const feature = {
            type: "Feature",
            properties: { name: sub.name, id: sub.id, parent: dist.id, color },
            geometry: { type: "Polygon", coordinates: [subRing] },
          };
          subDistrictFeatures.push(feature);
          // Non-canonical subdistricts (casino) also go in the district layer
          // so they're visible at all zoom levels, not just zoom 4+
          if (sub.canonical === false) {
            districtFeatures.push(feature);
          }
        }
      }

      districtLayer = L.geoJSON(
        { type: "FeatureCollection", features: districtFeatures },
        {
          pane: "districtPane",
          style: (f) => ({ fill: false, color: f.properties.color, weight: 3, opacity: 0.8 }),
        }
      );

      subDistrictLayer = L.geoJSON(
        { type: "FeatureCollection", features: subDistrictFeatures },
        {
          pane: "districtPane",
          style: (f) => ({ fill: false, color: f.properties.color, weight: 3, opacity: 0.8 }),
        }
      );

      // Debug: log casino feature to verify coordinates
      const casinoFeature = subDistrictFeatures.find((f) => f.properties.id === "north_oaks_casino");
      if (casinoFeature) {
        const coords = casinoFeature.geometry.coordinates[0];
        console.log("[NCZ] Casino polygon:", coords.length, "points, first:", coords[0], "last:", coords[coords.length - 1]);
      }

      // Log what was included
      const casinoIncluded = subDistrictFeatures.some((f) => f.properties.id === "north_oaks_casino");
      console.log(`[NCZ] Districts: ${districtFeatures.length} districts, ${subDistrictFeatures.length} subdistricts (casino: ${casinoIncluded})`);

      // Show districts immediately if enabled (default on both map types)
      if (districtsEnabled) updateDistrictZoom();
    });

  // Zoom-based district/subdistrict switching
  // At low zoom: show district outlines only
  // At high zoom: show subdistrict outlines + districts that have NO subdistricts
  //               (e.g. Morro Rock, Dogtown — they stay visible at all zooms)
  function updateDistrictZoom() {
    if (!districtsEnabled || !districtLayer || !subDistrictLayer) return;
    const zoom = map.getZoom();
    if (zoom <= DISTRICT_ZOOM_MAX) {
      if (!map.hasLayer(districtLayer)) districtLayer.addTo(map);
      if (map.hasLayer(subDistrictLayer)) map.removeLayer(subDistrictLayer);
    } else {
      // Keep district layer visible — it contains districts with no subs
      // (Morro Rock, Dogtown). The subdistrict layer adds the detail.
      if (!map.hasLayer(districtLayer)) districtLayer.addTo(map);
      if (!map.hasLayer(subDistrictLayer)) subDistrictLayer.addTo(map);
    }
  }

  map.on("zoomend", updateDistrictZoom);

  // ── Contour lines ──────────────────────────────────────────────────
  let contourLayer = null;

  fetch("data/terrain_contours.json")
    .then((r) => r.json())
    .then((contours) => {
      const features = contours.map((c) => ({
        type: "Feature",
        properties: { level: c.level },
        geometry: {
          type: "LineString",
          coordinates: c.pts.map((pt) => [pt[1], pt[0]]),
        },
      }));

      contourLayer = L.geoJSON(
        { type: "FeatureCollection", features },
        { pane: "overlayPane", style: { color: "rgba(109,138,176,0.3)", weight: 0.5 } }
      );

      console.log(`[NCZ] Contours: ${features.length} lines`);
    });

  // ── Base layer switching ───────────────────────────────────────────
  const satelliteTiles = L.tileLayer("assets/tiles/{z}/{x}/{y}.png", {
    minZoom: 0, maxNativeZoom: 5, maxZoom: 8, tileSize: 256, noWrap: true, bounds: mapBounds,
  });

  const terrainOverlay = L.imageOverlay("assets/img/terrain_8k.webp", mapBounds, { zIndex: 1 });

  let activeBaseLayer = "satellite";
  satelliteTiles.addTo(map);

  NCZ.switchBaseLayer = function (layerName) {
    if (layerName === activeBaseLayer) return;

    // Remove current
    if (activeBaseLayer === "satellite") {
      map.removeLayer(satelliteTiles);
    } else {
      map.removeLayer(terrainOverlay);
      if (map.hasLayer(canvasLayer)) map.removeLayer(canvasLayer);
      if (districtLayer && map.hasLayer(districtLayer)) map.removeLayer(districtLayer);
      if (subDistrictLayer && map.hasLayer(subDistrictLayer)) map.removeLayer(subDistrictLayer);
      if (contourLayer && map.hasLayer(contourLayer)) map.removeLayer(contourLayer);
    }

    // Add new
    if (layerName === "satellite") {
      satelliteTiles.addTo(map);
      canvasLayer.setVisibility({ showRoads: false, showBuildings: false, showMetro: false });
      districtsEnabled = true;
      updateDistrictZoom();
    } else {
      terrainOverlay.addTo(map);
      canvasLayer.addTo(map);
      canvasLayer.setVisibility({ showRoads: true, showBuildings: true, showMetro: true });
      districtsEnabled = true;
      updateDistrictZoom();
    }

    activeBaseLayer = layerName;
  };

  // ── Overlay toggling ───────────────────────────────────────────────

  NCZ.toggleOverlay = function (overlay, visible) {
    // Canvas overlays
    if (overlay === "roads" || overlay === "buildings" || overlay === "metro") {
      const opts = {};
      opts["show" + overlay.charAt(0).toUpperCase() + overlay.slice(1)] = visible;
      canvasLayer.setVisibility(opts);

      const anyOn = canvasLayer.options.showRoads || canvasLayer.options.showBuildings || canvasLayer.options.showMetro;
      if (anyOn && !map.hasLayer(canvasLayer)) canvasLayer.addTo(map);
      else if (!anyOn && map.hasLayer(canvasLayer)) map.removeLayer(canvasLayer);
    }

    // Districts
    if (overlay === "districts") {
      districtsEnabled = visible;
      if (visible) {
        updateDistrictZoom();
      } else {
        if (districtLayer && map.hasLayer(districtLayer)) map.removeLayer(districtLayer);
        if (subDistrictLayer && map.hasLayer(subDistrictLayer)) map.removeLayer(subDistrictLayer);
      }
    }

    // Contours
    if (overlay === "contours") {
      if (visible && contourLayer) contourLayer.addTo(map);
      else if (!visible && contourLayer && map.hasLayer(contourLayer)) map.removeLayer(contourLayer);
    }
  };

  // Theme change cache clear
  NCZ._clearOverlayCache = function () {
    canvasLayer.clearCache();
  };
};
