// The PIXEL view's overlay of the ANSI cells: every cell with All cells, else the cells layers' own. Which cells are the
// layers' is worked out only while All cells is off (a file opened has 500k), and again when it's turned off.
import { test, expect, vi } from 'vitest';
import { settle } from '../support/app.js';
import { mountPixelView } from '../support/pixelView.js';
import { ownIndexes } from '@/document/editCells';

vi.mock('@/document/editCells', { spy: true });

const COLS = 20, RED = { fg: '#ff0000', bg: '#ff0000' };

test('All cells finds no layer\'s cells; turned off, it shows the layers\' cells typed while it was on, and no others', async () => {
  const { project, workspace, seen, done } = await mountPixelView();
  workspace.ansiOverlay = 0;
  await settle(project);
  const picture = seen(5, 4); // a generated cell's grid pixel with no overlay
  Object.assign(workspace, { ansiOverlay: 100, ansiOverlayAll: true });
  await settle(project);
  vi.mocked(ownIndexes).mockClear();
  project.typeAt(5, 3, 'A', RED);
  project.commitEdit();
  await settle(project);
  expect(vi.mocked(ownIndexes)).not.toHaveBeenCalled(); // All cells: the layers' cells aren't looked for

  workspace.ansiOverlayAll = false;
  await settle(project);
  expect(vi.mocked(ownIndexes)).toHaveBeenCalled(); // turned off: looked for again
  expect(seen(5, 6)).toEqual([255, 0, 0]); // the typed cell, both its grid pixels
  expect(seen(5, 7)).toEqual([255, 0, 0]);
  expect(seen(5, 4)).toEqual(picture); // no overlay over a generated cell
  expect(project.cells[3 * COLS + 5].fg.hex).toBe('#ff0000');

  // The same edit with All cells off: the overlay looks for the layers' cells, once, over every layer cell.
  vi.mocked(ownIndexes).mockClear();
  project.typeAt(6, 3, 'B', RED);
  project.commitEdit();
  await settle(project);
  expect(vi.mocked(ownIndexes)).toHaveBeenCalledTimes(1);
  expect(vi.mocked(ownIndexes).mock.calls[0][0]).toContain(project.editCells);
  expect(seen(6, 6)).toEqual([255, 0, 0]);
  done();
});

// The report (projects/layer-blending-ascii.phosphor): in Color ASCII the paint in the PIXEL view didn't blend. Colors
// only had made each blank cell it painted a ▄ with no colors (a paint block), which only ANSI shows, but the overlay
// drew it as the layer's own cell: the ASCII character the paint converts to, on black, over the paint's own pixels.
test('in the ASCII styles a paint block isn\'t drawn over its paint; a typed cell still is', async () => {
  const { project, workspace, seen, done } = await mountPixelView();
  workspace.pickLayer(project.addLayer('cells', 'base'));
  project.renderStyle = 'colorAscii';
  project.writeEditCells([{ col: 8, row: 4, attrs: { char: '▄' } }]); // as Colors only leaves a blank cell it paints
  project.paintEditPixels([{ x: 8, y: 8, r: 255, g: 255, b: 255, alpha: 0.5 }]); // a soft stroke's edge, over the picture
  project.commitEdit();
  project.typeAt(12, 4, 'A', RED);
  project.commitEdit();
  await settle(project);
  expect(project.editCellAt(8, 4)).toEqual({ char: '▄' });
  const typed = seen(12, 8);
  workspace.ansiOverlay = 0;
  await settle(project);
  const [paint, under] = [seen(8, 8), seen(8, 9)];
  workspace.ansiOverlay = 100;
  await settle(project);
  expect([seen(8, 8), seen(8, 9)]).toEqual([paint, under]); // the paint's own pixels, as with no overlay
  expect(typed).toEqual(seen(12, 8));
  workspace.ansiOverlay = 0;
  await settle(project);
  expect(seen(12, 8)).not.toEqual(typed); // the typed cell is the overlay's
  done();
});

// docs/model.md R6: a frozen cell (Merge down's pinned conversion of the paint under it) is its paint: not drawn either.
test('R6: a frozen cell isn\'t drawn over its paint; a typed cell still is', async () => {
  const { project, workspace, seen, done } = await mountPixelView();
  workspace.pickLayer(project.addLayer('cells', 'base'));
  project.paintEditPixels([{ x: 8, y: 8, r: 255, g: 255, b: 255, alpha: 1 }, { x: 8, y: 9, r: 255, g: 0, b: 0, alpha: 1 }]);
  project.commitEdit();
  project.setEditCells(new Map([...project.editCells, ['8,4', Object.freeze({ char: '%', fg: '#ff0000', bg: '#ffffff', frozen: true })]]), ['8,4']);
  project.commitEdit();
  project.typeAt(12, 4, 'A', RED);
  project.commitEdit();
  await settle(project);
  const typed = seen(12, 8);
  workspace.ansiOverlay = 0;
  await settle(project);
  const paint = [seen(8, 8), seen(8, 9)];
  workspace.ansiOverlay = 100;
  await settle(project);
  expect([seen(8, 8), seen(8, 9)]).toEqual(paint); // its paint, as with no Overlay
  expect(seen(12, 8)).toEqual(typed);
  done();
});

test('the report: the strokes under and over the shape show blended with the Overlay on, as with it off', async () => {
  const { project, workspace, seen, done } = await mountPixelView('/tests/fixtures/projects/layer-blending-ascii.phosphor');
  const spots = [[40, 22], [40, 23], [50, 14], [60, 12]]; // the stroke under the shape's edge, and beside it
  const at = () => spots.map(([x, y]) => seen(x, y));
  workspace.ansiOverlay = 0;
  await settle(project);
  const paint = at();
  workspace.ansiOverlay = 100;
  await settle(project);
  expect(at()).toEqual(paint);
  done();
});
