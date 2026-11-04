// VECTOR's copy, cut and paste (Cmd/Ctrl+C, X, V there, and the options row's buttons): the selected shapes,
// bottom to top, on this tab's own clipboard (workspace.vectorClipboard). A paste puts copies on top, selected, as
// one step, where they were copied from (on another frame, after a cut); where the frame has copies of them there
// already, 2 grid pixels right and down from those, so they're seen to land, and each paste again past the last.
import { stacked, transformed, translation } from '@/document/shapes.js';

const OFFSET = 2; // grid pixels

const chosen = (project, workspace) => stacked(project.shapes).filter(([key]) => workspace.vectorSelected.includes(key));
const moved = (shapes, by) => shapes.map((shape) => transformed(shape, translation(by, by)));

// Each returns whether it did anything.
export function copyShapes(project, workspace) {
  const shapes = chosen(project, workspace).map(([, shape]) => shape);
  if (shapes.length) workspace.vectorClipboard = shapes;
  return shapes.length > 0;
}

export function cutShapes(project, workspace) {
  const shapes = chosen(project, workspace);
  if (!shapes.length) return false;
  workspace.vectorClipboard = shapes.map(([, shape]) => shape);
  project.deleteShapes(shapes.map(([key]) => key));
  workspace.vectorSelected = [];
  return true;
}

export function pasteShapes(project, workspace) {
  const copied = workspace.vectorClipboard;
  if (!copied) return false;
  const spot = (shape) => JSON.stringify([shape.points, shape.more, shape.m]), carried = project.inheritedShapes();
  const here = new Set([...project.shapes].filter(([key]) => !carried.has(key)).map(([, shape]) => spot(shape)));
  let copies = copied;
  for (let k = 1; k <= 100 && copies.some((shape) => here.has(spot(shape))); k++) copies = moved(copied, k * OFFSET);
  project.addShapes(copies);
  return true;
}
