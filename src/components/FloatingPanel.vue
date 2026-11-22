<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, useTemplateRef, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMediaQuery } from '@vueuse/core';
import CloseButton from '@/components/CloseButton.vue';

// The frame a layer opening from the toolbar sits in (the character palette layer's): small, it floats under the
// toolbar's bottom right, or `left` px along it; `wide`, it grows to the big size, which on a smaller window is a dialog
// over the dimmed page and on a phone's width the whole window. Its first line holds the page's tabs, then a full screen
// button and, taking the whole window, a close button. A press outside closes it; Escape is the page's to hear.
defineOptions({ inheritAttrs: false }); // the parent's class and listeners go on the panel, not the scrim beside it
const props = defineProps({
  wide: Boolean,
  label: { type: String, default: '' },
  width: { type: Number, default: 300 },
  left: { type: Number, default: null },
  keep: { type: String, default: '' }, // a selector whose presses don't close it (its own toggle's)
});
const emit = defineEmits(['close']);
const { t } = useI18n();
const root = useTemplateRef('root');

// The small width and where along the toolbar it opens, as properties the styles read, so the big size and the
// dialog's inset still take over from them.
const place = computed(() => ({ '--panel-width': `${props.width}px`, ...(props.left === null ? {} : { '--panel-left': `${props.left}px` }) }));

// Wide on a smaller window, the layer is a dialog over the dimmed page, as the About dialog; on a phone's width, the
// whole window (the media queries below). Either way it has a close button.
const smallWindow = useMediaQuery('(max-width: 1000px), (max-height: 520px)');
const phoneWidth = useMediaQuery('(max-width: 700px)');
// Wide and short of the whole window, the layer can be made to take it (its full screen button), list still beside the
// editor; that holds until it closes.
const maximized = ref(false);
const canMaximize = computed(() => props.wide && !phoneWidth.value);
const fullScreen = computed(() => maximized.value && canMaximize.value);
const fullWindow = computed(() => props.wide && (smallWindow.value || fullScreen.value));
const dialog = computed(() => fullWindow.value && !phoneWidth.value && !fullScreen.value);
const stage = computed(() => (phoneWidth.value ? 'phone' : fullScreen.value ? 'full' : dialog.value ? 'dialog' : 'float')); // the Fonts page lays out its filters by it

// Becoming a dialog or the whole window (on a smaller window) grows out of where the layer floated, the page revealed
// by a clip from that box; coming back, the floating layer fades in. (A big window only widens it, by its transition.)
watch(() => props.wide, () => {
  const el = root.value;
  if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const from = el.getBoundingClientRect(), wasFull = getComputedStyle(el).position === 'fixed';
  nextTick(() => {
    const full = getComputedStyle(el).position === 'fixed', options = { duration: 250, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' };
    if (full && !wasFull) {
      const to = el.getBoundingClientRect(), px = (n) => `${Math.max(0, n)}px`;
      const box = `${px(from.top - to.top)} ${px(to.right - from.right)} ${px(to.bottom - from.bottom)} ${px(from.left - to.left)}`;
      el.animate([{ clipPath: `inset(${box} round 10px)` }, { clipPath: 'inset(0px 0px 0px 0px round 0px)' }], options);
    } else if (wasFull && !full) {
      el.animate([{ opacity: 0, transform: 'scale(0.98)' }, { opacity: 1, transform: 'none' }], { ...options, duration: 150 });
    }
  });
});

// A press outside closes it, but not its own toggle's (keep), nor a resize edge's (the side panel's: the layer follows it).
const onPointerDown = (event) => {
  if (root.value && !root.value.contains(event.target) && !event.target.closest(['[role="separator"]', props.keep].filter(Boolean).join(', '))) emit('close');
};
// A button that goes away once pressed (a page's, a menu's, the Fonts page's actions) takes the focus with it: this
// gives the keyboard back to the layer.
const keepKeys = () => nextTick(() => {
  if (root.value && !root.value.contains(document.activeElement)) root.value.focus();
});

onMounted(() => document.addEventListener('pointerdown', onPointerDown, true));
onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerDown, true));
defineExpose({ root, stage, keepKeys });
</script>

