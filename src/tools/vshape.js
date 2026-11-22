// The Shape tool (the VECTOR tab): drag from corner to corner for a rectangle, an ellipse or a polygon
// (Sides: 3 to 12), drawn live and made a path, one undo step. Shift makes it a square, a circle
// or a regular polygon; Snap to puts both corners on the grid. It gets the next shape's style (workspace.vectorStyle) and is selected when it's
// made; a click without a drag makes nothing. The selection's box shows here as with Vector select, and its handles
// work the same (vselect.pressHandles): the size handles, the turn knob, and the one selected shape's gradient ends and
// stops, ahead of drawing. A drag anywhere else, inside the box too, draws a new shape.
//
// A plugin's shapes join the row after Polygon (none in a room or with plugins off), each with its options after the row
// as Polygon's Sides is. A drag with one calls its outline once, at the drag's first move, with the options' values, and
// stretches the outlines it gives (in a 0-to-1 box) over the drag's box.
//
// A polygon or a plugin shape keeps what made it (shapes.js: made), so while it's selected its options show its values,
// and a change draws the selected ones of its kind again in their boxes (and is the next shape's too); a slider's drag
// or a color picked is one undo step. Its points edited by hand, it's a path, and its options are the tool's again. A
// plugin shape whose plugin isn't on offer is a path until it is. On a shape with keys, the change is the frame's.
import { t } from '@/i18n/index.js';
import { ellipseShape, makeShape, polygonShape, rectShape, styleColors, withShape } from '@/document/shapes.js';
import shapes from '@/tools/shapes.js';
import { snapMode, snapPoint } from '@/lib/vectorSnap.js';
import { stopKeys } from '@/tools/gradientHandles.js';
import vselect from '@/tools/vselect.js';
import { pluginShapeFor, scriptOptions } from '@/plugins/solvers.js';
import { readOutlines } from '@/plugins/script.js';
import { ManifestError } from '@/plugins/manifest.js';
import { optionValues } from '@/plugins/solvers.js';
import { refusalWords, usePluginStore } from '@/store/PluginStore';
import { useProjectStore } from '@/store/ProjectStore';
import { useRoomStore } from '@/store/RoomStore';
import { firstUnderMark, sayFailed, toolOption, valuesOf } from '@/tools/pluginTool.js';

// { from, key, kind, plugin (a plugin shape's pluginShapes entry, as the drag began), outlines (its, once its outline
// was called; null when that failed), values (the options' values it was called with) }
let drag = null;
let onHandle = false; // the press took one of the selection's handles: Vector select's drag carries it

const BUILT_IN = ['rect', 'ellipse', 'polygon'];

// The plugin shapes on offer: those of the plugins that are on, in the Plugins dialog's order and then each plugin's own;
// none in a room or with plugins off. [{ ref, pluginId, pluginName, hash, def }]
function pluginShapes() {
  const plugins = usePluginStore();
  if (useRoomStore().inRoom || plugins.off) return [];
  return plugins.plugins.filter(({ enabled }) => enabled).flatMap(({ id, manifest }) =>
    Object.entries(plugins.shapes).filter(([, { pluginId }]) => pluginId === id).sort(([, a], [, b]) => a.index - b.index)
      .map(([ref]) => ({ ref, pluginName: manifest.name, ...pluginShapeFor(ref) })).filter(({ def }) => def));
}

// The kind a drag draws: the one chosen when it's built in or a plugin shape on offer, else Rectangle (a plugin shape
// whose plugin was turned off or dropped, or in a room). The chosen one is kept, so it's back when its plugin is.
export function shapeKind(workspace) {
  const kind = workspace.vectorShapeKind;
  return BUILT_IN.includes(kind) || pluginShapes().some(({ ref }) => ref === kind) ? kind : 'rect';
}

// A plugin shape's outlines for its option values, or null when its outline threw or gave what isn't outlines (said, with
// a toast and in its plugin's row, unless quiet). The first call of a visit runs under the hang mark.
function plugged({ ref, pluginId, hash, def }, values, quiet = false) {
  try {
    return readOutlines(firstUnderMark('shape', ref, hash, pluginId, () => def.outline(scriptOptions(def, values))));
  } catch (error) {
    if (!quiet) sayFailed('plugins.shapeFailed', def.name, pluginId, error instanceof ManifestError ? refusalWords(error) : error);
    return null;
  }
}

