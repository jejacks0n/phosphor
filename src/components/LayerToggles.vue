<script setup>
// Which layers a tool acts on: connected [Base] [Edit] buttons, either or both lit, never neither
// (a click that would turn the last one off does nothing). v-model is { base, edit }.
const layers = defineModel({ type: Object, required: true });
defineProps({ label: { type: String, default: 'Layers' } }); // for screen readers; the toolbar shows its own

const LAYERS = [
  ['base', 'Base', 'The base layer: the image, as the converter turns it into cells'],
  ['edit', 'Edit', 'The edit layer: everything drawn (typed, painted and pasted)'],
];

function toggle(key) {
  const next = { ...layers.value, [key]: !layers.value[key] };
  if (next.base || next.edit) layers.value = next;
}
</script>

<template>
  <div class="layer-toggles" role="group" :aria-label="label">
    <button
        v-for="[key, name, title] in LAYERS"
        :key="key"
        :class="{ on: layers[key] }"
        :aria-pressed="layers[key]"
        :title="title"
        @click="toggle(key)"
    >{{ name }}</button>
  </div>
</template>

<style scoped>
/* Connected: one bar, rounded only at its ends. */
div.layer-toggles {
  display: flex;
}

div.layer-toggles button {
  width: auto;
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 0;
  font-size: 12px;
  color: var(--text-dim);
}

div.layer-toggles button:first-child {
  border-radius: 3px 0 0 3px;
}

/* The buttons overlap by their shared border; the lit or hovered one draws on top, so its edge shows. */
div.layer-toggles button:last-child {
  margin-left: -1px;
  border-radius: 0 3px 3px 0;
}

div.layer-toggles button:hover {
  position: relative;
  z-index: 1;
  transform: none;
}

div.layer-toggles button.on {
  position: relative;
  z-index: 1;
  background: var(--accent);
  border-color: var(--accent);
  color: var(--white);
}
</style>
