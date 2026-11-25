// VECTOR's copy, cut and paste (Cmd/Ctrl+C, X, V there, and the options row's buttons): the selected shapes, bottom to
// top, with their keys, on this tab's own clipboard (workspace.vectorClipboard and vectorClipboardKeys), and on the
// system clipboard's HTML for another Phosphor tab (clipboardBlocks.js), with an id so this tab knows its own.
// Cmd/Ctrl+V pastes what the system clipboard holds from another tab, else this tab's (useKeyboardShortcuts). A paste
// puts copies on top, selected, as one step, where they were copied from (on another frame, after a cut); where the
// frame has copies of them there already, 2 grid pixels right and down from those, so they're seen to land, and each
// paste again past the last. A follower pasted with its path follows the pasted path; pasted alone, the path it was
// copied from, if it can follow that here (addShapes). Pasted on PIXEL or ANSI, where a cells layer is picked, they get
// a vector layer of their own directly above it, picked, so VECTOR shows them selected (pasteShapes' above).
import { stacked, transformed, translation } from '@/document/shapes.js';
import { VERSION, clipboardHtml } from '@/lib/clipboardBlocks.js';
import { copyEvent } from '@/composables/clipboard.js';

const OFFSET = 2; // grid pixels

const chosen = (project, workspace) => stacked(project.shapes, project.shapeRank).filter(([key]) => workspace.vectorSelected.includes(key));
const moved = (shapes, by) => shapes.map((shape) => transformed(shape, translation(by, by)));

// copied: [key, shape], bottom to top.
function keep(workspace, copied) {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`, shapes = copied.map(([, shape]) => shape), keys = copied.map(([key]) => key);
  workspace.vectorClipboard = shapes;
  workspace.vectorClipboardKeys = keys;
  workspace.vectorClipboardId = id;
  copyEvent(null, clipboardHtml({ phosphorShapes: { version: VERSION, id, shapes, keys } }));
}

// Each returns whether it did anything.
export function copyShapes(project, workspace) {
  const shapes = chosen(project, workspace);
  if (shapes.length) keep(workspace, shapes);
  return shapes.length > 0;
}

export function cutShapes(project, workspace) {
  const shapes = chosen(project, workspace);
  if (!shapes.length) return false;
  keep(workspace, shapes);
  const before = project.shapes;
  project.deleteShapes(shapes.map(([key]) => key));
  if (project.shapes !== before) workspace.vectorSelected = []; // or refused (a layer someone's drawing in): still selected
  return true;
}

// copied: another tab's shapes, else this tab's; keys, the keys they were copied from. above: the id of the cells layer
// they're pasted over, for a vector layer of their own above it (one step with them), which is then picked; in a room,
// which keeps its layers, they go on the vector layer VECTOR picks, as a paste there does. Whether any came in.
export function pasteShapes(project, workspace, copied = workspace.vectorClipboard, keys = copied === workspace.vectorClipboard ? workspace.vectorClipboardKeys : null, above = null) {
  if (!copied) return false;
  if (above && project._sharing) {
    workspace.editorTab = 'vector';
    above = null;
  }
  const spot = (shape) => JSON.stringify([shape.points, shape.more, shape.m, shape.art]), carried = project.inheritedShapes();
  const here = new Set([...project.shapes].filter(([key]) => !carried.has(key)).map(([, shape]) => spot(shape)));
  let copies = copied;
  for (let k = 1; k <= 100 && copies.some((shape) => here.has(spot(shape))); k++) copies = moved(copied, k * OFFSET);
  if (!above) return project.addShapes(copies, keys), true;
  const [made] = project.addShapesAbove(copies, keys, above) ?? []; // (refused while the drawing is held: nothing)
  if (made) workspace.pickLayer(project.shapes.get(made).layer ?? 'vector');
  return !!made;
}

// Duplicate (the command list's): the selected shapes pasted again as copies, as a paste does, without going on the
// clipboard.
export function duplicateShapes(project, workspace) {
  const shapes = chosen(project, workspace);
  return shapes.length > 0 && pasteShapes(project, workspace, shapes.map(([, shape]) => shape), shapes.map(([key]) => key));
}
