// What the eyedropper reads (rawColorAt in the PIXEL view, underlyingAt in the ANSI view): the colors
// a pixel or cell shows, as stored (before adjustments).
import { test, expect } from 'vitest';
import { createTestApp, settle } from '../support/app.js';
import { cellIndex } from '@/lib/Cells';
import { pickedFrom } from '@/store/project/reading.js';
import { rectShape } from '@/document/shapes.js';

test('on soft paint the picker picks the color shown, not the paint at full strength', async () => {
  const { project } = await createTestApp();
  project.cols = 30;
  project.rows = 30;
  await project.setBlankCanvas();
  project.render();
  await settle(project);
  project.paintStroke([{ x: 3, y: 7, alpha: 0.5 }], '#ff0000'); // half-strength red on black: cell (3, 3)'s bottom half
  project.commitEdit();
  await settle(project);
  const shown = project.cells[cellIndex(3, 3, project.cols)].fg.hex;
  expect(shown).not.toBe('#ff0000');
  expect(project.underlyingAt(3, 3).fg).toBe(shown);
  expect(project.rawColorAt(3, 7)).toBe(shown);
});

test('the status bar says a color came from a drawn layer when any shown cells layer has it, the one in use or not', async () => {
  const { project, workspace } = await createTestApp();
  project.cols = 30;
  project.rows = 30;
  await project.setBlankCanvas();
  project.render();
  await settle(project);
  const top = project.addLayer('cells', 'edit');
  workspace.pickLayer(top);
  project.typeAt(2, 2, 'X', { bg: '#0000ff' }); // a background of its own, on the top layer
  project.commitEdit();
  project.paintStroke([{ x: 6, y: 13, alpha: 1 }], '#00ff00'); // cell (6, 6)'s bottom half
  project.commitEdit();
  workspace.pickLayer('edit');
  expect(pickedFrom(project, 2, 2)).toEqual({ fgFrom: 'base', bgFrom: 'edit', ownBg: true });
  expect(pickedFrom(project, 6, 6)).toEqual({ fgFrom: 'edit', bgFrom: 'base', ownBg: false });
  project.setLayerHidden(top, true);
  expect(pickedFrom(project, 2, 2)).toEqual({ fgFrom: 'base', bgFrom: 'base', ownBg: false });
});

test('the PIXEL picker picks a shape on a vector layer above a cells layer, and not once it is hidden', async () => {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ cols: 20, rows: 20 });
  await settle(project);
  const vector = project.addLayer('vector', 'edit'); // above Layer 1: an upper layer
  workspace.pickLayer(vector);
  project.addShape(rectShape(2, 4, 3, 5, { fill: '#ff0000' }));
  await settle(project);
  expect(project.rawColorAt(2, 4)).toBe('#ff0000');
  expect(project.rawColorAt(2, 5)).toBe('#000000');
  project.setLayerHidden(vector, true);
  await settle(project);
  expect(project.rawColorAt(2, 4)).toBe('#000000');
});
