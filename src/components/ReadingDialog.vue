<script setup>
import { onMounted, useTemplateRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { keepTabIn } from '@/lib/focus';
import { useModal } from '@/composables/useModal';

// A large box of text to read over the app (About, the Terms, the Privacy Policy): a close button, and the slot,
// scrolled when it's long. Each user styles its own text. A modal <dialog> as ModalDialog is (useModal), so it can
// open over one; Escape, the back gesture and the backdrop close it.
defineProps({ label: { type: String, required: true } });
const emit = defineEmits(['close']);
const { t } = useI18n();
const close = useTemplateRef('close');
onMounted(() => close.value?.focus());
const { open, onCancel, onClose, outside } = useModal(() => emit('close'));

// Keys are the dialog's while it's up (none reach the app's shortcuts); Escape closes it, and Tab keeps to it.
function onKeyDown(event) {
  event.stopPropagation();
  if (event.key === 'Escape') {
    event.preventDefault(); // not the dialog's own close as well
    emit('close');
  } else keepTabIn(event);
}
</script>

<template>
  <Teleport to="body">
    <dialog :ref="open" class="reading-dialog" :aria-label="label" @keydown="onKeyDown" @cancel="onCancel" @close="onClose" @click="outside($event) && emit('close')">
      <button ref="close" class="close" @click="emit('close')" :title="t('common.close')" :aria-label="t('common.close')">×</button>
      <div class="content-container">
        <slot/>
      </div>
    </dialog>
  </Teleport>
</template>

<style scoped>
dialog.reading-dialog::backdrop {
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(4px);
}

/* 20px clear of the window's edges, as the backdrop's padding kept it before */
dialog.reading-dialog {
  box-sizing: border-box;
  width: calc(100% - 40px);
  max-width: 802px; /* 800px inside */
  max-height: 90vh;
  padding: 0;
  overflow: visible; /* the content scrolls, and the close button sits over the corner */
  background: var(--surface-0);
  border: 1px solid var(--border);
  border-radius: 12px;
  color: var(--text);
  line-height: 1.6;
  box-shadow: 0 20px 40px color-mix(in srgb, var(--shadow) 60%, transparent);
}
dialog.reading-dialog[open] { /* only while open: closed, the dialog's hidden */
  display: flex;
  flex-direction: column;
}

div.content-container {
  height: 100%;
  overflow: auto;
  padding: 40px;
}

/* It fades in, over a backdrop fading in. */
dialog.reading-dialog[open],
dialog.reading-dialog[open]::backdrop {
  transition: opacity 0.15s ease-out;
}
@starting-style {
  dialog.reading-dialog[open],
  dialog.reading-dialog[open]::backdrop {
    opacity: 0;
  }
}
</style>
