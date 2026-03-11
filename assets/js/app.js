document.addEventListener("DOMContentLoaded", () => {
  // Welcome Modal Logic — runs immediately, independent of map loading
  const welcomeModal = document.getElementById("welcome-modal");
  const closeModalBtn = document.getElementById("close-modal");

  if (!sessionStorage.getItem("nc_zoning_board_visited")) {
    welcomeModal.classList.remove("hidden");
  } else {
    welcomeModal.classList.add("hidden");
  }

  closeModalBtn.addEventListener("click", () => {
    welcomeModal.classList.add("hidden");
    sessionStorage.setItem("nc_zoning_board_visited", "true");
  });

  // About Modal Logic
  const aboutBtn = document.getElementById("about-btn");
  const aboutModal = document.getElementById("about-modal");
  const closeAboutBtn = document.getElementById("close-about-modal");

  aboutBtn.addEventListener("click", () => {
    aboutModal.classList.remove("hidden");
  });

  closeAboutBtn.addEventListener("click", () => {
    aboutModal.classList.add("hidden");
  });

  // Sync Offset Telemetry Animation
  const statusLed = document.querySelector(".status-led");
  const statusLabel = document.querySelector(".status-label");
  const statusTelemetry = document.querySelector(".status-telemetry");

  if (statusLed && statusLabel && statusTelemetry) {
    setInterval(() => {
      // Generate mostly low values with occasional spikes
      let offset;
      const roll = Math.random();
      if (roll < 0.85) {
        offset = Math.random() * 200; // Normal: 0–200ms
      } else if (roll < 0.95) {
        offset = 200 + Math.random() * 600; // Elevated: 200–800ms
      } else {
        offset = 800 + Math.random() * 1000; // Critical: >800ms
      }

      statusTelemetry.textContent = `SYNC_OFFSET: ${offset.toFixed(2)}ms`;

      // Update LED and status based on thresholds
      statusLed.classList.remove("led-amber", "led-red");
      statusLabel.classList.remove("status-elevated", "status-critical");

      if (offset > 800) {
        statusLed.classList.add("led-red");
        statusLabel.classList.add("status-critical");
        statusLabel.textContent = "[SYSTEM_STATUS: CRITICAL]";
      } else if (offset > 200) {
        statusLed.classList.add("led-amber");
        statusLabel.classList.add("status-elevated");
        statusLabel.textContent = "[SYSTEM_STATUS: ELEVATED]";
      } else {
        statusLabel.textContent = "[SYSTEM_STATUS: NOMINAL]";
      }
    }, 2000);
  }

  initMap();
});

const CATEGORY_STYLES = {
  "location-overhaul": {
    color: "#00f0ff",
    label: "Overhaul",
    class: "cat-location-overhaul",
  },
  "new-location": {
    color: "#ffb300",
    label: "New Location",
    class: "cat-new-location",
  },
  other: { color: "#8892b0", label: "Other", class: "cat-other" },
};

const NEXUS_GAME_ID = 3333; // Cyberpunk 2077
const NEXUS_GQL_ENDPOINT = "https://api.nexusmods.com/v2/graphql";

// Convert gameId + modId → Nexus UID (composite BigInt key)
function toNexusUid(modId) {
  return ((BigInt(NEXUS_GAME_ID) << BigInt(32)) + BigInt(modId)).toString();
}