// The selected shapes that a change to kind's options draws again: those it made, with what made them still theirs
// (none while the Pen draws). [[key, shape]]
function madeSelected(workspace, kind) {
  if (workspace.vectorPen) return [];
  const { shapes } = useProjectStore();
  return workspace.vectorSelected.map((key) => [key, shapes.get(key)]).filter(([, shape]) => shape?.made?.kind === kind);
}

// A shape kind made, drawn again in its box with values: its outlines replaced, the rest of it as it is; null when a
// plugin's outline failed.
function remade(shape, values, plugin, quiet) {
  const [x0, y0, x1, y1] = shape.made.box, made = { ...shape.made, values };
  if (!plugin) return withShape(shape, { points: polygonShape(x0, y0, x1, y1, values.sides, {}).points, made });
  const outlines = plugged(plugin, values, quiet);
  if (!outlines) return null;
  const { points, closed, more } = stretched(outlines, x0, y0, x1, y1, {});
  return withShape(shape, { points, closed, more: more ?? [], made });
}

// An option of kind's (Sides, or a plugin shape's) over the selected shapes it made: shown as the first one's value, and
// a change draws them again with it, as well as being the tool's own (get and set: the tool's). A slider's drag, or the
// picker's, holds one edit open until commit. A plugin outline that fails is said once an edit.
let failedInEdit = false;
function overSelected(kind, plugin, option, id, { get, set }) {
  const valuesOfShape = (shape) => (plugin ? optionValues(plugin.def, shape.made.values) : shape.made.values);
  const held = option.type === undefined || option.type === 'color'; // a slider (RangeField) or a color: a drag
  return {
    ...option,
    get: (workspace) => {
      const [first] = madeSelected(workspace, kind);
      return first ? valuesOfShape(first[1])[id] : get(workspace);
    },
    set: (workspace, value) => {
      set(workspace, value);
      const chosen = madeSelected(workspace, kind);
      if (!chosen.length) return;
      const project = useProjectStore();
      if (held) project.beginEdit();
      const changes = [];
      for (const [key, shape] of chosen) {
        const next = remade(shape, { ...valuesOfShape(shape), [id]: value }, plugin, failedInEdit);
        if (next) changes.push([key, next]);
        else failedInEdit = held;
      }
      project.updateShapes(changes);
    },
    commit: () => {
      failedInEdit = false;
      const project = useProjectStore();
      if (project._stroke && !project._stroke.typing) project.commitEdit();
    },
  };
}

// Outlines in a 0-to-1 box stretched over (x0, y0) to (x1, y1): the points placed in it, their handles scaled.
function stretched(outlines, x0, y0, x1, y1, style, made) {
  const w = x1 - x0, h = y1 - y0;
  const placed = ({ points }) => points.map(([px, py, ix, iy, ox, oy]) => [x0 + px * w, y0 + py * h, ix * w, iy * h, ox * w, oy * h]);
  const [first, ...rest] = outlines;
  return makeShape({ points: placed(first), closed: first.closed, more: rest.map((outline) => [outline.closed, placed(outline)]), ...style, made });
}

const builtInChoices = () => [
  { value: 'rect', label: t('tools.shapes.rectangle'), icon: '<svg viewBox="0 0 16 16"><path d="M1 3h14v10H1zM3 5v6h10V5z"/></svg>' },
  { value: 'ellipse', label: t('tools.shapes.ellipse'), icon: '<svg viewBox="0 0 16 16"><path d="M8 2.5a5.5 5.5 0 1 1 0 11a5.5 5.5 0 1 1 0-11zM8 4.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7z"/></svg>' },
  { value: 'polygon', label: t('tools.vshape.polygon'), icon: '<svg viewBox="0 0 16 16"><path d="M8 1l7 5-2.7 8.5H3.7L1 6zM8 3.5L3.3 6.8l1.8 5.7h5.8l1.8-5.7z"/></svg>' },
];

