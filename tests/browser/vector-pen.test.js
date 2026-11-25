// The Pen (penPoint, finishPen): a shape a point at a time, in one edit that converts live, closed on its first
// point or left an open curve. Whatever else commits ends it as an open curve, and one with under two points
// leaves nothing, not even an undo step. Undo while it's drawn takes back its last point.
import { test, expect } from 'vitest';
import { createTestApp, loadImage, settle, cellsKey } from '../support/app.js';
import pen from '@/tools/pen.js';
import vselect, { boxHandles, selectionBox } from '@/tools/vselect.js';
import { rectShape, worldPoints } from '@/document/shapes.js';
import { font8 } from '../support/blockFonts.js';

async function drawing() {
  const app = await createTestApp();
  await loadImage(app.project, '/tests/fixtures/images/gradient.png', { cols: 30, rows: 30 });
  app.project.clearHistory();
  app.workspace.editFgColor = '#ff0000';
  app.workspace.editFgNone = false;
  app.workspace.vectorStyle = { fill: 'fg', stroke: null, width: 1 };
  return app;
}
const steps = (project) => project.history.version;
const theShape = (project) => [...project.shapes.values()][0];

test('clicks make corners and a drag makes a smooth point; the shape converts live while drawn', async () => {
  const { project, workspace } = await drawing();
  const bare = cellsKey(project);
  const key = project.penPoint(4, 4);
  expect(workspace.vectorPen).toBe(key);
  project.penPoint(20, 4);
  project.penPoint(20, 20, { x: 3, y: 0 });
  expect(project._stroke?.pen).toBe(key);
  const { points, closed, fill, z } = project.shapes.get(key);
  expect(points).toEqual([[4, 4, 0, 0, 0, 0, 0], [20, 4, 0, 0, 0, 0, 0], [20, 20, -3, 0, 3, 0, 1]]);
  expect(closed).toBe(false);
  expect(fill).toBe('#ff0000');
  expect(z).toBe(0);
  await settle(project);
  expect(cellsKey(project)).not.toEqual(bare); // drawn while it's being drawn
});

test('clicking the first point closes it; Enter leaves an open curve stroked in the foreground color with no fill', async () => {
  const { project, workspace } = await drawing();
  project.penPoint(4, 4);
  project.penPoint(20, 4);
  project.penPoint(20, 20);
  project.finishPen({ closed: true });
  expect(project._stroke).toBe(null);
  expect(workspace.vectorPen).toBe(null);
  expect(theShape(project)).toMatchObject({ closed: true, fill: '#ff0000', stroke: null });

  project.penPoint(2, 25);
  project.penPoint(25, 25);
  project.finishPen({ closed: false });
  const open = [...project.shapes.values()].find((s) => !s.closed);
  expect(open).toMatchObject({ fill: null, stroke: '#ff0000' });
});

test('the whole shape is one undo step', async () => {
  const { project } = await drawing();
  const bare = cellsKey(project), before = steps(project);
  project.penPoint(4, 4);
  project.penPoint(20, 4);
  project.penPoint(20, 20, { x: 2, y: 2 });
  project.finishPen({ closed: true });
  await settle(project);
  expect(steps(project)).toBe(before + 1);
  project.undo();
  await settle(project);
  expect(project.shapes.size).toBe(0);
  expect(cellsKey(project)).toEqual(bare);
  project.redo();
  expect(theShape(project).points).toHaveLength(3);
});

test('a Pen shape ends as an open curve when anything else commits', async () => {
  const { project } = await drawing();
  project.addFrame('blank');
  project.showFrame(0);
  project.clearHistory();
  const ends = [
    ['showFrame', () => project.showFrame(1)],
    ['commitPending', () => project.commitPending()],
  ];
  for (const [name, end] of ends) {
    project.showFrame(0);
    const key = project.penPoint(3, 3);
    project.penPoint(15, 15);
    end();
    expect(project._stroke, name).toBe(null);
    project.showFrame(0);
    expect(project.shapes.get(key), name).toMatchObject({ closed: false, fill: null, stroke: '#ff0000' });
  }
});

