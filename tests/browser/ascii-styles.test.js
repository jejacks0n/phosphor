// The ASCII styles pick each cell's character from the set, lightest first: Monochrome by brightness,
// Color ASCII by intensity (the strongest channel), so paint in a pure color is drawn heaviest.
import { test, expect } from 'vitest';
import { createTestApp, settle } from '../support/app.js';
import { cellIndex } from '@/lib/Cells';

async function painted(renderStyle, color) {
  const { project } = await createTestApp();
  project.cols = 20;
  project.rows = 20;
  await project.setBlankCanvas();
  project.renderStyle = renderStyle;
  project.charsAscii = ' .:#';
  await settle(project);
  project.paintStroke([{ x: 5, y: 6, alpha: 1 }, { x: 5, y: 7, alpha: 1 }], color);
  project.commitEdit();
  await settle(project);
  return project.cells[cellIndex(5, 3, 20)].char;
}

test('Color ASCII draws red paint with the heaviest character; Monochrome with a light one', async () => {
  expect(await painted('colorAscii', '#ff0000')).toBe('#');
  expect(await painted('colorAscii', '#ffffff')).toBe('#');
  expect(await painted('ascii', '#ff0000')).toBe('.');
  expect(await painted('ascii', '#ffffff')).toBe('#');
});
