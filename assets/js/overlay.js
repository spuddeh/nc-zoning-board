/**
 * NC Zoning Board — Canvas Overlay Renderer
 *
 * Renders 380k+ overlay features (roads, buildings, landmarks, metro) into
 * canvas tiles using L.GridLayer with grid-based spatial index.
 *
 * All features are z-sorted in a single unified pass per tile so that
 * elevated roads render on top of ground buildings, metro bridges on top
 * of roads, etc. — matching the in-game map rendering.
 *
 * Depends on: constants.js, utils.js (via NCZ namespace).
 * Load order: after utils.js, before app.js.
 */

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

    // Unified feature array — all types mixed, will be z-sorted
    // t: "r"=road, "b"=building, "l"=landmark, "m"=metro
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

    // Global z-sort — draw order for correct occlusion
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

    // Check tile cache
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

    // Spatial lookup — get feature indices for this tile
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
          if (!seen.has(idx)) {
            seen.add(idx);
            indices.push(idx);
          }
        }
      }
    }

    if (indices.length === 0) {
      setTimeout(() => done(null, tile), 0);
      return tile;
    }

    // Sort indices by z (features array is globally z-sorted, but grid lookup
    // returns them in insertion order per cell, not z-order)
    indices.sort((a, b) => this._features[a].z - this._features[b].z);

    const minSize = 1.0 / scale;
    const showRoads = this.options.showRoads;
    const showBuildings = this.options.showBuildings;
    const showMetro = this.options.showMetro;

    // Read theme colours once
    const style = getComputedStyle(document.documentElement);
    const roadColor = style.getPropertyValue("--overlay-road").trim() || "rgba(110,100,85,0.47)";
    const buildingFill = style.getPropertyValue("--overlay-building-fill").trim() || "rgba(150,155,170,0.94)";
    const metroColor = style.getPropertyValue("--overlay-metro").trim() || "rgba(200,180,60,0.9)";
    const metroWidth = zoom >= 5 ? 2 : 1;

    requestAnimationFrame(() => {
      const _t0 = performance.now();

      // Unified z-sorted draw — track current style to minimize state changes
      let currentStyle = "";
      let currentIsStroke = false;

      for (const idx of indices) {
        const f = this._features[idx];

        // Visibility + LOD filter
        if (f.s < minSize) continue;
        if (f.t === "r" && !showRoads) continue;
        if (f.t === "b" && !showBuildings) continue;
        if (f.t === "m" && !showMetro) continue;

        const pts = f.p;

        if (f.t === "m") {
          // Metro line
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
          // Road fill
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
          // Building / landmark fill
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

      // Cache the rendered tile
      createImageBitmap(tile).then((bitmap) => {
        const keys = Object.keys(this._tileCache);
        if (keys.length >= this._tileCacheMax) {
          for (let i = 0; i < 50; i++) {
            this._tileCache[keys[i]].close();
            delete this._tileCache[keys[i]];
          }
        }
        this._tileCache[cacheKey] = bitmap;
      }).catch(() => {});

      const _ms = performance.now() - _t0;
      if (_ms > 50) console.log(`[tile ${coords.x},${coords.y},z${coords.z}] ${_ms.toFixed(0)}ms (${indices.length} features)`);
      done(null, tile);
    });

    return tile;
  },

  setVisibility: function (opts) {
    let changed = false;
    for (const [k, v] of Object.entries(opts)) {
      if (this.options[k] !== v) {
        this.options[k] = v;
        changed = true;
      }
    }
    if (changed) {
      for (const k in this._tileCache) {
        this._tileCache[k].close();
      }
      this._tileCache = {};
      this.redraw();
    }
  },
});

NCZ.overlayRenderer = function (options) {
  return new NCZ.OverlayRenderer(options);
};
