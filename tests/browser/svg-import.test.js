// An SVG's art brought in as shapes: fitted to the canvas, its transforms baked into the points, one undo step,
// selected; and it looks as the browser draws the same file.
import { test, expect } from 'vitest';
import { createTestApp } from '../support/app.js';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { toastMessage } from '@/composables/useToast';
import { IDENTITY, MOST_POINTS, MOST_SHAPES, outlines, scaling, stacked, transformed } from '@/document/shapes.js';
import { paintShape } from '@/document/ShapeLayer.js';
import { readSvgFile } from '@/lib/SvgFile.js';
import rose from '../fixtures/svg/rose-mark.svg?raw';
import mark from '../fixtures/svg/belle-verriere-mark.svg?raw';
import logo from '../fixtures/svg/belle-verriere-logo.svg?raw';

const svg = (body, attrs = 'viewBox="0 0 100 100"') => `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`;

async function blank(cols = 160, rows = 200) {
  const app = await createTestApp();
  await app.project.setBlankCanvas({ cols, rows });
  return app;
}

// The fit the import should make: art bigger than the canvas (less 2 grid pixels each side) scaled down into it,
// proportions kept; centered either way.
function fitOf(art, cols, rows) {
  const s = Math.min(1, (cols - 4) / art.width, (rows - 4) / art.height);
  return { s, x: (cols - art.width * s) / 2, y: (rows - art.height * s) / 2 };
}

const white = (w, h) => {
  const canvas = new OffscreenCanvas(w, h), ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  return ctx;
};

for (const [name, text] of [['rose', rose], ['mark', mark], ['logo', logo]]) {
  test(`each yardstick, imported, looks as the browser draws it: ${name}`, async () => {
    const { project } = await blank();
    const K = 4, W = project.cols * K, H = project.rows * K;
    const keys = project.addSvg(text);
    expect(keys.length).toBeGreaterThan(0);
    const ours = white(W, H);
    for (const [, shape] of stacked(project.shapes)) paintShape(ours, shape, K);

    const art = readSvgFile(text), fit = fitOf(art, project.cols, project.rows);
    const img = new Image();
    img.src = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
    await img.decode();
    const theirs = white(W, H);
    theirs.drawImage(img, fit.x * K, fit.y * K, art.width * fit.s * K, art.height * fit.s * K);
    URL.revokeObjectURL(img.src);

    const a = ours.getImageData(0, 0, W, H).data, b = theirs.getImageData(0, 0, W, H).data;
    let differ = 0, inked = 0;
    for (let i = 0; i < a.length; i += 4) {
      if (Math.abs(a[i] - b[i]) > 64 || Math.abs(a[i + 1] - b[i + 1]) > 64 || Math.abs(a[i + 2] - b[i + 2]) > 64) differ++;
      if (b[i] < 128) inked++;
    }
    expect(inked / (W * H)).toBeGreaterThan(0.01); // the browser drew something to compare with
    // Under 0.1%: started at 1.5%, and the three differ by 0.005% at most, at edges.
    expect(differ / (W * H)).toBeLessThan(0.001);
  });
}

test('big art fits inside the canvas and small art keeps its size, centered', async () => {
  const { project } = await blank();
  const box = (key) => {
    const xs = [], ys = [];
    for (const { points } of outlines(project.shapes.get(key))) for (const [x, y] of points) xs.push(x) && ys.push(y);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  };
  const [small] = project.addSvg(svg('<rect width="40" height="20"/>', 'viewBox="0 0 40 20"'));
  expect(box(small)).toEqual([60, 90, 100, 110]);
  expect(project.shapes.get(small).m).toEqual(IDENTITY);
  const [big] = project.addSvg(svg('<rect width="1000" height="500"/>', 'viewBox="0 0 1000 500"'));
  expect(box(big)).toEqual([2, 61, 158, 139]);
  const [tall] = project.addSvg(svg('<rect x="100" width="100" height="1000"/>', 'viewBox="100 0 100 1000"'));
  expect(box(tall)).toEqual([70.2, 2, 89.8, 198]);
});

