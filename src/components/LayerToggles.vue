<script setup>
import { computed } from 'vue';
import ToggleGroup from '@/components/ToggleGroup.vue';
import { useDrawingStore } from '@/store/DrawingStore';

// Which layers a tool acts on: connected [Base] [Edit] buttons, either or both lit, never neither. For an
// artist it's the edit layer, whatever was picked (layersFor), and Base is off. v-model is { base, edit }.
const layers = defineModel({ type: Object, required: true });
defineProps({ label: { type: String, default: 'Layers' } }); // for screen readers; the toolbar shows its own
const drawing = useDrawingStore();

const LAYERS = [
  { key: 'base', label: 'Base', title: 'The base layer: the image, as the converter turns it into cells' },
  { key: 'edit', label: 'Edit', title: 'The edit layer: everything drawn (typed, painted and pasted)' },
];
const options = computed(() => (drawing.hostOnly ? [{ ...LAYERS[0], title: drawing.hostOnly, disabled: true }, LAYERS[1]] : LAYERS));
const shown = computed({
  get: () => (drawing.hostOnly ? { base: false, edit: true } : layers.value),
  set: (next) => { layers.value = next; },
});
</script>

<template>
  <ToggleGroup v-model="shown" :options="options" :label="label"/>
</template>
