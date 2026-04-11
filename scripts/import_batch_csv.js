#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Simple UUID v4 generator
function generateUUID() {
  return crypto.randomUUID();
}

// Load valid tags
const tagsPath = path.join(__dirname, '../data/tags.json');
const validTags = Object.keys(JSON.parse(fs.readFileSync(tagsPath, 'utf-8')));

// Load existing locations to map names → UUIDs
const locationsDir = path.join(__dirname, '../data/locations');
const existingLocations = {};
const files = fs.readdirSync(locationsDir);

files.forEach(file => {
  if (file.endsWith('.json')) {
    const filePath = path.join(locationsDir, file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    existingLocations[data.name] = {
      uuid: file.replace('.json', ''),
      data: data
    };
  }
});

console.log(`Found ${files.length} existing location files\n`);

// Simple CSV parser
function parseCSV(content) {
  const lines = content.split('\n');
  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine);

  const records = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = parseCSVLine(lines[i]);
    const record = {};
    headers.forEach((header, idx) => {
      record[header] = values[idx] || '';
    });
    records.push(record);
  }
  return records;
}

// Parse a single CSV line (handles quoted fields)
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// Check for dry-run flag
const dryRun = process.argv.includes('--dry-run');

// Get CSV path (skip flags)
let csvPath = path.join(__dirname, '../NC Zoning Board - JonCross - Sheet1.csv');
for (let i = 2; i < process.argv.length; i++) {
  if (!process.argv[i].startsWith('--')) {
    csvPath = process.argv[i];
    break;
  }
}

const fileContent = fs.readFileSync(csvPath, 'utf-8');
const records = parseCSV(fileContent);

console.log(`Parsed ${records.length} entries from CSV\n`);

if (dryRun) {
  console.log('Running in DRY-RUN mode (no files will be written)\n');
}

const stats = {
  created: 0,
  updated: 0,
  skipped: 0,
  invalidTags: []
};

records.forEach((row) => {
  const modName = row['Mod Name'].trim();
  const category = row['Category'].trim();

  // Validate category
  const validCategories = ['location-overhaul', 'new-location', 'other'];
  if (!validCategories.includes(category)) {
    console.warn(`⚠ Skipping "${modName}": invalid category "${category}"`);
    stats.skipped++;
    return;
  }

  // Parse authors (first author is primary)
  const authorAlias = row['Author Alias'].trim();
  const authors = [authorAlias];

  // Parse credits
  const credits = row['Credits'] ? row['Credits'].trim() : undefined;

  // Parse coordinates
  const coords = [
    parseFloat(row['X Coord']),
    parseFloat(row['Y Coord']),
    parseFloat(row['Z Coord'])
  ];

  // Parse yaw
  const yaw = parseFloat(row['Yaw']);

  // Extract nexus ID from URL
  const nexusLink = row['Nexus Link'].trim();
  let nexusId = 'Dummy';
  const match = nexusLink.match(/mods\/(\d+)/);
  if (match) {
    nexusId = match[1];
  }

  // Parse and validate tags
  const rawTags = row['Tags'].split(',').map(t => t.trim().toLowerCase());
  const tags = rawTags.filter(tag => {
    if (validTags.includes(tag)) {
      return true;
    } else {
      // Log invalid tags
      if (!stats.invalidTags.find(t => t.tag === tag)) {
        stats.invalidTags.push({ tag, location: modName });
      }
      return false;
    }
  });

  // Truncate description to 500 chars
  let description = row['Short Desc'].trim();
  if (description.length > 500) {
    description = description.substring(0, 497) + '...';
  }

  // Create location object
  const location = {
    id: undefined, // Will be set below
    name: modName,
    authors: authors,
    coordinates: coords,
    yaw: yaw,
    nexus_id: nexusId,
    category: category,
    description: description,
    tags: tags
  };

  if (credits) {
    location.credits = credits;
  }

  // Check if location already exists
  if (existingLocations[modName]) {
    // Update existing
    const existingUuid = existingLocations[modName].uuid;
    location.id = existingUuid;

    if (!dryRun) {
      const filePath = path.join(locationsDir, `${existingUuid}.json`);
      fs.writeFileSync(filePath, JSON.stringify(location, null, 2) + '\n');
    }

    console.log(`✓ Updated: "${modName}" (${existingUuid})`);
    stats.updated++;
  } else {
    // Create new
    const newUuid = generateUUID();
    location.id = newUuid;

    if (!dryRun) {
      const filePath = path.join(locationsDir, `${newUuid}.json`);
      fs.writeFileSync(filePath, JSON.stringify(location, null, 2) + '\n');
    }

    console.log(`+ Created: "${modName}" (${newUuid})`);
    stats.created++;
  }
});

console.log(`\n${'='.repeat(60)}`);
console.log(`Summary:`);
console.log(`  Created: ${stats.created}`);
console.log(`  Updated: ${stats.updated}`);
console.log(`  Skipped: ${stats.skipped}`);
console.log(`  Total:   ${stats.created + stats.updated + stats.skipped}`);

if (stats.invalidTags.length > 0) {
  console.log(`\nInvalid tags (dropped):`);
  const uniqueTags = [...new Set(stats.invalidTags.map(t => t.tag))];
  uniqueTags.forEach(tag => {
    const count = stats.invalidTags.filter(t => t.tag === tag).length;
    console.log(`  "${tag}" (${count} location${count > 1 ? 's' : ''})`);
  });
  console.log(`\nValid tags are: ${validTags.join(', ')}`);
}

console.log(`\nNow run: node scripts/build_mods.js`);
