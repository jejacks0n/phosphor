import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/store/ProjectStore';
import { useDrawingStore } from '@/store/DrawingStore';
import { useLayerName } from '@/composables/useLayerName';
import { refusedHidden } from '@/store/project/shared.js';
import { sameChars } from '@/document/layerInfo.js';

// Merge down of a layer into the one under it (project.mergeDown), from the toolbar's buttons and LAYERS' ⋯ menu: why
// it's off, and doing it. A cells layer going into the bottom asks how first (exactly, or into the image): asking holds
// { id, rect } while EditToolbar's dialog is open.
export const asking = ref(null);

export function useMergeDown() {
  const project = useProjectStore(), drawing = useDrawingStore(), { t } = useI18n(), layerName = useLayerName();
  const below = (id) => project.layers[project.layers.findIndex((layer) => layer.id === id) - 1] ?? null;
  // Why Merge down of the layer with the id is off, or null. A hidden layer isn't a reason: the press says so (a toast).
  const offFor = (id) => {
    const layer = project.layerById(id), under = below(id);
    if (project.artInside) return t('art.wholeLayerOff');
    if (drawing.hostOnly) return drawing.hostOnly;
    if (!layer || !under) return t('toolbar.mergeBase');
    if (project.hasFrames) return t(layer.kind === 'vector' ? 'toolbar.mergeShapesOneFrame' : 'toolbar.mergeOneFrame');
    if (under.kind === 'vector') return t('toolbar.mergeOntoVector');
    if (under.id !== 'base' && project._sharing) return t('layers.notInRoom');
    if (layer.kind === 'vector' && under.id === 'base' && !sameChars(layer.chars, project.baseChars)) return t('toolbar.mergeOwnChars', { name: layerName(id) });
    return null;
  };
  // Whether the layer with the id has anything on it to merge.
  const hasAny = (id) => (project.layerById(id)?.kind === 'vector'
    ? [...project.shapes.values()].some((shape) => (shape.layer ?? 'vector') === id && !shape.guide)
    : project.cellsOf(id).size > 0 || !!project.paintOf(id)?.hasPaint);
  function mergeDown(id, rect = null) {
    if (below(id)?.id !== 'base' || project.layerById(id)?.kind !== 'cells') return project.mergeDown(id, rect);
    if (refusedHidden(project, [id, 'base'])) return false; // what both merges refuse: at the press, not after the question
    asking.value = { id, rect };
    return false;
  }
  return { below, offFor, hasAny, mergeDown };
}
