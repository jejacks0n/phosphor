<script setup>
import { ref, computed, useId, onMounted, onBeforeUnmount } from 'vue';

// A text field you can type any characters into, with a ▾ list of ready-made sets that fills it
// (the ARIA editable combobox pattern: the list doesn't filter, it offers). Typing commits on change,
// like the field it replaces; picking a set commits at once.
const props = defineProps({
  modelValue: { type: String, required: true },
  presets: { type: Array, required: true }, // [{ name, chars }]
  id: { type: String, required: true },
});
const emit = defineEmits(['update:modelValue']);

const root = ref(null);
const input = ref(null);
const open = ref(false);
const active = ref(-1);
const listId = `${useId()}-list`;
const optionId = (i) => `${listId}-${i}`;
const current = computed(() => props.presets.findIndex((p) => p.chars === props.modelValue));

function show() {
  open.value = true;
  active.value = Math.max(0, current.value);
}
function toggle() {
  if (open.value) open.value = false;
  else {
    show();
    input.value?.focus();
  }
}
function choose(preset) {
  open.value = false;
  input.value.value = preset.chars; // over anything typed and not yet committed
  emit('update:modelValue', preset.chars);
}

function onKeyDown(event) {
  const n = props.presets.length;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if (!open.value) return show();
    active.value = (active.value + (event.key === 'ArrowDown' ? 1 : -1) + n) % n;
  } else if (event.key === 'Enter' && open.value && active.value >= 0) {
    event.preventDefault();
    choose(props.presets[active.value]);
  } else if (event.key === 'Escape' && open.value) {
    event.preventDefault();
    event.stopPropagation(); // the list's Escape, not the selection's
    open.value = false;
  }
}

const onOutside = (event) => { if (open.value && !root.value?.contains(event.target)) open.value = false; };
onMounted(() => document.addEventListener('pointerdown', onOutside, true));
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutside, true));
</script>

<template>
  <div ref="root" class="charset-field">
    <input
        ref="input"
        :id="id"
        type="text"
        class="mono"
        role="combobox"
        aria-autocomplete="none"
        :aria-expanded="open"
        :aria-controls="listId"
        :aria-activedescendant="open && active >= 0 ? optionId(active) : undefined"
        :value="modelValue"
        placeholder="characters"
        autocomplete="off"
        spellcheck="false"
        @change="emit('update:modelValue', $event.target.value)"
        @keydown="onKeyDown"
        @blur="open = false"
    >
    <button type="button" class="toggle" tabindex="-1" aria-label="Character sets" :aria-expanded="open" :aria-controls="listId" @mousedown.prevent @click="toggle">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" aria-hidden="true"><path d="M201.4 342.6c12.5 12.5 32.8 12.5 45.3 0l160-160c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L224 274.7 86.6 137.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l160 160z"/></svg>
    </button>
    <ul v-if="open" :id="listId" role="listbox" aria-label="Character sets">
      <li
          v-for="(preset, i) in presets"
          :id="optionId(i)"
          :key="preset.name"
          role="option"
          :aria-selected="i === current"
          :class="{ active: i === active }"
          @mousedown.prevent="choose(preset)"
          @mousemove="active = i"
      >
        <span class="name">{{ preset.name }}</span>
        <span class="chars">{{ preset.chars }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
div.charset-field {
  position: relative;
}

input {
  padding-right: 34px;
}

button.toggle {
  position: absolute;
  top: 1px;
  right: 1px;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: 0 6px 6px 0;
  background: transparent;
  box-shadow: none;
  color: var(--text-muted);
}

button.toggle:hover {
  transform: none;
  box-shadow: none;
  background: transparent;
  color: var(--accent-hot);
}

button.toggle svg {
  display: block;
  width: 11px;
  height: 11px;
  margin: auto;
  fill: currentColor;
  transition: transform 0.15s ease;
}

button.toggle[aria-expanded="true"] svg {
  transform: rotate(180deg);
}

ul {
  position: absolute;
  z-index: 20;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  margin: 0;
  padding: 4px;
  list-style: none;
  background: var(--surface-1);
  border: 1px solid var(--border-light);
  border-radius: 8px;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.45);
}

li {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 8px;
  border-radius: 5px;
  cursor: pointer;
}

li.active {
  background: var(--surface-3);
}

li[aria-selected="true"] span.name::after {
  content: ' ✓';
  color: var(--accent-hot);
}

span.name {
  font-size: 12px;
  color: var(--text);
}

span.chars {
  overflow: hidden;
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--text-muted);
}
</style>