test('undo while the Pen draws takes back its last point, and the shape before it stays', async () => {
  const { project, workspace } = await drawing();
  project.penPoint(4, 4);
  project.penPoint(20, 4);
  project.penPoint(20, 20);
  project.finishPen({ closed: true });
  const done = theShape(project), before = steps(project);
  const key = project.penPoint(2, 25);
  project.penPoint(25, 25);
  project.undo();
  expect(project._stroke?.pen).toBe(key); // still drawing, one point fewer
  expect(project.shapes.get(key).points).toHaveLength(1);
  project.undo(); // the last point: nothing left of it, and no step
  expect(project.shapes.has(key)).toBe(false);
  expect(workspace.vectorPen).toBe(null);
  expect([...project.shapes.values()]).toEqual([done]);
  expect(steps(project)).toBe(before);
  project.undo(); // now the shape before it
  expect(project.shapes.size).toBe(0);
});

test('a change heard from a room doesn\'t end the Pen', async () => {
  const { project } = await drawing();
  const key = project.penPoint(3, 3);
  project.applyNumbered({ n: 1, by: 'them', stroke: 'theirs', cells: [['9,9', { char: 'T' }]], runs: [] });
  expect(project._stroke?.pen).toBe(key);
  project.penPoint(15, 15);
  project.finishPen({ closed: false });
  expect(project.shapes.get(key).points).toHaveLength(2);
});

test('removing points down to none leaves no shape and no undo step', async () => {
  const { project, workspace } = await drawing();
  const before = steps(project), bare = cellsKey(project);
  project.penPoint(3, 3);
  project.penPoint(15, 15);
  project.penBack();
  expect(theShape(project).points).toHaveLength(1);
  project.penBack();
  expect(project.shapes.size).toBe(0);
  expect(project._stroke).toBe(null);
  expect(workspace.vectorPen).toBe(null);
  expect(steps(project)).toBe(before);
  await settle(project);
  expect(cellsKey(project)).toEqual(bare);

  project.penPoint(3, 3); // one point, finished: nothing
  project.commitPending();
  expect(project.shapes.size).toBe(0);
  expect(steps(project)).toBe(before);
});

test('a shape the Pen finishes is selected, as the Shape tool\'s is; one with under two points leaves the selection as it was', async () => {
  const { project, workspace } = await drawing();
  const before = project.addShape({ z: 0, closed: true, fill: '#00ff00', stroke: null, width: 1, m: [1, 0, 0, 1, 0, 0], points: [[1, 1, 0, 0, 0, 0, 0], [3, 1, 0, 0, 0, 0, 0], [3, 3, 0, 0, 0, 0, 0]] });
  workspace.vectorSelected = [before];
  const key = project.penPoint(4, 4);
  project.penPoint(20, 4);
  expect(workspace.vectorSelected).toEqual([before]); // while it's drawn
  project.finishPen({ closed: false });
  expect(workspace.vectorSelected).toEqual([key]);

  workspace.vectorSelected = [before];
  project.penPoint(10, 10);
  project.finishPen();
  expect(workspace.vectorSelected).toEqual([before]);
});

// A finished shape is selected and its box shows with the Pen, as with the Shape tool (issue #198): its handles work
// there; while a shape is being drawn every press is a point.
test('after the Pen finishes a shape, its box\'s handles scale and turn it; a press off them starts a new shape', async () => {
  const { project, workspace } = await drawing();
  const unit = { x: 8, y: 8 }, ctx = { project, workspace, view: 'vector', unit };
  workspace.setActiveTool('pen');
  const click = (pos) => { pen.begin(ctx, pos, {}); pen.end(ctx); };
  const drag = (from, to) => { if (pen.begin(ctx, from, {})) pen.move(ctx, from, to); pen.end(ctx); };
  click({ x: 4, y: 4 });
  click({ x: 20, y: 4 });
  click({ x: 20, y: 20 });
  const key = project._stroke.pen;
  // Still drawing: a press where a handle would be is a point.
  drag(boxHandles(selectionBox(project.shapes, [key]), unit).handles[3], { x: 2, y: 22 });
  expect(project.shapes.get(key).points).toHaveLength(4);
  click({ x: 4, y: 4 }); // closes it
  expect(project._stroke).toBe(null);
  expect(workspace.vectorSelected).toEqual([key]);

  const corner = () => selectionBox(project.shapes, [key]).corners[2], version = steps(project), was = corner();
  drag(boxHandles(selectionBox(project.shapes, [key]), unit).handles[2], { x: was.x + 6, y: was.y + 4 });
  expect(project.shapes.size).toBe(1);
  expect(corner().x).toBeCloseTo(was.x + 6, 2); // the record's transform is kept to 4 places
  expect(corner().y).toBeCloseTo(was.y + 4, 2);
  expect(steps(project)).toBe(version + 1);
  const { center } = selectionBox(project.shapes, [key]);
  drag(boxHandles(selectionBox(project.shapes, [key]), unit).knob, { x: center.x + 10, y: center.y });
  expect(Math.atan2(project.shapes.get(key).m[1], project.shapes.get(key).m[0])).toBeCloseTo(Math.PI / 2, 5);
  expect(workspace.activeTool).toBe('pen');

  click({ x: center.x, y: center.y }); // inside the box, off the handles: a new shape's first point
  expect(project.shapes.size).toBe(2);
});

