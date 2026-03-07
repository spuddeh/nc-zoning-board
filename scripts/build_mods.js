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

    files.forEach(file => {
        try {
            const content = fs.readFileSync(path.join(LOCATIONS_DIR, file), 'utf8');
            const mod = JSON.parse(content);
            mods.push(mod);
        } catch (err) {
            console.error(`Error parsing ${file}:`, err.message);
        }
    });

    // Sort by name for consistency
    mods.sort((a, b) => a.name.localeCompare(b.name));

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(mods, null, 4) + '\n');
    console.log(`Successfully built ${OUTPUT_FILE} with ${mods.length} entries.`);
}

build();
