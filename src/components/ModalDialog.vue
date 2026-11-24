<script setup>
import { onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue';
import { FOCUSABLE, cancelOnBack, firstField, keepTabIn } from '@/lib/focus';
import { useModal } from '@/composables/useModal';
import CloseButton from '@/components/CloseButton.vue';

// The app's one dialog: a box centered over the page, as a confirm box is, for everything from ChoiceDialog and
// SaveDialog to Export, Plugins, About and the legal pages. Its first line is a title or tabs, with the × at its right
// end, and stays put; under it a line of words (`sub`) and the slot scroll. It's a modal <dialog>: the page behind it
// is inert, so Tab keeps to it, and it's drawn over everything. Focus goes to the slot's first field to type in, else
// its [autofocus] element, else its first control (the × when it has one); Tab goes round its controls rather than on
// to the browser's.
// While it's up, keys are the dialog's: none reach the app's shortcuts (Backspace would delete a selection, the arrows
// nudge it). Escape, the back gesture and the backdrop cancel. `long` is for a page of controls and text: wider, its
// slot lays out in a column that fits the window, and the backdrop does nothing (a drag selecting the text can end
// there), not even take focus. `wide` is long with room for two columns. `reading` is for text to read (About, the
// Terms, the Privacy Policy): wider still, roomier, over a darker backdrop, which closes it. With no title (a slot with
// its own heading, or tabs), `label` names it; `focus` false leaves focus to the slot.
// `tabs` ([{ key, label, count, id, controls }]) puts tabs on the first line in a title's place, the Palettes and Fonts
// layer's (tabStrip.css), with `tab` (v-model:tab) the chosen one's key: Left and Right move round them, and the body
// starts from its top on each. A tab's `id` and `controls` are for whoever shows a tab panel.
// `closable` adds the close button (CloseButton, the layer's thin ×) inside the top right corner, on the title's line when
// there is one, which cancels as Escape does. The browser's Back cancels it too, and the page stays, unless `back` is
// false: a dialog the address itself shows or asks about (SOCIAL's pages, its question, ending a room), or one read over
// another (About, the legal pages), which Back moves past.
// At 700px wide and below a big one (long, wide or reading, or `full`: Keyboard shortcuts) is the whole window, and a
// small one keeps its margin. `tall` gives it one height whatever it holds, so it doesn't change size as a list in it
// is searched; a shorter window still shortens it. The <dialog> itself is useModal's.
const props = defineProps({
  title: { type: String, default: '' },
  label: { type: String, default: '' },
  sub: { type: String, default: '' },
  long: { type: Boolean, default: false },
  wide: { type: Boolean, default: false },
  reading: { type: Boolean, default: false },
  focus: { type: Boolean, default: true },
  closable: { type: Boolean, default: false },
  back: { type: Boolean, default: true },
  full: { type: Boolean, default: false },
  tall: { type: Boolean, default: false },
  tabs: { type: Array, default: null },
  tab: { type: String, default: '' },
});
const emit = defineEmits(['cancel', 'update:tab']);

const { open, onCancel, onClose, outside, element } = useModal(() => emit('cancel'), {
  // showModal focuses its first control before the slot's fields have their values (v-model gives them as they
  // mount), so a field that selects its text on focus would select nothing: focus is placed on mounting instead,
  // the dialog's own with focus false, the slot's to place.
  opened: (el) => (props.focus ? el.contains(document.activeElement) && document.activeElement.blur() : (el.querySelector(':scope > .body[tabindex]') ?? el).focus()),
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

// The tabs pattern: Left and Right (wrapping) move to a tab and show it.
const strip = useTemplateRef('strip');
function onTabKey(event) {
  const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
  if (!step) return;
  event.preventDefault();
  const next = (props.tabs.findIndex((tab) => tab.key === props.tab) + step + props.tabs.length) % props.tabs.length;
  emit('update:tab', props.tabs[next].key);
  strip.value.children[next].focus();
}
const body = useTemplateRef('body');
watch(() => props.tab, () => { body.value.scrollTop = 0; }, { flush: 'post' });

const still = () => props.long || props.wide; // its backdrop does nothing
const onClick = (event) => outside(event) && !still() && emit('cancel');
const onMouseDown = (event) => outside(event) && still() && event.preventDefault();
</script>

<template>
  <Teleport to="body">
    <dialog :ref="open" class="modal-dialog" :class="{ long: props.long || props.wide, wide: props.wide, reading: props.reading, full: props.full || props.long || props.wide || props.reading, tall: props.tall }" :aria-label="props.title ? null : props.label" :aria-labelledby="props.title ? 'modal-dialog-title' : null" @keydown="onKeyDown" @cancel="onCancel" @close="onClose" @click="onClick" @mousedown="onMouseDown">
      <div v-if="props.tabs || props.title || props.closable" class="head" :class="{ 'tab-strip': !!props.tabs, titled: !props.tabs && !!props.title, closable: props.closable }">
        <CloseButton v-if="props.closable" @click="emit('cancel')"/><!-- first, so focus starts on it when the slot has nothing to take it; drawn at the line's right end -->
        <div v-if="props.tabs" ref="strip" role="tablist" :aria-label="props.label || props.title" @keydown="onTabKey">
          <button
              v-for="each in props.tabs"
              :id="each.id"
              :key="each.key"
              type="button"
              role="tab"
              :class="{ on: each.key === props.tab }"
              :aria-selected="each.key === props.tab ? 'true' : 'false'"
              :aria-controls="each.key === props.tab ? each.controls : undefined"
              :tabindex="each.key === props.tab ? 0 : -1"
              @click="emit('update:tab', each.key)"
          >
            {{ each.label }}
            <span v-if="each.count !== undefined" class="count">{{ each.count }}</span>
          </button>
        </div>
        <h3 v-else-if="props.title" id="modal-dialog-title">{{ props.title }}</h3>
      </div>
      <div ref="body" class="body" :tabindex="props.long || props.wide ? -1 : undefined">
        <p v-if="props.sub" class="sub">{{ props.sub }}</p>
        <slot/>
      </div>
    </dialog>
  </Teleport>
</template>

<style scoped src="./tabStrip.css"></style>
<style scoped>
dialog.modal-dialog::backdrop {
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(2px);
}
dialog.modal-dialog.reading::backdrop {
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(4px);
}

/* 20px clear of the window's edges, as the backdrop's padding kept it before */
dialog.modal-dialog {
  box-sizing: border-box;
  width: calc(100% - 40px);
  max-width: 478px; /* 440px inside */
  max-height: calc(100% - 40px);
  padding: 0;
  overflow: visible; /* the body scrolls */
  background: var(--surface-0);
  border: 1px solid var(--border-light);
  border-radius: 12px;
  color: var(--text);
  box-shadow: 0 20px 40px color-mix(in srgb, var(--shadow) 60%, transparent);
}

dialog.modal-dialog[open] { /* only while open: closed, the dialog's hidden */
  display: flex;
  flex-direction: column;
}

/* The first line: a title 18px in, or tabs, or nothing but the × (a slot with its own heading), which keeps the line
   so nothing of the body passes under it. */
div.head {
  position: relative;
  flex: none;
}
div.head:not(.tab-strip) {
  box-sizing: border-box;
  min-height: 32px;
  padding: 18px 18px 0;
}
div.head.closable:not(.tab-strip) {
  padding-right: 38px;
}
div.head > button.close {
  position: absolute;
  top: 6px;
  right: 6px;
}
div.head.titled > button.close { /* on the title's line (18px down, 18px tall), as Sign in's heading and the tabs have it */
  top: 14px;
}
div.head.tab-strip > button.close { /* at the tabs' right end, in the middle of the line, as the layer's */
  position: relative;
  top: auto;
  right: auto;
  order: 1;
  align-self: center;
}

div.body {
  flex: 1 1 auto;
  min-height: 0;
  padding: 18px;
  overflow: auto;
  border-radius: inherit;
}
div.head + div.body {
  padding-top: 0;
  border-top-left-radius: 0;
  border-top-right-radius: 0;
}
div.head.tab-strip + div.body {
  padding-top: 18px;
}

dialog.modal-dialog.long {
  max-width: 600px;
}
dialog.modal-dialog.long > div.body {
  display: flex;
  flex-direction: column;
  outline: none;
}
dialog.modal-dialog.wide {   /* after long, which it also is */
  max-width: 860px;
}
/* Text to read: its paragraphs' own margins, so not a column. */
dialog.modal-dialog.reading {
  max-width: 802px; /* 800px inside */
  max-height: 90vh;
  border-color: var(--border);
  line-height: 1.6;
}
dialog.modal-dialog.reading > div.body {
  padding: 40px;
}
dialog.modal-dialog.reading > div.head:not(.tab-strip) + div.body { /* under the ×'s line: its text 40px down, as before */
  padding-top: 8px;
}
/* One height whatever it holds (a list inside does the scrolling), up to the window's, which max-height keeps it in. */
dialog.modal-dialog.tall {
  height: 720px;
}
@media (max-width: 700px) {   /* after the others, which it may also be */
  dialog.modal-dialog.full {
    inset: 0;
    width: 100%;
    height: 100%;
    max-width: none;
    max-height: none;
    margin: 0;
    /* The page runs to the screen's edges (viewport-fit=cover): its first line clear of the status bar, its buttons of
       the home indicator, and both of a notch at the side. */
    padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px);
    border: none;
    border-radius: 0;
  }
  dialog.modal-dialog.full:not(.reading) > div.body { /* a column, so a list in it can take the room and its buttons the bottom */
    display: flex;
    flex-direction: column;
  }
  dialog.modal-dialog.full.reading > div.body {
    padding: 18px;
  }
  dialog.modal-dialog.full.reading > div.head:not(.tab-strip) + div.body {
    padding-top: 0;
  }
}

h3 {
  margin: 0 0 4px;
  font-size: 16px;
  line-height: 18px; /* one height in every system font, so the × stays on its line */
}

p.sub {
  margin: 0 0 14px;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.45;
}

/* It fades in, over a backdrop fading in, unless it's in another's place: the dim it takes over stays (useModal). */
dialog.modal-dialog[open],
dialog.modal-dialog[open]:not([data-handover])::backdrop {
  transition: opacity 0.15s ease-out;
}
@starting-style {
  dialog.modal-dialog[open],
  dialog.modal-dialog[open]::backdrop {
    opacity: 0;
  }
}
</style>
