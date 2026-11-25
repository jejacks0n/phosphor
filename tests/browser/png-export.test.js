import { test, expect, vi, afterEach } from 'vitest';
import { createApp } from 'vue';
import { i18n } from '@/i18n';
import { createTestApp, settle } from '../support/app.js';
import { drawnCells } from '@/lib/GifFile.js';
import { pngBlob } from '@/lib/PngFile.js';
import { charRowsOf } from '@/lib/Cells.js';
import SaveDialog from '@/components/SaveDialog.vue';
import { setDisplayFont } from '@/lib/displayFonts.js';
import { font11, font7 } from '../support/blockFonts.js';

afterEach(() => vi.restoreAllMocks());
// An export waits for a frame to show its note, then draws and packs the picture, on a machine that may be busy with
// other test files: 0.1 to 1.7 seconds, measured, so its waits get longer than the default second.
const PATIENT = { interval: 5, timeout: 10_000 };

// The next download: its name and bytes.
function nextDownload() {
  return new Promise((resolve) => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(async function () {
      resolve({ name: this.download, bytes: new Uint8Array(await (await fetch(this.href)).arrayBuffer()) });
    });
  });
}

// A PNG's size, color type and pixels, as the browser reads it.
async function decoded(bytes) {
  const view = new DataView(bytes.buffer);
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  return { width: view.getUint32(16), height: view.getUint32(20), depth: bytes[24], colorType: bytes[25], data: ctx.getImageData(0, 0, bitmap.width, bitmap.height).data };
}

const render = (project, smooth) => drawnCells(project.cols, charRowsOf(project.rows), { smooth }, ({ width, height, rgba }) => ({ width, height, data: rgba(project.cells) }));
const rgbOf = (data) => data.filter((_, i) => i % 4 !== 3);

async function drawing() {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 6, rows: 4 });
  project.typeAt(1, 0, 'A', { fg: '#ffee00', bg: '#0044aa' });
  project.commitEdit();
  await settle(project);
  return { project, workspace };
}

test('a hard-edged export is a small indexed PNG of the frame as the ANSI view draws it', async () => {
  const { project } = await drawing();
  const download = nextDownload();
  await project.exportFile('png', { filename: 'art', smooth: false });
  const { name, bytes } = await download;
  expect(name).toBe('art.png');
  const png = await decoded(bytes), shot = await render(project, false);
  expect([png.width, png.height]).toEqual([shot.width, shot.height]);
  expect(png.colorType).toBe(3); // indexed
  expect(png.depth).toBeLessThanOrEqual(2); // black, the yellow and the blue
  expect(rgbOf(png.data)).toEqual(rgbOf(shot.data));
});

test('without iCE colors a blinking cell is exported steady: its background bright, its letter there', async () => {
  const { project } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 2, rows: 2 });
  project.quantize = 'cga';
  project.typeAt(0, 0, '█', { fg: '#ffffff', bg: '#5555ff' });
  project.typeAt(1, 0, ' ', { fg: '#ffffff', bg: '#5555ff' });
  project.commitEdit();
  project.sauceIceColors = false;
  await settle(project);
  expect(project.blinkingBackgrounds.has('#5555ff')).toBe(true);
  const download = nextDownload();
  await project.exportFile('png', { filename: 'art', smooth: false });
  const png = await decoded((await download).bytes), at = (x, y) => [...png.data.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 3)];
  const middle = png.height >> 1;
  expect(at(png.width >> 2, middle)).toEqual([255, 255, 255]); // the block, lit
  expect(at((3 * png.width) >> 2, middle)).toEqual([85, 85, 255]); // the background, bright
});

test('above 256 colors the export is full color, every pixel as it was', async () => {
  const width = 40, height = 10, rgba = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < width * height; p++) rgba.set([p & 255, p >> 8, 7, 255], 4 * p);
  const png = await decoded(new Uint8Array(await (await pngBlob(width, height, rgba)).arrayBuffer()));
  expect(png.colorType).not.toBe(3);
  expect([...png.data]).toEqual([...rgba]);
});

function mountDialog() {
  const closed = vi.fn();
  const app = createApp(SaveDialog, { ext: 'png', onClose: closed }).use(i18n);
  app.mount(document.createElement('div'));
  return { closed, unmount: () => app.unmount() };
}

test('an export that is not told is hard-edged, whatever Smooth text is', async () => {
  const { project, workspace } = await drawing();
  workspace.smoothText = true;
  const download = nextDownload();
  await project.exportFile('png', { filename: 'art' });
  const png = await decoded((await download).bytes), hard = await render(project, false), smooth = await render(project, true);
  expect(png.colorType).toBe(3); // indexed: the art's own colors and no others
  expect(rgbOf(png.data)).toEqual(rgbOf(hard.data));
  expect(rgbOf(png.data)).not.toEqual(rgbOf(smooth.data)); // the letter's edges would be shaded
});

test('the save dialog\'s .png asks nothing and exports hard-edged with Smooth text on', async () => {
  const { project, workspace } = await drawing();
  workspace.smoothText = true;
  const exported = vi.spyOn(project, 'exportFile');
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  const { closed, unmount } = mountDialog();
  try {
    expect(document.querySelector('.modal-dialog button.choice')).toBeNull();
    document.querySelector('.modal-dialog form').requestSubmit();
    await vi.waitUntil(() => closed.mock.calls.length, PATIENT);
    expect(exported).toHaveBeenCalledWith('png', expect.not.objectContaining({ smooth: true }));
  } finally {
    unmount();
  }
});

test('in an 8×11 font a PNG is 11 pixels a line, a ▄ cell 5 rows of its background over 6 of its foreground', async () => {
  const { project, workspace } = await createTestApp();
  await project.setDrawingFont(font11); // the next drawing's: on a drawing, a font of another height changes its rows
  await project.setBlankCanvas({ withLayer: true, cols: 6, rows: 4 });
  await setDisplayFont(workspace.displayFontSpec);
  try {
    project.typeAt(1, 0, '▄', { fg: '#ffee00', bg: '#0044aa' });
    project.commitEdit();
    await settle(project);
    const shot = await render(project, false);
    expect([shot.width, shot.height]).toEqual([48, 22]); // 2 lines of 11 pixels
    const at = (row) => [...shot.data.slice(4 * (row * shot.width + 8), 4 * (row * shot.width + 8) + 3)];
    for (let row = 0; row < 5; row++) expect(at(row)).toEqual([0x00, 0x44, 0xaa]);
    for (let row = 5; row < 11; row++) expect(at(row)).toEqual([0xff, 0xee, 0x00]);
  } finally {
    await setDisplayFont('jetbrains');
  }
});

test('in a font drawn at its own width of 7 a PNG is 7 pixels a column', async () => {
  const { project, workspace } = await createTestApp();
  const { cellWidth, ...seven } = font7;
  await project.setDrawingFont({ ...seven, width: cellWidth }); // answered: drawn at its own width
  await project.setBlankCanvas({ withLayer: true, cols: 6, rows: 4 });
  await setDisplayFont(workspace.displayFontSpec);
  try {
    expect(project.drawingFont.cellWidth).toBe(7);
    project.typeAt(1, 0, '█', { fg: '#ffee00', bg: '#0044aa' });
    project.commitEdit();
    await settle(project);
    const download = nextDownload();
    await project.exportFile('png', { filename: 'art', smooth: false });
    const png = await decoded((await download).bytes);
    expect([png.width, png.height]).toEqual([6 * 7, 2 * 8]); // 6 columns of 7 pixels, 2 lines of 8
  } finally {
    await setDisplayFont('jetbrains');
  }
});
