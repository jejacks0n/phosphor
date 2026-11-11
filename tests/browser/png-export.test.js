import { test, expect, vi, afterEach } from 'vitest';
import { createApp, nextTick } from 'vue';
import { i18n } from '@/i18n';
import { createTestApp, settle } from '../support/app.js';
import { drawnCells } from '@/lib/GifFile.js';
import { pngBlob } from '@/lib/PngFile.js';
import { charRowsOf } from '@/lib/Cells.js';
import SaveDialog from '@/components/SaveDialog.vue';

afterEach(() => vi.restoreAllMocks());

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
  await project.setBlankCanvas({ cols: 6, rows: 4 });
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

test('with smooth text off, Export .png asks nothing and exports hard-edged', async () => {
  const { project, workspace } = await drawing();
  workspace.smoothText = false;
  const exported = vi.spyOn(project, 'exportFile');
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  const { closed, unmount } = mountDialog();
  try {
    expect(document.querySelector('.modal-dialog button.choice')).toBeNull();
    document.querySelector('.modal-dialog form').requestSubmit();
    await vi.waitUntil(() => closed.mock.calls.length, { interval: 5 });
    expect(exported).toHaveBeenCalledWith('png', expect.objectContaining({ smooth: false }));
  } finally {
    unmount();
  }
});

test('with smooth text on, Export .png asks first, Smooth focused, and exports as chosen', async () => {
  const { project, workspace } = await drawing();
  workspace.smoothText = true;
  const exported = vi.spyOn(project, 'exportFile');
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  for (const [choice, smooth] of [['Smooth', true], ['Hard-edged', false]]) {
    const { closed, unmount } = mountDialog();
    try {
      const dialog = document.querySelector('.modal-dialog');
      expect(dialog.textContent).toContain('Smooth text adds colors, so the PNG will be a few times bigger.');
      expect(dialog.querySelector('form')).toBeNull();
      expect(document.activeElement.textContent).toContain('Smooth');
      [...dialog.querySelectorAll('button.choice')].find((button) => button.querySelector('b').textContent === choice).click();
      await nextTick();
      document.querySelector('.modal-dialog form').requestSubmit();
      await vi.waitUntil(() => closed.mock.calls.length, { interval: 5 });
      expect(exported).toHaveBeenLastCalledWith('png', expect.objectContaining({ smooth }));
    } finally {
      unmount();
    }
  }
  expect(workspace.smoothText).toBe(true); // nothing's remembered
});

test('Cancel on the question closes without exporting', async () => {
  const { project, workspace } = await drawing();
  workspace.smoothText = true;
  const exported = vi.spyOn(project, 'exportFile');
  const { closed, unmount } = mountDialog();
  try {
    document.querySelector('.modal-dialog button.cancel').click();
    expect(closed).toHaveBeenCalled();
    expect(exported).not.toHaveBeenCalled();
  } finally {
    unmount();
  }
});
