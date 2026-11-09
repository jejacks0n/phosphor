import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/store/ProjectStore';

const DEFAULT_NAMES = { edit: 'layers.editDefault', vector: 'layers.vectorDefault', base: 'layers.base' };

// A layer's name as shown: the one it was given, else the default in the language in use. The layers list and the
// status bar both say it.
export function useLayerName() {
  const project = useProjectStore(), { t } = useI18n();
  return (id) => project.layerInfo[id]?.name ?? t(DEFAULT_NAMES[id]);
}
