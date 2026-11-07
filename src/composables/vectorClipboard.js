// VECTOR's copy, cut and paste (Cmd/Ctrl+C, X, V there, and the options row's buttons): the selected shapes,
// bottom to top, on this tab's own clipboard (workspace.vectorClipboard), and on the system clipboard's HTML for
// another Phosphor tab (clipboardBlocks.js), with an id so this tab knows its own. Cmd/Ctrl+V pastes what the
// system clipboard holds from another tab, else this tab's (useKeyboardShortcuts). A paste puts copies on top, selected, as
// one step, where they were copied from (on another frame, after a cut); where the frame has copies of them there
// already, 2 grid pixels right and down from those, so they're seen to land, and each paste again past the last.
import { stacked, transformed, translation } from '@/document/shapes.js';
import { VERSION, clipboardHtml } from '@/lib/clipboardBlocks.js';
import { copyEvent } from '@/composables/clipboard.js';

const OFFSET = 2; // grid pixels

const chosen = (project, workspace) => stacked(project.shapes).filter(([key]) => workspace.vectorSelected.includes(key));
const moved = (shapes, by) => shapes.map((shape) => transformed(shape, translation(by, by)));

function keep(workspace, shapes) {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  workspace.vectorClipboard = shapes;
  workspace.vectorClipboardId = id;
  copyEvent(null, clipboardHtml({ phosphorShapes: { version: VERSION, id, shapes } }));
}

// Each returns whether it did anything.
export function copyShapes(project, workspace) {
  const shapes = chosen(project, workspace).map(([, shape]) => shape);
  if (shapes.length) keep(workspace, shapes);
  return shapes.length > 0;
}

export function cutShapes(project, workspace) {
  const shapes = chosen(project, workspace);
  if (!shapes.length) return false;
  keep(workspace, shapes.map(([, shape]) => shape));
  project.deleteShapes(shapes.map(([key]) => key));
  workspace.vectorSelected = [];
  return true;
}

// copied: another tab's shapes, else this tab's.
export function pasteShapes(project, workspace, copied = workspace.vectorClipboard) {
  if (!copied) return false;
  const spot = (shape) => JSON.stringify([shape.points, shape.more, shape.m, shape.art]), carried = project.inheritedShapes();
  const here = new Set([...project.shapes].filter(([key]) => !carried.has(key)).map(([, shape]) => spot(shape)));
  let copies = copied;
  for (let k = 1; k <= 100 && copies.some((shape) => here.has(spot(shape))); k++) copies = moved(copied, k * OFFSET);
  project.addShapes(copies);
  return true;
}
