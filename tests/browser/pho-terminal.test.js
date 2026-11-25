// The .pho a terminal shows (src/document/phoTerminal.js) is still the same picture to a browser: its filtered rows,
// its chunks around the image and the two bytes after IEND change nothing a decoder shows, at every depth Save writes.
import { test, expect } from 'vitest';
import { terminalPho, harmful } from '@/document/phoTerminal.js';
import { indexedPng, rgbPng } from '@/lib/PngFile.js';

// Noise in runs of `colors` colors, the first seed whose PNG would act on a terminal printed as it is.
async function harmfulPicture(colors) {
  for (let seed = 1; ; seed++) {
    const width = colors > 256 ? 160 : 320, height = colors > 256 ? 60 : 160, rgba = new Uint8Array(width * height * 4);
    for (let p = 0, color = 0; p < width * height; p++) {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      if (seed % 5 === 0) color = (seed >>> 8) % colors;
      rgba.set([(color * 37) & 255, (color * 91) & 255, color >> 8 ? 200 : (color * 13) & 255, 255], p * 4);
    }
    const png = await (colors > 256 ? rgbPng : indexedPng)(width, height, rgba);
    if (harmful(png)) return { png, rgba };
  }
}

const pixelsOf = async (bytes) => {
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
};

for (const colors of [2, 16, 100, 1000]) {
  test(`a ${colors}-color picture decodes the same in the form a terminal shows`, async () => {
    const { png, rgba } = await harmfulPicture(colors);
    const file = await terminalPho(png, new Uint8Array([1, 2, 3, 0x1b]), new TextEncoder().encode('art\r\n'));
    expect(file).not.toBeNull();
    expect(new Uint8Array(await pixelsOf(file))).toEqual(rgba);
  });
}