// Batch-fetch mod thumbnails from Nexus V2 GraphQL API (no auth needed for public data)
// NOTE from Nexus Mods (Pickysaurus): The V2 API is technically unsupported, and long-term
// they intend to move back to REST. This implementation might need an update in the future if V2 is retired.
async function fetchNexusThumbnails(nexusIds) {
  const validIds = nexusIds.filter((id) => {
    if (!id) return false;
    const lower = id.toLowerCase();
    if (lower === "wip" || lower === "dummy") return false;
    return /^\d+$/.test(id); // Must be numeric
  });
  if (validIds.length === 0) return {};

  const uids = validIds.map((id) => toNexusUid(id));
  const query = `query modsByUid($uids: [ID!]!) {
        modsByUid(uids: $uids) {
            nodes {
                modId
                pictureUrl
                thumbnailUrl
            }
        }
    }`;

  try {
    const res = await fetch(NEXUS_GQL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: { uids } }),
    });
    const json = await res.json();
    const nodes = json?.data?.modsByUid?.nodes || [];
    const thumbMap = {};
    nodes.forEach((node) => {
      thumbMap[String(node.modId)] = {
        pictureUrl: node.pictureUrl,
        thumbnailUrl: node.thumbnailUrl,
      };
    });
    return thumbMap;
  } catch (err) {
    console.warn("Failed to fetch Nexus thumbnails:", err);
    return {};
  }
}

// Forward: CET (x, y) → Leaflet [lat, lng]
function cetToLeaflet(cetX, cetY) {
  const lat = 0.02101335 * cetY - 93.68566;
  const lng = 0.0208623 * cetX + 132.8016;
  return [lat, lng];
}