// The knob turns on screen: in an 8×8 font a grid pixel is half as tall as it's wide, so a shape square on screen
// stays square on screen however it's turned.
test('the knob turns a shape on screen in an 8×8 font: a 4 x 8 square turned a quarter stays 4 x 8', async () => {
  const { project, workspace } = await createTestApp();
  await project.setDrawingFont(font8);
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 30, rows: 30 });
  expect(project.pixelAspect).toBe(0.5);
  const unit = { x: 8, y: 4 }, ctx = { project, workspace, view: 'vector', unit };
  workspace.setActiveTool('vselect');
  const size = (key) => {
    const ps = worldPoints(project.shapes.get(key)), xs = ps.map((p) => p.x), ys = ps.map((p) => p.y);
    return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
  };
  const turn = (key, to) => {
    workspace.vectorSelected = [key];
    const knob = boxHandles(selectionBox(project.shapes, [key]), unit).knob;
    vselect.begin(ctx, knob, {});
    vselect.move(ctx, knob, to);
    vselect.end(ctx);
  };
  const key = project.addShape(rectShape(10, 10, 14, 18, { fill: '#ff0000', stroke: null, width: 1 }));
  turn(key, { x: 22, y: 14 }); // straight right of the middle (12, 14): a quarter turn
  const [w, h] = size(key);
  expect(w).toBeCloseTo(4, 3);
  expect(h).toBeCloseTo(8, 3);
  const { m } = project.shapes.get(key);
  expect(Math.atan2(m[1] * 0.5, m[0])).toBeCloseTo(Math.PI / 2, 5); // a quarter on screen

  // Shift squares it to 15° steps on screen: a drag a little past the quarter comes back to it.
  const other = project.addShape(rectShape(10, 10, 14, 18, { fill: '#00ff00', stroke: null, width: 1 }));
  workspace.isShiftPressed = true;
  turn(other, { x: 22, y: 15 });
  workspace.isShiftPressed = false;
  const [sw, sh] = size(other);
  expect(sw).toBeCloseTo(4, 3);
  expect(sh).toBeCloseTo(8, 3);
});

// The first shape of a drawing brings its vector layer. Taken back before it's a step (a lone Pen point removed), the
// layer goes with it: no undo step would hold it, and a later redo of a step from before it would drop it.
test('a first Pen point taken back takes the vector layer it brought, and VECTOR stays, ready for the next', async () => {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 20, rows: 20 });
  workspace.editorTab = 'vector';
  const stack = project.layers.map((layer) => layer.id), state = () => [workspace.editorTab, workspace.pickedLayer, workspace.lastCellsPick, project.editId, project.canUndo];
  const before = state();
  expect(project.hasVectorLayer).toBe(false);
  project.penPoint(5, 5, null);
  expect(project.hasVectorLayer).toBe(true); // the point's shape brought it
  project.penBack();
  expect(project.shapes.size).toBe(0);
  expect(project.layers.map((layer) => layer.id)).toEqual(stack);
  expect(state()).toEqual(before); // still VECTOR, the layer the next shape brings picked, Layer 1 the cells layer to go back to, nothing to undo

  const key = project.addShape(rectShape(2, 2, 8, 8, { fill: '#ff0000' })); // the next one brings it again, as a step
  expect(project.layers.map((layer) => layer.kind)).toContain('vector');
  expect(workspace.pickedLayer).toBe(project.shapes.get(key).layer ?? 'vector');
  project.undo();
  expect(project.layers.map((layer) => layer.id)).toEqual(stack);
});