test('transforms are baked into the points, and the curves\' handles with them', async () => {
  const { project } = await blank();
  const [key] = project.addSvg(svg('<path d="M0 0 C10 0 20 10 20 20" transform="translate(30 40) scale(2 1)" stroke="black" fill="none"/>', 'viewBox="0 0 100 100"'));
  const shape = project.shapes.get(key);
  expect(shape.m).toEqual(IDENTITY);
  // The 100×100 art is centered in 160×200: (30, 50) in; the path at (30, 40) and twice as wide.
  expect(shape.points).toEqual([[60, 90, 0, 0, 20, 0, 0], [100, 110, 0, -10, 0, 0, 0]]);
});

test('stroke widths scale once with the fit, and not after', async () => {
  const { project } = await blank();
  const keys = project.addSvg(mark);
  const art = readSvgFile(mark), { s } = fitOf(art, project.cols, project.rows);
  const shape = project.shapes.get(keys[0]);
  expect(shape.width).toBeCloseTo(13 * s, 1);
  expect(shape).toMatchObject({ stroke: '#000000', fill: null, rule: 'evenodd' });
  expect(shape.cap).toBeUndefined(); // round, the default
  project.updateShapes([[keys[0], transformed(shape, scaling(2, 2))]]);
  expect(project.shapes.get(keys[0]).width).toBe(shape.width);
  // Thin and thick lines stay in the widths a shape can have.
  const [thin, thick] = project.addSvg(svg('<path d="M0 0 L100 0" stroke="red" stroke-width="0.01"/><path d="M0 50 L100 50" stroke="red" stroke-width="500"/>'));
  expect([project.shapes.get(thin).width, project.shapes.get(thick).width]).toEqual([0.5, 64]);
});

test('an import is one undo step, selected, on top, with Vector select', async () => {
  const { project } = await blank();
  const workspace = useWorkspaceStore();
  const first = project.addSvg(svg('<rect width="10" height="10"/>'))[0];
  workspace.setActiveTool('pen');
  const keys = project.addSvg(rose);
  expect(keys).toHaveLength(6);
  expect(workspace.vectorSelected).toEqual(keys);
  expect(workspace.activeTool).toBe('vselect');
  const order = stacked(project.shapes).map(([k]) => k);
  expect(order).toEqual([first, ...keys]); // on top, in the file's order
  project.undo();
  expect([...project.shapes.keys()]).toEqual([first]);
  project.redo();
  expect(project.shapes.size).toBe(7);
});

test('past the limits, nothing comes in, and it says by how much', async () => {
  const { project } = await blank();
  const many = svg(Array.from({ length: MOST_SHAPES + 5 }, (_, i) => `<rect x="${i % 100}" width="1" height="1"/>`).join(''));
  toastMessage.value = null;
  expect(project.addSvg(many)).toEqual([]);
  expect(project.shapes.size).toBe(0);
  expect(toastMessage.value).toContain(String(MOST_SHAPES + 5));
  expect(toastMessage.value).toContain(String(MOST_SHAPES));
  const long = svg(`<path d="M0 0 ${Array.from({ length: MOST_POINTS + 10 }, (_, i) => `L${i % 100} ${(i * 7) % 100}`).join(' ')}"/>`);
  expect(project.addSvg(long)).toEqual([]);
  expect(project.shapes.size).toBe(0);
  expect(toastMessage.value).toContain(String(MOST_POINTS + 11));
  expect(project.canUndo).toBe(false);
});

test('what was left out is said, with how to bring text in; an SVG with nothing to bring says so', async () => {
  const { project } = await blank();
  toastMessage.value = null;
  project.addSvg(svg('<rect width="10" height="10"/><text>Hi</text><image href="x.png" width="5" height="5"/>'));
  expect(toastMessage.value).toMatch(/text/i);
  expect(toastMessage.value).toMatch(/image/i);
  expect(toastMessage.value).toMatch(/curves|paths/i);
  toastMessage.value = null;
  expect(project.addSvg(svg('<text>Hi</text>'))).toEqual([]);
  expect(toastMessage.value).toMatch(/curves|paths/i);
  expect(project.shapes.size).toBe(1);
});