<template>
  <div v-if="dialog" class="scrim" aria-hidden="true"></div>
  <div ref="root" v-bind="$attrs" class="floating-panel" :class="{ editing: wide, maximized: fullScreen }" :style="place" tabindex="0" role="dialog" :aria-label="label">
    <div class="pages tab-strip">
      <slot name="tabs"/>
      <button v-if="canMaximize" class="maximize" :title="t(fullScreen ? 'palette.layer.exitFullScreen' : 'palette.layer.fullScreen')" :aria-label="t(fullScreen ? 'palette.layer.exitFullScreen' : 'palette.layer.fullScreen')" @click="maximized = !fullScreen; keepKeys()">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path :d="fullScreen ? 'M6 2v4H2M10 2v4h4M14 10h-4v4M2 10h4v4' : 'M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4'"/></svg>
      </button>
      <CloseButton v-if="fullWindow" class="dismiss" @click="emit('close')"/>
    </div>
    <slot/>
  </div>
</template>

<style scoped src="./tabStrip.css"></style>
<style scoped>
/* Opens from the toolbar's bottom right, inside its padding, or `left` px along it (right then gives way, the width
   being set). */
div.floating-panel {
  position: absolute;
  top: calc(100% + 2px);
  right: 10px;
  left: var(--panel-left, auto);
  z-index: 300;
  display: flex;
  flex-direction: column;
  width: var(--panel-width);
  max-width: calc(100% - 20px); /* never wider than the toolbar it opens from */
  max-height: min(560px, calc(100vh - 160px));
  background: var(--surface-1);
  border: 1px solid var(--accent);
  border-radius: 10px;
  box-shadow: 0 10px 34px color-mix(in srgb, var(--shadow) 65%, transparent);
  overflow: hidden;
  outline: none;
  transition: width 0.25s ease;
  font-size: 13px;
  color: var(--text);
}

div.floating-panel.editing {
  width: 940px;
}

/* The page's tabs over it (tabStrip.css, a dialog's too) and, at the row's right end, the full screen toggle and,
   taking the whole window, the close button (CloseButton), drawn alike. */
div.pages button.maximize {
  align-self: center;
  flex: none;
  display: flex;
  padding: 6px;
  border: none;
  box-shadow: none;
  background: none;
  color: var(--text-muted);
}

div.pages button.maximize:hover {
  color: var(--text);
}

div.pages button.maximize svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

div.pages button.dismiss {
  align-self: center;
}

/* Full screen: the whole window, on any window wider than a phone's (which has it already). */
div.floating-panel.editing.maximized {
  position: fixed;
  inset: 0;
  z-index: 5000;
  width: auto;
  height: auto;
  max-width: none;
  max-height: none;
  margin: 0;
  border: none;
  border-radius: 0;
  transition: none;
}

/* The rules below are the pages' (the Palettes page's, the Fonts page's): they reach into them (:deep). */
:deep(div.page) {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
}

/* While editing (and on the Fonts page), the list is a narrow column, a little wider than a palette's row of glyphs
   (they never wrap; long names do), so the editor gets the rest. */
div.floating-panel.editing :deep(div.list-side) {
  flex: 0 0 220px;
  min-width: 0;
}

/* Beside the Fonts page's details, its list gives way first (shrink weight 10 to their 1), down to 180px; its Filters
   column does the same (FontsPage). */
@media (min-width: 701px) {
  div.floating-panel.editing :deep(div.page.fonts > div.list-side) {
    flex: 0 10 220px;
    min-width: 180px;
  }
}

/* Full screen gives the Fonts page's list more room too (its Filters column widens itself). */
div.floating-panel.editing.maximized :deep(div.page.fonts > div.list-side) {
  flex-basis: 320px;
}

