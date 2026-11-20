// The PIXEL view in the drawing's cell shape: a grid pixel is a column wide and pixelAspect columns tall (half as tall
// in an 8×8 font), so the view agrees with the ANSI view. Its sizes, selection, and the whole cells a room is shown
// follow that unit.
import { test, expect } from 'vitest';
import { settle } from '../support/app.js';
import { mountPixelView } from '../support/pixelView.js';
import { cp437Font, font8 } from '../support/blockFonts.js';

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

test('with an 8×16 font the PIXEL view is as tall as with none', async () => {
  for (const font of [null, cp437Font]) {
    const { project, workspace, host, done } = await mountPixelView(null, { cols: 20, rows: 20, font });
    expect(project.pixelAspect).toBe(1);
    expect(host.querySelector('.pixel-display').offsetHeight).toBe(project.rows * workspace.editZoom); // 100
    done();
  }
});

test('in an 8×8 font a grid pixel is half as tall as wide: the view is rows × zoom / 2 tall, and seen() reads each pixel', async () => {
  const { project, workspace, host, seen, done } = await mountPixelView(null, { cols: 20, rows: 20, font: font8 });
  const zoom = workspace.editZoom;
  expect(host.querySelector('.pixel-display').offsetHeight).toBe(project.rows * zoom * 0.5); // 50
  expect(host.querySelector('.pixel-display').offsetWidth).toBe(project.cols * zoom); // 100
  const canvas = host.querySelector('canvas');
  expect([canvas.style.width, canvas.style.height]).toEqual(['100px', '50px']);
  for (const [x, y] of [[0, 0], [19, 0], [0, 19], [19, 19]]) expect(seen(x, y)).toEqual(rgb(project.rawColorAt(x, y)));
  done();
});

test('in an 8×8 font a selection\'s marching ants sit on its cells', async () => {
  const { project, workspace, host, done } = await mountPixelView(null, { cols: 20, rows: 20, font: font8 });
  const zoom = workspace.editZoom;
  workspace.selection = { c0: 2, r0: 3, c1: 4, r1: 5 };
  await settle(project);
  const ants = host.querySelector('.pixel-marquee').style;
  expect([ants.left, ants.top, ants.width, ants.height]).toEqual([`${2 * zoom}px`, `${2 * 3 * zoom * 0.5}px`, `${3 * zoom}px`, `${2 * 3 * zoom * 0.5}px`]); // 10, 15, 15, 15
  done();
});

test('in an 8×8 font the whole cells a room is shown count lines a zoom tall', async () => {
  const { project, workspace, host, done } = await mountPixelView(null, { cols: 20, rows: 400, font: font8 });
  expect(host.querySelector('article').clientHeight).toBe(400);
  await settle(project);
  // A line is two grid pixels, 2 × 5 × 0.5 = 5 CSS px: 400 / 5 = 80 lines of the 200 (in a 1:2 cell, 40). The zoom
  // a room is sent stays per column (sharedView).
  expect(workspace.inputView).toMatchObject({ cols: 20, rows: 80, zoom: 5 });
  done();
});
