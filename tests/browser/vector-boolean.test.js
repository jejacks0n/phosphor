// VECTOR's Add and Subtract: the selected shapes made one (their union), or the ones above cut out of the bottom
// one; the result is the bottom one (its key, style, place in the stacking order and transform), curves kept, one
// undo step. Edges shared exactly (Snap to's) leave no seam and no extra points.
import { test, expect, beforeAll } from 'vitest';
import { createTestApp } from '../support/app.js';
import { ellipseShape, outlines, withShape, rectShape, rotation, transformed, translation, worldPoints } from '@/document/shapes';
import { shapeAt } from '@/lib/shapeHits.js';
import { loadBooleans } from '@/lib/shapeBooleans.js';

const RED = { fill: '#ff0000' }, BLUE = { fill: '#0000ff', stroke: '#ffffff', width: 2 };

beforeAll(() => loadBooleans());

async function app() {
  const made = await createTestApp();
  await made.project.setBlankCanvas({ cols: 60, rows: 30 });
  return made;
}
const box = (shape) => {
  const ps = worldPoints(shape), r = (v) => Math.round(v * 100) / 100;
  return [r(Math.min(...ps.map((p) => p.x))), r(Math.min(...ps.map((p) => p.y))), r(Math.max(...ps.map((p) => p.x))), r(Math.max(...ps.map((p) => p.y)))];
};
const hasCurves = (shape) => outlines(shape).some((o) => o.points.some((p) => p[2] || p[3] || p[4] || p[5]));

test('Add makes the shapes one, an L from two rectangles, in the bottom one\'s key and style; one undo step', async () => {
  const { project } = await app();
  const bottom = project.addShape(rectShape(10, 10, 20, 20, RED)), top = project.addShape(rectShape(15, 15, 25, 25, BLUE));
  const before = new Map(project.shapes);
  expect(project.combineShapes([top, bottom], 'add')).toBe(bottom);
  expect([...project.shapes.keys()]).toEqual([bottom]);
  const shape = project.shapes.get(bottom);
  expect(outlines(shape)).toHaveLength(1);
  expect(shape.points).toHaveLength(8);
  expect(box(shape)).toEqual([10, 10, 25, 25]);
  expect(shape.fill).toBe('#ff0000');
  expect(shape.stroke).toBe(null);
  expect(shape.z).toBe(before.get(bottom).z);
  project.undo();
  expect(project.shapes).toEqual(before);
});

test('Subtract cuts the shapes above out of the bottom one: one inside it leaves a hole', async () => {
  const { project } = await app();
  const outer = project.addShape(rectShape(10, 10, 40, 30, RED)), inner = project.addShape(rectShape(20, 16, 30, 24, BLUE));
  expect(project.combineShapes([outer, inner], 'subtract')).toBe(outer);
  expect([...project.shapes.keys()]).toEqual([outer]);
  const shape = project.shapes.get(outer);
  expect(outlines(shape)).toHaveLength(2);
  expect(shapeAt(project.shapes, 25, 20, 0)).toBe(null); // the hole
  expect(shapeAt(project.shapes, 12, 20, 0)).toBe(outer);
});

test('edges shared exactly leave one outline with only its corners', async () => {
  const { project } = await app();
  const a = project.addShape(rectShape(10, 10, 20, 20, RED)), b = project.addShape(rectShape(20, 10, 30, 20, RED));
  project.combineShapes([a, b], 'add');
  const shape = project.shapes.get(a);
  expect(outlines(shape)).toHaveLength(1);
  expect(shape.points).toHaveLength(4);
  expect(box(shape)).toEqual([10, 10, 30, 20]);
  // Overlapping along the same top and bottom: no points left where the other's corners were.
  const d = project.addShape(rectShape(5, 10, 15, 20, RED)), e = project.addShape(rectShape(25, 10, 35, 20, RED));
  project.combineShapes([a, d, e], 'add');
  expect(project.shapes.get(a).points).toHaveLength(4);
  expect(box(project.shapes.get(a))).toEqual([5, 10, 35, 20]);
  // Subtracting the half that shares an edge leaves the other, its four corners.
  const c = project.addShape(rectShape(20, 10, 35, 20, RED));
  project.combineShapes([a, c], 'subtract');
  expect(project.shapes.get(a).points).toHaveLength(4);
  expect(box(project.shapes.get(a))).toEqual([5, 10, 20, 20]);
});

test('curves stay curves, and the bottom shape\'s transform stays its own', async () => {
  const { project } = await app();
  const turned = transformed(ellipseShape(10, 10, 30, 30, RED), rotation(0.3, 20, 20));
  const disc = project.addShape(transformed(turned, translation(2, 0)));
  const m = project.shapes.get(disc).m;
  project.addShape(rectShape(22, 0, 40, 40, BLUE));
  project.combineShapes([...project.shapes.keys()], 'subtract');
  const shape = project.shapes.get(disc);
  expect(shape.m).toEqual(m);
  expect(hasCurves(shape)).toBe(true);
  expect(shape.points.some((p) => p[6])).toBe(true); // the ellipse's points still smooth
  const [x0, , x1] = box(shape);
  expect(x0).toBeCloseTo(12, 0);
  expect(x1).toBeCloseTo(22, 1);
});

test('Subtract that leaves nothing deletes the bottom shape too; an open path or one shape does nothing', async () => {
  const { project } = await app();
  const small = project.addShape(rectShape(10, 10, 12, 12, RED)), big = project.addShape(rectShape(0, 0, 30, 30, BLUE));
  expect(project.combineShapes([small, big], 'subtract')).toBe(null);
  expect(project.shapes.size).toBe(0);
  project.undo();
  expect(project.shapes.size).toBe(2);

  const version = project.history.version;
  expect(project.combineShapes([small], 'add')).toBe(null);
  const open = project.addShape(withShape(rectShape(5, 5, 8, 8, { stroke: '#ffffff', width: 1 }), { closed: false }));
  const shapes = new Map(project.shapes), at = project.history.version;
  expect(project.combineShapes([small, open], 'add')).toBe(null);
  expect(project.shapes).toEqual(shapes);
  expect(project.history.version).toBe(at);
  expect(at).toBeGreaterThan(version);
});
