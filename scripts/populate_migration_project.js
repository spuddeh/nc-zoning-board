/**
 * populate_migration_project.js
 *
 * Seeds the NC Zoning Board Z/Yaw migration GitHub Project with one draft card
 * per location that is still missing Z (and/or Yaw) data.
 *
 * Sources:
 *   - data/locations/*.json  (registry entries)
 *   - Nexus API auto-discovery (NCZoning-tagged mods)
 *
 * Skips entries where coordinates already has 3 elements (Z present).
 *
 * Usage:
 *   GITHUB_TOKEN=<token_with_project_scope> node scripts/populate_migration_project.js
 *
 * The token needs the `project` OAuth scope (read:project + write:project).
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const GITHUB_GQL     = 'https://api.github.com/graphql';
const NEXUS_GQL      = 'https://api.nexusmods.com/v2/graphql';
const NEXUS_GAME_ID  = 3333;
const NEXUS_BATCH    = 50;
const PROJECT_OWNER  = 'spuddeh';
const PROJECT_NUMBER = 3;
const TELEPORT_Z     = 690;

// Fields to create on the project (if not already present).
// dataType must be a valid ProjectV2CustomFieldType: TEXT | NUMBER | DATE | SINGLE_SELECT
const FIELD_DEFS = [
  { name: 'UUID',              dataType: 'TEXT'   },
  { name: 'Nexus ID',          dataType: 'TEXT'   },
  { name: 'Source',            dataType: 'TEXT'   },
  { name: 'CET X',             dataType: 'NUMBER' },
  { name: 'CET Y',             dataType: 'NUMBER' },
  { name: 'Teleport Command',  dataType: 'TEXT'   },
  { name: 'Z Coordinate',      dataType: 'NUMBER' },
  { name: 'Yaw',               dataType: 'NUMBER' },
];

// ---------------------------------------------------------------------------
// Token
// ---------------------------------------------------------------------------

const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) {
  console.error('Error: GITHUB_TOKEN environment variable is not set.');
  console.error('Usage: GITHUB_TOKEN=<token> node scripts/populate_migration_project.js');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// GraphQL helpers
// ---------------------------------------------------------------------------

async function ghQuery(query, variables = {}) {
  const res = await fetch(GITHUB_GQL, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2));
  return json.data;
}

async function nexusQuery(query, variables = {}) {
  const res = await fetch(NEXUS_GQL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) {
    console.warn('Nexus API errors:', JSON.stringify(json.errors, null, 2));
  }
  return json.data ?? null;
}

// ---------------------------------------------------------------------------
// Step 1: Get project node ID and existing fields
// ---------------------------------------------------------------------------

async function getProject() {
  const data = await ghQuery(`
    query($login: String!, $number: Int!) {
      user(login: $login) {
        projectV2(number: $number) {
          id
          title
          fields(first: 40) {
            nodes {
              ... on ProjectV2Field             { id name }
              ... on ProjectV2SingleSelectField { id name options { id name } }
              ... on ProjectV2IterationField    { id name }
            }
          }
        }
      }
    }
  `, { login: PROJECT_OWNER, number: PROJECT_NUMBER });

  const project = data.user.projectV2;
  console.log(`Project: "${project.title}" (${project.id})`);
  return project;
}

// ---------------------------------------------------------------------------
// Step 2: Create missing fields
// ---------------------------------------------------------------------------

async function ensureFields(projectId, existingFields) {
  const fieldMap = {};
  for (const f of existingFields) fieldMap[f.name] = f;

  for (const def of FIELD_DEFS) {
    if (fieldMap[def.name]) {
      console.log(`  Field exists: ${def.name}`);
      continue;
    }
    console.log(`  Creating field: ${def.name} (${def.dataType})`);
    const data = await ghQuery(`
      mutation($projectId: ID!, $name: String!, $dataType: ProjectV2CustomFieldType!) {
        createProjectV2Field(input: { projectId: $projectId, name: $name, dataType: $dataType }) {
          projectV2Field {
            ... on ProjectV2Field             { id name }
            ... on ProjectV2SingleSelectField { id name }
          }
        }
      }
    `, { projectId, name: def.name, dataType: def.dataType });
    fieldMap[def.name] = data.createProjectV2Field.projectV2Field;
  }
  return fieldMap;
}

// ---------------------------------------------------------------------------
// Step 3a: Load registry entries (data/locations/*.json)
// ---------------------------------------------------------------------------

function loadRegistryEntries() {
  const dir = path.join(__dirname, '..', 'data', 'locations');
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
}

// ---------------------------------------------------------------------------
// Step 3b: Fetch Nexus auto-discovered mods
// ---------------------------------------------------------------------------

// Minimal BBCode block parser (mirrors utils.js parseNcZoningBlock logic)
function parseNcZoningBlock(description) {
  if (!description) return null;
  const spoilerStripped = description.replace(/\[spoiler\]|\[\/spoiler\]/gi, '');
  const match = spoilerStripped.match(/\[code\]\s*NCZoning:([\s\S]*?)\[\/code\]/i);
  if (!match) return null;
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const eqIdx = line.indexOf('=');
    if (eqIdx < 1) continue;
    const key = line.slice(0, eqIdx).trim().toLowerCase();
    const val = line.slice(eqIdx + 1).trim();
    if (key && val) data[key] = val;
  }
  if (!data.coords || !data.category) return null;
  const parts = data.coords.split(',').map(s => parseFloat(s.trim()));
  if (parts.length < 2 || parts.length > 3 || parts.some(isNaN)) return null;
  return {
    coordinates: parts,
    yaw: data.yaw && !isNaN(parseFloat(data.yaw)) ? parseFloat(data.yaw) : null,
    nexusId: null,
  };
}

async function fetchNexusMods() {
  const query = `
    query($filter: ModsFilter!, $count: Int!, $offset: Int!) {
      mods(filter: $filter, count: $count, offset: $offset) {
        nodes { modId name description }
        totalCount
      }
    }
  `;
  let offset = 0, total = Infinity;
  const results = [];
  while (offset < total) {
    const data = await nexusQuery(query, {
      filter: {
        gameId: [{ value: String(NEXUS_GAME_ID) }],
        tag:    [{ value: 'NCZoning' }],
      },
      count: NEXUS_BATCH,
      offset,
    });
    const page = data?.mods;
    if (!page) {
      console.warn('Nexus: no mods page in response — API may have returned an error or null data');
      break;
    }
    total = page.totalCount ?? 0;
    if (page.nodes.length === 0) break;
    console.log(`Nexus: fetched ${page.nodes.length} mods (offset ${offset}, total ${total})`);
    for (const node of page.nodes) {
      const parsed = parseNcZoningBlock(node.description);
      if (!parsed) continue;
      results.push({
        id:          `nexus-auto-${node.modId}`,
        name:        node.name,
        nexus_id:    String(node.modId),
        coordinates: parsed.coordinates,
        yaw:         parsed.yaw,
        _source:     'nexus-auto',
      });
    }
    offset += NEXUS_BATCH;
  }
  return results;
}

// ---------------------------------------------------------------------------
// Step 4: Filter to entries still needing Z
// ---------------------------------------------------------------------------

function needsMigration(entry) {
  return !entry.coordinates || entry.coordinates.length < 3;
}

// ---------------------------------------------------------------------------
// Step 5: Create draft items and set field values
// ---------------------------------------------------------------------------

async function addDraftItem(projectId, title) {
  const data = await ghQuery(`
    mutation($projectId: ID!, $title: String!) {
      addProjectV2DraftIssue(input: { projectId: $projectId, title: $title }) {
        projectItem { id }
      }
    }
  `, { projectId, title });
  return data.addProjectV2DraftIssue.projectItem.id;
}

async function setTextField(projectId, itemId, fieldId, value) {
  await ghQuery(`
    mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $value: String!) {
      updateProjectV2ItemFieldValue(input: {
        projectId: $projectId, itemId: $itemId, fieldId: $fieldId,
        value: { text: $value }
      }) { projectV2Item { id } }
    }
  `, { projectId, itemId, fieldId, value: String(value) });
}

async function setNumberField(projectId, itemId, fieldId, value) {
  await ghQuery(`
    mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $value: Float!) {
      updateProjectV2ItemFieldValue(input: {
        projectId: $projectId, itemId: $itemId, fieldId: $fieldId,
        value: { number: $value }
      }) { projectV2Item { id } }
    }
  `, { projectId, itemId, fieldId, value: Number(value) });
}

function teleportCommand(x, y) {
  return `Game.GetTeleportationFacility():Teleport(GetPlayer(), Vector4.new(${x}, ${y}, ${TELEPORT_Z}, 1), EulerAngles.new(0,0,0))`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== NC Zoning Board — Populate Migration Project ===\n');

  // Get project
  const project  = await getProject();
  const fieldMap = await ensureFields(project.id, project.fields.nodes);
  console.log('');

  // Load all entries
  console.log('Loading registry entries...');
  const registry = loadRegistryEntries();

  console.log('Fetching Nexus auto-discovered mods...');
  const nexusMods = await fetchNexusMods();
  console.log('');

  // Registry IDs for deduplication (API mods that are also in registry are covered by registry)
  const registryNexusIds = new Set(registry.map(e => e.nexus_id).filter(Boolean));

  // Filter to entries needing migration
  const toMigrate = [
    ...registry.filter(needsMigration),
    ...nexusMods.filter(m => !registryNexusIds.has(m.nexus_id) && needsMigration(m)),
  ];

  const alreadyDone = registry.length + nexusMods.length - toMigrate.length;
  console.log(`Total entries:   ${registry.length} registry + ${nexusMods.length} API = ${registry.length + nexusMods.length}`);
  console.log(`Already have Z:  ${alreadyDone}`);
  console.log(`Needs migration: ${toMigrate.length}`);
  console.log('');

  if (toMigrate.length === 0) {
    console.log('Nothing to do!');
    return;
  }

  // Create project items
  let created = 0, failed = 0;
  for (const entry of toMigrate) {
    const [x, y] = entry.coordinates;
    const isRegistry = !entry._source || entry._source === 'registry';
    const source = isRegistry ? 'registry' : 'nexus-auto';

    process.stdout.write(`[${created + 1}/${toMigrate.length}] ${entry.name} ... `);
    try {
      const itemId = await addDraftItem(project.id, entry.name);

      // Set all field values
      if (fieldMap['UUID'])             await setTextField(project.id, itemId, fieldMap['UUID'].id, entry.id || '');
      if (fieldMap['Nexus ID'])         await setTextField(project.id, itemId, fieldMap['Nexus ID'].id, entry.nexus_id || '');
      if (fieldMap['Source'])           await setTextField(project.id, itemId, fieldMap['Source'].id, source);
      if (fieldMap['CET X'])            await setNumberField(project.id, itemId, fieldMap['CET X'].id, x);
      if (fieldMap['CET Y'])            await setNumberField(project.id, itemId, fieldMap['CET Y'].id, y);
      if (fieldMap['Teleport Command']) await setTextField(project.id, itemId, fieldMap['Teleport Command'].id, teleportCommand(x, y));
      // Z Coordinate and Yaw are intentionally left blank — to be filled in by contributors

      console.log('✓');
      created++;
    } catch (err) {
      console.log(`✗ ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone. Created: ${created}  Failed: ${failed}`);
}

main().catch(err => { console.error(err); process.exit(1); });
