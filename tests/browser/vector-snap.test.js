// VECTOR's Snap to, through the tools: the Pen's clicks, the Shape tool's corners, a Node point, Vector select's
// move (the box's corner nearest the grab) and scale (the handle dragged) land on the grid; curve handles stay
// free; Shift's line comes first; Cmd or Ctrl held turns it off.
import { test, expect } from 'vitest';
import { createTestApp, loadImage } from '../support/app.js';
import { rectShape, transformed, translation, worldPoints } from '@/document/shapes';
import pen from '@/tools/pen.js';
import vshape from '@/tools/vshape.js';
import vnode from '@/tools/vnode.js';
import vselect, { boxHandles, selectionBox } from '@/tools/vselect.js';

async function app() {
  const made = await createTestApp();
  await loadImage(made.project, '/tests/fixtures/images/gradient.png', { cols: 40, rows: 30 });
  made.workspace.vectorStyle = { fill: '#ff0000', stroke: null, width: 1 };
  return { ...made, ctx: { project: made.project, workspace: made.workspace, view: 'vector', unit: { x: 8, y: 8 } } };
}
const run = (tool, ctx, from, ...to) => {
  const took = tool.begin(ctx, from, {});
  let at = from;
  for (const p of to) {
    tool.move(ctx, at, p);
    at = p;
  }
  tool.end(ctx);
  return took;
};
const bounds = (shape) => {
  const xs = worldPoints(shape).map((p) => p.x), ys = worldPoints(shape).map((p) => p.y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map((v) => Math.round(v * 1000) / 1000);
};
const RED = { fill: '#ff0000' };

test('the Pen\'s clicks land on cell corners; a curve\'s handles stay free; Shift\'s line first, snapped along it; Ctrl held, as it is', async () => {
  const { project, workspace, ctx } = await app();
  workspace.setActiveTool('pen');
  workspace.vectorSnap = 'cells';
  run(pen, ctx, { x: 4.3, y: 5.2 });
  run(pen, ctx, { x: 10.6, y: 5.4 }, { x: 12, y: 5.4 }, { x: 13.3, y: 5.4 }); // a drag: a smooth point
  workspace.isShiftPressed = true;
  run(pen, ctx, { x: 20.4, y: 6.3 }); // across from (11, 6): x snapped, y kept
  workspace.isShiftPressed = false;
  workspace.isCtrlPressed = true;
  run(pen, ctx, { x: 25.3, y: 6.3 });
  workspace.isCtrlPressed = false;
  const { points } = project.shapes.get(workspace.vectorPen);
  expect(points.map((p) => p.slice(0, 2))).toEqual([[4, 6], [11, 6], [20, 6], [25.3, 6.3]]);
  expect(points[1][4]).toBeCloseTo(2.3, 5); // its out handle: from the point to the pointer, unsnapped
  expect(points[1][5]).toBeCloseTo(-0.6, 5);
});

test('the Shape tool\'s corners land on half cells', async () => {
  const { project, workspace, ctx } = await app();
  workspace.setActiveTool('vshape');
  workspace.vectorSnap = 'half';
  run(vshape, ctx, { x: 2.3, y: 3.1 }, { x: 9.6, y: 8.7 });
  expect(bounds([...project.shapes.values()][0])).toEqual([2.5, 3, 9.5, 9]);
});

test('a Node point dragged lands on a cell corner, from where it was grabbed, on a shape moved off the grid', async () => {
  const { project, workspace, ctx } = await app();
  const key = project.addShape(transformed(rectShape(10, 10, 30, 20, RED), translation(0.3, 0)));
  workspace.setActiveTool('vnode');
  workspace.vectorPoints = key;
  workspace.vectorSnap = 'cells';
  run(vnode, ctx, { x: 10.3, y: 10 }, { x: 12, y: 12 }, { x: 13.4, y: 13.3 });
  const at = worldPoints(project.shapes.get(key))[0];
  expect([at.x, at.y].map((v) => Math.round(v * 1000) / 1000)).toEqual([13, 14]);
});

test('Vector select\'s move puts the box\'s corner nearest the grab on the grid, and its scale the handle dragged; Ctrl held, as it is', async () => {
  const { project, workspace, ctx } = await app();
  const key = project.addShape(rectShape(10.3, 10.2, 20.3, 15.2, RED));
  workspace.setActiveTool('vselect');
  project.selectShapes([key]);
  workspace.vectorSnap = 'cells';
  run(vselect, ctx, { x: 19, y: 14 }, { x: 20, y: 15 }, { x: 22.1, y: 16.2 }); // nearest the bottom right corner
  expect(bounds(project.shapes.get(key))).toEqual([13, 13, 23, 18]);

  const { handles } = boxHandles(selectionBox(project.shapes, [key]), ctx.unit);
  run(vselect, ctx, handles[5], { x: 25, y: 15.5 }, { x: 26.4, y: 15.5 }); // the right edge's middle
  expect(bounds(project.shapes.get(key))).toEqual([13, 13, 26, 18]);

  workspace.isCtrlPressed = true;
  run(vselect, ctx, { x: 15, y: 15 }, { x: 15.3, y: 15.1 });
  workspace.isCtrlPressed = false;
  expect(bounds(project.shapes.get(key))).toEqual([13.3, 13.1, 26.3, 18.1]);
});
