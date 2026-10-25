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

test('a filled anti-aliased ellipse over a smaller one hides its soft edge', async () => {
  for (const [view, settings] of [['input', {}], ['output', { shapeDrawWith: 'half' }]]) {
    const { project, draw } = await scene(settings);
    draw(view, { x: 10, y: 10 }, { x: 20, y: 18 }, FIRST); // inside the next one: its edge is soft paint
    draw(view, { x: 4, y: 4 }, { x: 30, y: 26 }, SECOND);
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

test('paint laid fully over soft paint replaces it; over soft paint the new color is on top', async () => {
  const { default: PaintLayer } = await import('@/document/PaintLayer');
  const layer = new PaintLayer({ cols: 2, rows: 2, scale: 1 });
  layer.paint([{ x: 0, y: 0, r: 255, g: 0, b: 0, alpha: 0.5 }]);
  layer.paint([{ x: 0, y: 0, r: 0, g: 255, b: 0, alpha: 1 }]);
  expect(layer.pixelAt(0, 0)).toEqual({ r: 0, g: 255, b: 0, a: 1 });
  // Half green over half red: the alphas add up (paint builds up to its opacity), and the color is
  // green over red, red showing a third (a quarter of the pixel under three quarters' green).
  layer.paint([{ x: 1, y: 0, r: 255, g: 0, b: 0, alpha: 0.5 }]);
  layer.paint([{ x: 1, y: 0, r: 0, g: 255, b: 0, alpha: 0.5 }]);
  const p = layer.pixelAt(1, 0);
  expect([p.r, p.g, p.b, Math.round(p.a * 100)]).toEqual([85, 170, 0, 100]);
});

test('paint of one color builds up to opacity as before: dabs add up, and low flow still reaches opaque', async () => {
  const { default: PaintLayer } = await import('@/document/PaintLayer');
  const layer = new PaintLayer({ cols: 2, rows: 2, scale: 1 });
  const alphas = (flow, dabs) => {
    layer.clear();
    const out = [];
    for (let i = 0; i < dabs; i++) {
      layer.paint([{ x: 0, y: 0, r: 255, g: 0, b: 0, alpha: flow }]);
      out.push(Math.round(layer.pixelAt(0, 0).a * 255));
    }
    return out;
  };
  expect(alphas(0.25, 4)).toEqual([64, 128, 192, 255]); // the soft Brush's default flow
  expect(alphas(0.05, 25).at(-1)).toBe(255);
});
