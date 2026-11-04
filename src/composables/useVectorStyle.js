// VECTOR's Fill, Stroke, Width, and the Stroke panel's cap, join and miter limit: the color pair's two chips there, and the options row's Width. They're the
// selected shapes' (the first one's shown; with the Pen or the Shape tool, a change is the next shape's too, so it
// matches the one just drawn) unless the Pen is drawing one, or nothing's selected: then they're what the next
// shape gets (workspace.vectorStyle, where 'fg' is the foreground color when it's made). A change to the selection is one undo step; one opened by a drag (a slider, the native picker)
// closes with finish().
import { computed } from 'vue';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { STROKE_DEFAULTS, fillAs, isGradient, strokeOf, withShape } from '@/document/shapes.js';

export function useVectorStyle() {
  const project = useProjectStore();
  const workspace = useWorkspaceStore();

  const selected = computed(() => workspace.vectorSelected.filter((key) => project.shapes.has(key)));
  const editing = computed(() => selected.value.length > 0 && !workspace.vectorPen);
  const drawing = () => ['pen', 'vshape'].includes(workspace.activeTool);
  const first = computed(() => editing.value && project.shapes.get(selected.value[0]));

  const value = (slot) => {
    if (first.value) return slot in STROKE_DEFAULTS ? strokeOf(first.value)[slot] : first.value[slot];
    const v = workspace.vectorStyle[slot];
    return v === 'fg' ? (workspace.editFgNone ? null : workspace.editFgColor) : v;
  };

  const finish = () => {
    if (editing.value && project._stroke && !project._stroke.typing) project.commitEdit();
  };
  // remember: false while a drag goes on (the edit stays open until it ends).
  const set = (slot, v, { remember = true } = {}) => {
    if (!editing.value || drawing()) workspace.vectorStyle = { ...workspace.vectorStyle, [slot]: v };
    if (!editing.value) return;
    if (!remember) project.beginEdit();
    project.updateShapes(selected.value.map((key) => [key, withShape(project.shapes.get(key), { [slot]: v })]));
    if (remember) finish();
  };
  // The selected shapes' fill or stroke (slot) made Solid, Linear or Radial (fillAs: a color goes from itself to the
  // background color); one step. A gradient made is the one whose handles the Node tool shows then. With nothing selected the
  // next shape's stays solid: a gradient needs a box to sit in.
  const kindOf = (slot) => (first.value && isGradient(first.value[slot]) ? first.value[slot].type : 'solid');
  const setKind = (slot, kind) => {
    if (!editing.value) return;
    const colors = { from: workspace.editFgColor, to: workspace.editBgColor };
    project.updateShapes(selected.value.map((key) => {
      const shape = project.shapes.get(key);
      return [key, withShape(shape, { [slot]: fillAs(shape, kind, colors, slot) })];
    }));
    if (kind !== 'solid') workspace.vectorGradientSlot = slot;
  };
  // Each shape's Fill and Stroke trade places, gradients and all (Shift+Cmd/Ctrl+X, as the pair's colors do
  // elsewhere).
  const swap = () => {
    if (!editing.value || drawing()) {
      const { fill, stroke } = workspace.vectorStyle;
      workspace.vectorStyle = { ...workspace.vectorStyle, fill: stroke, stroke: fill };
    }
    if (!editing.value) return;
    project.updateShapes(selected.value.map((key) => {
      const shape = project.shapes.get(key);
      return [key, withShape(shape, { fill: shape.stroke, stroke: shape.fill })];
    }));
  };

  return { selected, editing, first, value, set, finish, swap, kindOf, setKind };
}
