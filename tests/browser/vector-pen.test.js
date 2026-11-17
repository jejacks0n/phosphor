// The Pen (penPoint, finishPen): a shape a point at a time, in one edit that converts live, closed on its first
// point or left an open curve. Whatever else commits ends it as an open curve, and one with under two points
// leaves nothing, not even an undo step. Undo while it's drawn takes back its last point.
import { test, expect } from 'vitest';
import { createTestApp, loadImage, settle, cellsKey } from '../support/app.js';
import pen from '@/tools/pen.js';
import { boxHandles, selectionBox } from '@/tools/vselect.js';

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
