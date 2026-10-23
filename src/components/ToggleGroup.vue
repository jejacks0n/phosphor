<script setup>
// Connected toggle buttons over an object of booleans (v-model): any number lit, never none (a
// click that would turn the last one off does nothing). options: [{ key, label, title }].
const value = defineModel({ type: Object, required: true });
defineProps({
  options: { type: Array, required: true },
  label: { type: String, default: '' }, // for screen readers; the toolbar shows its own
});

function toggle(key) {
  const next = { ...value.value, [key]: !value.value[key] };
  if (Object.values(next).some(Boolean)) value.value = next;
}
</script>

<template>
  <div class="toggle-group" role="group" :aria-label="label">
    <button
        v-for="{ key, label: name, title } in options"
        :key="key"
        :class="{ on: value[key] }"
        :aria-pressed="!!value[key]"
        :title="title"
        @click="toggle(key)"
    >{{ name }}</button>
  </div>
</template>

<style scoped>
/* Connected: one bar, rounded only at its ends. */
div.toggle-group {
  display: flex;
}

div.toggle-group button {
  width: auto;
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 0;
  font-size: 12px;
  color: var(--text-dim);
}

div.toggle-group button:first-child {
  border-radius: 3px 0 0 3px;
}

/* The buttons overlap by their shared border; the lit or hovered one draws on top, so its edge shows. */
div.toggle-group button + button {
  margin-left: -1px;
}

div.toggle-group button:last-child {
  border-radius: 0 3px 3px 0;
}

div.toggle-group button:hover,
div.toggle-group button:focus-visible {
  position: relative;
  z-index: 1;
  transform: none;
}

div.toggle-group button.on {
  position: relative;
  z-index: 1;
  background: var(--accent);
  border-color: var(--accent);
  color: var(--white);
}
</style>
