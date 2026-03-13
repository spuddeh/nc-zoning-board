# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### 2026-03-13

- **Bug Fixes**:
  - Fixed workflow condition logic in `auto-pr-submission.yml` and `modify-location-submission.yml` — replaced `pull-request-created == 'true'` with `pull-request-operation != 'none'` to correctly detect PR creation/update using the v6 output. The old boolean output was unreliable and could cause both the "PR created" and "no changes" comments to fire simultaneously, or neither to fire.
- **Workflow Updates**:
  - `notify-discord-pr-status.yml` now automatically deletes the `add-mod-*` / `mod-mod-*` branch after a PR is closed (merged or not), keeping the repo branch list clean. Added `contents: write` permission to support this.
- **Maintenance**:
  - One-off deletion of 49 stale `add-mod-*` and `mod-mod-*` branches that had accumulated from previous workflow runs.

- **Docs**:
  - Updated mod submission and modification issue templates — added a coordinate guide (CET console and Simple Location Manager methods), a warning not to use World Builder coordinates, and a reminder to include the minus sign for negative values.

- **Bug Fixes**:
  - Fixed missing mod thumbnails caused by the Nexus V2 GraphQL API silently capping `modsByUid` results at 20 — the query now passes an explicit `count` equal to the number of IDs requested, ensuring all thumbnails are fetched regardless of roster size.

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
