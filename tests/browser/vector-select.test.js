// Selecting on VECTOR: each change of which shapes are selected (a click, Shift-click, Esc, a box dragged over
// empty canvas) is an undo step of its own, and undoing an edit brings back the selection it started with.
import { test, expect } from 'vitest';
import { createTestApp, loadImage } from '../support/app.js';
import { makeShape, rectShape } from '@/document/shapes.js';
import vselect from '@/tools/vselect.js';

async function drawing() {
  const app = await createTestApp();
  await loadImage(app.project, '/tests/fixtures/images/gradient.png', { cols: 40, rows: 40 });
  const { project, workspace } = app;
  const keys = [rectShape(2, 2, 10, 10), rectShape(14, 2, 22, 10), rectShape(2, 30, 10, 38)].map((r) => project.addShape({ ...r, fill: '#ff0000' }));
  project.clearHistory();
  workspace.setActiveTool('vselect');
  return { ...app, keys, ctx: { project, workspace, view: 'vector', unit: { x: 8, y: 8 } } };
}

// A press, a drag through the points given, and a let-go.
function press(ctx, from, through = [], event = {}) {
  vselect.begin(ctx, from, event);
  let at = from;
  for (const to of through) {
    vselect.move(ctx, at, to);
    at = to;
  }
  vselect.end(ctx);
}

test('a click, a Shift-click and Esc each change the selection as an undo step; a click changing nothing is none', async () => {
  const { project, workspace, keys: [a, b], ctx } = await drawing();
  vselect.keydown(ctx, new KeyboardEvent('keydown', { key: 'Escape' })); // nothing selected: nothing changes
  expect(project.canUndo).toBe(false);
  press(ctx, { x: 6, y: 6 });
  expect(workspace.vectorSelected).toEqual([a]);
  press(ctx, { x: 18, y: 6 }, [], { shiftKey: true });
  expect(workspace.vectorSelected).toEqual([a, b]);
  vselect.keydown(ctx, new KeyboardEvent('keydown', { key: 'Escape' }));
  expect(workspace.vectorSelected).toEqual([]);
  project.undo();
  expect(workspace.vectorSelected).toEqual([a, b]);
  project.undo();
  expect(workspace.vectorSelected).toEqual([a]);
  project.undo();
  expect(workspace.vectorSelected).toEqual([]);
  expect(project.canUndo).toBe(false);
  project.redo();
  project.redo();
  expect(workspace.vectorSelected).toEqual([a, b]);
});

test('undoing a delete brings its shapes back selected', async () => {
  const { project, workspace, keys: [a, b], ctx } = await drawing();
  press(ctx, { x: 6, y: 6 });
  press(ctx, { x: 18, y: 6 }, [], { shiftKey: true });
  vselect.keydown(ctx, new KeyboardEvent('keydown', { key: 'Delete' }));
  expect(project.shapes.size).toBe(1);
  expect(workspace.vectorSelected).toEqual([]);
  project.undo();
  expect(project.shapes.size).toBe(3);
  expect(workspace.vectorSelected).toEqual([a, b]);
});

test('a box dragged over empty canvas selects every shape it touches, as one step; Shift adds; a click there deselects', async () => {
  const { project, workspace, keys: [a, b, c], ctx } = await drawing();
  const version = project.history.version;
  vselect.begin(ctx, { x: 0, y: 12 }, {});
  vselect.move(ctx, { x: 0, y: 12 }, { x: 16, y: 8 }); // up over a's corner and the edge of b
  expect(workspace.vectorMarquee).toEqual({ x0: 0, y0: 8, x1: 16, y1: 12 });
  vselect.end(ctx);
  expect(workspace.vectorMarquee).toBe(null);
  expect(workspace.vectorSelected).toEqual([a, b]);
  expect(project.history.version).toBe(version + 1);
  press(ctx, { x: 0, y: 39 }, [{ x: 4, y: 36 }], { shiftKey: true });
  expect(workspace.vectorSelected).toEqual([a, b, c]);
  press(ctx, { x: 30, y: 30 }, [{ x: 38, y: 38 }]); // touching nothing: nothing
  expect(workspace.vectorSelected).toEqual([]);
  press(ctx, { x: 6, y: 6 });
  press(ctx, { x: 30, y: 20 }); // a click on empty canvas
  expect(workspace.vectorSelected).toEqual([]);
  project.undo();
  expect(workspace.vectorSelected).toEqual([a]);
  expect(project.shapes.size).toBe(3); // selecting never changed a shape
});

// A straight 20-long line across the picture with a Blank frame after it, showing: End keyed on that frame.
async function trimmedLine(parts = ['end']) {
  const { project, workspace, ctx } = await drawing();
  project.setAnimate(true);
  const key = project.addShape(makeShape({ points: [[10, 20, 0, 0, 0, 0, 0], [30, 20, 0, 0, 0, 0, 0]], closed: false, stroke: '#ff0000', width: 2 }));
  project.addFrame('blank');
  for (const part of parts) project.addKey(key, part);
  workspace.vectorSelected = [key];
  project.clearHistory();
  return { project, workspace, ctx, key };
}

test('dragging the End handle along a line sets End to the share under the pointer on the frame showing, as one undo step', async () => {
  const { project, workspace, ctx, key } = await trimmedLine();
  const version = project.history.version;
  vselect.begin(ctx, { x: 30, y: 20 }, {});
  vselect.move(ctx, { x: 30, y: 20 }, { x: 25, y: 20 });
  vselect.move(ctx, { x: 25, y: 20 }, { x: 20, y: 20.5 });
  expect(workspace.vectorTrim.part).toBe('end');
  expect(workspace.vectorTrim.share).toBeCloseTo(0.5, 2);
  vselect.end(ctx);
  expect(workspace.vectorTrim).toBe(null);
  expect(project.shapes.get(key).end).toBeCloseTo(0.5, 2);
  expect(project.frame).toBe(1);
  expect(project.frames[1].parts.get(key).has('end')).toBe(true);
  expect(project.history.version).toBe(version + 1);
  project.undo();
  expect(project.shapes.get(key).end).toBeUndefined();
  expect(project.canUndo).toBe(false);
});

test('a trim handle is held to the outline: past its far end it stops at 100%', async () => {
  const { project, ctx, key } = await trimmedLine(['start']);
  press(ctx, { x: 10, y: 20 }, [{ x: 40, y: 20 }]);
  expect(project.shapes.get(key).start).toBe(1);
});

test('with no row for End, its corner is the box\'s handle and scales the line', async () => {
  const { project, ctx, key } = await trimmedLine(['start']);
  press(ctx, { x: 30, y: 20 }, [{ x: 20, y: 20 }]);
  expect(project.shapes.get(key).end).toBeUndefined();
  expect(project.shapes.get(key).m).not.toEqual([1, 0, 0, 1, 0, 0]);
});
