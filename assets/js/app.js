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
        // Fetch both mods and tags in parallel
        const [modsRes, tagsRes] = await Promise.all([
            fetch('mods.json'),
            fetch('data/tags.json')
        ]);
        
        const mods = await modsRes.json();
        const tagsDict = await tagsRes.json();
        
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

            // Build Link based on nexus_id
            const nexus_id_lower = String(mod.nexus_id).toLowerCase();
            let nexusUrl = `https://www.nexusmods.com/cyberpunk2077/mods/${mod.nexus_id}`;
            let nexusLabel = 'View on Nexus';

            if (nexus_id_lower === 'wip') {
                nexusUrl = 'https://www.nexusmods.com/games/cyberpunk2077';
                nexusLabel = 'Status: WIP';
            } else if (nexus_id_lower === 'dummy') {
                nexusUrl = 'https://www.nexusmods.com/games/cyberpunk2077';
                nexusLabel = 'Status: Dummy/Test';
            }

            // Build Authors HTML
            const authorsHtml = mod.authors.map(author => `
                <a href="https://www.nexusmods.com/profile/${author}/mods?gameId=3333" target="_blank" class="author-link">👤 ${author}</a>
            `).join(' ');

            // Build Tags HTML
            const tagsHtml = (mod.tags || []).map(tag => {
                const def = tagsDict[tag] || '';
                return `<span class="tag-badge" title="${def}">${tag}</span>`;
            }).join('');

            const popupContent = `
                <div class="custom-popup">
                    <div class="custom-popup-title">${mod.name}</div>
                    <div class="custom-popup-authors">${authorsHtml}</div>
                    ${mod.credits ? `<div class="custom-popup-credits">Credits: ${mod.credits}</div>` : ''}
                    <div class="custom-popup-desc">${mod.description}</div>
                    <div class="custom-popup-tags">${tagsHtml}</div>
                    <a href="${nexusUrl}" target="_blank" class="custom-popup-link">${nexusLabel}</a>
                </div>
            `;
            marker.bindPopup(popupContent);

            // Add to Sidebar
            const li = document.createElement('li');
            li.className = 'mod-item';
            li.dataset.category = mod.category;
            li.dataset.tags = (mod.tags || []).join(',');
            li.innerHTML = `
                <span class="mod-item-name">${mod.name}</span>
                <span class="mod-item-author">by ${mod.authors.join(', ')}</span>
                <div class="mod-item-meta">
                    <span class="mod-item-category badge-${mod.category}">${catStyle.label}</span>
                </div>
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

        // Add Tags filter UI
        const tagsHeader = document.createElement('div');
        tagsHeader.className = 'sidebar-section-header';
        tagsHeader.textContent = 'Filter by Tags';
        filterContainer.appendChild(tagsHeader);

        const tagsFilterContainer = document.createElement('div');
        tagsFilterContainer.id = 'tag-filters';
        const usedTags = new Set();
        mods.forEach(mod => (mod.tags || []).forEach(t => usedTags.add(t)));
        
        Array.from(usedTags).sort().forEach(tag => {
            const def = tagsDict[tag] || '';
            const btn = document.createElement('button');
            btn.className = 'tag-filter-btn';
            btn.textContent = tag;
            btn.title = def;
            btn.dataset.tag = tag;
            btn.addEventListener('click', () => {
                btn.classList.toggle('active');
                applyFilters();
            });
            tagsFilterContainer.appendChild(btn);
        });
        filterContainer.appendChild(tagsFilterContainer);

        // 6. Setup Text Search
        const searchInput = document.getElementById('mod-search');
        searchInput.addEventListener('input', () => {
            applyFilters();
        });

        // Centralized Filter Logic
        function applyFilters() {
            const query = searchInput.value.toLowerCase();
            const activeCats = Array.from(filterContainer.querySelectorAll('.filter-btn.active')).map(b => b.dataset.category);
            const activeTags = Array.from(filterContainer.querySelectorAll('.tag-filter-btn.active')).map(b => b.dataset.tag);
            
            // Toggle layer groups based on category buttons
            Object.keys(categoryLayers).forEach(cat => {
                const shouldShow = activeCats.includes(cat);
                if (shouldShow) {
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
                const modTags = (li.dataset.tags || '').split(',');

                const matchesSearch = modName.includes(query) || modAuthor.includes(query);
                const matchesCategory = activeCats.includes(modCat);
                const matchesTags = activeTags.length === 0 || activeTags.some(t => modTags.includes(t));

                li.style.display = (matchesSearch && matchesCategory && matchesTags) ? 'block' : 'none';
                
                // Also need to filter markers individually if we want tag filtering to affect the map
                // (Currently, category layers toggle whole groups. If we want per-marker tag filtering, 
                // we'd need a more granular approach than LayerGroups).
            });
        }

    } catch (error) {
        console.error('Error loading mod data:', error);
    }
}

