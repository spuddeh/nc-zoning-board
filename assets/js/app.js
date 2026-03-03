document.addEventListener('DOMContentLoaded', () => {
    initMap();
});

async function initMap() {
    // 1. Setup the Map Instance
    // Using L.CRS.Simple for game coordinates [Y, X]
    const map = L.map('map', {
        crs: L.CRS.Simple,
        minZoom: -2,
        maxZoom: 2
    });

    // 2. Define Map Bounds (Calibrated to CET coordinates)
    // Adjust these values based on the actual map image size
    const bounds = [[-3000, -3000], [3000, 3000]];
    
    // 3. Add Placeholder Image Overlay
    // In a real scenario, use night_city_map.jpg
    const image = L.imageOverlay('assets/images/night_city_map.jpg', bounds).addTo(map);
    
    map.fitBounds(bounds);
    map.setView([0, 0], 0);

    // 4. Fetch and Plot Mod Pins
    try {
        const response = await fetch('mods.json');
        if (!response.ok) throw new Error('Failed to load mods.json');
        
        const mods = await response.json();
        
        mods.forEach(mod => {
            const marker = L.marker(mod.coordinates).addTo(map);
            
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
