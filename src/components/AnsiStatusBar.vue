<script setup>
import { computed, onUpdated, ref, useTemplateRef } from 'vue';
import { useMediaQuery, useResizeObserver } from '@vueuse/core';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { getEffectiveColor } from '@/lib/PixelTransforms';
import { getTool } from '@/tools';
import { slotOf } from '@/lib/BitmapFont';
import { cp437Byte } from '@/lib/Cp437';
import { shortcut } from '@/lib/keyLabels';
import { useLayerName } from '@/composables/useLayerName';

// Under the ANSI and VECTOR views, starting with the picked layer's name, then following the tool: Edit
// Mode shows its cursor's cell (each attribute from the edit layer or the base) and the overwrite/insert/partial
// toggle; Select, the selection's size and place; the Color Picker, its last pick and where each color
// came from. On the right, with a mouse or trackpad, Space's pan (the Zoom tool's click and Alt-click too), or while a
// modifier's held, what it does with the tool (in the pixel view too); the rest is in the docs, for the room it takes. Zoomed
// out, the zoom, which goes back to 100%. Too narrow for one line, the character's code and the FG and BG hex codes give way first (each stays
// on its swatch's hover and in the text read out); still too narrow, the readout wraps a group at a time and only the
// buttons at the end scroll sideways, faded at the edge while there's more, by a plain mouse wheel too.
const { t } = useI18n();
const project = useProjectStore();
const workspace = useWorkspaceStore();
const layerName = useLayerName();
const layer = computed(() => layerName(workspace.shownPick));
const tool = computed(() => workspace.activeTool);
const sel = computed(() => workspace.selection);
const offset = computed(() => workspace.selectionOffset ?? { dc: 0, dr: 0 }); // while it's being dragged
const pick = computed(() => workspace.lastPick);
// A picked (stored) color as it shows: the swatch matches the canvas, the hex is what was picked.
const shown = (hex) => getEffectiveColor(hex, project, project.activePalette);
// The character's code, in decimal: its slot in the drawing's font, else its CP437 byte; none when it has neither.
const code = (char) => (project.drawingFont ? slotOf(char, project.drawingFont) : cp437Byte(char));

const cursor = computed(() => workspace.textCursor);
const cell = computed(() => cursor.value && project.cells[cursor.value.row * project.cols + cursor.value.col]);
const entry = computed(() => cursor.value && project.editCellAt(cursor.value.col, cursor.value.row));
const origin = (attr) => (entry.value?.[attr] !== undefined ? 'edit' : 'base');
// Room for the longer origin word, so moving the cursor doesn't change how the bar wraps (nor do Col, Row and Char,
// which keep room for their largest).
const originWidth = computed(() => `${Math.max(t('status.origin.edit').length, t('status.origin.base').length)}ch`);

const KEYS = { alt: shortcut('alt'), shift: shortcut('shift') };
const keyboard = useMediaQuery('(pointer: fine)');
// [key, what it does] pairs, or a sentence while a key is held.
const hint = computed(() => {
  const held = workspace.heldTool?.by;
  if (held === 'space') return t('status.panning');
  if (held === 'alt') return workspace.isShiftPressed ? t('status.pickingBg') : t('status.pickingFg', { shift: KEYS.shift });
  const current = getTool(tool.value);
  if (workspace.isShiftPressed) {
    const vector = tool.value === 'picker' && workspace.editorTab === 'vector';
    const shift = current?.altPicks || current?.shiftLines ? (current.shiftLines ? t('status.straightLine') : current.shiftHint?.(workspace))
      : vector ? t(workspace.vectorPickSlot.stroke ? 'status.pickFill' : 'status.pickStroke') : null;
    if (shift) return [[KEYS.shift, shift]];
  }
  if (workspace.isAltPressed && tool.value === 'vnode' && workspace.vectorPoints) return [[KEYS.alt, t('status.breakHandle')]];
  if (tool.value === 'zoom') {
    if (workspace.isAltPressed) return t('status.zoomingOut');
    return [[t('status.clickKey'), t('status.zoomIn')], [t('status.altClickKey', { alt: KEYS.alt }), t('status.zoomOut')], [t('status.spaceKey'), t('status.pan')]];
  }
  if (tool.value !== 'text' && tool.value !== 'hand') return [[t('status.spaceKey'), t('status.pan')]];
  return null;
});

