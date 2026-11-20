import { test, expect } from 'vitest';
import { createTestApp, loadImage, settle } from '../support/app.js';
import { drawnCells, gifFile } from '@/lib/GifFile.js';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { setDisplayFont } from '@/lib/displayFonts.js';
import { font11 } from '../support/blockFonts.js';

// Each frame of the file as a browser decodes it.
async function decodedFrames(bytes, count) {
  const decoder = new ImageDecoder({ data: bytes, type: 'image/gif' });
  const out = [];
  for (let i = 0; i < count; i++) {
    const { image } = await decoder.decode({ frameIndex: i });
    const canvas = new OffscreenCanvas(image.displayWidth, image.displayHeight), ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    image.close();
    out.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
  }
  decoder.close();
  return out;
}

test('the worker writes a GIF a browser decodes, each frame matching the canvas, telling progress as it goes', async () => {
  const { project } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 8, rows: 8 });
  project.typeAt(1, 1, 'A', { fg: '#ffee00', bg: '#0044aa' });
  project.commitEdit();
  project.addFrame('wipe');
  await settle(project);
  const frames = await project.animationCells(), smooth = useWorkspaceStore().smoothText, told = [];
  const bytes = await gifFile(frames, project.cols, 4, [13, 13], { smooth, progress: (share) => told.push(share) });
  expect(told).toEqual([0.5, 1]);
  const drawn = await drawnCells(project.cols, 4, { smooth }, ({ width, height, rgba }) => ({ width, height, frames: frames.map((cells) => rgba(cells).slice()) }));
  const decoded = await decodedFrames(bytes, 2);
  decoded.forEach(({ width, height, data }, f) => {
    expect([width, height]).toEqual([drawn.width, drawn.height]);
    let worst = 0;
    for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(data[i + c] - drawn.frames[f][i + c]));
    expect(worst).toBeLessThanOrEqual(1); // the art has fewer than 256 colors, so the palette holds each
  });
  // And the picture is the art: the typed cell's background is in the first frame, wiped from the second.
  const hasBlue = ({ data }) => { for (let i = 0; i < data.length; i += 4) if (data[i] === 0x00 && data[i + 1] === 0x44 && data[i + 2] === 0xaa) return true; return false; };
  expect(decoded.map(hasBlue)).toEqual([true, false]);
});

test('an export too large says so', async () => {
  const { project } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 8, rows: 8 });
  project.addFrame('blank');
  await settle(project);
  const frames = await project.animationCells();
  await expect(gifFile(frames, project.cols, 4, [2, 2], { tooLarge: () => { throw new Error('too large'); } })).rejects.toThrow('too large');
});

test('in an 8×11 font a GIF frame is 11 pixels a line', async () => {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 6, rows: 4 });
  project.setDrawingFont(font11);
  await setDisplayFont(workspace.displayFontSpec);
  try {
    const frames = await project.animationCells();
    const bytes = await gifFile(frames, project.cols, 4, [13], { smooth: false });
    const [{ width, height }] = await decodedFrames(bytes, 1);
    expect([width, height]).toEqual([48, 44]); // 4 lines of 11 pixels
  } finally {
    await setDisplayFont('jetbrains');
  }
});
