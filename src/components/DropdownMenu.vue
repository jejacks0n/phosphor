<script setup>
import { ref, shallowRef, nextTick, onMounted, onBeforeUnmount, useTemplateRef, useId } from 'vue';
import { t } from '@/i18n';

const props = defineProps({
  label: { type: String, default: () => t('common.actions') },
  triggerLabel: { type: String, default: null }, // the trigger's name, where its text is a value
  icon: { type: String, default: null },
  disabled: { type: Boolean, default: false },
  closeOnSelect: { type: Boolean, default: true }, // false for panels of controls (sliders, checkboxes)
  align: { type: String, default: 'right' }, // the trigger edge the menu lines up with: 'right' | 'left'
  up: { type: Boolean, default: false }, // opens above the trigger, for a trigger at the bottom of the window
});

const isOpen = ref(false);
const position = ref(null);
const root = useTemplateRef('root');
const content = shallowRef(null);
const MARGIN = 4; // between the menu and the window's edge
const anchor = `--dropdown-${useId()}`; // the name the menu is anchored to its trigger by

// The menu is a manual popover, so it's drawn over everything, a modal dialog included, and no scrolling row clips
// it: shown from its ref as it goes in. Its own code still closes it (a press outside, Escape, a scroll), as a
// manual popover never closes itself. Where the browser has anchor positioning, CSS places it under the trigger and
// flips it to stay in the window. Elsewhere it's placed here: lined up with the trigger, then moved along as far as
// it takes to stay in the window, which on a phone it may not.
const anchored = typeof CSS !== 'undefined' && CSS.supports('position-area: block-end');
const showMenu = (el) => {
  content.value = el;
  if (el && !el.matches(':popover-open')) el.showPopover();
};
async function toggle() {
  if (props.disabled) return;
  isOpen.value = !isOpen.value;
  if (!isOpen.value || anchored) return;
  const rect = root.value.getBoundingClientRect();
  const edge = props.up ? { bottom: `${document.documentElement.clientHeight - rect.top + 4}px` } : { top: `${rect.bottom + 4}px` };
  position.value = props.align === 'left'
    ? { ...edge, left: `${rect.left}px` }
    : { ...edge, right: `${document.documentElement.clientWidth - rect.right}px` };
  await nextTick();
  const menu = content.value?.getBoundingClientRect(), width = document.documentElement.clientWidth;
  if (!menu) return;
  if (menu.left < MARGIN) position.value = { ...edge, left: `${MARGIN}px` };
  else if (menu.right > width - MARGIN) position.value = { ...edge, right: `${MARGIN}px` };
}
const close = () => { isOpen.value = false; };
const open = () => { if (!isOpen.value) toggle(); };
defineExpose({ open, close });
// An item chosen closes the menu; focus that was on the item goes back to the trigger, not to the page.
function chosen() {
  if (!props.closeOnSelect) return;
  const had = content.value?.contains(document.activeElement);
  close();
  if (had) root.value.querySelector('.dropdown-trigger').focus();
}
// Scrolling what holds the menu would leave it behind, so it closes. Something beside it, a chat
// keeping up with its messages, say, doesn't move it.
const handleScroll = (e) => { if (isOpen.value && !root.value.contains(e.target) && e.target.contains(root.value)) close(); };
// Pointer presses, in the capture phase: the canvas cancels its pointerdowns, so no mousedown
// follows a click there.
const handleOutsideClick = (e) => { if (isOpen.value && !root.value.contains(e.target)) close(); };
// Escape, heard first (the capture phase): it closes an open menu and does nothing else, so what's selected stays.
const handleKeydown = (e) => {
  if (!isOpen.value || e.key !== 'Escape') return;
  e.preventDefault();
  e.stopImmediatePropagation();
  close();
};

onMounted(() => {
  document.addEventListener('pointerdown', handleOutsideClick, true);
  window.addEventListener('keydown', handleKeydown, true);
  window.addEventListener('resize', close);
  document.addEventListener('scroll', handleScroll, true);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleOutsideClick, true);
  window.removeEventListener('keydown', handleKeydown, true);
  window.removeEventListener('resize', close);
  document.removeEventListener('scroll', handleScroll, true);
});
</script>

<template>
  <article ref="root" class="dropdown" :class="{ open: isOpen }" :style="{ '--anchor': anchor }">
    <slot name="before"></slot><!-- inside, so the menu lines up with it too and a press on it isn't outside -->
    <button class="dropdown-trigger" :aria-label="triggerLabel" @click="toggle" :disabled="disabled" :title="label">
      <slot name="trigger">
        <span v-if="icon">{{ icon }}</span>
        <span v-else>{{ label }}</span>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512">
          <path d="M201.4 342.6c12.5 12.5 32.8 12.5 45.3 0l160-160c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L224 274.7 86.6 137.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l160 160z"/>
        </svg>
      </slot>
    </button>
    <div v-if="isOpen" :ref="showMenu" popover="manual" class="dropdown-content" :class="{ up: props.up, left: props.align === 'left' }" :style="position" @click="chosen">
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

/* The popover's own styles undone: no centering, border or scrollbar. */
div.dropdown-content {
  position: fixed;
  inset: auto;
  margin: 0;
  overflow: visible;
  color: inherit;
  border-radius: 6px;
  min-width: 140px;
  max-width: calc(100vw - 8px);
  display: flex;
  flex-direction: column;
  padding: 4px;
  gap: 2px;
  background: var(--surface-1);
  border: 1px solid var(--accent);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
}

/* Anchored to the trigger: lined up with its right edge (or its left, with align left), below it (or above, with
   up), flipped to whichever side keeps it in the window. */
@supports (position-area: block-end) {
  article.dropdown {
    anchor-name: var(--anchor);
  }
  div.dropdown-content {
    position-anchor: var(--anchor);
    position-area: block-end span-inline-start;
    position-try-fallbacks: flip-inline, flip-block, flip-block flip-inline;
    margin-block-start: 4px;
  }
  div.dropdown-content.left {
    position-area: block-end span-inline-end;
  }
  div.dropdown-content.up {
    position-area: block-start span-inline-start;
    margin-block: 0 4px;
  }
  div.dropdown-content.up.left {
    position-area: block-start span-inline-end;
  }
}

/* It fades in, and slides a little from the trigger unless motion is reduced. */
div.dropdown-content:popover-open {
  transition: opacity 0.1s ease-out, translate 0.1s ease-out;
}
@starting-style {
  div.dropdown-content:popover-open {
    opacity: 0;
  }
}
@media (prefers-reduced-motion: no-preference) {
  @starting-style {
    div.dropdown-content:popover-open {
      translate: 0 -4px;
    }
    div.dropdown-content.up:popover-open {
      translate: 0 4px;
    }
  }
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
