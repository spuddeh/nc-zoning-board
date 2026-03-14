# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### 2026-03-14

- **UI**:
  - Replaced "show more / show less" toggles on Tag and Author filter sections with collapsible section headers — click the header to expand/collapse. Both sections are collapsed by default to remove perceived bias toward alphabetically-first entries.
  - Added close buttons (X) to the terminal header bar of all modals (Welcome, About, BBCode Generator) for improved usability.
  - Location count now updates dynamically when filters or search are applied, showing filtered/total format (e.g., `42/97`).
  - `nczoning` tag now sorts first in the tag filter list (before alphabetical tags).
  - Added amber warning note below coordinate inputs in the BBCode Generator modal reminding users to include the minus sign for negative coordinates.
  - Updated About modal description to neutral tone — removed "avoid overlapping builds" language.
- **Issue Templates**:
  - Rewrote mod submission template description to neutral tone — removed "to prevent overlaps" language that implied the tool gatekeeps or plays favourites.
  - Strengthened negative coordinate guidance in both X and Y coordinate fields with warning emoji and clearer instructions.
  - Changed X coordinate placeholder to show a negative example (`-500`).

### 2026-03-13

- **UI**:
  - Added step-by-step instructions to the BBCode Generator modal (Acquire Coordinates, Configure Metadata, Tag Your Mod, Deploy Block) replacing the single warning line.
  - Added placement recommendations in the output section — suggests bottom of description as common spot, notes block can go anywhere, references spoiler wrap option.
  - Added link to full auto-discovery documentation from the modal.
  - Updated CET coordinate tooltip to use `print(GetPlayer():GetWorldPosition())`.

### 2026-03-13 (API optimization)

- **Performance**:
  - Eliminated duplicate image API calls — auto-discovered mods now carry their own `pictureUrl`/`thumbnailUrl` from the discovery query, so `fetchNexusThumbnails()` only fetches images for manual mods.
  - Added localStorage caching for Nexus API responses — auto-discovery results cached for 10 minutes, thumbnail data cached for 24 hours. Incremental fetches for new IDs not yet in cache.
  - Added 200ms debounce to sidebar search input to avoid excessive re-filtering on every keystroke.
  - Extracted magic numbers (`NEXUS_BATCH_SIZE`, `DESCRIPTION_MAX_LENGTH`, `SPIDERFY_DEBOUNCE_MS`, `COPY_FEEDBACK_MS`, `SEARCH_DEBOUNCE_MS`) into named constants.

### 2026-03-13 (security & hardening)

- **Security**:
  - Added `escapeHtml()` utility and applied to all user-supplied data in popup and sidebar HTML (`mod.name`, `mod.credits`, `mod.description`, authors, tag names/descriptions, URLs). Prevents XSS from Nexus API or submitted JSON.
  - Replaced inline `onclick` handler on popup thumbnails with a `data-full-src` attribute and delegated event listener.
  - Added `nexus_id` pattern validation (`^\d+|WIP|Dummy$`) to `mods.schema.json`.
  - Added coordinate range validation to the BBCode generator — rejects non-finite values and coordinates outside ±5000.
- **Bug Fixes**:
  - `build_mods.js` now exits with code 1 on any JSON parse error and detects duplicate IDs before writing output.
  - `deploy.yml` build step now uses `set -e` to propagate build failures.
  - `modify-location-submission.yml` now preserves existing coordinates when both coordinate fields are left blank (instead of failing with "Invalid coordinates").
  - Added `.catch()` to clipboard API call — shows "COPY FAILED" feedback instead of silently failing.
  - Removed stale `ripperdoc` tag from both issue templates and `docs/tags.md` (tag was removed from registry but references remained, causing validation failures).
- **Docs**:
  - Added Nexus V2 GraphQL API section to `CLAUDE.md` (endpoint, docs URL, query descriptions, caching strategy).
  - Added "What the API Reads from Your Mod Page" table to `docs/nczoning-auto-discovery.md`.
  - Standardized CET coordinate command to `print(GetPlayer():GetWorldPosition())` across all docs.
  - Added `npm run build` and `npm run validate` scripts to `package.json`.
  - Cleaned up `.gitignore` — removed dead `assets/images/raw maps/` pattern and duplicate `README.md` entry.

### 2026-03-13 (NCZoning auto-discovery)

- **Features**:
  - **NCZoning Auto-Discovery** — the map now queries the Nexus Mods V2 GraphQL API on page load for all Cyberpunk 2077 mods tagged with `NCZoning`. Mods with a valid `[NCZoning]` metadata block in their description are automatically added to the map as live pins — no GitHub submission required.
  - **BBCode Generator modal** — new `[+] SUBMIT` button in the header and sidebar opens a form that generates the `[code]NCZoning:...[/code]` metadata block. Includes CET coordinate inputs with a tooltip, category dropdown, tag checkboxes (populated from `tags.json`), credits, additional authors, an optional `[spoiler]` wrapper, a copy-to-clipboard button, and a reset button.
  - **Auto-discovered pin indicators** — auto-discovered mods display an amber `[ N ]` badge in the popup title and sidebar entry (tooltip: "Sourced automatically from Nexus Mods"). They also receive an automatic `nczoning` tag badge (with matching tooltip) visible in the popup, tag filter panel, and sidebar.
  - **Conflict resolution** — if a mod has both an auto-discovered entry and a manually submitted entry sharing the same `nexus_id`, the manual entry always wins.
  - **"Suggest Edit" suppressed** for auto-discovered mods — edits go through the Nexus description directly.
