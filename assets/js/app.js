/**
 * NC Zoning Board — Main Application Logic
 * DOM manipulation, map initialization, event handlers, sidebar, modals, image gallery.
 * Depends on: constants.js, utils.js, services.js (via NCZ namespace).
 */

document.addEventListener("DOMContentLoaded", () => {
  // Terminal header close buttons — delegates to each modal's existing close button
  document.querySelectorAll(".terminal-close-btn[data-close-modal]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const modal = document.getElementById(btn.dataset.closeModal);
      if (modal) modal.classList.add("hidden");
      // Preserve welcome modal session flag
      if (btn.dataset.closeModal === "welcome-modal") {
        sessionStorage.setItem("nc_zoning_board_visited", "true");
      }
    });
  });

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
  const aboutOpenBbcodeLink = document.getElementById("about-open-bbcode-link");
  const sidebarOpenBbcodeLink = document.getElementById("sidebar-open-bbcode-link");

  aboutBtn.addEventListener("click", () => {
    aboutModal.classList.remove("hidden");
  });

  closeAboutBtn.addEventListener("click", () => {
    aboutModal.classList.add("hidden");
  });

  // Parameters Modal Logic
  const parametersBtn = document.getElementById("parameters-btn");
  const parametersModal = document.getElementById("parameters-modal");
  const closeParametersModalBtn = document.getElementById("close-parameters-modal");
  const themeSelect = document.getElementById("theme-select");
  const headerLogoImg = document.getElementById("header-logo-img");
  const themedModalHeaderLabels = document.querySelectorAll(".terminal-header-theme-label[data-modal-title]");
  const themes = Array.isArray(NCZ.THEMES) && NCZ.THEMES.length
    ? NCZ.THEMES
    : [{
      id: "night-corp",
      label: "Night Corp",
      className: "theme-night-corp",
      logo: "assets/img/nightcorp-logo.webp",
      logoAlt: "Night Corp",
    }];

  function openParametersModal() {
    if (parametersModal) parametersModal.classList.remove("hidden");
  }

  function closeParametersModal() {
    if (parametersModal) parametersModal.classList.add("hidden");
  }

  if (parametersBtn) parametersBtn.addEventListener("click", openParametersModal);
  if (closeParametersModalBtn) closeParametersModalBtn.addEventListener("click", closeParametersModal);

  function findThemeById(themeId) {
    return themes.find((theme) => theme.id === themeId) || themes[0];
  }

  function findThemeByClassName(themeClassName) {
    return themes.find((theme) => theme.className === themeClassName) || themes[0];
  }

  function getStoredThemeId() {
    try {
      const storedThemeId = localStorage.getItem(NCZ.THEME_PREFERENCE_KEY);
      if (!storedThemeId) return null;
      return themes.some((theme) => theme.id === storedThemeId) ? storedThemeId : null;
    } catch (_) {
      return null;
    }
  }

  function findActiveThemeClassName() {
    return Array.from(document.documentElement.classList).find((cls) =>
      cls.startsWith("theme-")
    );
  }

  function getInitialThemeId() {
    const storedThemeId = getStoredThemeId();
    if (storedThemeId) return storedThemeId;

    const activeThemeClass = findActiveThemeClassName();
    return activeThemeClass ? findThemeByClassName(activeThemeClass).id : themes[0].id;
  }

  function applyHeaderThemeBranding(theme) {
    if (!headerLogoImg || !theme) return;
    if (theme.logo) headerLogoImg.src = theme.logo;
    headerLogoImg.alt = theme.logoAlt || theme.label || "Header logo";
  }

  function applyModalHeaderThemeBranding(theme) {
    const themePrefix = (theme?.label || "Night Corp").toUpperCase();
    themedModalHeaderLabels.forEach((label) => {
      const modalTitle = label.dataset.modalTitle || "";
      label.textContent = `${themePrefix} // ${modalTitle}`;
    });
  }

  function applyThemeById(themeId, { persist = true } = {}) {
    const theme = findThemeById(themeId);
    const targetClass = theme.className || `theme-${theme.id}`;
    const root = document.documentElement;

    Array.from(root.classList)
      .filter((cls) => cls.startsWith("theme-"))
      .forEach((cls) => root.classList.remove(cls));
    root.classList.add(targetClass);

    applyHeaderThemeBranding(theme);
    applyModalHeaderThemeBranding(theme);
    if (themeSelect) themeSelect.value = theme.id;

    if (persist) {
      try {
        localStorage.setItem(NCZ.THEME_PREFERENCE_KEY, theme.id);
      } catch (_) {
        // Ignore storage write failures (private mode / restricted browsers).
      }
    }
  }

  const initialThemeId = getInitialThemeId();

  if (themeSelect) {
    themeSelect.innerHTML = "";
    themes.forEach((theme) => {
      const option = document.createElement("option");
      option.value = theme.id;
      option.textContent = theme.label;
      themeSelect.appendChild(option);
    });

    applyThemeById(initialThemeId, { persist: false });

    themeSelect.addEventListener("change", () => {
      applyThemeById(themeSelect.value);
    });
  } else {
    applyThemeById(initialThemeId, { persist: false });
  }

  // BBCode Generator Modal Logic
  const bbcodeBtn = document.getElementById("bbcode-btn");
  const bbcodeModal = document.getElementById("bbcode-modal");
  const closeBbcodeModalBtn = document.getElementById("close-bbcode-modal");

  function openBbcodeModal() {
    bbcodeModal.classList.remove("hidden");
  }
  function closeBbcodeModal() {
    bbcodeModal.classList.add("hidden");
  }

  if (aboutOpenBbcodeLink) {
    aboutOpenBbcodeLink.addEventListener("click", (event) => {
      event.preventDefault();
      aboutModal.classList.add("hidden");
      openBbcodeModal();
    });
  }

  if (sidebarOpenBbcodeLink) {
    sidebarOpenBbcodeLink.addEventListener("click", (event) => {
      event.preventDefault();
      openBbcodeModal();
    });
  }

  if (bbcodeBtn) bbcodeBtn.addEventListener("click", openBbcodeModal);
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
        }, NCZ.COPY_FEEDBACK_MS);
      }).catch(() => {
        bbcodeCopyBtn.textContent = "[ COPY FAILED ]";
        setTimeout(() => {
          bbcodeCopyBtn.textContent = "[ COPY TO CLIPBOARD ]";
        }, NCZ.COPY_FEEDBACK_MS);
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

/** Controls pin hover tooltip placement and visibility inside map bounds. */
function createPinTooltipController(map) {
  // Create one tooltip element we reuse for every marker.
  const container = map.getContainer();
  const tooltipEl = document.createElement("div");
  tooltipEl.className = "pin-tooltip";
  tooltipEl.innerHTML = `
    <div class="pin-tooltip-content"></div>
    <div class="pin-tooltip-arrow" aria-hidden="true"></div>
  `;
  container.appendChild(tooltipEl);

  const contentEl = tooltipEl.querySelector(".pin-tooltip-content");
  let activeMarker = null;

  function clearDirectionClasses() {
    tooltipEl.classList.remove("dir-top", "dir-bottom", "dir-left", "dir-right");
  }

  function measureTooltip() {
    // Temporarily show tooltip to get its current size.
    tooltipEl.classList.add("visible", "measure");
    const rect = contentEl.getBoundingClientRect();
    tooltipEl.classList.remove("measure");
    return {
      width: Math.max(1, Math.ceil(rect.width)),
      height: Math.max(1, Math.ceil(rect.height)),
    };
  }

  function positionTooltip() {
    const markerEl = activeMarker?.getElement?.();
    if (!activeMarker || !markerEl) {
      hide();
      return;
    }

    const point = map.latLngToContainerPoint(activeMarker.getLatLng());
    const mapWidth = container.clientWidth;
    const mapHeight = container.clientHeight;
    const size = measureTooltip();
    const { direction, left, top, arrowX, arrowY } = NCZ.pickDirectionAndPosition(
      point,
      size,
      { x: mapWidth, y: mapHeight },
      {
        marginPx: NCZ.PIN_TOOLTIP_MARGIN_PX,
        gapPx: NCZ.PIN_TOOLTIP_GAP_PX,
        arrowSizePx: NCZ.PIN_TOOLTIP_ARROW_SIZE_PX,
        arrowEdgePaddingPx: NCZ.PIN_TOOLTIP_ARROW_EDGE_PADDING_PX,
      },
    );

    clearDirectionClasses();
    tooltipEl.classList.add(`dir-${direction}`);

    tooltipEl.style.left = `${left}px`;
    tooltipEl.style.top = `${top}px`;
    tooltipEl.style.setProperty("--pin-tooltip-arrow-x", `${arrowX}px`);
    tooltipEl.style.setProperty("--pin-tooltip-arrow-y", `${arrowY}px`);
  }

  function show(marker, text) {
    activeMarker = marker;
    contentEl.textContent = text;
    tooltipEl.classList.add("visible");
    positionTooltip();
  }

  function hide(marker = null) {
    if (marker && marker !== activeMarker) return;
    activeMarker = null;
    tooltipEl.classList.remove("visible");
  }

  return {
    show,
    hide,
    reposition: positionTooltip,
  };
}

/** Repositions an open popup so it stays visible and points to its pin. */
function positionDynamicPopup(map, popup) {
  if (!popup) return;

  const popupEl = popup.getElement?.();
  if (!popupEl) return;

  const wrapperEl = popupEl.querySelector(".leaflet-popup-content-wrapper");
  if (!wrapperEl) return;

  popupEl.classList.add("ncz-dynamic-popup");

  // Read popup size and marker anchor position.
  const size = {
    width: Math.max(1, Math.ceil(wrapperEl.offsetWidth)),
    height: Math.max(1, Math.ceil(wrapperEl.offsetHeight)),
  };
  const mapSize = map.getSize();
  const anchor = map.latLngToContainerPoint(popup.getLatLng());
  const { direction, left, top, arrowX, arrowY } = NCZ.pickDirectionAndPosition(
    anchor,
    size,
    mapSize,
    {
      marginPx: NCZ.PIN_POPUP_MARGIN_PX,
      gapPx: NCZ.PIN_POPUP_GAP_PX,
      arrowSizePx: NCZ.PIN_POPUP_ARROW_SIZE_PX,
      arrowEdgePaddingPx: NCZ.PIN_POPUP_ARROW_EDGE_PADDING_PX,
    },
  );

  const layerPos = map.containerPointToLayerPoint(L.point(left, top));
  L.DomUtil.setPosition(popupEl, layerPos);
  popupEl.style.left = "0px";
  popupEl.style.top = "0px";
  popupEl.style.bottom = "auto";
  popupEl.style.margin = "0";
  popupEl.style.setProperty("--ncz-popup-arrow-x", `${arrowX}px`);
  popupEl.style.setProperty("--ncz-popup-arrow-y", `${arrowY}px`);

  popupEl.classList.remove("ncz-popup-top", "ncz-popup-bottom", "ncz-popup-left", "ncz-popup-right");
  popupEl.classList.add(`ncz-popup-${direction}`);
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
    spiderfyOnMaxZoom: false,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: false,
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

  const pinTooltip = createPinTooltipController(map);
  let activePopup = null;
  let popupRepositionFrame = null;

  function repositionActivePopup() {
    if (!activePopup) return;
    positionDynamicPopup(map, activePopup);
  }

  // Coalesce bursty map/popup events into one popup reposition per animation frame.
  function scheduleActivePopupReposition() {
    if (popupRepositionFrame !== null) return;
    popupRepositionFrame = requestAnimationFrame(() => {
      popupRepositionFrame = null;
      repositionActivePopup();
    });
  }

  map.on("popupopen", (e) => {
    pinTooltip.hide();
    activePopup = e.popup;
    repositionActivePopup();
    scheduleActivePopupReposition();
    const popupImages = activePopup.getElement()?.querySelectorAll("img") || [];
    popupImages.forEach((img) => {
      if (!img.complete) {
        img.addEventListener("load", scheduleActivePopupReposition, { once: true });
      }
    });
  });
  map.on("popupclose", () => {
    activePopup = null;
    if (popupRepositionFrame !== null) {
      cancelAnimationFrame(popupRepositionFrame);
      popupRepositionFrame = null;
    }
  });

  map.on("move zoom resize", () => {
    pinTooltip.reposition();
    scheduleActivePopupReposition();
  });

  const allMarkers = [];
  const modCountEl = document.getElementById("mod-count");
  const modListEl = document.getElementById("mod-list");
  const filterContainer = document.getElementById("category-filters");
  const authorFilterContainer = document.getElementById("author-filters");
  const sidebar = document.getElementById("sidebar");
  const sidebarClose = document.getElementById("sidebar-close");
  const sidebarOpen = document.getElementById("sidebar-open");
  // Cluster menu DOM references
  const clusterPanel = document.getElementById("cluster-panel");
  const clusterPanelResizeHandle = document.getElementById("cluster-panel-resize-handle");
  const clusterPanelClose = document.getElementById("cluster-panel-close");
  const clusterPanelCount = document.getElementById("cluster-panel-count");
  const clusterModList = document.getElementById("cluster-mod-list");

  // Compute the maximum allowed cluster menu width for current viewport
  function getClusterPanelMaxWidth() {
    const viewportBound = Math.floor(window.innerWidth * 0.7);
    return Math.max(
      NCZ.CLUSTER_PANEL_MIN_WIDTH,
      Math.min(NCZ.CLUSTER_PANEL_MAX_WIDTH, viewportBound),
    );
  }

  // Clamp width so dragging cannot make the panel too small or too wide
  function clampClusterPanelWidth(width) {
    return Math.min(
      getClusterPanelMaxWidth(),
      Math.max(NCZ.CLUSTER_PANEL_MIN_WIDTH, Math.round(width)),
    );
  }

  // Apply panel width (desktop only), and optionally save it in localStorage
  function setClusterPanelWidth(width, persist = true) {
    if (window.innerWidth < NCZ.MOBILE_BREAKPOINT) {
      clusterPanel.style.removeProperty("width");
      return;
    }

    const clampedWidth = clampClusterPanelWidth(width);
    clusterPanel.style.width = `${clampedWidth}px`;

    if (persist) {
      try {
        localStorage.setItem(NCZ.CLUSTER_PANEL_WIDTH_KEY, String(clampedWidth));
      } catch {
        // Ignore storage failures (e.g. private mode/quota)
      }
    }
  }

  // Enable drag-to-resize from the panel's left edge
  function initClusterPanelResize() {
    if (!clusterPanelResizeHandle) return;

    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    // While dragging, update width based on horizontal mouse movement
    const onMouseMove = (event) => {
      if (!isResizing) return;
      const deltaX = startX - event.clientX;
      setClusterPanelWidth(startWidth + deltaX, false);
    };

    // End drag operation, restore normal interactions, then persist final width
    const stopResizing = () => {
      if (!isResizing) return;
      isResizing = false;
      clusterPanel.classList.remove("resizing");
      document.body.classList.remove("cluster-panel-resizing");
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", stopResizing);

      const finalWidth = clusterPanel.getBoundingClientRect().width;
      if (finalWidth) {
        setClusterPanelWidth(finalWidth, true);
      }

      if (map.dragging) map.dragging.enable();
    };

    // Start drag operation when user presses the resize handle
    clusterPanelResizeHandle.addEventListener("mousedown", (event) => {
      if (window.innerWidth < NCZ.MOBILE_BREAKPOINT) return;
      event.preventDefault();
      event.stopPropagation();

      isResizing = true;
      startX = event.clientX;
      startWidth = clusterPanel.getBoundingClientRect().width;
      clusterPanel.classList.add("resizing");
      document.body.classList.add("cluster-panel-resizing");

      if (map.dragging) map.dragging.disable();

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", stopResizing);
    });

    // Keep width valid when viewport size changes
    window.addEventListener("resize", () => {
      if (window.innerWidth < NCZ.MOBILE_BREAKPOINT) {
        clusterPanel.style.removeProperty("width");
        return;
      }

      const inlineWidth = Number.parseFloat(clusterPanel.style.width);
      const currentWidth =
        Number.isFinite(inlineWidth) && inlineWidth > 0
          ? inlineWidth
          : clusterPanel.getBoundingClientRect().width || NCZ.CLUSTER_PANEL_DEFAULT_WIDTH;
      setClusterPanelWidth(currentWidth, false);
    });

    // Restore saved width, or use default width on first visit
    const savedWidth = Number.parseInt(
      localStorage.getItem(NCZ.CLUSTER_PANEL_WIDTH_KEY),
      10,
    );
    if (Number.isFinite(savedWidth)) {
      setClusterPanelWidth(savedWidth, false);
    } else {
      setClusterPanelWidth(NCZ.CLUSTER_PANEL_DEFAULT_WIDTH, false);
    }
  }

  initClusterPanelResize();

  // Hide and reset cluster menu state
  function hideClusterPanel() {
    clusterModList.innerHTML = "";
    clusterPanelCount.textContent = "";
    clusterPanel.classList.add("cluster-panel-closed");
  }

  function focusMarker(marker) {
    markerClusterGroup.zoomToShowLayer(marker, () => marker.openPopup());
  }

  markerClusterGroup.on("clusterclick", (a) => {
    if (a.originalEvent) L.DomEvent.stop(a.originalEvent);

    // Collect mods from clicked cluster and sort by name
    const childMarkers = a.layer
      .getAllChildMarkers()
      .slice()
      .sort((left, right) => left.modData.name.localeCompare(right.modData.name));

    // Rebuild cluster menu list for this cluster
    clusterModList.innerHTML = "";
    clusterPanelCount.textContent = `(${childMarkers.length})`;

    if (childMarkers.length === 0) {
      const empty = document.createElement("li");
      empty.className = "cluster-empty";
      empty.textContent = "No mods found in this cluster.";
      clusterModList.appendChild(empty);
    } else {
      childMarkers.forEach((childMarker) => {
        const mod = childMarker.modData;
        const catStyle = NCZ.CATEGORY_STYLES[mod.category] || NCZ.CATEGORY_STYLES.other;
        // Build tag chips shown under author name
        const modTagsHtml = (mod.tags || [])
          .map((tag) => `<span class="tag-badge">${NCZ.escapeHtml(tag)}</span>`)
          .join("");
        // Thumbnail becomes clickable only when full-size image exists
        const isThumbClickable = Boolean(childMarker.modFull);
        const thumbMarkup = childMarker.modThumb
          ? `<img class="cluster-mod-thumb${isThumbClickable ? " cluster-mod-thumb-clickable" : ""}" src="${NCZ.escapeHtml(childMarker.modThumb)}" alt="${NCZ.escapeHtml(mod.name)} thumbnail" referrerpolicy="no-referrer"${isThumbClickable ? ` data-full-src="${NCZ.escapeHtml(childMarker.modFull)}"` : ""}>`
          : `<span class="cluster-mod-thumb cluster-mod-thumb-placeholder" aria-hidden="true"></span>`;

        const item = document.createElement("li");
        item.className = "cluster-mod-item";
        item.style.setProperty("--cluster-mod-color", catStyle.color);

        const button = document.createElement("button");
        button.type = "button";
        button.className = "cluster-mod-btn";
        button.innerHTML = `
          <span class="cluster-mod-layout">
            ${thumbMarkup}
            <span class="cluster-mod-content">
              <span class="cluster-mod-name">${NCZ.escapeHtml(mod.name)}</span>
              <span class="cluster-mod-separator"></span>
              <span class="cluster-mod-meta">by ${NCZ.escapeHtml(mod.authors.join(", "))}</span>
              <span class="cluster-mod-tags">
                ${modTagsHtml}
              </span>
              <span class="cluster-mod-desc">${NCZ.escapeHtml(mod.description || "No description provided.")}</span>
            </span>
          </span>
        `;

        // Open image modal when thumbnail is clicked
        const imageButton = button.querySelector(".cluster-mod-thumb[data-full-src]");
        if (imageButton) {
          imageButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            window.openImageGallery([imageButton.dataset.fullSrc], 0);
          });
        }

        // Clicking row focuses corresponding marker/popup on the map
        button.addEventListener("click", () => {
          focusMarker(childMarker);
          if (window.innerWidth < NCZ.MOBILE_BREAKPOINT) hideClusterPanel();
        });

        item.appendChild(button);
        clusterModList.appendChild(item);
      });
    }

    // Slide menu in from the right
    clusterPanel.classList.remove("cluster-panel-closed");
  });

  clusterPanelClose.addEventListener("click", hideClusterPanel);

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
  if (window.innerWidth < NCZ.MOBILE_BREAKPOINT) {
    sidebar.classList.add("hidden");
    sidebarOpen.classList.add("visible");
  }

  map.on("click", hideClusterPanel);
  map.on("zoomstart", hideClusterPanel);

  // 3. Fetch and Setup Data
  try {
    const { mods, tagsDict } = await NCZ.fetchModData();

    // Auto-discover mods tagged "NCZoning" on Nexus (manual entries win on conflict)
    const existingNexusIds = new Set(
      mods
        .filter((m) => m.nexus_id && !["WIP", "Dummy"].includes(String(m.nexus_id)))
        .map((m) => String(m.nexus_id)),
    );
    const validTagNames = new Set(Object.keys(tagsDict));
    const autoMods = await NCZ.fetchNexusTaggedMods(existingNexusIds, validTagNames);
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
    const fetchedThumbs = await NCZ.fetchNexusThumbnails(manualNexusIds);
    Object.assign(nexusThumbs, fetchedThumbs);

    mods
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((mod) => {
        const [lat, lng] = NCZ.cetToLeaflet(mod.coordinates[0], mod.coordinates[1]);
        const catStyle =
          NCZ.CATEGORY_STYLES[mod.category] || NCZ.CATEGORY_STYLES["other"];

        // Custom Marker Icon (Diamond/Square for Night Corp)
        const icon = L.divIcon({
          className: "category-marker",
          html: `<div class="marker-pin ${catStyle.class}"></div>`,
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        });

        const marker = L.marker([lat, lng], { icon });
        marker.modData = mod; // Store data for filtering later
        allMarkers.push(marker);
        markerClusterGroup.addLayer(marker);

        marker.on("mouseover", () => {
          pinTooltip.show(marker, mod.name);
        });
        marker.on("mouseout", () => {
          pinTooltip.hide(marker);
        });
        marker.on("click", () => {
          pinTooltip.hide(marker);
        });
        marker.on("remove", () => {
          pinTooltip.hide(marker);
        });

        // Build Link based on nexus_id
        const nexus_id_lower = String(mod.nexus_id).toLowerCase();
        let nexusUrl = `https://www.nexusmods.com/cyberpunk2077/mods/${mod.nexus_id}`;

        if (nexus_id_lower === "wip") {
          nexusUrl = "https://www.nexusmods.com/games/cyberpunk2077";
        } else if (nexus_id_lower === "dummy") {
          nexusUrl = "https://www.nexusmods.com/games/cyberpunk2077";
        }

        // Build Authors HTML
        const authorsHtml = mod.authors
          .map(
            (author) => `
                <a href="https://www.nexusmods.com/profile/${encodeURIComponent(author)}/mods?gameId=3333" target="_blank" class="ui-popup-action-link small"><img src="assets/img/nexus-mods_favicon.ico" class="ui-popup-action-link-icon" alt="" aria-hidden="true"> ${NCZ.escapeHtml(author)}</a>
            `,
          )
          .join(" ");

        // Build Tags HTML
        const tagsHtml = (mod.tags || [])
          .map((tag) => {
            const def = tag === "nczoning"
              ? "Sourced automatically from Nexus Mods"
              : tagsDict[tag] || "";
            return `<span class="tag-badge" title="${NCZ.escapeHtml(def)}">${NCZ.escapeHtml(tag)}</span>`;
          })
          .join("");

        // Build Link for Suggesting Edits (Phase 2)
        const [cX, cY] = mod.coordinates;
        const editUrl = `https://github.com/spuddeh/nc-zoning-board/issues/new?template=modify_location.yml&location_id=${mod.id}&mod_name=${encodeURIComponent(mod.name)}&authors=${encodeURIComponent(mod.authors.join(", "))}&coord_x=${cX}&coord_y=${cY}`;

        // Use only Nexus thumbnails, skip manual images to prevent feature creep
        const nexusThumb = nexusThumbs[String(mod.nexus_id)];
        const thumbSrc = nexusThumb?.thumbnailUrl || null;
        const fullSrc = nexusThumb?.pictureUrl || null;
        marker.modThumb = thumbSrc;
        marker.modFull = fullSrc;

        const nexusAutoBadge = mod._source === "nexus-auto"
          ? ` <span class="nexus-auto-badge" title="Sourced automatically from Nexus Mods" aria-hidden="true"></span>`
          : "";

        const popupContent = `
                <div class="custom-popup-content">
                    <div class="custom-popup-title">${NCZ.escapeHtml(mod.name)}${nexusAutoBadge}</div>
                    <div class="custom-popup-authors">${authorsHtml}</div>
                    ${mod.credits ? `<div class="custom-popup-credits">Credits: ${NCZ.escapeHtml(mod.credits)}</div>` : ""}
                    <div class="custom-popup-tags">${tagsHtml}</div>
                    ${
                      thumbSrc && fullSrc
                        ? `
                        <div class="custom-popup-images">
                            <img src="${NCZ.escapeHtml(thumbSrc)}" class="popup-thumb" referrerpolicy="no-referrer" data-full-src="${NCZ.escapeHtml(fullSrc)}">
                        </div>
                    `
                        : ""
                    }
                    <div class="custom-popup-desc">${NCZ.escapeHtml(mod.description || "No description provided.")}</div>
                    <div class="popup-actions">
                        <a href="${NCZ.escapeHtml(nexusUrl)}" target="_blank" class="ui-popup-action-link ui-popup-action-link-nexus">View on Nexus</a>
                        ${!mod._source ? `<a href="${NCZ.escapeHtml(editUrl)}" target="_blank" class="ui-popup-action-link ui-popup-action-link-edit tertiary" aria-label="Suggest Edit" title="Suggest Edit"><span class="ui-popup-action-link-icon" aria-hidden="true"></span></a>` : ""}
                    </div>
                </div>
            `;
        marker.bindPopup(popupContent, {
          autoPan: false,
          offset: [0, 0],
          className: "ncz-dynamic-popup",
        });

        // Add to Sidebar
        const li = document.createElement("li");
        li.className = "mod-item";
        li.dataset.category = mod.category;
        li.dataset.tags = (mod.tags || []).join(",");
        li.dataset.authors = mod.authors.join(",");
        const sidebarBadge = mod._source === "nexus-auto"
          ? ` <span class="nexus-auto-badge" title="Sourced automatically from Nexus Mods" aria-hidden="true"></span>`
          : "";
        li.innerHTML = `
                <div class="mod-item-header">
                    <span class="mod-item-name">${NCZ.escapeHtml(mod.name)}</span>${sidebarBadge}
                </div>
                <span class="mod-item-author">by ${NCZ.escapeHtml(mod.authors.join(", "))}</span>
                <div class="mod-item-meta">
                    <span class="mod-item-category badge-${NCZ.escapeHtml(mod.category)}">${NCZ.escapeHtml(catStyle.label)}</span>
                </div>
            `;
        li.addEventListener("click", (e) => {
          if (e.target.tagName !== "A") {
            focusMarker(marker);
            hideClusterPanel();
            if (window.innerWidth < NCZ.MOBILE_BREAKPOINT) sidebar.classList.add("hidden");
          }
        });

        // Pulse marker (or parent cluster) on sidebar hover
        li.addEventListener("mouseenter", () => {
          const element = marker.getElement();
          if (element) {
            const pin = element.querySelector(".marker-pin");
            if (pin) pin.classList.add("pulsing");
          } else {
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
      mods.map((mod) => NCZ.cetToLeaflet(mod.coordinates[0], mod.coordinates[1])),
    );
    if (pinBounds.isValid()) {
      map.invalidateSize();
      map.fitBounds(pinBounds, { padding: [50, 50], maxZoom: 5 });
    }

    // 5. Setup Category Filters
    const activeCategories = new Set(mods.map((m) => m.category));
    activeCategories.forEach((cat) => {
      const style = NCZ.CATEGORY_STYLES[cat] || NCZ.CATEGORY_STYLES["other"];
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
      .sort((a, b) => {
        if (a === "nczoning") return -1;
        if (b === "nczoning") return 1;
        return a.localeCompare(b);
      })
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

    // Setup collapsible section headers
    document.querySelectorAll(".sidebar-section-header.collapsible").forEach((header) => {
      const target = document.getElementById(header.dataset.collapseTarget);
      if (!target) return;
      header.addEventListener("click", () => {
        header.classList.toggle("collapsed");
        target.classList.toggle("filter-collapsed");
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
      searchDebounce = setTimeout(applyFilters, NCZ.SEARCH_DEBOUNCE_MS);
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
      hideClusterPanel();
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

      // Update visible mod count
      modCountEl.textContent = `(${visibleMarkers.length}/${mods.length})`;
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
  const isImageModalOpen = imageModal && !imageModal.classList.contains("hidden");

  if (e.key === "Escape") {
    if (isImageModalOpen) {
      closeGallery();
      return;
    }

    const visibleModal = document.querySelector(".modal:not(.hidden)");
    if (visibleModal) {
      visibleModal.classList.add("hidden");
      if (visibleModal.id === "welcome-modal") {
        sessionStorage.setItem("nc_zoning_board_visited", "true");
      }
      return;
    }

    document.querySelector(".leaflet-popup-close-button")?.click();
    return;
  }

  if (!isImageModalOpen) return;
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
