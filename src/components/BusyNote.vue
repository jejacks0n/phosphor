<script setup>
import { busyMessage } from '@/composables/useBusy';
import { toastMessage } from '@/composables/useToast';

// Opening or saving still going after half a second (the delay below, so it comes on time on a busy page): the file's name at the bottom of the screen, with a line moving under it.
// A manual popover, as the toast is, so it's over a modal dialog (the save dialog); the toast takes its place.
const show = (el) => {
  if (el && !el.matches(':popover-open')) el.showPopover();
};
</script>

<template>
  <div v-if="busyMessage && !toastMessage" :ref="show" popover="manual" class="busy-note" role="status">{{ busyMessage }}</div>
</template>

<style scoped>
div.busy-note {
  position: fixed;
  inset: auto auto 24px 50%;
  margin: 0;
  transform: translateX(-50%);
  padding: 7px 14px 9px;
  border-radius: 6px;
  border: 1px solid var(--border-light);
  background: var(--surface-2);
  color: var(--text);
  font-size: 12px;
  white-space: nowrap;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  pointer-events: none;
  animation: busy-in 0.15s 0.5s both;
}
div.busy-note::after { /* how far along isn't known: a line going back and forth */
  content: '';
  position: absolute;
  left: 0;
  bottom: 0;
  height: 2px;
  width: 40%;
  background: var(--accent-hot);
  animation: busy-slide 1.1s ease-in-out infinite alternate;
}

@keyframes busy-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes busy-slide {
  from { transform: translateX(-10%); }
  to { transform: translateX(160%); }
}

@media (prefers-reduced-motion: reduce) {
  div.busy-note::after {
    animation: none;
    width: 100%;
    opacity: 0.6;
  }
}
</style>
