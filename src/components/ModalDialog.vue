<script setup>
import { onBeforeUnmount, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { FOCUSABLE, cancelOnBack, firstField, keepTabIn } from '@/lib/focus';
import { useModal } from '@/composables/useModal';

// A box centered over the page like a confirm box, for ChoiceDialog and SaveDialog: a title, a line
// under it, and the slot. It's a modal <dialog>: the page behind it is inert, so Tab keeps to it, and it's drawn
// over everything. Focus goes to the slot's first field to type in, else its [autofocus] element, else its first control; Tab goes round its controls
// rather than on to the browser's.
// While it's up, keys are the dialog's: none reach the app's shortcuts (Backspace would delete a
// selection, the arrows nudge it). Escape, the back gesture and the backdrop cancel. `long` is for text to
// read: wider, its slot lays out in a column that fits the window, and the backdrop does nothing (a drag selecting
// the text can end there), not even take focus. `wide` is long with room for two columns. With no title (a slot with
// its own heading), `label` names it; `focus` false leaves focus to the slot. `closable` adds a close button (×) at
// the top right, which cancels as Escape does. The browser's Back cancels it too, and the page stays, unless `back` is
// false: a dialog the address itself shows or asks about (SOCIAL's pages, its question, ending a room), which Back
// moves past. The <dialog> itself is useModal's.
const props = defineProps({
  title: { type: String, default: '' },
  label: { type: String, default: '' },
  sub: { type: String, default: '' },
  long: { type: Boolean, default: false },
  wide: { type: Boolean, default: false },
  focus: { type: Boolean, default: true },
  closable: { type: Boolean, default: false },
  back: { type: Boolean, default: true },
});
const { t } = useI18n();
const emit = defineEmits(['cancel']);

const { open, onCancel, onClose, outside, element } = useModal(() => emit('cancel'), {
  // showModal focuses its first control before the slot's fields have their values (v-model gives them as they
  // mount), so a field that selects its text on focus would select nothing: focus is placed on mounting instead,
  // the dialog's own with focus false, the slot's to place.
  opened: (el) => (props.focus ? el.contains(document.activeElement) && document.activeElement.blur() : el.focus()),
});

onMounted(() => {
  const el = element();
  if (props.focus) (firstField(el) ?? el?.querySelector('[autofocus]') ?? el?.querySelector(FOCUSABLE))?.focus();
});
const stopBack = props.back ? cancelOnBack(() => emit('cancel')) : null;
onBeforeUnmount(() => stopBack?.());

function onKeyDown(event) {
  event.stopPropagation();
  if (event.key === 'Escape') {
    event.preventDefault(); // not the dialog's own close as well
    emit('cancel');
  } else keepTabIn(event);
}

const onClick = (event) => outside(event) && !props.long && !props.wide && emit('cancel');
const onMouseDown = (event) => outside(event) && (props.long || props.wide) && event.preventDefault();
</script>

<template>
  <Teleport to="body">
    <dialog :ref="open" class="modal-dialog" :class="{ long: props.long || props.wide, wide: props.wide }" :aria-label="props.title ? null : props.label" :aria-labelledby="props.title ? 'modal-dialog-title' : null" :tabindex="props.long || props.wide ? -1 : undefined" @keydown="onKeyDown" @cancel="onCancel" @close="onClose" @click="onClick" @mousedown="onMouseDown">
      <button v-if="props.closable" class="close" :title="t('common.close')" :aria-label="t('common.close')" @click="emit('cancel')">×</button>
      <h3 v-if="props.title" id="modal-dialog-title">{{ props.title }}</h3>
      <p v-if="props.sub" class="sub">{{ props.sub }}</p>
      <slot/>
    </dialog>
  </Teleport>
</template>

<style scoped>
dialog.modal-dialog::backdrop {
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(2px);
}

/* 20px clear of the window's edges, as the backdrop's padding kept it before */
dialog.modal-dialog {
  box-sizing: border-box;
  width: calc(100% - 40px);
  max-width: 478px; /* 440px inside */
  max-height: calc(100% - 40px);
  padding: 18px;
  background: var(--surface-0);
  border: 1px solid var(--border-light);
  border-radius: 12px;
  color: var(--text);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
}

dialog.modal-dialog.long {
  max-width: 600px;
  overflow: auto;   /* a window too short even for what's pinned */
  outline: none;
}
dialog.modal-dialog.long[open] { /* only while open: closed, the dialog's hidden */
  display: flex;
  flex-direction: column;
}
dialog.modal-dialog.wide {   /* after long, which it also is */
  max-width: 860px;
}

/* The app's close button, inside the corner rather than over it: a long box scrolls, which would cut it off, and
   sticky keeps it in reach as it does. It takes no room, so what's under it starts at the top as before. */
dialog.modal-dialog > button.close {
  position: sticky;
  top: 0;
  flex: none;
  align-self: flex-end;
  margin: -8px -8px -22px auto;
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
