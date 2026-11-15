import { test, expect } from 'vitest';
import { ALL_FORMATS, BufferSource, Input, VideoSampleSink } from 'mediabunny';
import { createTestApp, loadImage, settle } from '../support/app.js';
import { drawnCells } from '@/lib/GifFile.js';
import { canExportVideo, videoFile, videoSettings } from '@/lib/VideoFile.js';
import { useWorkspaceStore } from '@/store/WorkspaceStore';

async function twoFrames(cols = 8) {
  const { project } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols, rows: 8 });
  project.typeAt(1, 1, 'A', { fg: '#ffee00', bg: '#0044aa' });
  project.commitEdit();
  project.addFrame('wipe');
  await settle(project);
  return { project, frames: await project.animationCells() };
}

test('the browser encodes an MP4 of the frames, each pixel 2×2, at each frame’s own time, telling progress as it goes', async () => {
  expect(canExportVideo()).toBe(true);
  const { project, frames } = await twoFrames();
  const smooth = useWorkspaceStore().smoothText, told = [];
  const bytes = await videoFile(frames, project.cols, 4, [250, 500], { smooth, progress: (share) => told.push(share) });
  expect(told).toEqual([0.5, 1]);
  expect(new TextDecoder().decode(bytes.slice(4, 8))).toBe('ftyp');

  const drawn = await drawnCells(project.cols, 4, { smooth }, ({ width, height, rgba }) => ({ width, height, frames: frames.map((cells) => rgba(cells).slice()) }));
  const input = new Input({ source: new BufferSource(bytes), formats: ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack();
  expect(['avc', 'vp9']).toContain(track.codec);
  expect([track.codedWidth, track.codedHeight]).toEqual([drawn.width * 2, drawn.height * 2]);
  expect(await input.computeDuration()).toBeCloseTo(0.75, 2);

  const decoded = [];
  for await (const sample of new VideoSampleSink(track).samples()) {
    const canvas = new OffscreenCanvas(track.codedWidth, track.codedHeight), ctx = canvas.getContext('2d');
    sample.draw(ctx, 0, 0);
    decoded.push({ timestamp: sample.timestamp, data: ctx.getImageData(0, 0, canvas.width, canvas.height).data });
    sample.close();
  }
  expect(decoded.map(({ timestamp }) => timestamp)).toEqual([0, 0.25]);
  decoded.forEach(({ data }, f) => {
    // A video's lossy, so near the canvas on average, read from the middle of each pixel's 2×2 block.
    let total = 0;
    for (let y = 0; y < drawn.height; y++) {
      for (let x = 0; x < drawn.width; x++) {
        const at = 4 * ((2 * y + 1) * track.codedWidth + 2 * x + 1), was = 4 * (y * drawn.width + x);
        for (let c = 0; c < 3; c++) total += Math.abs(data[at + c] - drawn.frames[f][was + c]);
      }
    }
    expect(total / (drawn.width * drawn.height * 3)).toBeLessThan(6);
  });
});

test('a video the browser can’t encode at any size says so', async () => {
  const { project, frames } = await twoFrames(6); // a size of its own: what a browser will encode is remembered by size
  const real = VideoEncoder.isConfigSupported;
  VideoEncoder.isConfigSupported = async (config) => ({ supported: false, config });
  try {
    await expect(videoFile(frames, project.cols, 4, [100, 100], { unencodable: () => { throw new Error('too large'); } })).rejects.toThrow('too large');
  } finally {
    VideoEncoder.isConfigSupported = real;
  }
});

test('where the browser won’t encode the doubled size it’s a pixel a pixel, rounded up to even, and VP9 where there’s no H.264', async () => {
  const real = VideoEncoder.isConfigSupported;
  VideoEncoder.isConfigSupported = async (config) => ({ supported: config.width < 200 && config.codec.startsWith('vp09'), config });
  try {
    // Sizes of their own: what a browser will encode is remembered by size.
    expect(await videoSettings(123, 45)).toEqual({ codec: 'vp9', scale: 1, width: 124, height: 46 });
    expect(await videoSettings(301, 45)).toBeNull();
  } finally {
    VideoEncoder.isConfigSupported = real;
  }
});
