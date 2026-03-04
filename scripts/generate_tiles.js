/**
 * generate_tiles.js — Slice a map image into Leaflet-compatible tiles
 *
 * Usage: node scripts/generate_tiles.js
 *
 * Input:  raw maps/8k/night_city.png  (8192×8192)
 * Output: assets/tiles/{z}/{x}/{y}.png
 *
 * Generates zoom levels 0–5 with 256×256 tiles.
 * At zoom 5 (native), 8192/256 = 32×32 = 1024 tiles.
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const INPUT = path.join(__dirname, '..', 'raw maps', '8k', 'night_city.png');
const OUTPUT_DIR = path.join(__dirname, '..', 'assets', 'tiles');
const TILE_SIZE = 256;
const MAX_ZOOM = 5; // 2^5 = 32 tiles per axis → 32×256 = 8192

async function generateTiles() {
    console.log('Loading source image...');
    const metadata = await sharp(INPUT).metadata();
    console.log(`Source: ${metadata.width}×${metadata.height} (${metadata.format})`);

    const imgSize = metadata.width; // Assumes square
    if (imgSize !== metadata.height) {
        console.warn(`Warning: Image is not square (${metadata.width}×${metadata.height}). Using width.`);
    }

    let totalTiles = 0;

    for (let z = 0; z <= MAX_ZOOM; z++) {
        const tilesPerAxis = Math.pow(2, z);       // e.g. z5 = 32
        const scaledSize = tilesPerAxis * TILE_SIZE; // e.g. 32×256 = 8192
        const scale = scaledSize / imgSize;

        console.log(`\nZoom ${z}: ${tilesPerAxis}×${tilesPerAxis} tiles (scale ${scale.toFixed(3)})`);

        // Resize the source image for this zoom level
        const resized = sharp(INPUT)
            .resize(scaledSize, scaledSize, { fit: 'fill' })
            .png({ quality: 90 });

        // Extract the full resized buffer once
        const buffer = await resized.toBuffer();

        for (let x = 0; x < tilesPerAxis; x++) {
            const tileDir = path.join(OUTPUT_DIR, String(z), String(x));
            fs.mkdirSync(tileDir, { recursive: true });

            for (let y = 0; y < tilesPerAxis; y++) {
                const left = x * TILE_SIZE;
                const top = y * TILE_SIZE;

                const tilePath = path.join(tileDir, `${y}.png`);

                await sharp(buffer, { raw: undefined })
                    .extract({ left, top, width: TILE_SIZE, height: TILE_SIZE })
                    .png()
                    .toFile(tilePath);

                totalTiles++;
            }
        }

        console.log(`  → ${tilesPerAxis * tilesPerAxis} tiles written`);
    }

    console.log(`\nDone! ${totalTiles} tiles generated in ${OUTPUT_DIR}`);
}

generateTiles().catch(err => {
    console.error('Error generating tiles:', err);
    process.exit(1);
});
