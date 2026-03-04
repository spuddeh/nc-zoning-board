document.addEventListener('DOMContentLoaded', () => {
    initMap();
});

const DISTRICT_COLORS = {
    'watson':        { fill: '#0a1a3a', border: '#1a3a5c' }, // Navy Blue
    'westbrook':     { fill: '#00ced1', border: '#46afc8' }, // Teal
    'city-center':   { fill: '#00e676', border: '#69f0ae' }, // Green
    'heywood':       { fill: '#fcee0a', border: '#fff44f' }, // Gold
    'santo-domingo': { fill: '#ff8c00', border: '#ff6b35' }, // Orange
    'pacifica':      { fill: '#ff003c', border: '#ff5252' }, // Red
    'ocean':         { fill: '#0a1628', border: '#1a3a5c' },
    'badlands':      { fill: '#4a4a4a', border: '#666666' }
};

// ── Coordinate Transform (16-point grid calibration) ─────────────────
// Simple linear mapping — axes are decoupled:
//   Leaflet lat ←→ CET Y    (north-south)
//   Leaflet lng ←→ CET X    (east-west)
//
// Derived from 16-point uniform grid survey, then scaled for CRS.Simple
// tile bounds: lat [-256, 0], lng [0, 256] (8k image, maxZoom=5)
//
// Original calibration (old bounds [-4000,-4500]→[4000,4500]):
//   lat_old = 0.65666703 * CET_y + 1072.3236
//   lng_old = 0.73346813 * CET_x + 168.7723
// Scaled to [-256,0] × [0,256]:
//   new_lat = old_lat * (256/8000) - 128
//   new_lng = old_lng * (256/9000) + 128

// Forward: CET (x, y) → Leaflet [lat, lng]
function cetToLeaflet(cetX, cetY) {
    const lat = 0.02101335 * cetY - 93.68566;
    const lng = 0.02086230 * cetX + 132.80160;
    return [lat, lng];
}

// Inverse: Leaflet (lat, lng) → CET [x, y]
function leafletToCet(lat, lng) {
    const cetY = (lat + 93.68566) / 0.02101335;
    const cetX = (lng - 132.80160) / 0.02086230;
    return [cetX, cetY];
}
// ──────────────────────────────────────────────────────────────────────

