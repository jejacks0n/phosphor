<script setup>
import { computed } from 'vue';

// A text field you can type any characters into, with a ▾ that offers ready-made sets. The ▾ is a
// native <select> laid invisibly over it, so the sets open in the system's own menu, like the other
// menus (Safari's and Chrome's popups, iOS's wheel, Android's sheet). Typing commits on change, like
// the field it replaces; picking a set commits at once.
const props = defineProps({
  modelValue: { type: String, required: true },
  presets: { type: Array, required: true }, // [{ name, chars }]
  id: { type: String, required: true },
});
const emit = defineEmits(['update:modelValue']);

const current = computed(() => props.presets.findIndex((p) => p.chars === props.modelValue));
const preview = (chars) => {
  const all = [...chars];
  return all.length > 14 ? `${all.slice(0, 14).join('')}…` : chars;
};

function pick(event) {
  const preset = props.presets[Number(event.target.value)];
  if (preset) emit('update:modelValue', preset.chars);
}
</script>

<template>
  <div class="charset-field">
    <input
        :id="id"
        type="text"
        :value="modelValue"
        placeholder="characters"
        autocomplete="off"
        spellcheck="false"
        @change="emit('update:modelValue', $event.target.value)"
    >
    <select aria-label="Character sets" :value="current" @change="pick">
      <option v-if="current < 0" :value="-1" disabled>Custom</option>
      <option v-for="(preset, i) in presets" :key="preset.name" :value="i">{{ preset.name }} · {{ preview(preset.chars) }}</option>
    </select>
    <svg class="chevron" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" aria-hidden="true"><path d="M201.4 342.6c12.5 12.5 32.8 12.5 45.3 0l160-160c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L224 274.7 86.6 137.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l160 160z"/></svg>
  </div>
</template>

<style scoped>
div.charset-field {
  position: relative;
}

/* The characters in the font the art is drawn in (displayFonts.js), as they'll be drawn; at its size,
   to 16px at most so they fit the field (a pixel font stays sharp at 16, or 32 halved). */
input {
  padding-right: 34px;
  font-family: var(--display-font-family);
  font-size: min(var(--display-font-size), 16px);
  -webkit-font-smoothing: var(--display-font-smoothing, antialiased);
  -moz-osx-font-smoothing: var(--display-moz-font-smoothing, grayscale);
}

/* Over the ▾, invisible: a click or tap opens the system menu. */
select {
  position: absolute;
  z-index: 1;
  top: 0;
  right: 0;
  width: 34px;
  height: 100%;
  padding: 0;
  opacity: 0;
  cursor: pointer;
}

svg.chevron {
  position: absolute;
  top: 50%;
  right: 11px;
  width: 11px;
  height: 11px;
  margin-top: -5.5px;
  fill: var(--text-muted);
  pointer-events: none;
}

select:hover + svg.chevron {
  fill: var(--accent-hot);
}

/* The select can't show its own focus ring (it's invisible), so the ▾ does. */
select:focus-visible + svg.chevron {
  fill: var(--accent-hot);
  outline: 2px solid var(--accent);
  outline-offset: 4px;
  border-radius: 2px;
}
</style>
