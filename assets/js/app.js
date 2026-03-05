document.addEventListener('DOMContentLoaded', () => {
    initMap();
});

const CATEGORY_STYLES = {
    'apartment': { color: '#fcee0a', label: 'Apartment', class: 'cat-apartment' },
    'location-overhaul': { color: '#00f0ff', label: 'Overhaul', class: 'cat-location-overhaul' },
    'new-location': { color: '#ff8c00', label: 'New Location', class: 'cat-new-location' },
    'other': { color: '#888888', label: 'Other', class: 'cat-other' }
};

// Forward: CET (x, y) → Leaflet [lat, lng]
function cetToLeaflet(cetX, cetY) {
    const lat = 0.02101335 * cetY - 93.68566;
    const lng = 0.02086230 * cetX + 132.80160;
    return [lat, lng];
}

async function initMap() {
    // 1. Setup Map
    const map = L.map('map', {
        crs: L.CRS.Simple,
        minZoom: 0,
        maxZoom: 8,
        maxBoundsViscosity: 1.0,
        attributionControl: false,
        zoomControl: false // Disable default top-left zoom control
    });

    // Add zoom control manually to the bottom right
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const maxZoom = 5;
    const southWest = map.unproject([0, 8192], maxZoom);
    const northEast = map.unproject([8192, 0], maxZoom);
    const mapBounds = new L.LatLngBounds(southWest, northEast);

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

    // 2. State & UI Elements
    const categoryLayers = {};
    const modCountEl = document.getElementById('mod-count');
    const modListEl = document.getElementById('mod-list');
    const filterContainer = document.getElementById('category-filters');
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebar-toggle');

    // Toggle Sidebar
    sidebarToggle.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        sidebarToggle.textContent = sidebar.classList.contains('collapsed') ? '▶' : '◀';
    });

    // Auto-collapse sidebar on mobile screens
    if (window.innerWidth < 768) {
        sidebar.classList.add('collapsed');
        sidebarToggle.textContent = '▶';
    }

    // 3. Fetch and Setup Data
    try {
        const response = await fetch('mods.json');
        const mods = await response.json();
        
        modCountEl.textContent = `(${mods.length})`;

        // Initialize LayerGroups for each category
        Object.keys(CATEGORY_STYLES).forEach(cat => {
            categoryLayers[cat] = L.layerGroup().addTo(map);
        });

        mods.sort((a, b) => a.name.localeCompare(b.name)).forEach(mod => {
            const [lat, lng] = cetToLeaflet(mod.coordinates[0], mod.coordinates[1]);
            const catStyle = CATEGORY_STYLES[mod.category] || CATEGORY_STYLES['other'];

            // Custom Marker Icon
            const icon = L.divIcon({
                className: 'category-marker',
                html: `<div class="marker-pin ${catStyle.class}"></div>`,
                iconSize: [14, 14],
                iconAnchor: [7, 7]
            });

            const marker = L.marker([lat, lng], { icon }).addTo(categoryLayers[mod.category] || categoryLayers['other']);

            const popupContent = `
                <div class="custom-popup">
                    <div class="custom-popup-title">${mod.name}</div>
                    <div class="custom-popup-author">by ${mod.author}</div>
                    <div class="custom-popup-desc">${mod.description}</div>
                    <a href="${mod.nexus_link}" target="_blank" class="custom-popup-link">View on Nexus</a>
                </div>
            `;
            marker.bindPopup(popupContent);

            // Add to Sidebar
            const li = document.createElement('li');
            li.className = 'mod-item';
            li.dataset.category = mod.category;
            li.innerHTML = `
                <span class="mod-item-name">${mod.name}</span>
                <span class="mod-item-author">by ${mod.author}</span>
                <span class="mod-item-category badge-${mod.category}">${catStyle.label}</span>
            `;
            li.addEventListener('click', () => {
                map.flyTo([lat, lng], 5, { duration: 1.5 });
                marker.openPopup();
                if (window.innerWidth < 768) sidebar.classList.add('collapsed');
            });
            modListEl.appendChild(li);
        });

        // 4. Fit map to plotted pins
        const pinBounds = L.latLngBounds(mods.map(mod => cetToLeaflet(mod.coordinates[0], mod.coordinates[1])));
        if (pinBounds.isValid()) {
            map.fitBounds(pinBounds, { padding: [50, 50], maxZoom: 5 });
        }

        // 5. Setup Category Filters
        const activeCategories = new Set(mods.map(m => m.category));
        activeCategories.forEach(cat => {
            const style = CATEGORY_STYLES[cat] || CATEGORY_STYLES['other'];
            const btn = document.createElement('button');
            btn.className = 'filter-btn active';
            btn.textContent = style.label;
            btn.dataset.category = cat;
            btn.addEventListener('click', () => {
                btn.classList.toggle('active');
                applyFilters();
            });
            filterContainer.appendChild(btn);
        });

        // 6. Setup Text Search
        const searchInput = document.getElementById('mod-search');
        searchInput.addEventListener('input', () => {
            applyFilters();
        });

        // Centralized Filter Logic
        function applyFilters() {
            const query = searchInput.value.toLowerCase();
            const activeCats = Array.from(filterContainer.querySelectorAll('.filter-btn.active')).map(b => b.dataset.category);
            
            // Toggle layer groups based on category buttons
            Object.keys(categoryLayers).forEach(cat => {
                if (activeCats.includes(cat)) {
                    if (!map.hasLayer(categoryLayers[cat])) map.addLayer(categoryLayers[cat]);
                } else {
                    if (map.hasLayer(categoryLayers[cat])) map.removeLayer(categoryLayers[cat]);
                }
            });

            // Filter the sidebar list items
            const listItems = modListEl.querySelectorAll('.mod-item');
            listItems.forEach(li => {
                const modName = li.querySelector('.mod-item-name').textContent.toLowerCase();
                const modAuthor = li.querySelector('.mod-item-author').textContent.toLowerCase();
                const modCat = li.dataset.category;

                const matchesSearch = modName.includes(query) || modAuthor.includes(query);
                const matchesCategory = activeCats.includes(modCat);

                li.style.display = (matchesSearch && matchesCategory) ? 'block' : 'none';
            });
        }

    } catch (error) {
        console.error('Error loading mod data:', error);
    }
}

