/**
 * NC Zoning Board — Pure Utility Functions
 * No DOM manipulation, no fetch. Operates on provided parameters + NCZ constants.
 */

// HTML escape — prevents XSS from user-supplied data (Nexus API, submitted JSON)
NCZ.escapeHtml = function (text) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(text).replace(/[&<>"']/g, (m) => map[m]);
};

// Read/write a JSON object from localStorage with a TTL check
NCZ.cacheGet = function (key, ttl) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > ttl) return null;
    return data;
  } catch { return null; }
};

NCZ.cacheSet = function (key, data) {
  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); }
  catch { /* quota exceeded — silently skip */ }
};

// Convert gameId + modId → Nexus UID (composite BigInt key)
NCZ.toNexusUid = function (modId) {
  return ((BigInt(NCZ.NEXUS_GAME_ID) << BigInt(32)) + BigInt(modId)).toString();
};

// Forward: CET (x, y) → Leaflet [lat, lng]
NCZ.cetToLeaflet = function (cetX, cetY) {
  const lat = 0.02101335 * cetY - 93.68566;
  const lng = 0.0208623 * cetX + 132.8016;
  return [lat, lng];
};


NCZ.clamp = function (value, min, max) {
  return Math.min(Math.max(value, min), max);
};

/**
 * Chooses an anchor side and calculates a clamped box position + arrow anchor.
 * Consumers apply the returned values to their own DOM elements/styles.
 */
NCZ.pickDirectionAndPosition = function (anchorPoint, size, mapSize, config) {
  const mapWidth = mapSize.x ?? mapSize.width;
  const mapHeight = mapSize.y ?? mapSize.height;
  const directionOrder = config.directionOrder ?? ["top", "bottom", "right", "left"];

  const requiredVertical = size.height + config.gapPx + config.arrowSizePx;
  const requiredHorizontal = size.width + config.gapPx + config.arrowSizePx;

  const space = {
    top: anchorPoint.y - config.marginPx,
    bottom: mapHeight - anchorPoint.y - config.marginPx,
    left: anchorPoint.x - config.marginPx,
    right: mapWidth - anchorPoint.x - config.marginPx,
  };

  let direction = directionOrder.find((dir) => {
    if (dir === "top" || dir === "bottom") return space[dir] >= requiredVertical;
    return space[dir] >= requiredHorizontal;
  });

  if (!direction) {
    direction = directionOrder.reduce(
      (best, dir) => (space[dir] > space[best] ? dir : best),
      directionOrder[0],
    );
  }

  let left = anchorPoint.x - (size.width / 2);
  let top = anchorPoint.y - size.height - config.gapPx - config.arrowSizePx;

  if (direction === "bottom") {
    top = anchorPoint.y + config.gapPx + config.arrowSizePx;
  } else if (direction === "left") {
    left = anchorPoint.x - size.width - config.gapPx - config.arrowSizePx;
    top = anchorPoint.y - (size.height / 2);
  } else if (direction === "right") {
    left = anchorPoint.x + config.gapPx + config.arrowSizePx;
    top = anchorPoint.y - (size.height / 2);
  }

  let minLeft = config.marginPx;
  let maxLeft = mapWidth - config.marginPx - size.width;
  let minTop = config.marginPx;
  let maxTop = mapHeight - config.marginPx - size.height;

  if (direction === "right") minLeft += config.arrowSizePx;
  if (direction === "left") maxLeft -= config.arrowSizePx;
  if (direction === "bottom") minTop += config.arrowSizePx;
  if (direction === "top") maxTop -= config.arrowSizePx;

  if (maxLeft < minLeft) {
    minLeft = maxLeft = Math.max(0, (mapWidth - size.width) / 2);
  }
  if (maxTop < minTop) {
    minTop = maxTop = Math.max(0, (mapHeight - size.height) / 2);
  }

  left = NCZ.clamp(left, minLeft, maxLeft);
  top = NCZ.clamp(top, minTop, maxTop);

  const arrowX = NCZ.clamp(
    anchorPoint.x - left,
    config.arrowEdgePaddingPx,
    size.width - config.arrowEdgePaddingPx,
  );
  const arrowY = NCZ.clamp(
    anchorPoint.y - top,
    config.arrowEdgePaddingPx,
    size.height - config.arrowEdgePaddingPx,
  );

  return { direction, left, top, arrowX, arrowY };
};

/**
 * Parse the [code]NCZoning:...[/code] metadata block from a Nexus mod description.
 * Returns a parsed object or null if the block is missing/invalid.
 */
NCZ.parseNcZoningBlock = function (description, validTagNames) {
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
};
