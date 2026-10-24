<script setup>
import ToggleGroup from '@/components/ToggleGroup.vue';

// Which layers a tool acts on: connected [Base] [Edit] buttons, either or both lit, never neither.
// v-model is { base, edit }.
const layers = defineModel({ type: Object, required: true });
defineProps({ label: { type: String, default: 'Layers' } }); // for screen readers; the toolbar shows its own

const LAYERS = [
  { key: 'base', label: 'Base', title: 'The base layer: the image, as the converter turns it into cells' },
  { key: 'edit', label: 'Edit', title: 'The edit layer: everything drawn (typed, painted and pasted)' },
];
</script>

<template>
  <ToggleGroup v-model="layers" :options="LAYERS" :label="label"/>
</template>
