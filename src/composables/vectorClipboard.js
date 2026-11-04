// VECTOR's copy, cut and paste (Cmd/Ctrl+C, X, V there, and the options row's buttons): the selected shapes,
// bottom to top, on this tab's own clipboard (workspace.vectorClipboard). A paste puts copies on top, selected, as
// one step: after a copy 2 grid pixels right and down from the last ones, so they're seen to land; after a cut
// where the shapes were.
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
  workspace.vectorClipboard = moved(shapes.map(([, shape]) => shape), -OFFSET); // the paste puts them back in place
  project.deleteShapes(shapes.map(([key]) => key));
  workspace.vectorSelected = [];
  return true;
}

export function pasteShapes(project, workspace) {
  if (!workspace.vectorClipboard) return false;
  const copies = moved(workspace.vectorClipboard, OFFSET);
  if (project.addShapes(copies)?.length) workspace.vectorClipboard = copies; // the next paste lands past these
  return true;
}