async function initMap() {
  // 1. Setup Map
  const map = L.map("map", {
    crs: L.CRS.Simple,
    minZoom: 0,
    maxZoom: 8,
    maxBoundsViscosity: 1.0,
    attributionControl: false,
    zoomControl: false, // Disable default top-left zoom control
  });

  // Add zoom control manually to the bottom right
  L.control.zoom({ position: "bottomright" }).addTo(map);

  const maxZoom = 5;
  const southWest = map.unproject([0, 8192], maxZoom);
  const northEast = map.unproject([8192, 0], maxZoom);
  const mapBounds = new L.LatLngBounds(southWest, northEast);

  L.tileLayer("assets/tiles/{z}/{x}/{y}.png", {
    minZoom: 0,
    maxNativeZoom: 5,
    maxZoom: 8,
    tileSize: 256,
    noWrap: true,
    bounds: mapBounds,
  }).addTo(map);

  map.fitBounds(mapBounds);
  map.setMaxBounds(mapBounds);

  // 2. State & UI Elements
  const markerClusterGroup = L.markerClusterGroup({
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true,
    maxClusterRadius: 40,
    polygonOptions: {
      fillColor: "#00f0ff",
      color: "#00f0ff",
      weight: 1,
      opacity: 1,
      fillOpacity: 0.1,
    },
  }).addTo(map);

  // Cluster Hover Spiderfy (debounced)
  let spiderfyTimer = null;
  let currentSpiderfied = null;
  let popupOpen = false;

  // Track popup state to prevent unspiderfy while a popup is visible
  map.on("popupopen", () => {
    popupOpen = true;
    if (spiderfyTimer) {
      clearTimeout(spiderfyTimer);
      spiderfyTimer = null;
    }
  });
  map.on("popupclose", () => {
    popupOpen = false;
  });

  markerClusterGroup.on("clustermouseover", function (a) {
    if (spiderfyTimer) {
      clearTimeout(spiderfyTimer);
      spiderfyTimer = null;
    }
    if (currentSpiderfied && currentSpiderfied !== a.layer) {
      currentSpiderfied.unspiderfy();
    }
    a.layer.spiderfy();
    currentSpiderfied = a.layer;
  });

  markerClusterGroup.on("clustermouseout", function () {
    if (!popupOpen) {
      spiderfyTimer = setTimeout(() => {
        if (currentSpiderfied && !popupOpen) {
          currentSpiderfied.unspiderfy();
          currentSpiderfied = null;
        }
      }, 500);
    }
  });

  // Keep fan open while hovering a spiderfied child marker
  markerClusterGroup.on("mouseover", function () {
    if (spiderfyTimer) {
      clearTimeout(spiderfyTimer);
      spiderfyTimer = null;
    }
  });

  markerClusterGroup.on("mouseout", function () {
    if (currentSpiderfied && !popupOpen) {
      spiderfyTimer = setTimeout(() => {
        if (currentSpiderfied && !popupOpen) {
          currentSpiderfied.unspiderfy();
          currentSpiderfied = null;
        }
      }, 500);
    }
  });

  // Immediately collapse on map click or zoom
  map.on("click", () => {
    if (spiderfyTimer) {
      clearTimeout(spiderfyTimer);
      spiderfyTimer = null;
    }
    if (currentSpiderfied) {
      currentSpiderfied.unspiderfy();
      currentSpiderfied = null;
    }
  });

  map.on("zoomstart", () => {
    if (spiderfyTimer) {
      clearTimeout(spiderfyTimer);
      spiderfyTimer = null;
    }
    if (currentSpiderfied) {
      currentSpiderfied.unspiderfy();
      currentSpiderfied = null;
    }
  });

  const allMarkers = [];
  const modCountEl = document.getElementById("mod-count");
  const modListEl = document.getElementById("mod-list");
  const filterContainer = document.getElementById("category-filters");
  const authorFilterContainer = document.getElementById("author-filters");
  const sidebar = document.getElementById("sidebar");
  const sidebarClose = document.getElementById("sidebar-close");
  const sidebarOpen = document.getElementById("sidebar-open");

  // Close Sidebar
  sidebarClose.addEventListener("click", () => {
    sidebar.classList.add("hidden");
    sidebarOpen.classList.add("visible");
  });

  // Open Sidebar
  sidebarOpen.addEventListener("click", () => {
    sidebar.classList.remove("hidden");
    sidebarOpen.classList.remove("visible");
  });

  // Auto-hide sidebar on mobile screens
  if (window.innerWidth < 768) {
    sidebar.classList.add("hidden");
    sidebarOpen.classList.add("visible");
  }

  // 3. Fetch and Setup Data
  try {
    // Fetch both mods and tags in parallel
    const [modsRes, tagsRes] = await Promise.all([
      fetch("mods.json"),
      fetch("data/tags.json"),
    ]);

    const mods = await modsRes.json();
    const tagsDict = await tagsRes.json();

    modCountEl.textContent = `(${mods.length})`;

    // Fetch Nexus thumbnails for all mods
    const nexusIds = mods.map((m) => String(m.nexus_id)).filter(Boolean);
    const nexusThumbs = await fetchNexusThumbnails(nexusIds);

    mods
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((mod) => {
        const [lat, lng] = cetToLeaflet(mod.coordinates[0], mod.coordinates[1]);
        const catStyle =
          CATEGORY_STYLES[mod.category] || CATEGORY_STYLES["other"];

        // Custom Marker Icon (Diamond/Square for Night Corp)
        const icon = L.divIcon({
          className: "category-marker",
          html: `<div class="marker-pin ${catStyle.class}" style="transform: rotate(45deg);"></div>`,
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        });

        const marker = L.marker([lat, lng], { icon });
        marker.modData = mod; // Store data for filtering later
        allMarkers.push(marker);
        markerClusterGroup.addLayer(marker);

        // Build Link based on nexus_id
        const nexus_id_lower = String(mod.nexus_id).toLowerCase();
        let nexusUrl = `https://www.nexusmods.com/cyberpunk2077/mods/${mod.nexus_id}`;
        let nexusLabel = "View on Nexus";

        if (nexus_id_lower === "wip") {
          nexusUrl = "https://www.nexusmods.com/games/cyberpunk2077";
          nexusLabel = "Status: WIP";
        } else if (nexus_id_lower === "dummy") {
          nexusUrl = "https://www.nexusmods.com/games/cyberpunk2077";
          nexusLabel = "Status: Dummy/Test";
        }

        // Build Authors HTML
        const authorsHtml = mod.authors
          .map(
            (author) => `
                <a href="https://www.nexusmods.com/profile/${author}/mods?gameId=3333" target="_blank" class="author-link">👤 ${author}</a>
            `,
          )
          .join(" ");

        // Build Tags HTML
        const tagsHtml = (mod.tags || [])
          .map((tag) => {
            const def = tagsDict[tag] || "";
            return `<span class="tag-badge" title="${def}">${tag}</span>`;
          })
          .join("");

        // Build Link for Suggesting Edits (Phase 2)
        const [cX, cY] = mod.coordinates;
        const editUrl = `https://github.com/spuddeh/nc-zoning-board/issues/new?template=modify_location.yml&location_id=${mod.id}&mod_name=${encodeURIComponent(mod.name)}&authors=${encodeURIComponent(mod.authors.join(", "))}&coord_x=${cX}&coord_y=${cY}`;

        // Use only Nexus thumbnails, skip manual images to prevent feature creep
        const nexusThumb = nexusThumbs[String(mod.nexus_id)];
        const thumbSrc = nexusThumb?.thumbnailUrl || null;
        const fullSrc = nexusThumb?.pictureUrl || null;

        const popupContent = `
                <div class="custom-popup-content">
                    <div class="custom-popup-title">${mod.name}</div>
                    <div class="custom-popup-authors">${authorsHtml}</div>
                    ${mod.credits ? `<div class="custom-popup-credits">Credits: ${mod.credits}</div>` : ""}
                    <div class="custom-popup-tags">${tagsHtml}</div>
                    ${
                      thumbSrc && fullSrc
                        ? `
                        <div class="custom-popup-images">
                            <img src="${thumbSrc}" class="popup-thumb" referrerpolicy="no-referrer" onclick="window.openImageGallery([&quot;${fullSrc}&quot;], 0)">
                        </div>
                    `
                        : ""
                    }
                    <div class="custom-popup-desc">${mod.description || "No description provided."}</div>
                    <div class="popup-actions" style="display: flex; gap: 8px; margin-top: 10px;">
                        <a href="${nexusUrl}" target="_blank" class="custom-popup-link" style="margin-top:0;">${nexusLabel}</a>
                        <a href="${editUrl}" target="_blank" class="custom-popup-link" style="margin-top:0; border-color: var(--nc-amber); color: var(--nc-amber);">Suggest Edit</a>
                    </div>
                </div>
            `;
        marker.bindPopup(popupContent);

        // Add to Sidebar
        const li = document.createElement("li");
        li.className = "mod-item";
        li.dataset.category = mod.category;
        li.dataset.tags = (mod.tags || []).join(",");
        li.innerHTML = `
                <span class="mod-item-name">${mod.name}</span>
                <span class="mod-item-author">by ${mod.authors.join(", ")}</span>
                <div class="mod-item-meta">
                    <span class="mod-item-category badge-${mod.category}">${catStyle.label}</span>
                </div>
            `;
        li.addEventListener("click", (e) => {
          if (e.target.tagName !== "A") {
            const coords = cetToLeaflet(mod.coordinates[0], mod.coordinates[1]);
            map.flyTo(coords, 5);
            marker.openPopup();
            if (window.innerWidth < 768) sidebar.classList.add("collapsed");
          }
        });

        // Pulse marker (or parent cluster) on sidebar hover
        li.addEventListener("mouseenter", () => {
          const element = marker.getElement();
          if (element) {
            const pin = element.querySelector(".marker-pin");
            if (pin) pin.classList.add("pulsing");
          } else {
            // Marker is inside a cluster — pulse the cluster icon
            const visibleParent = markerClusterGroup.getVisibleParent(marker);
            if (visibleParent && visibleParent !== marker) {
              const clusterEl = visibleParent.getElement();
              if (clusterEl) clusterEl.classList.add("pulsing");
            }
          }
        });
        li.addEventListener("mouseleave", () => {
          const element = marker.getElement();
          if (element) {
            const pin = element.querySelector(".marker-pin");
            if (pin) pin.classList.remove("pulsing");
          } else {
            const visibleParent = markerClusterGroup.getVisibleParent(marker);
            if (visibleParent && visibleParent !== marker) {
              const clusterEl = visibleParent.getElement();
              if (clusterEl) clusterEl.classList.remove("pulsing");
            }
          }
        });

        modListEl.appendChild(li);
      });

    // Fit map to plotted pins
    const pinBounds = L.latLngBounds(
      mods.map((mod) => cetToLeaflet(mod.coordinates[0], mod.coordinates[1])),
    );
    if (pinBounds.isValid()) {
      map.fitBounds(pinBounds, { padding: [50, 50], maxZoom: 5 });
    }

    // 5. Setup Category Filters
    const activeCategories = new Set(mods.map((m) => m.category));
    activeCategories.forEach((cat) => {
      const style = CATEGORY_STYLES[cat] || CATEGORY_STYLES["other"];
      const btn = document.createElement("button");
      btn.className = "filter-btn active";
      btn.textContent = style.label;
      btn.dataset.category = cat;
      btn.addEventListener("click", () => {
        btn.classList.toggle("active");
        applyFilters();
      });
      filterContainer.appendChild(btn);
    });

    // 5b. Setup Author Filters
    const usedAuthors = new Set();
    mods.forEach((mod) => mod.authors.forEach((a) => usedAuthors.add(a)));
    Array.from(usedAuthors)
      .sort()
      .forEach((author) => {
        const btn = document.createElement("button");
        btn.className = "tag-filter-btn"; // Reusing tag style for consistency
        btn.textContent = author;
        btn.dataset.author = author;
        btn.addEventListener("click", () => {
          btn.classList.toggle("active");
          applyFilters();
        });
        authorFilterContainer.appendChild(btn);
      });

    // Add Tags filter UI (targets static #tag-filters div in HTML)
    const tagsFilterContainer = document.getElementById("tag-filters");
    const usedTags = new Set();
    mods.forEach((mod) => (mod.tags || []).forEach((t) => usedTags.add(t)));

    Array.from(usedTags)
      .sort()
      .forEach((tag) => {
        const def = tagsDict[tag] || "";
        const btn = document.createElement("button");
        btn.className = "tag-filter-btn";
        btn.textContent = tag;
        btn.title = def;
        btn.dataset.tag = tag;
        btn.addEventListener("click", () => {
          btn.classList.toggle("active");
          applyFilters();
        });
        tagsFilterContainer.appendChild(btn);
      });

    // 6. Setup Text Search
    const searchInput = document.getElementById("mod-search");
    searchInput.addEventListener("input", () => {
      applyFilters();
    });

    // Centralized Filter Logic
    function applyFilters() {
      const query = searchInput.value.toLowerCase();
      const activeCats = Array.from(
        filterContainer.querySelectorAll(".filter-btn.active"),
      ).map((b) => b.dataset.category);
      const activeTags = Array.from(
        document.querySelectorAll("#tag-filters .tag-filter-btn.active"),
      ).map((b) => b.dataset.tag);
      const activeAuthors = Array.from(
        authorFilterContainer.querySelectorAll(".tag-filter-btn.active"),
      ).map((b) => b.dataset.author);

      // Clear current cluster group
      markerClusterGroup.clearLayers();
      const visibleMarkers = [];

      // Filter individual markers
      allMarkers.forEach((marker) => {
        const mod = marker.modData;
        const matchesSearch =
          mod.name.toLowerCase().includes(query) ||
          mod.authors.some((a) => a.toLowerCase().includes(query));
        const matchesCategory = activeCats.includes(mod.category);
        const matchesTags =
          activeTags.length === 0 ||
          activeTags.some((t) => (mod.tags || []).includes(t));
        const matchesAuthor =
          activeAuthors.length === 0 ||
          activeAuthors.some((a) => mod.authors.includes(a));

        if (matchesSearch && matchesCategory && matchesTags && matchesAuthor) {
          markerClusterGroup.addLayer(marker);
          visibleMarkers.push(marker);
        }
      });

      // Filter the sidebar list items
      const listItems = modListEl.querySelectorAll(".mod-item");
      listItems.forEach((li) => {
        const modName = li
          .querySelector(".mod-item-name")
          .textContent.toLowerCase();
        const modAuthor = li
          .querySelector(".mod-item-author")
          .textContent.toLowerCase();
        const modCat = li.dataset.category;
        const modTags = (li.dataset.tags || "").split(",");
        const modAuthors =
          mods.find(
            (m) => m.name.toLowerCase() === modName && m.category === modCat,
          )?.authors || [];

        const matchesSearch =
          modName.includes(query) || modAuthor.includes(query);
        const matchesCategory = activeCats.includes(modCat);
        const matchesTags =
          activeTags.length === 0 ||
          activeTags.some((t) => modTags.includes(t));
        const matchesAuthor =
          activeAuthors.length === 0 ||
          activeAuthors.some((a) => modAuthors.includes(a));

        li.style.display =
          matchesSearch && matchesCategory && matchesTags && matchesAuthor
            ? "block"
            : "none";
      });
    }
  } catch (error) {
    console.error("Error loading mod data:", error);
  }
}

