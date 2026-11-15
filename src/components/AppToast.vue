<script setup>
import { watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { toastMessage, closeToast } from '@/composables/useToast';

const { t } = useI18n();

// A manual popover, so it's drawn over a modal dialog (which no z-index is), and nothing but closeToast closes it.
// Shown from its ref, as it goes in; a new message shows it again, over a dialog opened since.
let shown = null;
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
    <div v-if="toastMessage" :ref="show" popover="manual" class="app-toast" role="status" :title="t('common.close')" @click="closeToast">{{ toastMessage }}</div>
  </Transition>
</template>

<style scoped>
div.app-toast {
  position: fixed;
  inset: auto auto 24px 50%; /* not the popover's centering */
  margin: 0;
  border: none;
  transform: translateX(-50%);
  padding: 7px 14px;
  border-radius: 6px;
  background: #e0b050;
  color: var(--black);
  font-size: 12px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
  cursor: pointer; /* a click closes it */
}
div.app-toast::after { /* drawn, so it isn't part of what the message says */
  content: '×';
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
