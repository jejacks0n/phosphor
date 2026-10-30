<script setup>
import { onMounted, useTemplateRef } from 'vue';

// A large box of text to read over the app (About, the Terms, the Privacy Policy): a close button, and the slot,
// scrolled when it's long. Each user styles its own text.
defineProps({ label: { type: String, required: true } });
const emit = defineEmits(['close']);
const close = useTemplateRef('close');
onMounted(() => close.value?.focus());

// Keys are the dialog's while it's up (none reach the app's shortcuts); Escape closes it.
function onKeyDown(event) {
  event.stopPropagation();
  if (event.key === 'Escape') emit('close');
}
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <article class="reading-dialog" role="dialog" aria-modal="true" :aria-label="label" @keydown="onKeyDown">
      <button ref="close" class="close" @click="emit('close')" title="Close" aria-label="Close">×</button>
      <div class="content-container">
        <slot/>
      </div>
    </article>
  </div>
</template>

<style scoped>
div.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  padding: 20px;
}

article.reading-dialog {
  position: relative;
  max-width: 800px;
  width: 100%;
  max-height: 90vh;
  background: var(--surface-0);
  border: 1px solid var(--border);
  border-radius: 12px;
  color: var(--text);
  line-height: 1.6;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
}

div.content-container {
  height: 100%;
  overflow: auto;
  padding: 40px;
}
</style>
