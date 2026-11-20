<script setup>
import { watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { toastMessage, toastAction, closeToast } from '@/composables/useToast';

const { t } = useI18n();

// A manual popover, so it's drawn over a modal dialog (which no z-index is), and nothing but closeToast closes it.
// Shown from its ref, as it goes in; a new message shows it again, over a dialog opened since.
let shown = null;
// An action's button closes the toast before it runs, so a message the action shows stays.
const act = () => {
  const { run } = toastAction.value;
  closeToast();
  run();
};
const show = (el) => {
  shown = el;
  if (el && !el.matches(':popover-open')) el.showPopover();
};
watch(toastMessage, (now, was) => {
  if (!now || !was || !shown?.matches(':popover-open')) return; // a message replacing one: the first shows from its ref
  shown.hidePopover();
  shown.showPopover();
}, { flush: 'post' });
</script>

<template>
  <Transition name="toast">
    <div v-if="toastMessage" :ref="show" popover="manual" class="app-toast" role="status" :title="t('common.close')" @click="closeToast()">{{ toastMessage }}<button v-if="toastAction" type="button" class="action" :title="toastAction.label" @click.stop="act">{{ toastAction.label }}</button></div>
  </Transition>
</template>

<style scoped>
div.app-toast {
  position: fixed;
  inset: auto auto 24px 50%; /* not the popover's centering */
  margin: 0;
  border: none;
  transform: translateX(-50%);
  box-sizing: border-box;
  display: flex; /* the message wraps; its button and × keep their size */
  align-items: center;
  width: max-content; /* not wrapped at half the screen, where left: 50% would put it */
  max-width: min(560px, calc(100vw - 32px));
  padding: 7px 14px;
  border-radius: 6px;
  background: #e0b050;
  color: var(--black);
  font-size: 12px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
  cursor: pointer; /* a click closes it */
}
button.action {
  flex-shrink: 0;
  white-space: nowrap;
  margin-left: 10px;
  padding: 2px 8px;
  border: 1px solid currentColor;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

button.action:hover {
  background: rgba(0, 0, 0, 0.12);
}

div.app-toast::after { /* drawn, so it isn't part of what the message says */
  content: '×';
  flex-shrink: 0;
  margin-left: 10px;
  opacity: 0.6;
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
}
</style>
