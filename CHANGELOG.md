# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Two new mod locations from upstream sync:
  - **Improved Aldecaldos Camp** (Mod ID: 13821)
  - **V's Edgerunners Mansion Reloaded** (Mod ID: 26023)
- Support for "WIP" and "Dummy" status in `nexus_id` field.
- Support for multiple authors per mod with direct Nexus profile links.
- Credits field for development teams (e.g., "CRF Team").
- Dynamic Tagging system with hover definitions and sidebar filtering.
- Automated tag validation script (`scripts/validate_tags.js`).

### Changed

- **Data Corrections**:
  - Corrected author alias for "APEX - Sonora Canyon and Safehouse" (`Nox` -> `Nox2182`) and added TPMG credits.
- **Data Architecture Refactor**:
  - Migrated monolithic `mods.json` into individual granular JSON files in `data/locations/`.
  - Implemented a build step (`scripts/build_mods.js`) to compile individual files into a single `mods.json` for frontend consumption.
  - Updated `mods.schema.json` to support arrays for authors and new metadata.
- **Frontend Logic**:
  - Overhauled popup generation to handle new schema and dynamic tag badges.
  - Revamped sidebar to include tag-based filtering and custom tooltips.
- **CI/CD Workflows**:
  - `auto-pr-submission.yml`: Overhauled to handle the new granular JSON structure and multi-author/tag inputs.
  - `deploy.yml`: Added build step for `mods.json`.
  - `validate-mods.yml`: Integrated tag consistency checks, updated trigger paths for `data/locations/`, and added the required build step prior to validation.

### Security

- Updated `.gitignore` to ensure compiled artifacts like `mods.json` are not tracked, preventing merge conflicts and keeping the repository clean.
