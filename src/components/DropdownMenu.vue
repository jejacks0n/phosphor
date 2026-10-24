<script setup>
import { ref, onMounted, onBeforeUnmount, useTemplateRef } from 'vue';

const props = defineProps({
  label: { type: String, default: 'Actions' },
  icon: { type: String, default: null },
  disabled: { type: Boolean, default: false },
  closeOnSelect: { type: Boolean, default: true }, // false for panels of controls (sliders, checkboxes)
  align: { type: String, default: 'right' }, // the trigger edge the menu lines up with: 'right' | 'left'
});

const isOpen = ref(false);
const position = ref(null);
const root = useTemplateRef('root');

// The menu is fixed under the trigger, so a scrolling toolbar row doesn't clip it.
function toggle() {
  if (props.disabled) return;
  isOpen.value = !isOpen.value;
  if (!isOpen.value) return;
  const rect = root.value.getBoundingClientRect();
  position.value = props.align === 'left'
    ? { top: `${rect.bottom + 4}px`, left: `${rect.left}px` }
    : { top: `${rect.bottom + 4}px`, right: `${document.documentElement.clientWidth - rect.right}px` };
}
const close = () => { isOpen.value = false; };
// Scrolling anything but the menu itself would leave it behind, so it closes.
const handleScroll = (e) => { if (isOpen.value && !root.value.contains(e.target)) close(); };
// Pointer presses, in the capture phase: the canvas cancels its pointerdowns, so no mousedown
// follows a click there.
const handleOutsideClick = (e) => { if (isOpen.value && !root.value.contains(e.target)) close(); };
const handleKeydown = (e) => { if (isOpen.value && e.key === 'Escape') close(); };

onMounted(() => {
  document.addEventListener('pointerdown', handleOutsideClick, true);
  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('resize', close);
  document.addEventListener('scroll', handleScroll, true);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleOutsideClick, true);
  window.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('resize', close);
  document.removeEventListener('scroll', handleScroll, true);
});
</script>

<template>
  <article ref="root" class="dropdown" :class="{ open: isOpen }">
    <button class="dropdown-trigger" @click="toggle" :disabled="disabled" :title="label">
      <slot name="trigger">
        <span v-if="icon">{{ icon }}</span>
        <span v-else>{{ label }}</span>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512">
          <path d="M201.4 342.6c12.5 12.5 32.8 12.5 45.3 0l160-160c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L224 274.7 86.6 137.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l160 160z"/>
        </svg>
      </slot>
    </button>
    <div class="dropdown-content" v-if="isOpen" :style="position" @click="closeOnSelect && close()">
      <slot></slot>
    </div>
  </article>
</template>

<style scoped>
article.dropdown {
  position: relative;
  display: inline-block;
}

article.dropdown.open .chevron {
  transform: rotate(180deg);
}

button.dropdown-trigger {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  height: 26px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text-muted);
}

button.dropdown-trigger:hover:not(:disabled) {
  background: var(--surface-3);
  color: var(--text);
}

button.dropdown-trigger svg {
  width: 10px;
  height: 10px;
  fill: currentColor;
  transition: transform 0.2s;
}


div.dropdown-content {
  position: fixed;
  border-radius: 6px;
  z-index: 1000;
  min-width: 140px;
  display: flex;
  flex-direction: column;
  padding: 4px;
  gap: 2px;
  background: var(--surface-1);
  border: 1px solid var(--accent);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
}

/* Deep selector to style slotted buttons */
div.dropdown-content :deep(button) {
  width: 100%;
  justify-content: flex-start;
  background: transparent;
  border: none;
  padding: 6px 10px;
  height: auto;
  font-size: 12px;
  border-radius: 4px;
  text-align: left;
  gap: 8px;
  color: var(--text);
}

div.dropdown-content :deep(button:hover:not(:disabled)) {
  background: var(--surface-3);
}

div.dropdown-content :deep(button:disabled) {
  opacity: 0.3;
}

div.dropdown-content :deep(button svg) {
  width: 14px;
  height: 14px;
}
</style>
