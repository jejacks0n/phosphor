// Opacity is how much one stroke (an edit, beginEdit to commitEdit) lays at most; strokes stack, so
// two at 50% make the paint opaque.
import { test, expect } from 'vitest';
import { createTestApp, settle } from '../support/app.js';

async function canvas() {
  const { project, workspace } = await createTestApp();
  project.cols = 20;
  project.rows = 20;
  await project.setBlankCanvas();
  await settle(project);
  workspace.editBrushOpacity = 50;
  return { project, workspace };
}

const square = Array.from({ length: 16 }, (_, i) => ({ x: 4 + (i % 4), y: 4 + Math.floor(i / 4), alpha: 1 }));
const at = (project) => { const p = project.paintLayer.pixelAt(5, 5); return [p.r, p.g, p.b, Math.round(p.a * 255)]; };

test('two strokes at 50% opacity make the paint opaque', async () => {
  const { project } = await canvas();
  project.paintStroke(square, '#ff0000');
  project.commitEdit();
  expect(at(project)).toEqual([255, 0, 0, 128]);
  project.paintStroke(square, '#ff0000');
  project.commitEdit();
  expect(at(project)).toEqual([255, 0, 0, 255]);
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
  expect(a).toBe(255);
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