function shapeFor(workspace, { from, kind, outlines, values }, to, square) {
  let dx = to.x - from.x, dy = to.y - from.y;
  if (square) {
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    dx = Math.sign(dx || 1) * side;
    dy = Math.sign(dy || 1) * side;
  }
  const x0 = Math.min(from.x, from.x + dx), x1 = Math.max(from.x, from.x + dx);
  const y0 = Math.min(from.y, from.y + dy), y1 = Math.max(from.y, from.y + dy);
  const style = styleColors(workspace);
  if (!style.fill && !style.stroke) style.fill = workspace.editFgColor; // a shape that shows something
  if (outlines) return stretched(outlines, x0, y0, x1, y1, style, { kind, box: [x0, y0, x1, y1], values });
  if (kind === 'ellipse') return ellipseShape(x0, y0, x1, y1, style);
  if (kind === 'polygon') return polygonShape(x0, y0, x1, y1, workspace.vectorSides, style);
  return rectShape(x0, y0, x1, y1, style);
}

export default {
  id: 'vshape',
  get title() { return t('tools.vshape.title'); },
  keys: ['U'],
  icon: shapes.icon, // the Shapes tool's, as it's the same tool for shapes
  views: ['vector'],
  kind: 'paint',
  section: 'vector',
  // The row of shapes (the plugin shapes after Polygon), Polygon's Sides, and each plugin shape's options, each showing
  // while its own is the kind drawn.
  get options() {
    const plugged = pluginShapes();
    return [
      {
        key: 'vectorShapeKind', label: t('tools.shapes.shape'), type: 'segmented', get: shapeKind,
        choices: [...builtInChoices(), ...plugged.map(({ ref, pluginName, def }) => ({ value: ref, label: t('tools.pluginTitle', { name: def.name, plugin: pluginName }), icon: def.icon }))],
      },
      overSelected('polygon', null, {
        key: 'vectorSides', label: t('tools.vshape.sides'), title: t('tools.vshape.sidesTitle'), min: 3, max: 12, readout: true,
        when: (ws) => shapeKind(ws) === 'polygon' || madeSelected(ws, 'polygon').length > 0,
      }, 'sides', { get: (ws) => ws.vectorSides, set: (ws, value) => { ws.vectorSides = value; } }),
      ...plugged.flatMap((plugin) => plugin.def.options.map((declared) => {
        const option = toolOption('shape', plugin.ref, plugin.def, declared);
        const when = (ws) => shapeKind(ws) === plugin.ref || madeSelected(ws, plugin.ref).length > 0;
        return overSelected(plugin.ref, plugin, { ...option, when }, declared.id, option);
      })),
    ];
  },

  begin(ctx, pos) {
    const { project, workspace } = ctx;
    if (vselect.pressHandles(ctx, pos)) return (onHandle = true);
    const kind = shapeKind(workspace);
    drag = { from: snapPoint(pos, snapMode(workspace)), key: null, kind, plugin: pluginShapes().find(({ ref }) => ref === kind) ?? null };
    project.beginEdit();
    return true;
  },

  move(ctx, from, to) {
    if (onHandle) return vselect.move(ctx, from, to);
    const { project, workspace } = ctx;
    to = snapPoint(to, snapMode(workspace));
    if (!drag || (to.x === drag.from.x && to.y === drag.from.y)) return;
    if (drag.plugin && drag.outlines === undefined) {
      drag.values = valuesOf(workspace, 'shape', drag.plugin.ref, drag.plugin.def);
      drag.outlines = plugged(drag.plugin, drag.values);
    }
    if (drag.outlines === null) return; // its outline failed: this drag draws nothing
    const shape = shapeFor(workspace, drag, to, workspace.isShiftPressed);
    if (!drag.key) drag.key = project.addShape(shape);
    else {
      const { z, layer } = project.shapes.get(drag.key); // what addShape gave it: its place in the stack and its vector layer
      project.updateShapes([[drag.key, withShape(shape, { z, layer })]]);
    }
  },

  end(ctx) {
    if (onHandle) {
      onHandle = false;
      return vselect.end(ctx);
    }
    const { project, workspace } = ctx, key = drag?.key;
    drag = null;
    project.commitEdit();
    if (key && project.shapes.has(key)) workspace.vectorSelected = [key];
  },

  cancel(ctx) {
    drag = null; // the viewport took the edit back
    onHandle = false;
    vselect.cancel(ctx);
  },

  keydown({ project, workspace }, event) {
    return stopKeys(project, workspace, event);
  },
};
