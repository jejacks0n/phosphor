<script setup>
import { onMounted, useTemplateRef } from 'vue';

// A box centred over the page like a confirm box, for ChoiceDialog and SaveDialog: a title, a line
// under it, and the slot. Focus goes to the slot's [autofocus] element, else its first control.
// While it's up, keys are the dialog's: none reach the app's shortcuts (Backspace would delete a
// selection, the arrows nudge it). Escape and the backdrop cancel; Tab keeps to the dialog.
const props = defineProps({
  title: { type: String, required: true },
  sub: { type: String, default: '' },
});
const emit = defineEmits(['cancel']);
const dialog = useTemplateRef('dialog');
const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)';

onMounted(() => (dialog.value?.querySelector('[autofocus]') ?? dialog.value?.querySelector(FOCUSABLE))?.focus());

function onKeyDown(event) {
  event.stopPropagation();
  if (event.key === 'Escape') {
    event.preventDefault();
    emit('cancel');
  } else if (event.key === 'Tab') {
    const controls = [...event.currentTarget.querySelectorAll(FOCUSABLE)];
    const at = controls.indexOf(document.activeElement);
    const next = event.shiftKey ? (at <= 0 ? controls.length - 1 : at - 1) : (at === controls.length - 1 ? 0 : at + 1);
    event.preventDefault();
    controls[next]?.focus();
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="modal-backdrop" @click.self="emit('cancel')">
      <div ref="dialog" class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="modal-dialog-title" @keydown="onKeyDown">
        <h3 id="modal-dialog-title">{{ props.title }}</h3>
        <p v-if="props.sub" class="sub">{{ props.sub }}</p>
        <slot/>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
div.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(2px);
}

div.modal-dialog {
  width: 100%;
  max-width: 440px;
  padding: 18px;
  background: var(--surface-0);
  border: 1px solid var(--border-light);
  border-radius: 12px;
  color: var(--text);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
}

h3 {
  margin: 0 0 4px;
  font-size: 16px;
}

p.sub {
  margin: 0 0 14px;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.45;
}
</style>