/* Editing wants 940px and up to 560px tall; a shorter window shrinks it (the glyph pane gives way first) until it
   can't fit. A smaller window makes it a dialog over the dimmed page, 20px clear of the edges as the About dialog
   (between, the slots narrow), and a phone's width the whole window, with the list above the editor. (smallWindow and
   phoneWidth, for the scrim and the close button, ask the same.) */
@media (max-width: 1000px), (max-height: 520px) {
  div.floating-panel.editing {
    position: fixed;
    inset: 20px;
    z-index: 5000;
    width: min(940px, calc(100vw - 40px));
    height: min(600px, calc(100vh - 40px));
    max-width: none;
    max-height: none;
    margin: auto;
    border-radius: 12px;
    transition: none;
  }

  div.scrim {
    position: fixed;
    inset: 0;
    z-index: 4999;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(2px);
    animation: scrim-in 0.25s ease-out;
  }
}

@keyframes scrim-in {
  from { opacity: 0; }
}

@media (max-width: 700px) {
  div.floating-panel.editing {
    inset: 0;
    width: auto;
    height: auto;
    margin: 0;
    border: none;
    border-radius: 0;
  }

  div.floating-panel.editing :deep(div.page) {
    flex-direction: column;
  }

  div.floating-panel.editing :deep(div.list-side) {
    flex: 1 1 300px;
    width: auto;
    max-height: 35vh;
    border-right: none;
    border-bottom: 1px solid var(--surface-3);
  }

  div.floating-panel.editing :deep(div.edit-side) {
    max-height: 65vh;
  }
}

:deep(div.list-side) {
  display: flex;
  flex-direction: column;
  flex: 1 1 300px;
  min-width: 260px;
  border-right: 1px solid var(--surface-3);
}

:deep(div.top) {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--surface-3);
}

/* The field and its buttons one height, an input's (global.css's 34px), so they line up. */
:deep(div.top input),
:deep(div.top button) {
  box-sizing: border-box;
  height: 34px;
}

:deep(div.top input) {
  flex: 1;
  min-width: 0;
  padding: 5px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
  font-size: 12px;
}

:deep(div.top button) {
  padding: 5px 10px;
  border: none;
  border-radius: 4px;
  background: var(--surface-3);
  color: var(--text-dim);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}

:deep(div.top button:hover) {
  background: var(--accent);
  color: var(--white);
}

:deep(div.list) {
  flex: 1;
  overflow-y: auto;
  padding: 6px 0;
}

:deep(div.group) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px 2px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-muted);
}

:deep(div.row) {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 12px;
  cursor: pointer;
  border-left: 2px solid transparent;
}

:deep(div.row:hover) {
  background: var(--surface-2);
}

:deep(div.row.current) {
  background: var(--surface-2);
}

:deep(div.row.active) {
  border-left-color: var(--accent);
}

:deep(div.name) {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text);
}

:deep(div.name em) {
  font-size: 9px;
  font-style: normal;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}

:deep(div.edit-side) {
  display: flex;
  flex-direction: column;
  flex: 2 1 600px;
  min-width: 0;
  padding: 12px 16px;
  gap: 10px;
}

:deep(div.head) {
  display: flex;
  align-items: center;
  gap: 10px;
}

:deep(span.title) {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
  padding: 2px 4px;
  border-radius: 4px;
  outline: none;
}

:deep(span.meta) {
  font-size: 12px;
  color: var(--text-muted);
}

:deep(button.ghost) {
  padding: 4px 8px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-dim);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

:deep(button.ghost:hover) {
  background: var(--surface-3);
  color: var(--text);
}

:deep(div.note) {
  font-size: 11px;
  color: var(--text-muted);
  padding: 2px 4px;
}

:deep(div.grid) {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(28px, 1fr));
  gap: 2px;
}

:deep(div.info) {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--text-dim);
  min-height: 16px;
}

:deep(.spacer) {
  flex: 1;
}
</style>
