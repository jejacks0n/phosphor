import { test, expect } from 'vitest';
import { createTestApp, loadImage, settle } from '../support/app.js';
import { gifBytes, gifFrames } from '@/lib/GifFile.js';
import { useWorkspaceStore } from '@/store/WorkspaceStore';

test('a browser decodes the export and its first frame matches the canvas', async () => {
  const { project } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 8, rows: 8 });
  project.typeAt(1, 1, 'A', { fg: '#ffee00', bg: '#0044aa' });
  project.commitEdit();
  project.addFrame('wipe');
  await settle(project);
  const frames = await project.animationCells();
  const shot = await gifFrames(frames, project.cols, 4, [13, 13], { smooth: useWorkspaceStore().smoothText });
  const blob = new Blob([gifBytes(shot.width, shot.height, shot.frames)], { type: 'image/gif' });
  const decoded = await createImageBitmap(blob);
  expect([decoded.width, decoded.height]).toEqual([shot.width, shot.height]);
  const canvas = new OffscreenCanvas(shot.width, shot.height), ctx = canvas.getContext('2d');
  ctx.drawImage(decoded, 0, 0);
  const { data } = ctx.getImageData(0, 0, shot.width, shot.height);
  const { pixels, palette } = shot.frames[0];
  let worst = 0;
  for (let i = 0; i < pixels.length; i++) {
    const c = palette[pixels[i]];
    worst = Math.max(worst, Math.abs(data[4 * i] - c.r), Math.abs(data[4 * i + 1] - c.g), Math.abs(data[4 * i + 2] - c.b));
  }
  expect(worst).toBeLessThanOrEqual(1);
  // And the picture is the art: the typed cell's background is there.
  const blue = palette.findIndex((c) => c.r === 0x00 && c.g === 0x44 && c.b === 0xaa);
  expect(blue).toBeGreaterThanOrEqual(0);
  expect(pixels.includes(blue)).toBe(true);
  expect(shot.frames[1].pixels.includes(blue)).toBe(false);
});

test('an export too large says so', async () => {
  const { project } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 8, rows: 8 });
  project.addFrame('blank');
  await settle(project);
  const frames = await project.animationCells();
  await expect(gifFrames(frames, project.cols, 4, [2, 2], { tooLarge: () => { throw new Error('too large'); } })).rejects.toThrow('too large');
});
