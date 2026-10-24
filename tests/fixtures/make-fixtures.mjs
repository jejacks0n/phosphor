// Makes the test fixtures under tests/fixtures/ (images and older .phosphor layouts). Deterministic:
// rerunning writes the same bytes. Images a canvas has to encode (JPEG, WebP, a Display P3 PNG) are
// made in headless Chromium, once: an existing one is kept, since browser encoders can change.
// Run: npm run fixtures
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { writePng } from '../support/png.js';
import { buildProjectFile } from '../support/projectFile.js';

const at = (path) => fileURLToPath(new URL(path, import.meta.url));
mkdirSync(at('images/'), { recursive: true });
mkdirSync(at('projects/'), { recursive: true });

const image = (width, height, fn) => {
  const pixels = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) pixels.push(...fn(x, y));
  return { width, height, pixels };
};

// PNGs (tests/support/png.js)
const gradient = image(64, 64, (x, y) => [x * 4, y * 4, 255 - x * 2, 255]);
writeFileSync(at('images/gradient.png'), writePng(gradient));
writeFileSync(at('images/rgba.png'), writePng(image(48, 48, (x, y) => [255, x * 5, 64, Math.min(255, y * 6)]))); // transparency
writeFileSync(at('images/deep16.png'), writePng({ ...image(32, 32, (x, y) => [x * 2048, y * 2048, 40000, 65535]), bitDepth: 16 }));
writeFileSync(at('images/one.png'), writePng(image(1, 1, () => [200, 40, 120, 255])));
writeFileSync(at('images/tall.png'), writePng(image(40, 1200, (x, y) => (Math.floor(y / 40) % 2 ? [20, 20, 20, 255] : [230, 200, 60, 255]))));

// A GIF, written without compression: 3-bit codes with a clear code before the table would grow.
function gif({ width, height, palette, indices }) {
  const bytes = [...Buffer.from('GIF89a'), width & 255, width >> 8, height & 255, height >> 8, 0xf1, 0, 0];
  for (const [r, g, b] of palette) bytes.push(r, g, b); // 4 colors (size flag 1)
  bytes.push(0x2c, 0, 0, 0, 0, width & 255, width >> 8, height & 255, height >> 8, 0, 2); // image, LZW min 2
  const codes = [];
  indices.forEach((index, i) => {
    if (i % 2 === 0) codes.push(4); // clear: the code size stays 3 bits
    codes.push(index);
  });
  codes.push(5); // end
  let bits = 0, n = 0;
  const data = [];
  for (const code of codes) {
    bits |= code << n;
    n += 3;
    while (n >= 8) { data.push(bits & 255); bits >>= 8; n -= 8; }
  }
  if (n) data.push(bits & 255);
  for (let i = 0; i < data.length; i += 255) bytes.push(Math.min(255, data.length - i), ...data.slice(i, i + 255));
  bytes.push(0, 0x3b);
  return Buffer.from(bytes);
}
writeFileSync(at('images/tiny.gif'), gif({ width: 4, height: 4, palette: [[0, 0, 0], [255, 0, 0], [0, 255, 0], [0, 0, 255]], indices: [0, 1, 2, 3, 1, 2, 3, 0, 2, 3, 0, 1, 3, 0, 1, 2] }));

// Older .phosphor layouts (tests/support/projectFile.js): what projectIO.readProject migrates.
const small = writePng(image(16, 16, (x, y) => [x * 16, y * 16, 128, 255]));
const paint = writePng(image(16, 16, (x, y) => (y === 8 ? [255, 255, 0, 255] : [0, 0, 0, 0])));
const settings = { cols: 16, rows: 16, renderStyle: 'ansi', chars: '░▒▓█', seed: 'fixture', quantize: 'none' };
const layouts = {
  'pre-cell-layer': { json: { ...settings, charEditMap: [[17, 'A'], [18, 'B'], [40, '╬']] } },
  'no-haspaint': { json: { ...settings, cellEdits: [['2,2', { char: 'Q', fg: '#ff0000' }]] }, paint },
  'erased-cells': { json: { ...settings, cellEdits: [], base: { erased: ['1,1', '2,2', '3,3'] } } },
  'charmode': { json: { ...settings, cellEdits: [], charMode: 'brightness' } },
};
for (const [name, { json, paint: p = null }] of Object.entries(layouts)) {
  writeFileSync(at(`projects/${name}.phosphor`), buildProjectFile({ json, image: small, paint: p }));
}

// Images a canvas encodes: JPEG, WebP, and a PNG with an embedded Display P3 profile.
const browserMade = { 'photo.jpg': ['image/jpeg', 'srgb'], 'photo.webp': ['image/webp', 'srgb'], 'p3.png': ['image/png', 'display-p3'] };
const missing = Object.keys(browserMade).filter((name) => !existsSync(at(`images/${name}`)));
if (missing.length) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const name of missing) {
    const [type, colorSpace] = browserMade[name];
    const base64 = await page.evaluate(({ type, colorSpace }) => {
      const canvas = document.createElement('canvas');
      canvas.width = 96;
      canvas.height = 64;
      const ctx = canvas.getContext('2d', { colorSpace });
      for (let y = 0; y < 64; y++) for (let x = 0; x < 96; x++) {
        ctx.fillStyle = colorSpace === 'display-p3' ? `color(display-p3 ${x / 95} ${y / 63} 0.6)` : `rgb(${x * 2.6} ${y * 4} ${128 + Math.sin(x / 6) * 100})`;
        ctx.fillRect(x, y, 1, 1);
      }
      return canvas.toDataURL(type, 0.9).split(',')[1];
    }, { type, colorSpace });
    writeFileSync(at(`images/${name}`), Buffer.from(base64, 'base64'));
  }
  await browser.close();
}
console.log('fixtures written');
