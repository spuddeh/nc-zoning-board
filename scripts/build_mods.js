const fs = require('fs');
const path = require('path');

const LOCATIONS_DIR = path.join(__dirname, '..', 'data', 'locations');
const OUTPUT_FILE = path.join(__dirname, '..', 'mods.json');

function build() {
    console.log('Building mods.json from data/locations/*.json...');

    if (!fs.existsSync(LOCATIONS_DIR)) {
        console.error(`Error: Locations directory not found at ${LOCATIONS_DIR}`);
        process.exit(1);
    }

    const files = fs.readdirSync(LOCATIONS_DIR).filter(f => f.endsWith('.json'));
    const mods = [];
    let errors = 0;

    files.forEach(file => {
        try {
            const content = fs.readFileSync(path.join(LOCATIONS_DIR, file), 'utf8');
            const mod = JSON.parse(content);
            mods.push(mod);
        } catch (err) {
            console.error(`Error parsing ${file}:`, err.message);
            errors++;
        }
    });

    if (errors > 0) {
        console.error(`Build failed: ${errors} file(s) could not be parsed.`);
        process.exit(1);
    }

    // Detect duplicate IDs
    const idCounts = {};
    for (const mod of mods) {
        if (idCounts[mod.id]) {
            idCounts[mod.id].push(mod.name);
        } else {
            idCounts[mod.id] = [mod.name];
        }
    }
    const duplicates = Object.entries(idCounts).filter(([, names]) => names.length > 1);
    if (duplicates.length > 0) {
        for (const [id, names] of duplicates) {
            console.error(`Duplicate ID ${id} found in: ${names.join(', ')}`);
        }
        console.error(`Build failed: ${duplicates.length} duplicate ID(s) detected.`);
        process.exit(1);
    }

    // Sort by name for consistency
    mods.sort((a, b) => a.name.localeCompare(b.name));

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(mods, null, 4) + '\n');
    console.log(`Successfully built ${OUTPUT_FILE} with ${mods.length} entries (from ${files.length} files).`);
}

build();