// --- Image Gallery Modal Logic ---
let currentGallery = [];
let currentIndex = 0;

window.openImageGallery = function (images, index) {
  currentGallery = images;
  currentIndex = index;
  updateModalImage();
  const imageModal = document.getElementById("image-modal");
  if (imageModal) imageModal.classList.remove("hidden");
};

function updateModalImage() {
  const modalImage = document.getElementById("modal-image");
  const imageCounter = document.getElementById("image-counter");
  const prevBtn = document.getElementById("prev-image");
  const nextBtn = document.getElementById("next-image");

  if (modalImage) {
    modalImage.src = currentGallery[currentIndex];
    modalImage.referrerPolicy = "no-referrer";
  }
  if (imageCounter)
    imageCounter.textContent = `IMAGE ${currentIndex + 1} / ${currentGallery.length}`;
  if (prevBtn)
    prevBtn.style.display = currentGallery.length > 1 ? "block" : "none";
  if (nextBtn)
    nextBtn.style.display = currentGallery.length > 1 ? "block" : "none";
}

function closeGallery() {
  const imageModal = document.getElementById("image-modal");
  const modalImage = document.getElementById("modal-image");
  if (imageModal) imageModal.classList.add("hidden");
  if (modalImage) modalImage.src = "";
}

// Global Event Listeners for Image Modal
document.addEventListener("DOMContentLoaded", () => {
  const closeImageModal = document.getElementById("close-image-modal");
  const imageModal = document.getElementById("image-modal");
  const prevBtn = document.getElementById("prev-image");
  const nextBtn = document.getElementById("next-image");

  if (closeImageModal) closeImageModal.addEventListener("click", closeGallery);
  if (imageModal) {
    const overlay = imageModal.querySelector(".modal-overlay");
    if (overlay) overlay.addEventListener("click", closeGallery);
  }

  if (prevBtn)
    prevBtn.addEventListener("click", () => {
      currentIndex =
        (currentIndex - 1 + currentGallery.length) % currentGallery.length;
      updateModalImage();
    });

  if (nextBtn)
    nextBtn.addEventListener("click", () => {
      currentIndex = (currentIndex + 1) % currentGallery.length;
      updateModalImage();
    });
});

// Keyboard navigation
document.addEventListener("keydown", (e) => {
  const imageModal = document.getElementById("image-modal");
  if (!imageModal || imageModal.classList.contains("hidden")) return;
  if (e.key === "Escape") closeGallery();
  if (e.key === "ArrowLeft" && currentGallery.length > 1) {
    currentIndex =
      (currentIndex - 1 + currentGallery.length) % currentGallery.length;
    updateModalImage();
  }
  if (e.key === "ArrowRight" && currentGallery.length > 1) {
    currentIndex = (currentIndex + 1) % currentGallery.length;
    updateModalImage();
  }
});
