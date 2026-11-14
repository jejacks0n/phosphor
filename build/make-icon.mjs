// The desktop app's icon (build/icon.png, which electron-builder makes every platform's icons from): the flame from
// the logo (public/logo.png), its pixels kept sharp, on a dark rounded square sized to Apple's icon grid (an 824 px
// square on a 1024 px canvas). Drawn in Chromium's canvas, so it needs nothing but Playwright.
//   node build/make-icon.mjs
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';

const FLAME = { x: 296, y: 0, width: 112, height: 176 };   // in logo.png: 14 by 22 cells of 8 px
const SCALE = 3.5;   // 28 px a cell

const logo = `data:image/png;base64,${readFileSync(new URL('../public/logo.png', import.meta.url)).toString('base64')}`;
const browser = await chromium.launch();
const page = await browser.newPage();
const png = await page.evaluate(async ({ logo, FLAME, SCALE }) => {
  const image = new Image();
  image.src = logo;
  await image.decode();
  const canvas = new OffscreenCanvas(1024, 1024);
  const g = canvas.getContext('2d');

  const tile = new Path2D();
  tile.roundRect(100, 100, 824, 824, 185);
  const fill = g.createLinearGradient(0, 100, 0, 924);
  fill.addColorStop(0, '#26222e');
  fill.addColorStop(1, '#100e14');
  g.fillStyle = fill;
  g.fill(tile);
  g.save();
  g.clip(tile);
  const glow = g.createRadialGradient(512, 600, 0, 512, 600, 420);   // phosphor's glow, low behind the flame
  glow.addColorStop(0, 'rgba(232, 2, 252, 0.28)');
  glow.addColorStop(1, 'rgba(232, 2, 252, 0)');
  g.fillStyle = glow;
  g.fillRect(100, 100, 824, 824);
  g.restore();
  g.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  g.lineWidth = 2;
  g.stroke(tile);

  // The flame alone: the logo's lettering (white and gray, under and into it) is left out.
  const flame = new OffscreenCanvas(FLAME.width, FLAME.height);
  const f = flame.getContext('2d');
  f.drawImage(image, FLAME.x, FLAME.y, FLAME.width, FLAME.height, 0, 0, FLAME.width, FLAME.height);
  const pixels = f.getImageData(0, 0, FLAME.width, FLAME.height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const [r, gr, b] = pixels.data.subarray(i, i + 3);
    if (Math.max(r, gr, b) - Math.min(r, gr, b) < 40) pixels.data[i + 3] = 0;
  }
  f.putImageData(pixels, 0, 0);

  const [width, height] = [FLAME.width * SCALE, FLAME.height * SCALE];
  g.imageSmoothingEnabled = false;
  g.drawImage(flame, Math.round(512 - width / 2), Math.round(512 - height / 2), width, height);

  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return [...new Uint8Array(await blob.arrayBuffer())];
}, { logo, FLAME, SCALE });
await browser.close();
writeFileSync(new URL('./icon.png', import.meta.url), Buffer.from(png));
