<script setup>
import { onMounted, useTemplateRef } from 'vue';
import { FOCUSABLE, keepTabIn } from '@/lib/focus';

// A box centered over the page like a confirm box, for ChoiceDialog and SaveDialog: a title, a line
// under it, and the slot. Focus goes to the slot's [autofocus] element, else its first control.
// While it's up, keys are the dialog's: none reach the app's shortcuts (Backspace would delete a
// selection, the arrows nudge it). Escape and the backdrop cancel; Tab keeps to the dialog. `long` is for text to
// read: wider, its slot lays out in a column that fits the window, and the backdrop does nothing (a drag selecting
// the text can end there), not even take focus. `wide` is long with room for two columns. With no title (a slot with
// its own heading), `label` names it; `focus` false leaves focus to the slot.
const props = defineProps({
  title: { type: String, default: '' },
  label: { type: String, default: '' },
  sub: { type: String, default: '' },
  long: { type: Boolean, default: false },
  wide: { type: Boolean, default: false },
  focus: { type: Boolean, default: true },
});
const emit = defineEmits(['cancel']);
const dialog = useTemplateRef('dialog');

onMounted(() => props.focus && (dialog.value?.querySelector('[autofocus]') ?? dialog.value?.querySelector(FOCUSABLE))?.focus());

function onKeyDown(event) {
  event.stopPropagation();
  if (event.key === 'Escape') {
    event.preventDefault();
    emit('cancel');
  } else keepTabIn(event);
}
</script>

<template>
  <Teleport to="body">
    <div class="modal-backdrop" @click.self="props.long || props.wide || emit('cancel')" @mousedown.self="(props.long || props.wide) && $event.preventDefault()">
      <div ref="dialog" class="modal-dialog" :class="{ long: props.long || props.wide, wide: props.wide }" :aria-label="props.title ? null : props.label" role="dialog" aria-modal="true" :aria-labelledby="props.title ? 'modal-dialog-title' : null" :tabindex="props.long || props.wide ? -1 : undefined" @keydown="onKeyDown">
        <h3 v-if="props.title" id="modal-dialog-title">{{ props.title }}</h3>
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

div.modal-dialog.long {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  max-width: 600px;
  max-height: 100%;
  overflow: auto;   /* a window too short even for what's pinned */
  outline: none;
}
div.modal-dialog.wide {   /* after long, which it also is */
  max-width: 860px;
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
