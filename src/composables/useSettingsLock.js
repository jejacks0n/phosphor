import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/store/ProjectStore';
import { useDrawingStore } from '@/store/DrawingStore';

// Why the drawing's settings are off, if they are, else null: only the host's in a room; and inside an art layer the
// dimmed rest is a snapshot of how they had the picture, which a change would leave stale.
export function useSettingsLock() {
  const project = useProjectStore(), drawing = useDrawingStore(), { t } = useI18n();
  return computed(() => drawing.hostOnly || (project.artInside ? t('art.settingsOff') : null));
}
