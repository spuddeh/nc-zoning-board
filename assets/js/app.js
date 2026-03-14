// HTML escape utility — prevents XSS from user-supplied data (Nexus API, submitted JSON)
function escapeHtml(text) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(text).replace(/[&<>"']/g, (m) => map[m]);
}

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

  // BBCode Generator Modal Logic
  const bbcodeBtn = document.getElementById("bbcode-btn");
  const bbcodeSidebarBtn = document.getElementById("bbcode-sidebar-btn");
  const bbcodeModal = document.getElementById("bbcode-modal");
  const closeBbcodeModalBtn = document.getElementById("close-bbcode-modal");

  function openBbcodeModal() {
    bbcodeModal.classList.remove("hidden");
  }
  function closeBbcodeModal() {
    bbcodeModal.classList.add("hidden");
  }

  if (bbcodeBtn) bbcodeBtn.addEventListener("click", openBbcodeModal);
  if (bbcodeSidebarBtn) bbcodeSidebarBtn.addEventListener("click", openBbcodeModal);
  if (closeBbcodeModalBtn) closeBbcodeModalBtn.addEventListener("click", closeBbcodeModal);

  const bbcodeGenerateBtn = document.getElementById("bbcode-generate-btn");
  if (bbcodeGenerateBtn) {
    bbcodeGenerateBtn.addEventListener("click", () => {
      const x = document.getElementById("bbcode-coord-x").value.trim();
      const y = document.getElementById("bbcode-coord-y").value.trim();
      const category = document.getElementById("bbcode-category").value;
      const credits = document.getElementById("bbcode-credits").value.trim();
      const authors = document.getElementById("bbcode-authors").value.trim();
      const spoiler = document.getElementById("bbcode-spoiler").checked;

      const xNum = parseFloat(x);
      const yNum = parseFloat(y);
      if (!Number.isFinite(xNum) || !Number.isFinite(yNum)) {
        alert("Please enter valid X and Y coordinates.");
        return;
      }
      if (Math.abs(xNum) > 5000 || Math.abs(yNum) > 5000) {
        alert("Coordinates appear out of range. Night City CET coords are typically within \u00b14000. Check your values.");
        return;
      }
      if (!category) {
        alert("Please select a category.");
        return;
      }

      const selectedTags = Array.from(
        document.querySelectorAll("#bbcode-tag-checkboxes input:checked"),
      ).map((cb) => cb.value).join(",");

      const lines = [`NCZoning:`, `coords=${x},${y}`, `category=${category}`];
      if (selectedTags) lines.push(`tags=${selectedTags}`);
      if (credits) lines.push(`credits=${credits}`);
      if (authors) lines.push(`authors=${authors}`);

      let block = `[code]\n${lines.join("\n")}\n[/code]`;
      if (spoiler) block = `[spoiler]\n${block}\n[/spoiler]`;

      document.getElementById("bbcode-output").value = block;
      document.getElementById("bbcode-output-section").classList.remove("hidden");
    });
  }

  const bbcodeCopyBtn = document.getElementById("bbcode-copy-btn");
  if (bbcodeCopyBtn) {
    bbcodeCopyBtn.addEventListener("click", () => {
      const output = document.getElementById("bbcode-output").value;
      navigator.clipboard.writeText(output).then(() => {
        const original = bbcodeCopyBtn.textContent;
        bbcodeCopyBtn.textContent = "[ COPIED! ]";
        setTimeout(() => {
          bbcodeCopyBtn.textContent = original;
        }, COPY_FEEDBACK_MS);
      }).catch(() => {
        bbcodeCopyBtn.textContent = "[ COPY FAILED ]";
        setTimeout(() => {
          bbcodeCopyBtn.textContent = "[ COPY TO CLIPBOARD ]";
        }, COPY_FEEDBACK_MS);
      });
    });
  }

  const bbcodeResetBtn = document.getElementById("bbcode-reset-btn");
  if (bbcodeResetBtn) {
    bbcodeResetBtn.addEventListener("click", () => {
      document.getElementById("bbcode-coord-x").value = "";
      document.getElementById("bbcode-coord-y").value = "";
      document.getElementById("bbcode-category").value = "";
      document.getElementById("bbcode-credits").value = "";
      document.getElementById("bbcode-authors").value = "";
      document.getElementById("bbcode-spoiler").checked = false;
      document.querySelectorAll("#bbcode-tag-checkboxes input:checked").forEach((cb) => (cb.checked = false));
      document.getElementById("bbcode-output-section").classList.add("hidden");
      document.getElementById("bbcode-output").value = "";
    });
  }

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
const NEXUS_BATCH_SIZE = 50;
const DESCRIPTION_MAX_LENGTH = 500;
const SPIDERFY_DEBOUNCE_MS = 500;
const COPY_FEEDBACK_MS = 2000;
const SEARCH_DEBOUNCE_MS = 200;
const THUMB_CACHE_KEY = "nc_nexus_thumbs";
const THUMB_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const AUTODISCOVERY_CACHE_KEY = "nc_nexus_autodiscovery";
const AUTODISCOVERY_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Read/write a JSON object from localStorage with a TTL check
function cacheGet(key, ttl) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > ttl) return null;
    return data;
  } catch { return null; }
}
function cacheSet(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); }
  catch { /* quota exceeded — silently skip */ }
}

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

  // Return cached thumbnails if still fresh
  const cached = cacheGet(THUMB_CACHE_KEY, THUMB_CACHE_TTL);
  if (cached) {
    // Check if all requested IDs are in the cache — if so, skip the API call
    const missing = validIds.filter((id) => !cached[id]);
    if (missing.length === 0) {
      console.log(`Thumbnails: serving ${validIds.length} from cache`);
      return cached;
    }
    // Only fetch the missing IDs
    console.log(`Thumbnails: ${validIds.length - missing.length} cached, fetching ${missing.length} new`);
    const fetched = await fetchNexusThumbnailsFromApi(missing);
    const merged = { ...cached, ...fetched };
    cacheSet(THUMB_CACHE_KEY, merged);
    return merged;
  }

  const result = await fetchNexusThumbnailsFromApi(validIds);
  cacheSet(THUMB_CACHE_KEY, result);
  return result;
}