// The zoom as shown; going back to 100% takes the button away, so the focus goes to the one beside it.
const percent = computed(() => Math.round(workspace.ansiZoom * 100));
const renderer = useTemplateRef('renderer');
const bar = useTemplateRef('bar'), strip = useTemplateRef('strip'), more = ref(false), tight = ref(false);
// Whether it all fits on one line with the hex codes shown: measured with them shown, so dropping them can't bring them
// straight back. Shown, they can make the strip short of anything to scroll, so its scroll is put back after.
function fitsWithHex(el, buttons) {
  const had = el.classList.contains('tight'), scrolled = buttons.scrollLeft;
  el.classList.remove('tight');
  const [first, ...rest] = [...el.children], line = first.getBoundingClientRect().bottom;
  const fits = buttons.scrollWidth <= buttons.clientWidth + 1 && rest.every((child) => child.getBoundingClientRect().top < line);
  if (had) el.classList.add('tight');
  buttons.scrollLeft = scrolled;
  return fits;
}
const measure = () => {
  const el = bar.value, buttons = strip.value;
  if (!el || !buttons) return;
  tight.value = !!el.querySelector('b.hex') && !fitsWithHex(el, buttons);
  more.value = buttons.scrollLeft + buttons.clientWidth < buttons.scrollWidth - 1;
};
// A plain wheel over the buttons scrolls them sideways while there's more (a trackpad's sideways swipe already does).
function wheel(e) {
  const el = strip.value;
  if (!el || e.deltaX || el.scrollWidth <= el.clientWidth) return;
  el.scrollLeft += e.deltaY * (e.deltaMode === 1 ? 16 : 1); // Firefox's wheel counts lines
  e.preventDefault();
}
// The bar, not the strip: dropping the hex codes resizes the strip, which would ask again in the same frame.
useResizeObserver(bar, measure);
onUpdated(measure);
const backTo100 = () => {
  workspace.setAnsiZoom(1);
  renderer.value?.focus();
};
</script>

<template>
  <footer ref="bar" class="ansi-status" :class="{ tight }">
    <span class="layer" role="group" :title="layer" :aria-label="t('status.layerAria', { name: layer })">{{ layer }}</span>
    <template v-if="tool === 'text'">
      <template v-if="cursor && cell">
        <span>Col <b class="col">{{ cursor.col + 1 }}</b> Row <b class="row">{{ cursor.row + 1 }}</b></span>
        <span>Char <b class="glyph">{{ cell.char === ' ' ? '␣' : cell.char }}</b><template v-if="code(cell.char) !== null"> <b class="code">{{ code(cell.char) }}</b></template> <span class="origin">{{ t(`status.origin.${origin('char')}`) }}</span></span>
        <span>FG <i class="swatch" :title="cell.fg.hex" :style="{ backgroundColor: cell.fg.hex }"></i><b class="hex">{{ cell.fg.hex }}</b> <span class="origin">{{ t(`status.origin.${origin('fg')}`) }}</span></span>
        <span>BG <i class="swatch" :title="cell.bg.hex" :style="{ backgroundColor: cell.bg.hex }"></i><b class="hex">{{ cell.bg.hex }}</b> <span class="origin">{{ t(`status.origin.${origin('bg')}`) }}</span></span>
      </template>
      <span v-else>{{ t('status.colRowEmpty') }}</span>
    </template>
    <template v-else-if="tool === 'select' && sel">
      <span>Selection <b>{{ sel.c1 - sel.c0 + 1 }} × {{ sel.r1 - sel.r0 + 1 }}</b></span>
      <span>at Col <b>{{ sel.c0 + offset.dc + 1 }}</b> Row <b>{{ sel.r0 + offset.dr + 1 }}</b></span>
    </template>
    <template v-else-if="tool === 'picker' && !workspace.pickSwapped && pick">
      <span>Picked Col <b class="col">{{ pick.col + 1 }}</b> Row <b class="row">{{ pick.row + 1 }}</b></span>
      <span>FG <i class="swatch" :title="pick.fg" :style="{ backgroundColor: shown(pick.fg) }"></i><b class="hex">{{ pick.fg }}</b> <span class="origin">{{ pick.fgFrom ? t(`status.origin.${pick.fgFrom}`) : '' }}</span></span>
      <span v-if="pick.bg">BG <i class="swatch" :title="pick.bg" :style="{ backgroundColor: shown(pick.bg) }"></i><b class="hex">{{ pick.bg }}</b> <span class="origin">{{ pick.bgFrom ? t(`status.origin.${pick.bgFrom}`) : '' }}</span></span>
    </template>
    <div ref="strip" class="strip" :class="{ more }" @scroll.passive="measure" @wheel="wheel">
      <span v-if="keyboard && hint" class="hint">
        <template v-if="typeof hint === 'string'">{{ hint }}</template>
        <template v-else v-for="([key, does], i) in hint" :key="key">{{ i ? ' · ' : '' }}<kbd>{{ key }}</kbd> {{ does }}</template>
      </span>
      <button
          v-if="percent !== 100"
          :title="t('status.zoomResetTitle')"
          :aria-label="t('status.zoomResetAria', { percent })"
          @click="backTo100"
      >{{ percent }}%</button>
      <button
          v-if="tool === 'text'"
          :title="t(`status.${workspace.typingMode}Title`, { key: shortcut('alt', 'Enter') })"
          @click="workspace.cycleTypingMode()"
      >{{ t(`status.${workspace.typingMode}`) }}</button>
      <button
          ref="renderer"
          :title="workspace.ansiRenderer === 'dom' ? t('status.domToCanvasTitle') : t('status.canvasToDomTitle')"
          @click="workspace.ansiRenderer = workspace.ansiRenderer === 'dom' ? 'canvas' : 'dom'"
      >{{ workspace.ansiRenderer === 'dom' ? t('status.canvas') : t('status.dom') }}</button>
      <button
          :class="{ on: workspace.smoothText }"
          :aria-pressed="workspace.smoothText"
          :title="workspace.smoothText ? t('status.smoothOnTitle') : t('status.smoothOffTitle')"
          @click="workspace.smoothText = !workspace.smoothText"
      >{{ t('status.smooth') }}</button>
    </div>
  </footer>
