<script setup>
import { toastMessage } from '@/composables/useToast';
</script>

<template>
  <Transition name="toast">
    <div v-if="toastMessage" class="app-toast" role="status">{{ toastMessage }}</div>
  </Transition>
</template>

<style scoped>
div.app-toast {
  position: fixed;
  left: 50%;
  bottom: 24px;
  z-index: 10002;
  transform: translateX(-50%);
  padding: 7px 14px;
  border-radius: 6px;
  background: #e0b050;
  color: var(--black);
  font-size: 12px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
  pointer-events: none;
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