- **Bug Fixes**:
  - Fixed Nexus GraphQL filter sending `gameId` as a number — API requires a string (`"3333"`).
  - Fixed GraphQL query sending `uploader` as a scalar — corrected to `uploader { name }` (returns a `User` object).
  - Fixed BBCode block parsing failing on mod descriptions returned by the Nexus API with `<br />` HTML line breaks — parser now normalises these to `\n` before matching.
  - Fixed `applyFilters()` author lookup breaking when the `[ N ]` badge was added to the sidebar item name — authors are now stored in `li.dataset.authors` and read directly.
- **Docs**:
  - Added `docs/nczoning-auto-discovery.md` — full guide covering setup, BBCode format, field reference, editing, removal, conflict resolution, limitations, and misuse policy.
  - Updated `README.md` — NCZoning auto-discovery is now the preferred submission method; docs table updated.
  - Updated `CONTRIBUTING.md` — auto-discovery listed as preferred; GitHub issue listed as alternative; NCZoning guide added to useful docs list.
  - Updated `docs/adding-mods.md` — callout at top pointing to auto-discovery for mod authors who land there first.

### 2026-03-13

- **UI Improvements**:
  - Filter sections ("Filter by Tags", "Author Filters") now collapse to 2 rows by default with a "show more / show less" toggle. Sections with ≤2 rows of buttons hide the toggle automatically.
  - Sidebar location click now uses `flyTo` to the marker, then opens the popup after the animation completes. If the marker is inside a cluster, it spiderfies the cluster before opening the popup.
  - Map now calls `invalidateSize()` before `fitBounds` to ensure correct container dimensions on page load.
  - Popup `autoPan` disabled — the `maxBounds` constraint caused a visible snap-back; sidebar clicks handle positioning via `flyTo` instead.
- **Data**:
  - Removed `ripperdoc` tag from the tag registry.
- **Bug Fixes**:
  - Fixed workflow condition logic in `auto-pr-submission.yml` and `modify-location-submission.yml` — replaced `pull-request-created == 'true'` with `pull-request-operation != 'none'` to correctly detect PR creation/update using the v6 output. The old boolean output was unreliable and could cause both the "PR created" and "no changes" comments to fire simultaneously, or neither to fire.
  - Fixed missing mod thumbnails caused by the Nexus V2 GraphQL API silently capping `modsByUid` results at 20 — the query now passes an explicit `count` equal to the number of IDs requested, ensuring all thumbnails are fetched regardless of roster size.
- **Workflow Updates**:
  - `notify-discord-pr-status.yml` now automatically deletes the `add-mod-*` / `mod-mod-*` branch after a PR is closed (merged or not), keeping the repo branch list clean. Added `contents: write` permission to support this.
- **Maintenance**:
  - One-off deletion of 49 stale `add-mod-*` and `mod-mod-*` branches that had accumulated from previous workflow runs.
- **Docs**:
  - Updated mod submission and modification issue templates — added a coordinate guide (CET console and Simple Location Manager methods), a warning not to use World Builder coordinates, and a reminder to include the minus sign for negative values.

### 2026-03-12 (tags)

- **Data**:
  - Added new `photos` tag — scenic or atmospheric locations well-suited for virtual photography.
- **Docs**:
  - Created `docs/tags.md` — canonical reference for the tag registry, including the full tag list and step-by-step processes for adding, modifying, renaming, and removing tags.
  - Updated `CONTRIBUTING.md` — added link to `docs/tags.md` in the Useful Docs section.
  - Updated `docs/adding-mods.md` — tags field now links to the tag registry doc.

### 2026-03-12

- **Bug Fixes**:
  - Fixed `ReferenceError: path is not defined` in `auto-pr-submission.yml` that was crashing the workflow before the PR title output was set, causing new mod submissions to fail silently.
  - Fixed malformed SVG namespace (`http://www.w3.org/-2000/svg`) in sidebar footer icon.
  - Fixed incorrect CSS class `"collapsed"` applied to the sidebar on mobile when clicking a location — corrected to `"hidden"` to match the existing style contract.
  - Fixed author extraction in `auto-pr-submission.yml` — the `Author Alias(es)` label heading contains parentheses that broke the regex match, producing empty `authors` arrays in generated JSON files.
  - Fixed `_No response_` placeholder not being stripped from the `credits` field in `auto-pr-submission.yml` and `modify-location-submission.yml`.
  - Fixed `modify-location-submission.yml` overwriting an existing `credits` value with `"_No response_"` when credits were left blank on the form — a blank entry now correctly preserves the existing value.
