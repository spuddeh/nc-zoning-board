/**
 * render_terrain_3d.js
 * ====================
 * Headless 8192×8192 PNG renderer for the CP2077 3D map terrain+water.
 *
 * Uses Puppeteer to drive render_terrain_3d.html in a headless Chrome browser,
 * then captures the canvas at 8k resolution and saves it as terrain_background_8k.png.
 *
 * The HTML file handles all Three.js scene setup. This script only:
 *   1. Launches Chrome at the correct viewport size
 *   2. Navigates to the HTML file (via a local server)
 *   3. Waits for all GLBs to load
 *   4. Triggers a render and screenshots the canvas
 *   5. Saves the result
 *
 * Usage:
 *   # First start a local server in the repo root:
 *   npx serve . -p 3001
 *
 *   # Then in another terminal:
 *   node scripts/render_terrain_3d.js
 *
 *   # Or specify a custom port:
 *   node scripts/render_terrain_3d.js --port 3001
 *
 * Output:
 *   scripts/output/terrain_background_8k.png  — 8192×8192 opaque PNG
 *
 * Notes:
 *   - Chrome's max canvas size is 16384×16384, so 8192×8192 is fine.
 *   - GLB files are large (terrain: 18MB, cliffs: 9.5MB). Allow 2-3 minutes.
 *   - The render uses the same scene as the browser page, so visual debugging
 *     in the browser first is recommended before running this script.
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const OUTPUT_SIZE = 8192;
const OUTPUT_PATH = path.join(__dirname, 'output', 'terrain_background_8k.png');

// Parse --port argument
const portArg = process.argv.indexOf('--port');
const PORT = portArg !== -1 ? parseInt(process.argv[portArg + 1]) : 3001;
// Server must be started from D:/ root: npx serve D:/ -p 3001
const URL = `http://localhost:${PORT}/Modding/cp2077-location-mods-map/scripts/render_terrain_3d.html`;

async function main() {
  console.log(`Launching headless Chrome at ${OUTPUT_SIZE}×${OUTPUT_SIZE}...`);
  console.log(`Source: ${URL}`);
  console.log(`Output: ${OUTPUT_PATH}`);
  console.log('');

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      `--window-size=${OUTPUT_SIZE},${OUTPUT_SIZE}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',       // Allow cross-origin GLB loading
      '--allow-file-access-from-files',
    ],
    defaultViewport: { width: OUTPUT_SIZE, height: OUTPUT_SIZE, deviceScaleFactor: 1 },
  });

  const page = await browser.newPage();

  // Log browser console messages
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.error(`[Browser error] ${msg.text()}`);
    }
  });

  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 60000 });
  console.log('Page loaded. Waiting for GLBs to finish loading...');

  // Wait for "Ready" status message in the page
  try {
    await page.waitForFunction(
      () => document.getElementById('status')?.textContent?.startsWith('Ready'),
      { timeout: 300000 }  // 5 minute timeout for large GLB loads
    );
  } catch (e) {
    const status = await page.$eval('#status', el => el.textContent).catch(() => 'unknown');
    console.error(`Timeout waiting for GLBs. Last status: ${status}`);
    await browser.close();
    process.exit(1);
  }

  console.log('All GLBs loaded. Capturing...');

  // Trigger final render and capture canvas
  const imageData = await page.evaluate(() => {
    const canvas = document.getElementById('canvas');
    // Force one more render pass
    return canvas.toDataURL('image/png');
  });

  // Convert base64 data URL to PNG file
  const base64 = imageData.replace(/^data:image\/png;base64,/, '');
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, Buffer.from(base64, 'base64'));

  await browser.close();

  const stats = fs.statSync(OUTPUT_PATH);
  const mb = (stats.size / 1024 / 1024).toFixed(1);
  console.log(`\nSaved: ${OUTPUT_PATH} (${mb} MB)`);
  console.log('Done.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