</template>

<style scoped>
/* Each readout group goes to the next line whole when it doesn't fit; the buttons take what's left of the last line
   and scroll sideways in it, without a scrollbar, like the toolbar's options row. */
footer.ansi-status {
  position: relative; /* a hex code given way is placed in it */
  cursor: default; /* its own: the brush's and eraser's hidden cursor is set on the viewport it sits in */
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 16px;
  padding: 4px 12px;
  background: var(--surface-1);
  color: var(--text-muted);
  font: 11px ui-monospace, Menlo, monospace;
  white-space: nowrap;
}

footer.ansi-status > * {
  flex-shrink: 0;
}

span.layer {
  max-width: 20ch;
  overflow: hidden;
  text-overflow: ellipsis;
}

div.strip {
  flex: 1 1 64px; /* stays on the last line with room for a button or so, and grows into the rest */
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}

div.strip::-webkit-scrollbar {
  display: none;
}

div.strip > * {
  flex-shrink: 0;
}

div.strip > :first-child {
  margin-left: auto; /* to the right while it fits */
}

div.strip.more {
  mask-image: linear-gradient(to left, transparent, #000 24px);
}

b.col,
b.row,
b.glyph,
span.origin {
  display: inline-block;
}

b.col {
  min-width: 3ch; /* 300 columns at most */
}

b.row {
  min-width: 4ch; /* 5,000 lines */
}

b.glyph {
  min-width: 2ch; /* a wide character */
}

span.origin {
  min-width: v-bind(originWidth);
}

b {
  color: var(--text-dim);
  font-weight: 500;
}

kbd {
  padding: 1px 5px;
  border-radius: 3px;
  background: var(--surface-3);
  color: var(--text-dim);
  font: inherit;
}

b.glyph {
  font-family: 'JetBrains Mono', monospace;
}

i.swatch {
  display: inline-block;
  width: 9px;
  height: 9px;
  margin: 0 4px -1px 0;
  border: 1px solid var(--border-light);
}

/* Too narrow for it all: the hex codes give way, out of sight but still in the text read out (and on the swatch's hover). */
footer.tight b.hex,
footer.tight b.code {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

footer.tight i.swatch {
  margin-right: 0;
}

button {
  padding: 2px 8px;
  border: none;
  border-radius: 3px;
  background: var(--surface-3);
  color: var(--text-dim);
  font: inherit;
  cursor: pointer;
}

/* A setting that's on (Smooth). */
button.on {
  background: var(--accent);
  color: var(--white);
}
</style>
