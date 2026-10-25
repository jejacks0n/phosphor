// What the eyedropper reads (rawColorAt in the PIXEL view, underlyingAt in the ANSI view): the colors
// a pixel or cell shows, as stored (before adjustments).
import { test, expect } from 'vitest';
import { createTestApp, settle } from '../support/app.js';
import { cellIndex } from '@/lib/Cells';

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
