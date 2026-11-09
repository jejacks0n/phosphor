import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/store/ProjectStore';

// A layer's name as shown: the one it was given, else the default in the language in use, by kind and number ("Layer 2",
// "Vector 1"; the bottom is "Base"). The layers list and the status bar both say it.
export function useLayerName() {
  const project = useProjectStore(), { t } = useI18n();
  return (id) => {
    const layer = project.layerById(id);
    if (layer?.name) return layer.name;
    if (id === 'base') return t('layers.base');
    return t(layer?.kind === 'vector' || (!layer && id === 'vector') ? 'layers.vectorDefault' : 'layers.editDefault', { n: layer?.n ?? 1 });
  };
}