async function initMap() {
    // 1. Setup Map
    const map = L.map('map', {
        crs: L.CRS.Simple,
        minZoom: 0,
        maxZoom: 8,
        attributionControl: false
    });

    // 2. Calculate bounds from image dimensions using CRS.Simple unproject
    // At maxZoom=5, the 8192×8192px image maps to these coordinates:
    const maxZoom = 5;
    const southWest = map.unproject([0, 8192], maxZoom);    // bottom-left pixel
    const northEast = map.unproject([8192, 0], maxZoom);    // top-right pixel
    const mapBounds = new L.LatLngBounds(southWest, northEast);

    // 3. Add Tile Layer (8k source, pre-generated at zoom levels 0-5)
    L.tileLayer('assets/tiles/{z}/{x}/{y}.png', {
        minZoom: 0,
        maxNativeZoom: 5,
        maxZoom: 8,
        tileSize: 256,
        noWrap: true,
        bounds: mapBounds
    }).addTo(map);

    map.fitBounds(mapBounds);
    map.setMaxBounds(mapBounds);

    // ── CALIBRATION GRID (DISABLED — calibration complete) ──────
    // To re-enable: uncomment the block below. Grid + click handler
    // for matching Leaflet coords to CET in-game coords.
    /*
    const calibrationGrid = [
        { id: 1,  lat: -500,  lng: -1500, label: '1' },
        { id: 2,  lat: -500,  lng: -500,  label: '2' },
        { id: 3,  lat: -500,  lng: 500,   label: '3' },
        { id: 4,  lat: -500,  lng: 1500,  label: '4' },
        { id: 5,  lat: 500,   lng: -1500, label: '5' },
        { id: 6,  lat: 500,   lng: -500,  label: '6' },
        { id: 7,  lat: 500,   lng: 500,   label: '7' },
        { id: 8,  lat: 500,   lng: 1500,  label: '8' },
        { id: 9,  lat: 1500,  lng: -1500, label: '9' },
        { id: 10, lat: 1500,  lng: -500,  label: '10' },
        { id: 11, lat: 1500,  lng: 500,   label: '11' },
        { id: 12, lat: 1500,  lng: 1500,  label: '12' },
        { id: 13, lat: 2500,  lng: -1500, label: '13' },
        { id: 14, lat: 2500,  lng: -500,  label: '14' },
        { id: 15, lat: 2500,  lng: 500,   label: '15' },
        { id: 16, lat: 2500,  lng: 1500,  label: '16' },
    ];
    function calibIcon(label) {
        return L.divIcon({
            className: 'calib-marker',
            html: `<div style="background:#ff0;color:#000;font-weight:900;font-family:monospace;width:28px;height:28px;border-radius:50%;border:2px solid #000;display:flex;align-items:center;justify-content:center;font-size:${label.length > 1 ? '11' : '14'}px;box-shadow:0 0 8px rgba(255,255,0,0.6);">${label}</div>`,
            iconSize: [28, 28], iconAnchor: [14, 14]
        });
    }
    calibrationGrid.forEach(pt => {
        L.marker([pt.lat, pt.lng], { icon: calibIcon(pt.label) }).addTo(map)
            .bindTooltip(`Ref #${pt.label}<br>Lat: ${pt.lat}, Lng: ${pt.lng}`, { direction: 'top', offset: [0, -16] });
    });
    map.on('click', function(e) {
        const lat = e.latlng.lat.toFixed(2), lng = e.latlng.lng.toFixed(2);
        L.popup().setLatLng(e.latlng).setContent(`<div style="font-family:monospace;font-size:13px;color:#0ff;background:#1a1a2e;padding:10px;border-radius:4px;">📍 Lat: ${lat}<br>Lng: ${lng}</div>`).openOn(map);
        console.log(`[Click] lat=${lat}, lng=${lng}`);
    });
    */
    // ── END CALIBRATION GRID ─────────────────────────────────────

    // 4. Load District Polygons (DISABLED — awaiting improved SVG source)
    // TODO: Re-enable once new district SVG is ready and coords are calibrated
    /*
    try {
        const res = await fetch('assets/data/districts_v2.json');
        const data = await res.json();

        // Calibration for SVG -> Game coordinates
        const SVG_W = 7466.6665, SVG_H = 7093.3335;
        const L_MIN_Y = -4000, L_MAX_Y = 4000;
        const L_MIN_X = -4500, L_MAX_X = 4500;

        L.geoJSON(data, {
            coordsToLatLng: function(coords) {
                // GeoJSON [x, y] mapped to Leaflet [Lat, Lng]
                const y = coords[0], x = coords[1];
                const lat = L_MAX_Y - (y / SVG_H) * (L_MAX_Y - L_MIN_Y);
                const lng = L_MIN_X + (x / SVG_W) * (L_MAX_X - L_MIN_X);
                return L.latLng(lat, lng);
            },
            style: function(feature) {
                const id = feature.properties.id;
                const colors = DISTRICT_COLORS[id] || { fill: '#ffffff', border: '#ffffff' };
                return {
                    fillColor: colors.fill,
                    fillOpacity: 0.15,
                    color: colors.border,
                    weight: 2,
                    opacity: 0.5,
                    dashArray: '5, 5'
                };
            },
            onEachFeature: function(feature, layer) {
                const id = feature.properties.id;
                if (id !== 'unknown' && id !== 'ocean' && id !== 'badlands') {
                    layer.bindTooltip(id.replace('-', ' ').toUpperCase(), {
                        sticky: true,
                        className: 'district-tooltip'
                    });
                }
                
                layer.on({
                    mouseover: (e) => {
                        e.target.setStyle({ fillOpacity: 0.4, weight: 3, opacity: 1 });
                    },
                    mouseout: (e) => {
                        e.target.setStyle({ fillOpacity: 0.15, weight: 2, opacity: 0.5 });
                    }
                });
            }
        }).addTo(map);
    } catch (err) {
        console.error('Error loading districts:', err);
    }
    */

    // 5. Fetch and Plot Mod Pins
    try {
        const response = await fetch('mods.json');
        const mods = await response.json();

        mods.forEach(mod => {
            // Convert CET coords [x, y] to Leaflet [lat, lng]
            const [lat, lng] = cetToLeaflet(mod.coordinates[0], mod.coordinates[1]);
            const marker = L.marker([lat, lng]).addTo(map);

            const popupContent = `
                <div class="custom-popup">
                    <div class="custom-popup-title">${mod.name}</div>
                    <div class="custom-popup-author">by ${mod.author}</div>
                    <div class="custom-popup-desc">${mod.description}</div>
                    <a href="${mod.nexus_link}" target="_blank" class="custom-popup-link">View on Nexus</a>
                </div>
            `;
            marker.bindPopup(popupContent);
        });
    } catch (error) {
        console.error('Error loading mod data:', error);
    }
}
