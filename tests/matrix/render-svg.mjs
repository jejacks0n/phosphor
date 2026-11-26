// Renders tests/fixtures/matrix/landscape.svg to landscape.png beside it (1440 x 1200). Run: node tests/matrix/render-svg.mjs
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
const svg = readFileSync(new URL('../fixtures/matrix/landscape.svg', import.meta.url), 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
await page.screenshot({ path: new URL('../fixtures/matrix/landscape.png', import.meta.url).pathname, clip: { x: 0, y: 0, width: 1440, height: 1200 } });
await browser.close();
