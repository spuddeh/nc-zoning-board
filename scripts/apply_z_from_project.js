/**
 * apply_z_from_project.js
 *
 * Reads all "Done" items from the Z/Yaw migration GitHub Project, backfills
 * Z and Yaw into data/locations/*.json, then marks each item "Processed".
 *
 * - Registry entries (Source: registry): JSON file is updated in place
 * - Nexus-auto entries (Source: nexus-auto): logged for manual follow-up
 *   (mod author must update their Nexus BBCode block)
 *
 * Usage:
 *   GITHUB_TOKEN=<projects_token> node scripts/apply_z_from_project.js
 *
 * The token needs the `project` OAuth scope (read:project + write:project).
 * To run via GitHub Actions, add the token as a PROJECTS_PAT repo secret.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const GITHUB_GQL     = 'https://api.github.com/graphql';
const PROJECT_OWNER  = 'spuddeh';
const PROJECT_NUMBER = 3;
const LOCATIONS_DIR  = path.join(__dirname, '..', 'data', 'locations');

const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) {
  console.error('Error: GITHUB_TOKEN environment variable is not set.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// GraphQL helper
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

// ---------------------------------------------------------------------------
// Step 1: Get project, fields, and status option IDs
// ---------------------------------------------------------------------------

async function getProjectMeta() {
  const data = await ghQuery(`
    query($login: String!, $number: Int!) {
      user(login: $login) {
        projectV2(number: $number) {
          id title
          fields(first: 40) {
            nodes {
              ... on ProjectV2Field             { id name }
              ... on ProjectV2SingleSelectField { id name options { id name } }
            }
          }
        }
      }
    }
  `, { login: PROJECT_OWNER, number: PROJECT_NUMBER });

  const project = data.user.projectV2;
  console.log(`Project: "${project.title}" (${project.id})\n`);

  // Build field map
  const fieldMap = {};
  for (const f of project.fields.nodes) fieldMap[f.name] = f;

  // Resolve Status option IDs
  const statusField = fieldMap['Status'];
  if (!statusField?.options) {
    throw new Error('Status field not found or not a single-select field.');
  }

  const doneOption      = statusField.options.find(o => o.name === 'Done');
  const processedOption = statusField.options.find(o => o.name === 'Processed');

  if (!doneOption) {
    throw new Error('Status field has no "Done" option. Add it in the project settings.');
  }
  if (!processedOption) {
    throw new Error(
      'Status field has no "Processed" option.\n' +
      `Add it at: https://github.com/users/${PROJECT_OWNER}/projects/${PROJECT_NUMBER}/settings`
    );
  }

  return { projectId: project.id, fieldMap, statusField, doneOption, processedOption };
}

// ---------------------------------------------------------------------------
// Step 2: Load all "Done" items from the project
// ---------------------------------------------------------------------------

async function loadDoneItems(projectId, fieldMap, doneOptionId) {
  const uuidFieldId   = fieldMap['UUID']?.id;
  const nexusFieldId  = fieldMap['Nexus ID']?.id;
  const sourceFieldId = fieldMap['Source']?.id;
  const zFieldId      = fieldMap['Z Coordinate']?.id;
  const yawFieldId    = fieldMap['Yaw']?.id;
  const statusFieldId = fieldMap['Status']?.id;

  const doneItems = [];
  let cursor = null, hasNextPage = true;

  while (hasNextPage) {
    const data = await ghQuery(`
      query($projectId: ID!, $cursor: String) {
        node(id: $projectId) {
          ... on ProjectV2 {
            items(first: 100, after: $cursor) {
              nodes {
                id
                fieldValues(first: 20) {
                  nodes {
                    ... on ProjectV2ItemFieldTextValue {
                      text
                      field { ... on ProjectV2Field { id } }
                    }
                    ... on ProjectV2ItemFieldNumberValue {
                      number
                      field { ... on ProjectV2Field { id } }
                    }
                    ... on ProjectV2ItemFieldSingleSelectValue {
                      optionId
                      field { ... on ProjectV2SingleSelectField { id } }
                    }
                  }
                }
              }
              pageInfo { hasNextPage endCursor }
            }
          }
        }
      }
    `, { projectId, cursor });

    const page = data.node.items;
    for (const item of page.nodes) {
      const fields = {};
      for (const fv of item.fieldValues.nodes) {
        const fieldId = fv.field?.id;
        if (!fieldId) continue;
        if (fv.text   !== undefined) fields[fieldId] = fv.text;
        if (fv.number !== undefined) fields[fieldId] = fv.number;
        if (fv.optionId !== undefined) fields[fieldId] = fv.optionId;
      }

      // Only process items with Status = Done
      if (fields[statusFieldId] !== doneOptionId) continue;

      doneItems.push({
        itemId:   item.id,
        uuid:     fields[uuidFieldId]   ?? null,
        nexusId:  fields[nexusFieldId]  ?? null,
        source:   fields[sourceFieldId] ?? null,
        z:        fields[zFieldId]      ?? null,
        yaw:      fields[yawFieldId]    ?? null,
      });
    }

    hasNextPage = page.pageInfo.hasNextPage;
    cursor      = page.pageInfo.endCursor;
  }

  return doneItems;
}

// ---------------------------------------------------------------------------
// Step 3: Set item status to Processed
// ---------------------------------------------------------------------------

async function setProcessed(projectId, itemId, statusFieldId, processedOptionId) {
  await ghQuery(`
    mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
      updateProjectV2ItemFieldValue(input: {
        projectId: $projectId, itemId: $itemId, fieldId: $fieldId,
        value: { singleSelectOptionId: $optionId }
      }) { projectV2Item { id } }
    }
  `, {
    projectId,
    itemId,
    fieldId:  statusFieldId,
    optionId: processedOptionId,
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== NC Zoning Board — Apply Z/Yaw from Project ===\n');

  const { projectId, fieldMap, statusField, doneOption, processedOption } = await getProjectMeta();

  console.log('Loading "Done" items from project...');
  const doneItems = await loadDoneItems(projectId, fieldMap, doneOption.id);
  console.log(`Found ${doneItems.length} Done item(s)\n`);

  if (doneItems.length === 0) {
    console.log('Nothing to process.');
    return;
  }

  let updated = 0, nexusOnly = 0, skipped = 0, failed = 0;
  const nexusOnlyItems = [];

  for (const item of doneItems) {
    const label = item.uuid || item.nexusId || item.itemId;
    process.stdout.write(`${label} ... `);

    try {
      if (item.z === null) {
        console.log('skip — Z Coordinate is empty');
        skipped++;
        continue;
      }

      if (item.source === 'nexus-auto') {
        // No local file to update — tracked in project for author outreach only
        console.log('skip — nexus-auto (contact author to update their Nexus page)');
        nexusOnly++;
        nexusOnlyItems.push({ nexusId: item.nexusId, itemId: item.itemId });
        continue;
      }

      // Registry entry — find and update the JSON file
      const filePath = path.join(LOCATIONS_DIR, `${item.uuid}.json`);
      if (!fs.existsSync(filePath)) {
        console.log(`skip — file not found: ${item.uuid}.json`);
        skipped++;
        continue;
      }

      const existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      existing.coordinates = [existing.coordinates[0], existing.coordinates[1], item.z];
      if (item.yaw !== null) existing.yaw = item.yaw;

      fs.writeFileSync(filePath, JSON.stringify(existing, null, 4) + '\n');
      await setProcessed(projectId, item.itemId, statusField.id, processedOption.id);

      console.log(`✓  Z=${item.z}${item.yaw !== null ? `  yaw=${item.yaw}` : ''}`);
      updated++;

    } catch (err) {
      console.log(`✗  ${err.message}`);
      failed++;
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Updated:      ${updated}`);
  console.log(`Nexus-auto:   ${nexusOnly} (author must update BBCode)`);
  console.log(`Skipped:      ${skipped}`);
  console.log(`Failed:       ${failed}`);

  if (nexusOnlyItems.length > 0) {
    console.log('\nNexus-auto mods needing author update:');
    for (const m of nexusOnlyItems) console.log(`  https://www.nexusmods.com/cyberpunk2077/mods/${m.nexusId}`);
  }

  if (updated > 0) {
    console.log('\nRun `node scripts/build_mods.js` to rebuild mods.json');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
