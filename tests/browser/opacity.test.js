// With Stack opacity on (the default), Opacity is how much one stroke (an edit, beginEdit to
// commitEdit) lays at most, and strokes stack as layers do, so two at 50% make the paint 75%. Off, Opacity is a
// ceiling on the paint, as it was.
import { test, expect } from 'vitest';
import { createTestApp, settle } from '../support/app.js';
import PaintLayer from '@/document/PaintLayer.js';

async function canvas() {
  const { project, workspace } = await createTestApp();
  project.cols = 20;
  project.rows = 20;
  await project.setBlankCanvas({ withLayer: true });
  await settle(project);
  workspace.editBrushOpacity = 50;
  return { project, workspace };
}

const square = Array.from({ length: 16 }, (_, i) => ({ x: 4 + (i % 4), y: 4 + Math.floor(i / 4), alpha: 1 }));
const at = (project) => { const p = project.paintLayer.pixelAt(5, 5); return [p.r, p.g, p.b, Math.round(p.a * 255)]; };

test('two strokes at 50% opacity make the paint 75%, as two layers at 50% do', async () => {
  const { project } = await canvas();
  project.paintStroke(square, '#ff0000');
  project.commitEdit();
  expect(at(project)).toEqual([255, 0, 0, 128]);
  project.paintStroke(square, '#ff0000');
  project.commitEdit();
  expect(at(project)).toEqual([255, 0, 0, 192]);
});

// maya-13: a stroke over paint partly see-through lays over it as a layer above it would (the alphas as two layers',
// not their sum), so what's under shows through as much. Every paint tool comes through here: the Brush, the Pencil,
// Shapes' paint, the Gradient and the Paint Bucket's Colors only fill.
test('a stroke over 50% paint on its own layer comes out as it does on a layer above that paint', async () => {
  const { project, workspace } = await canvas();
  project.paintStroke(square, '#ffffff');
  project.commitEdit();
  const white = at(project);
  workspace.editBrushOpacity = 40;
  project.paintStroke(square, '#ff5555');
  project.commitEdit();
  const [r, g, b, a] = at(project);
  // The red alone, as on a clear layer above: 40% of #ff5555, over the white.
  const red = [255, 85, 85, Math.round(0.4 * 255)], under = white[3] * (255 - red[3]) / 255, total = red[3] + under;
  const over = [0, 1, 2].map((i) => Math.round((red[i] * red[3] + white[i] * under) / total));
  expect(Math.abs(a - Math.round(total))).toBeLessThanOrEqual(1); // 70%, not 90%
  [r, g, b].forEach((v, i) => expect(Math.abs(v - over[i])).toBeLessThanOrEqual(1));
});

test('one stroke lays no more than its opacity, however often it goes over a pixel', async () => {
  const { project } = await canvas();
  for (let i = 0; i < 4; i++) project.paintStroke(square, '#ff0000');
  project.commitEdit();
  expect(at(project)).toEqual([255, 0, 0, 128]);
});

test('a second color at 50% stacks on top of the first', async () => {
  const { project } = await canvas();
  project.paintStroke(square, '#ff0000');
  project.commitEdit();
  project.paintStroke(square, '#00ff00');
  project.commitEdit();
  const [r, g, b, a] = at(project);
  expect(a).toBe(192);
  expect(g).toBeGreaterThan(r); // green over red
  expect(r).toBeGreaterThan(0);  // red shows through what green doesn't cover
  expect(b).toBe(0);
});

test('over opaque paint a stroke still recolors as it always did: its dabs keep blending in', async () => {
  const { project, workspace } = await canvas();
  workspace.editBrushOpacity = 100;
  project.paintStroke(square, '#0000ff');
  project.commitEdit();
  const dab = square.map((p) => ({ ...p, alpha: 0.25 }));
  for (let i = 0; i < 12; i++) project.paintStroke(dab, '#ff0000');
  project.commitEdit();
  const [r, , b, a] = at(project);
  expect(a).toBe(255);
  expect(r).toBeGreaterThan(240); // twelve quarter dabs: nearly all red
  expect(b).toBeLessThan(15);
});

test('with Stack opacity off, Opacity is a ceiling: two strokes at 50% stay at 50%', async () => {
  const { project, workspace } = await canvas();
  workspace.editBrushStack = false;
  project.paintStroke(square, '#ff0000');
  project.commitEdit();
  project.paintStroke(square, '#00ff00');
  project.commitEdit();
  expect(at(project)).toEqual([0, 255, 0, 128]); // the second stroke recolors, under the same ceiling
});

// In a room, another person's paint written in the middle of a stroke (writeRuns) goes under the stroke, as it goes into
// what the stroke's undo saved: the stroke's next dab lays over it, not over what the pixel was before them.
test('paint written mid-stroke by someone else stays under the stroke, over see-through paint too', () => {
  const layer = new PaintLayer({ cols: 4, rows: 4, scale: 1 });
  const dab = (hex, opacity) => layer.paint([{ x: 0, y: 0, r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5), 16), alpha: 1 }], opacity, true);
  layer.beginStroke();
  dab('#ffffff', 50);
  layer.endStroke();
  layer.beginStroke();
  dab('#ff5555', 40);
  layer.writeRuns([[0, 0, 1, 0x0000ffff]]); // theirs: opaque blue
  dab('#ff5555', 40);
  layer.endStroke();
  const { data } = layer.canvas.getContext('2d').getImageData(0, 0, 1, 1);
  expect(Array.from(data)).toEqual([102, 34, 187, 255]); // 40% of #ff5555 over the blue
});