async function fetchNexusThumbnailsFromApi(validIds) {
  const uids = validIds.map((id) => toNexusUid(id));
  const query = `query modsByUid($uids: [ID!]!, $count: Int!) {
        modsByUid(uids: $uids, count: $count) {
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
      body: JSON.stringify({ query, variables: { uids, count: validIds.length } }),
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

// Parse the [code]NCZoning:...[/code] metadata block from a Nexus mod description.
// Returns a parsed object or null if the block is missing/invalid.
function parseNcZoningBlock(description, validTagNames) {
  if (!description) return null;

  // Normalize HTML line breaks from Nexus API to actual newlines
  let text = description.replace(/<br\s*\/?>/gi, "\n");

  // Strip outer [spoiler]...[/spoiler] wrapper if present
  text = text.replace(/\[spoiler\]([\s\S]*?)\[\/spoiler\]/gi, "$1");

  // Extract [code]NCZoning:\n...[/code] block
  const match = text.match(/\[code\]\s*NCZoning:\s*\n([\s\S]*?)\[\/code\]/i);
  if (!match) return null;

  const data = {};
  for (const line of match[1].split("\n")) {
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim().toLowerCase();
    const value = line.slice(eqIdx + 1).trim();
    if (key && value) data[key] = value;
  }

  // coords is required — two comma-separated numbers
  if (!data.coords) return null;
  const coordParts = data.coords.split(",").map((s) => parseFloat(s.trim()));
  if (coordParts.length !== 2 || coordParts.some(isNaN)) return null;

  // category is required
  const validCategories = ["location-overhaul", "new-location", "other"];
  if (!data.category || !validCategories.includes(data.category)) return null;

  // tags: filter to known tags only — unknown tags silently dropped
  const tags = data.tags
    ? data.tags.split(",").map((t) => t.trim()).filter((t) => validTagNames.has(t))
    : [];

  // additional authors beyond Nexus uploader
  const additionalAuthors = data.authors
    ? data.authors.split(",").map((a) => a.trim()).filter(Boolean)
    : [];

  return {
    coordinates: coordParts,
    category: data.category,
    tags,
    credits: data.credits || null,
    additionalAuthors,
  };
}

// Fetch all mods tagged "NCZoning" from Nexus V2 GraphQL, parse their BBCode blocks,
// and return an array of mod objects ready to merge with the manual mods.json entries.
// ModsFilter schema: https://graphql.nexusmods.com/#definition-ModsFilter
// Fields use [BaseFilterValue] = array of { value: ... } objects.
// "uploader" on the Mod type is a plain string (username), not a nested object.
async function fetchNexusTaggedMods(existingNexusIds, validTagNames) {
  // Return cached auto-discovery results if still fresh
  const cached = cacheGet(AUTODISCOVERY_CACHE_KEY, AUTODISCOVERY_CACHE_TTL);
  if (cached) {
    // Re-filter against current manual entries (may have changed since cache was written)
    const filtered = cached.filter((m) => !existingNexusIds.has(m.nexus_id));
    console.log(`NCZoning: serving ${filtered.length} auto-discovered mods from cache`);
    return filtered;
  }

  const query = `
    query NCZoningMods($filter: ModsFilter!, $count: Int!, $offset: Int!) {
      mods(filter: $filter, count: $count, offset: $offset) {
        nodes {
          modId
          name
          summary
          description
          pictureUrl
          thumbnailUrl
          uploader {
            name
          }
        }
        totalCount
      }
    }
  `;

  const COUNT = NEXUS_BATCH_SIZE;
  let offset = 0;
  let totalCount = Infinity;
  const results = [];

  try {
    while (offset < totalCount) {
      const res = await fetch(NEXUS_GQL_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          variables: {
            filter: {
              gameId: [{ value: String(NEXUS_GAME_ID) }],
              tag: [{ value: "NCZoning" }],
            },
            count: COUNT,
            offset,
          },
        }),
      });
      const json = await res.json();

      if (json.errors) {
        console.warn("NCZoning API errors:", json.errors);
      }

      const page = json?.data?.mods;
      if (!page) {
        console.warn("NCZoning auto-discovery: no mods page in response", json);
        break;
      }

      totalCount = page.totalCount ?? 0;
      const nodes = page.nodes || [];
      console.log(`NCZoning: fetched ${nodes.length} mods (offset ${offset}, total ${totalCount})`);
      if (nodes.length === 0) break;

      for (const node of nodes) {
        const nexusId = String(node.modId);
        if (existingNexusIds.has(nexusId)) continue; // manual entry wins

        const parsed = parseNcZoningBlock(node.description, validTagNames);
        if (!parsed) {
          console.log(`NCZoning: skipping mod ${nexusId} (${node.name}) — no valid [NCZoning] block found. Description preview:`, (node.description || "").slice(0, 300));
          continue;
        }

        const uploaderName = node.uploader?.name || "Unknown";
        const allAuthors = [uploaderName, ...parsed.additionalAuthors];

        const summary = node.summary || "";
        const description =
          summary.length > DESCRIPTION_MAX_LENGTH ? summary.slice(0, DESCRIPTION_MAX_LENGTH - 3) + "..." : summary;

        results.push({
          id: `nexus-auto-${nexusId}`,
          name: node.name || "Unknown Mod",
          authors: allAuthors,
          ...(parsed.credits ? { credits: parsed.credits } : {}),
          coordinates: parsed.coordinates,
          nexus_id: nexusId,
          description,
          category: parsed.category,
          tags: ["nczoning", ...parsed.tags],
          _source: "nexus-auto",
          _thumbnailUrl: node.thumbnailUrl || null,
          _pictureUrl: node.pictureUrl || null,
        });
      }

      offset += nodes.length;
      if (nodes.length < COUNT) break; // last page
    }
  } catch (err) {
    console.warn("NCZoning auto-discovery failed:", err);
  }

  console.log(`NCZoning: auto-discovery complete — ${results.length} mods added`);
  cacheSet(AUTODISCOVERY_CACHE_KEY, results);
  return results;
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

  map.invalidateSize();
  map.fitBounds(mapBounds);
  map.setMaxBounds(mapBounds);

  // 2. State & UI Elements
  const markerClusterGroup = L.markerClusterGroup({
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true,
    maxClusterRadius: 40,
    iconCreateFunction: function (cluster) {
      const count = cluster.getChildCount();
      let sizeClass = "xlarge";
      if (count < 10) {
        sizeClass = "small";
      } else if (count < 25) {
        sizeClass = "medium";
      } else if (count < 50) {
        sizeClass = "large";
      }

      return L.divIcon({
        html: `<div><span>${count}</span></div>`,
        className: `marker-cluster marker-cluster-${sizeClass}`,
        iconSize: L.point(40, 40),
      });
    },
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
      }, SPIDERFY_DEBOUNCE_MS);
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
      }, SPIDERFY_DEBOUNCE_MS);
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

    // Auto-discover mods tagged "NCZoning" on Nexus (manual entries win on conflict)
    const existingNexusIds = new Set(
      mods
        .filter((m) => m.nexus_id && !["WIP", "Dummy"].includes(String(m.nexus_id)))
        .map((m) => String(m.nexus_id)),
    );
    const validTagNames = new Set(Object.keys(tagsDict));
    const autoMods = await fetchNexusTaggedMods(existingNexusIds, validTagNames);
    mods.push(...autoMods);

    modCountEl.textContent = `(${mods.length})`;

    // Pre-seed thumbnail map from auto-discovery (already fetched), then
    // only call the API for manual mods that still need images
    const nexusThumbs = {};
    const manualNexusIds = [];
    for (const mod of mods) {
      const nid = String(mod.nexus_id);
      if (mod._thumbnailUrl || mod._pictureUrl) {
        nexusThumbs[nid] = { pictureUrl: mod._pictureUrl, thumbnailUrl: mod._thumbnailUrl };
      } else if (nid && !["wip", "dummy"].includes(nid.toLowerCase())) {
        manualNexusIds.push(nid);
      }
    }
    const fetchedThumbs = await fetchNexusThumbnails(manualNexusIds);
    Object.assign(nexusThumbs, fetchedThumbs);

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
                <a href="https://www.nexusmods.com/profile/${encodeURIComponent(author)}/mods?gameId=3333" target="_blank" class="author-link">👤 ${escapeHtml(author)}</a>
            `,
          )
          .join(" ");

        // Build Tags HTML
        const tagsHtml = (mod.tags || [])
          .map((tag) => {
            const def = tag === "nczoning"
              ? "Sourced automatically from Nexus Mods"
              : tagsDict[tag] || "";
            return `<span class="tag-badge" title="${escapeHtml(def)}">${escapeHtml(tag)}</span>`;
          })
          .join("");

        // Build Link for Suggesting Edits (Phase 2)
        const [cX, cY] = mod.coordinates;
        const editUrl = `https://github.com/spuddeh/nc-zoning-board/issues/new?template=modify_location.yml&location_id=${mod.id}&mod_name=${encodeURIComponent(mod.name)}&authors=${encodeURIComponent(mod.authors.join(", "))}&coord_x=${cX}&coord_y=${cY}`;

        // Use only Nexus thumbnails, skip manual images to prevent feature creep
        const nexusThumb = nexusThumbs[String(mod.nexus_id)];
        const thumbSrc = nexusThumb?.thumbnailUrl || null;
        const fullSrc = nexusThumb?.pictureUrl || null;

        const nexusAutoBadge = mod._source === "nexus-auto"
          ? ` <span class="nexus-auto-badge" title="Sourced automatically from Nexus Mods">[ N ]</span>`
          : "";

        const popupContent = `
                <div class="custom-popup-content">
                    <div class="custom-popup-title">${escapeHtml(mod.name)}${nexusAutoBadge}</div>
                    <div class="custom-popup-authors">${authorsHtml}</div>
                    ${mod.credits ? `<div class="custom-popup-credits">Credits: ${escapeHtml(mod.credits)}</div>` : ""}
                    <div class="custom-popup-tags">${tagsHtml}</div>
                    ${
                      thumbSrc && fullSrc
                        ? `
                        <div class="custom-popup-images">
                            <img src="${escapeHtml(thumbSrc)}" class="popup-thumb" referrerpolicy="no-referrer" data-full-src="${escapeHtml(fullSrc)}">
                        </div>
                    `
                        : ""
                    }
                    <div class="custom-popup-desc">${escapeHtml(mod.description || "No description provided.")}</div>
                    <div class="popup-actions" style="display: flex; gap: 8px; margin-top: 10px;">
                        <a href="${escapeHtml(nexusUrl)}" target="_blank" class="custom-popup-link" style="margin-top:0;">${escapeHtml(nexusLabel)}</a>
                        ${!mod._source ? `<a href="${escapeHtml(editUrl)}" target="_blank" class="custom-popup-link" style="margin-top:0; border-color: var(--nc-amber); color: var(--nc-amber);">Suggest Edit</a>` : ""}
                    </div>
                </div>
            `;
        marker.bindPopup(popupContent, { autoPan: false });

        // Add to Sidebar
        const li = document.createElement("li");
        li.className = "mod-item";
        li.dataset.category = mod.category;
        li.dataset.tags = (mod.tags || []).join(",");
        li.dataset.authors = mod.authors.join(",");
        const sidebarBadge = mod._source === "nexus-auto"
          ? ` <span class="nexus-auto-badge" title="Sourced automatically from Nexus Mods">[ N ]</span>`
          : "";
        li.innerHTML = `
                <div class="mod-item-header">
                    <span class="mod-item-name">${escapeHtml(mod.name)}</span>${sidebarBadge}
                </div>
                <span class="mod-item-author">by ${escapeHtml(mod.authors.join(", "))}</span>
                <div class="mod-item-meta">
                    <span class="mod-item-category badge-${escapeHtml(mod.category)}">${escapeHtml(catStyle.label)}</span>
                </div>
            `;
        li.addEventListener("click", (e) => {
          if (e.target.tagName !== "A") {
            const coords = cetToLeaflet(mod.coordinates[0], mod.coordinates[1]);
            map.once("moveend", () => {
              const visibleParent = markerClusterGroup.getVisibleParent(marker);
              if (!visibleParent || visibleParent === marker) {
                marker.openPopup();
              } else {
                markerClusterGroup.once("spiderfied", () => marker.openPopup());
                visibleParent.spiderfy();
              }
            });
            map.flyTo(coords, 5);
            if (window.innerWidth < 768) sidebar.classList.add("hidden");
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
      map.invalidateSize();
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
        const def = tag === "nczoning"
          ? "Sourced automatically from Nexus Mods"
          : tagsDict[tag] || "";
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

    // Setup show-more / show-less toggles for collapsible filter sections
    document.querySelectorAll(".filter-show-more-btn").forEach((btn) => {
      const target = document.getElementById(btn.dataset.target);
      if (!target) return;
      // Hide button if content fits within the collapsed height
      if (target.scrollHeight <= target.clientHeight) {
        btn.classList.add("hidden");
        return;
      }
      btn.addEventListener("click", () => {
        const collapsed = target.classList.toggle("filter-collapsed");
        btn.textContent = collapsed ? "show more" : "show less";
      });
    });

    // 6. Populate BBCode generator tag checkboxes (requires tagsDict from this scope)
    const bbcodeTagGrid = document.getElementById("bbcode-tag-checkboxes");
    if (bbcodeTagGrid) {
      Object.keys(tagsDict)
        .sort()
        .forEach((tag) => {
          const label = document.createElement("label");
          label.className = "bbcode-tag-checkbox";
          label.title = tagsDict[tag] || "";
          label.innerHTML = `<input type="checkbox" value="${tag}"> ${tag}`;
          bbcodeTagGrid.appendChild(label);
        });
    }

    // 7. Setup Text Search (debounced to avoid excessive re-filtering)
    const searchInput = document.getElementById("mod-search");
    let searchDebounce;
    searchInput.addEventListener("input", () => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(applyFilters, SEARCH_DEBOUNCE_MS);
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
        const modAuthors = (li.dataset.authors || "").split(",").filter(Boolean);

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

// Delegated click handler for popup thumbnails (avoids inline onclick / XSS risk)
document.addEventListener("click", (e) => {
  const thumb = e.target.closest(".popup-thumb[data-full-src]");
  if (thumb) {
    window.openImageGallery([thumb.dataset.fullSrc], 0);
  }
});

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