- **GitHub Issue Form Improvements**:
  - Added `Category` dropdown to the modify/removal form (with "Keep existing" option to leave it unchanged).
  - Replaced the free-text `Tags` input on both the submission and modify forms with a `checkboxes` field listing all 14 valid tags with inline definitions — eliminates invalid tag submissions and removes the need to reference `tags.json`.
  - Made X/Y coordinates optional on the modify/removal form (removal requests no longer need to provide coordinates).
  - Moved the `Description` field to the last position on both forms.
  - Removed prefilled title prefixes (e.g. `[Mod Submission]:`) from all five issue templates — submitters must now write a meaningful title themselves.
- **Workflow Updates**:
  - Updated `auto-pr-submission.yml` and `modify-location-submission.yml` tag parsers to read the new checkbox format.
  - `modify-location-submission.yml` now extracts and applies category changes; defaults to "Keep existing" if unchanged.
  - Both submission workflows now trigger on `issues: labeled` only (replacing `opened`) — eliminates double-fire when a form auto-applies a label at creation, and allows maintainers to manually re-trigger by removing and re-adding the label.
  - `modify-location-submission.yml` Discord notifications now follow the same stored-ID pattern as the submission workflow: the initial "Awaiting Review" message ID is saved as a hidden comment on the issue so `notify-discord-pr-status.yml` can edit it on merge/close rather than post a new message.
  - `notify-discord-pr-status.yml` split into two jobs: `notify-submission` (edits the existing Discord message for `add-mod-*` PRs) and `notify-modification` (edits the existing Discord message for `mod-mod-*` PRs).
- **Labels**:
  - Created missing `mod-modification` label — its absence was silently preventing all modification/removal issue form submissions from triggering the automation workflow.
  - Created missing `feedback` label referenced by the General Feedback issue template.
- **UI**:
  - Restored the Join Discord link and SVG icon to the sidebar footer, beneath the Submit a Location button.

### [0.1.0-pre.1] - 2026-03-11

- **Nexus Mods API Integration**:
  - Successfully integrated the Nexus V2 GraphQL API.
  - Dynamically fetches official mod thumbnails and full-size promotional images using the provided `nexus_id`.
  - Image modals updated to exclusively display the officially fetched Nexus thumbnails.
- **Frontend Enhancements**:
  - Added a welcome modal loosely aligning with the "Dream On" quest to immerse users immediately upon load.
  - Interactive Map/Sidebar Integration: Hovering over a sidebar mod entry now triggers a neon pulse animation on the corresponding map pin or cluster icon.
  - Dynamic Map Pin Clustering: Integrated `Leaflet.markercluster` to group dense map pins. Clusters automatically "spider out" on hover to reveal individual pins, and remain expanded while a popup is open.
  - Added automated Nexus profile link generation for mod authors.
  - Unified Author and Tag filter layouts for visual consistency.
- **Automated Modification System**:
  - Implemented "Suggest Edit" system on all map popups using pre-filled GitHub issue templates.
  - Created `modify-location-submission.yml` workflow for automated location updates and removals.
  - Integrated Discord webhooks for real-time submission alerts.
- **Night Corp Modernization & UI Polish**:
  - Thematic branding applied to headers, modals, and list items.
  - Unified SVG icon system for sidebar navigation and replaced native emoji icons.
  - Category-colored active filter buttons for improved UX.
  - Cyberpunk-styled scrollbars and Leaflet map controls.
  - Moved external links (Discord, Report Bug, Suggest Feature) into the 'About Night Corp' modal and footer.
  - Added a mock `SYNC_OFFSET` telemetry generator in the footer to simulate an active system status (operates nominally 85% of the time, improving visual calmness).
- **Maintenance & Bug Fixes**:
  - Swept, removed, and resolved all underlying CSS variables conflicting with the old colour palette (`--cb-` to `--nc-`).
  - Fixed duplicate CSS header rules causing potential layering issues (`z-index`).
  - Corrected raw markdown syntax rendering incorrectly inside the Welcome Modal DOM.

### 2026-03-07

- **Data Architecture Refactor**:
  - Migrated monolithic `mods.json` into individual granular JSON files in `data/locations/`.
  - Implemented a build step (`scripts/build_mods.js`) to compile individual files.
  - Updated `mods.schema.json` to support multi-author arrays and team credits.
- **Mod Locations**:
  - Added **Improved Aldecaldos Camp** (Mod ID: 13821) and **V's Edgerunners Mansion Reloaded** (Mod ID: 26023).
  - Corrected author alias for "APEX - Sonora Canyon and Safehouse".
- **Dynamic Tagging**:
  - Implemented `tags.json` registry and automated validation script.
  - Added tag badges and filtering sidebar.
- **CI/CD Workflows**:
  - Overhauled `auto-pr-submission.yml` for granular JSON structure.
  - Integrated validation and build steps into `deploy.yml` and `validate-mods.yml`.
- **Security**:
  - Updated `.gitignore` to prevent tracking of compiled `mods.json`.
