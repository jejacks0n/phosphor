<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import ToggleGroup from '@/components/ToggleGroup.vue';
import { useDrawingStore } from '@/store/DrawingStore';
import { useProjectStore } from '@/store/ProjectStore';

// Which layers a tool acts on: connected [Base] [Edit] buttons, either or both lit, never neither. For an
// artist, or inside an art layer, it's the edit layer, whatever was picked (layersFor), and Base is off. v-model is { base, edit }.
const layers = defineModel({ type: Object, required: true });
const props = defineProps({ label: { type: String, default: '' } }); // for screen readers; the toolbar shows its own
const { t } = useI18n();
const drawing = useDrawingStore();
const project = useProjectStore();

const layerOptions = computed(() => [
  { key: 'base', label: t('layers.base'), title: t('layers.baseTitle') },
  { key: 'edit', label: t('layers.edit'), title: t('layers.editTitle') },
]);
const baseOff = computed(() => drawing.hostOnly || (project.artInside ? t('art.baseOff') : null));
const options = computed(() => (baseOff.value ? [{ ...layerOptions.value[0], title: baseOff.value, disabled: true }, layerOptions.value[1]] : layerOptions.value));
const shown = computed({
  get: () => (baseOff.value ? { base: false, edit: true } : layers.value),
  set: (next) => { layers.value = next; },
});
</script>

<template>
  <ToggleGroup v-model="shown" :options="options" :label="props.label || t('layers.label')"/>
</template>
