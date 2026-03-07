const fs = require('fs');
const path = require('path');

const TAGS_FILE = path.join(__dirname, '..', 'data', 'tags.json');
const LOCATIONS_DIR = path.join(__dirname, '..', 'data', 'locations');

function validate() {
    console.log('Validating tags against data/tags.json...');
    
    if (!fs.existsSync(TAGS_FILE)) {
        console.error('Error: tags.json not found.');
        process.exit(1);
    }

    const tagsDict = JSON.parse(fs.readFileSync(TAGS_FILE, 'utf8'));
    const validTags = new Set(Object.keys(tagsDict));
    
    if (!fs.existsSync(LOCATIONS_DIR)) {
        console.log('No locations directory found, skipping tag validation.');
        return;
    }

    const files = fs.readdirSync(LOCATIONS_DIR).filter(f => f.endsWith('.json'));
    let hasError = false;

    files.forEach(file => {
        try {
            const mod = JSON.parse(fs.readFileSync(path.join(LOCATIONS_DIR, file), 'utf8'));
            if (mod.tags && Array.isArray(mod.tags)) {
                mod.tags.forEach(tag => {
                    if (!validTags.has(tag)) {
                        console.error(`Error in ${file}: Invalid tag "${tag}"`);
                        hasError = true;
                    }
                });
            }
        } catch (err) {
            console.error(`Error reading ${file}:`, err.message);
            hasError = true;
        }
    });

    if (hasError) {
        console.error('Tag validation failed.');
        process.exit(1);
    }
    
    console.log('Tag validation passed.');
}

validate();
