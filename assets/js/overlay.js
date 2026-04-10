/**
 * NC Zoning Board — Overlay Module
 * Namespace: NCZ.Overlay
 *
 * Manages overlay layers for the Leaflet satellite view:
 *   - District/subdistrict GeoJSON borders (zoom-based switching)
 *
 * Roads and metro are SCHEMA-only (rendered as GLBs in Three.js).
 * The district toggle is shared: this module handles the SAT side;
 * NCZ.ThreeScene.setLayerVisibility() handles the SCHEMA side.
 *
 * Zoom behaviour (matches SCHEMA):
 *   Zoomed out: district outlines only (outer + always layers)
 *   Zoomed in:  subdistrict outlines + always layer (outer hidden)
 *   Always visible: districts with no canonical subs (Dogtown, Morro Rock)
 *                   + canonical:false subs (casino)
 *
 * Public API (called by app.js):
 *   NCZ.Overlay.init(map)             — load subdistricts.json, add layers
 *   NCZ.Overlay.setDistricts(visible) — show/hide district borders
 *
 * Depends on: constants.js (NCZ.DISTRICT_COLORS, NCZ.DISTRICT_ZOOM_THRESHOLD), utils.js
 */

NCZ.Overlay = (() => {
  let _map = null;
  let alwaysLayer    = null; // no-sub districts + canonical:false — always visible
  let outerLayer     = null; // districts with subs — zoom-out only
  let subLayer       = null; // canonical subdistricts — zoom-in only
  let districtsVisible = true;

  const styleFeature = f => ({
    color:   f.properties.color,
    weight:  f.properties.level === "district" ? NCZ.DISTRICT_LINE_WIDTH : NCZ.SUBDISTRICT_LINE_WIDTH,
    opacity: NCZ.DISTRICT_LINE_OPACITY,
    fill:    false,
    pane:    "districtPane",
  });

  function init(map) {
    _map = map;

    map.createPane("districtPane");
    map.getPane("districtPane").style.zIndex = 460;

    fetch("data/subdistricts.json")
      .then(r => r.json())
      .then(data => {
        const alwaysFeatures = [];
        const outerFeatures  = [];
        const subFeatures    = [];

        for (const dist of data.districts) {
          const color = NCZ.DISTRICT_COLORS[dist.id] || "#ffffff";
          const canonicalSubs = (dist.subdistricts || []).filter(s => s.canonical !== false);
          const hasSubs = canonicalSubs.length > 0;

          // District outline
          if (dist.polygon?.length) {
            const coords = dist.polygon.map(pt => NCZ.cetToLeaflet(pt[0], pt[1]));
            const feature = {
              type: "Feature",
              properties: { color, name: dist.name, level: "district" },
              geometry: { type: "Polygon", coordinates: [coords.map(c => [c[1], c[0]])] },
            };
            (hasSubs ? outerFeatures : alwaysFeatures).push(feature);
          }

          // Subdistrict outlines
          for (const sub of dist.subdistricts || []) {
            if (!sub.polygon?.length) continue;
            const coords = sub.polygon.map(pt => NCZ.cetToLeaflet(pt[0], pt[1]));
            const feature = {
              type: "Feature",
              properties: { color, name: sub.name, level: "subdistrict" },
              geometry: { type: "Polygon", coordinates: [coords.map(c => [c[1], c[0]])] },
            };
            // canonical:false (casino etc) — always visible
            (sub.canonical === false ? alwaysFeatures : subFeatures).push(feature);
          }
        }

        const toLayer = features => L.geoJSON(
          { type: "FeatureCollection", features },
          { style: styleFeature, pane: "districtPane" }
        );

        alwaysLayer = toLayer(alwaysFeatures);
        outerLayer  = toLayer(outerFeatures);
        subLayer    = toLayer(subFeatures);

        map.on("zoomend", updateZoom);
        if (districtsVisible) updateZoom();
      })
      .catch(err => console.error("[NCZ] Failed to load subdistricts.json:", err));
  }

  function updateZoom() {
    if (!_map || !alwaysLayer) return;
    if (!districtsVisible) return;

    const zoomedIn = _map.getZoom() > NCZ.DISTRICT_ZOOM_THRESHOLD;

    if (!_map.hasLayer(alwaysLayer)) alwaysLayer.addTo(_map);

    if (zoomedIn) {
      if (_map.hasLayer(outerLayer)) _map.removeLayer(outerLayer);
      if (!_map.hasLayer(subLayer))  subLayer.addTo(_map);
    } else {
      if (!_map.hasLayer(outerLayer)) outerLayer.addTo(_map);
      if (_map.hasLayer(subLayer))    _map.removeLayer(subLayer);
    }
  }

  function setDistricts(visible) {
    districtsVisible = visible;
    if (!_map || !alwaysLayer) return;
    if (visible) {
      updateZoom();
    } else {
      [alwaysLayer, outerLayer, subLayer].forEach(l => {
        if (l && _map.hasLayer(l)) _map.removeLayer(l);
      });
    }
  }

  return { init, setDistricts };
})();
