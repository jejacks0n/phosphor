import { ref } from 'vue';
import { useProjectStore } from '@/store/ProjectStore';
import { useDrawingStore } from '@/store/DrawingStore';
import { layerName, refusedHidden } from '@/store/project/shared.js';
import { sameChars } from '@/document/layerInfo.js';
import { busyWhile } from '@/composables/useBusy';
import { reasonWords } from '@/lib/offReasons';
import { t } from '@/i18n';

// Merge down of a layer into the one under it (project.mergeDown), from the toolbar's buttons, LAYERS' ⋯ menu and the
// command list: why it's off, and doing it, under the busy note (seconds on a large drawing). A cells layer going into
// the bottom asks how first (exactly, or into the image), and so does a whole vector layer with shapes that can merge
// (not in a room, where it's pressed): asking holds { id, rect } while EditToolbar's dialog is open.
// Plain store reads, so a command runs it too.
export const asking = ref(null);

export const mergeBusy = (t, work) => busyWhile(t('busy.merging'), work);

export function useMergeDown() {
  const project = useProjectStore(), drawing = useDrawingStore();
  const below = (id) => project.layers[project.layers.findIndex((layer) => layer.id === id) - 1] ?? null;
  const nameOf = (id) => ({ name: layerName(project.layerById(id)) });
  // Why Merge down of the layer with the id is off (offReasons.js's form), or null. A hidden layer isn't a reason: the
  // press says so (a toast).
  const offWhy = (id) => {
    const layer = project.layerById(id), under = below(id);
    if (project.artInside) return 'art.wholeLayerOff';
    if (drawing.mayDraw) return 'social.drawing.onlyHost';
    if (!layer || !under) return 'toolbar.mergeBase';
    if (project.hasFrames) return layer.kind === 'vector' ? 'toolbar.mergeShapesOneFrame' : 'toolbar.mergeOneFrame';
    if (under.kind === 'vector' && layer.kind !== 'vector') return 'toolbar.mergeOntoVector';
    if (under.kind === 'vector' && !sameChars(project.charsOf(id), project.charsOf(under.id))) return ['toolbar.mergeOwnChars', nameOf(id)];
    return null;
  };
  const offFor = (id) => reasonWords(offWhy(id));
  // Whether the layer with the id has anything on it to merge.
  const hasAny = (id) => (project.layerById(id)?.kind === 'vector'
    ? [...project.shapes.values()].some((shape) => (shape.layer ?? 'vector') === id && !shape.guide)
    : project.cellsOf(id).size > 0 || !!project.paintOf(id)?.hasPaint);
  function mergeDown(id, rect = null) {
    const kind = project.layerById(id)?.kind, shapes = kind === 'vector' && !rect && !project._sharing && hasAny(id) && offWhy(id) === null;
    if (below(id)?.id !== 'base' || (kind !== 'cells' && !shapes)) return mergeBusy(t, () => project.mergeDown(id, rect));
    if (refusedHidden(project, [id, 'base'])) return false; // what both merges refuse: at the press, not after the question
    asking.value = { id, rect };
    return false;
  }
  // The toolbar's Merge down: the picked layer, or on VECTOR with shapes selected, those (onto a vector layer, moved
  // there), without asking how.
  function mergePicked(workspace) {
    const selected = workspace.editorTab === 'vector' ? workspace.vectorSelected.filter((key) => project.shapes.has(key)) : [];
    if (!selected.length) return mergeDown(workspace.pickedLayer);
    if (project.mergeShapes(selected)) workspace.vectorSelected = []; // or refused: still selected
  }
  return { below, offWhy, offFor, hasAny, mergeDown, mergePicked };
}
