// VECTOR's Fill, Stroke and Width: the color pair's two chips there, and the options row's Width. They're the
// selected shapes' (the first one's shown) unless the Pen or the Shape tool is drawing the next one, or nothing's
// selected: then they're what the next shape gets (workspace.vectorStyle, where 'fg' is the foreground color when
// it's made). A change to the selection is one undo step; one opened by a drag (a slider, the native picker)
// closes with finish().
import { computed } from 'vue';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { withShape } from '@/document/shapes.js';

export function useVectorStyle() {
  const project = useProjectStore();
  const workspace = useWorkspaceStore();

  const selected = computed(() => workspace.vectorSelected.filter((key) => project.shapes.has(key)));
  const editing = computed(() => selected.value.length > 0 && !['pen', 'vshape'].includes(workspace.activeTool));
  const first = computed(() => editing.value && project.shapes.get(selected.value[0]));

  const value = (slot) => {
    if (first.value) return first.value[slot];
    const v = workspace.vectorStyle[slot];
    return v === 'fg' ? (workspace.editFgNone ? null : workspace.editFgColor) : v;
  };

  const finish = () => {
    if (editing.value && project._stroke && !project._stroke.typing) project.commitEdit();
  };
  // remember: false while a drag goes on (the edit stays open until it ends).
  const set = (slot, v, { remember = true } = {}) => {
    if (!editing.value) return (workspace.vectorStyle = { ...workspace.vectorStyle, [slot]: v });
    if (!remember) project.beginEdit();
    project.updateShapes(selected.value.map((key) => [key, withShape(project.shapes.get(key), { [slot]: v })]));
    if (remember) finish();
  };
  // Each shape's Fill and Stroke trade places (Shift+Cmd/Ctrl+X, as the pair's colors do elsewhere).
  const swap = () => {
    if (!editing.value) {
      const { fill, stroke } = workspace.vectorStyle;
      return (workspace.vectorStyle = { ...workspace.vectorStyle, fill: stroke, stroke: fill });
    }
    project.updateShapes(selected.value.map((key) => {
      const shape = project.shapes.get(key);
      return [key, withShape(shape, { fill: shape.stroke, stroke: shape.fill })];
    }));
  };

  return { selected, editing, first, value, set, finish, swap };
}
