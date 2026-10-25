// The Shapes tool's paint: a filled shape is its outline in FG and its inside in BG, and where it
// covers a pixel fully nothing under it shows through, anti-aliased or not.
import { test, expect } from 'vitest';
import { createTestApp, loadImage } from '../support/app.js';
import { ellipseCoverage } from '@/lib/Brushes';
import { hex2rgb } from '@/lib/ColorUtils';

const FIRST = { editFgColor: '#ff0000', editBgColor: '#0000ff' };
const SECOND = { editFgColor: '#00ff00', editBgColor: '#ffff00' };

async function scene(settings) {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 40, rows: 40 });
  const { default: shapes } = await import('@/tools/shapes');
  Object.assign(workspace, { shapeKind: 'ellipse', shapeAntialias: true, editBgNone: false, editBrushOpacity: 100 }, settings);
  const draw = (view, from, to, colors) => {
    Object.assign(workspace, colors);
    const ctx = { project, workspace, view };
    shapes.begin(ctx, from);
    shapes.move(ctx, from, to);
    shapes.end(ctx);
  };
  return { project, draw };
}

// The color a filled shape paints where it covers a pixel fully: its outline's share in FG, the rest BG.
const twoTone = ({ editFgColor, editBgColor }, ring) => {
  const f = hex2rgb(editFgColor), b = hex2rgb(editBgColor);
  return ['r', 'g', 'b'].map((k) => b[k] + (f[k] - b[k]) * ring);
};
const near = (got, want) => want.every((v, i) => Math.abs(got[i] - v) <= 1);

test('a filled anti-aliased ellipse over another shows none of it where it covers fully', async () => {
  for (const [view, settings] of [['input', {}], ['output', { shapeDrawWith: 'half' }]]) {
    const { project, draw } = await scene(settings);
    const from = { x: 4, y: 4 }, to = { x: 30, y: 26 };
    draw(view, from, to, FIRST);
    draw(view, from, to, SECOND);
    const filled = ellipseCoverage(4, 4, 30, 26, true), ring = ellipseCoverage(4, 4, 30, 26, false);
    const ghosts = [];
    for (let y = 4; y <= 26; y++) {
      for (let x = 4; x <= 30; x++) {
        if (filled(x, y) < 1) continue;
        const { r, g, b } = project.paintLayer.pixelAt(x, y);
        if (!near([r, g, b], twoTone(SECOND, ring(x, y)))) ghosts.push(`${x},${y}: ${r},${g},${b}`);
      }
    }
    expect(ghosts, view).toEqual([]);
  }
});

test('a filled anti-aliased Full block ellipse over another shows none of it where it covers fully', async () => {
  const { project, draw } = await scene({ shapeDrawWith: 'full', shapeBlockChars: false });
  const from = { x: 4, y: 4 }, to = { x: 30, y: 37 }; // cells 4..30, rows 2..18
  draw('output', from, to, FIRST);
  draw('output', from, to, SECOND);
  const filled = ellipseCoverage(4, 2, 30, 18, true), ring = ellipseCoverage(4, 2, 30, 18, false);
  const ghosts = [];
  for (let row = 2; row <= 18; row++) {
    for (let col = 4; col <= 30; col++) {
      if (filled(col, row) < 1) continue;
      const { r, g, b } = project.paintLayer.pixelAt(col, 2 * row);
      if (!near([r, g, b], twoTone(SECOND, ring(col, row)))) ghosts.push(`${col},${row}: ${r},${g},${b}`);
    }
  }
  expect(ghosts).toEqual([]);
});
