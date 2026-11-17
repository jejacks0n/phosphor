// The PIXEL view's overlay of the ANSI cells: every cell with All cells, else the cells layers' own. Which cells are the
// layers' is worked out only while All cells is off (a file opened has 500k), and again when it's turned off.
import { test, expect, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { createTestApp, loadImage, settle } from '../support/app.js';
import { parseKey } from '@/document/editCells';
import InputEditor from '@/components/InputEditor.vue';

vi.mock('@/document/editCells', { spy: true });

const COLS = 20, ROWS = 20, RED = { fg: '#ff0000', bg: '#ff0000' };

async function mounted(file = null) {
  const { project, workspace } = await createTestApp();
  if (file) await project.loadProject(new File([await (await fetch(file)).arrayBuffer()], 'x.phosphor'));
  else await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: COLS, rows: ROWS });
  const [cols, rows] = [project.cols, project.rows];
  Object.assign(workspace, { editorTab: 'input', ansiOverlay: 100 });
  const host = document.createElement('div');
  host.style.cssText = 'width:400px;height:400px;position:fixed;left:0;top:0';
  document.body.append(host);
  const app = createApp({ render: () => h(InputEditor) });
  app.use(getActivePinia());
  app.mount(host);
  await nextTick();
  await settle(project);
  const canvas = host.querySelector('canvas');
  // A grid pixel's color as the view shows it.
  const seen = (x, y) => {
    const { width, height } = canvas, c = canvas.getContext('2d');
    return [...c.getImageData(Math.floor((x + 0.5) * (width / cols)), Math.floor((y + 0.5) * (height / rows)), 1, 1).data].slice(0, 3);
  };
  return { project, workspace, seen, done: () => { app.unmount(); host.remove(); } };
}

test('All cells finds no layer\'s cells; turned off, it shows the layers\' cells typed while it was on, and no others', async () => {
  const { project, workspace, seen, done } = await mounted();
  workspace.ansiOverlay = 0;
  await settle(project);
  const picture = seen(5, 4); // a generated cell's grid pixel with no overlay
  Object.assign(workspace, { ansiOverlay: 100, ansiOverlayAll: true });
  await settle(project);
  vi.mocked(parseKey).mockClear();
  project.typeAt(5, 3, 'A', RED);
  project.commitEdit();
  await settle(project);
  const parsed = vi.mocked(parseKey).mock.calls.length; // the redraw's own, not the overlay's

  workspace.ansiOverlayAll = false;
  await settle(project);
  expect(seen(5, 6)).toEqual([255, 0, 0]); // the typed cell, both its grid pixels
  expect(seen(5, 7)).toEqual([255, 0, 0]);
  expect(seen(5, 4)).toEqual(picture); // no overlay over a generated cell
  expect(project.cells[3 * COLS + 5].fg.hex).toBe('#ff0000');

  // The same edit with All cells off: the overlay reads every layer cell's key too.
  vi.mocked(parseKey).mockClear();
  project.typeAt(6, 3, 'B', RED);
  project.commitEdit();
  await settle(project);
  expect(vi.mocked(parseKey).mock.calls.length).toBe(parsed + project.editCells.size);
  expect(seen(6, 6)).toEqual([255, 0, 0]);
  done();
});

// The report (projects/layer-blending-ascii.phosphor): in Color ASCII the paint in the PIXEL view didn't blend. Colors
// only had made each blank cell it painted a ▄ with no colors (a paint block), which only ANSI shows, but the overlay
// drew it as the layer's own cell: the ASCII character the paint converts to, on black, over the paint's own pixels.
test('in the ASCII styles a paint block isn\'t drawn over its paint; a typed cell still is', async () => {
  const { project, workspace, seen, done } = await mounted();
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
  const { project, workspace, seen, done } = await mounted();
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
  const { project, workspace, seen, done } = await mounted('/tests/fixtures/projects/layer-blending-ascii.phosphor');
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
