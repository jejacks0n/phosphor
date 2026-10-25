<script setup>
import { computed } from 'vue';
import { useMediaQuery } from '@vueuse/core';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { getEffectiveColor } from '@/lib/PixelTransforms';
import { getTool } from '@/tools';
import { shortcut } from '@/lib/keyLabels';

// Under the ANSI view, following the tool: Edit Mode shows its cursor's cell (each attribute from the
// edit layer or the base) and the overwrite/insert toggle; Select, the selection's size and place; the
// Color Picker, its last pick and where each color came from. On the right, with a mouse or trackpad,
// the held-key shortcuts for the tool (they work in the pixel view too; this is where they're taught),
// or what a held key is doing.
const project = useProjectStore();
const workspace = useWorkspaceStore();
const tool = computed(() => workspace.activeTool);
const sel = computed(() => workspace.selection);
const offset = computed(() => workspace.selectionOffset ?? { dc: 0, dr: 0 }); // while it's being dragged
const pick = computed(() => workspace.lastPick);
// A picked (stored) color as it shows: the swatch matches the canvas, the hex is what was picked.
const shown = (hex) => getEffectiveColor(hex, project, project.activePalette);

const cursor = computed(() => workspace.textCursor);
const cell = computed(() => cursor.value && project.cells[cursor.value.row * project.cols + cursor.value.col]);
const entry = computed(() => cursor.value && project.editCellAt(cursor.value.col, cursor.value.row));
const origin = (attr) => (entry.value?.[attr] !== undefined ? 'edit' : 'base');

const KEYS = { alt: shortcut('alt'), altShift: shortcut('alt', 'shift'), shift: shortcut('shift') };
const keyboard = useMediaQuery('(pointer: fine)');
// [key, what it does] pairs, or a sentence while a key is held.
const hint = computed(() => {
  const held = workspace.heldTool?.by;
  if (held === 'space') return 'Panning';
  if (held === 'alt') return workspace.isShiftPressed ? 'Picking the background color' : `Picking the foreground color · add ${KEYS.shift} for the background`;
  if (getTool(tool.value)?.altPicks) return [[KEYS.alt, 'pick color'], [KEYS.altShift, 'pick background'], ['Space', 'pan']];
  if (tool.value !== 'text' && tool.value !== 'hand') return [['Space', 'pan']];
  return null;
});
</script>

<template>
  <footer class="ansi-status">
    <template v-if="tool === 'text'">
      <template v-if="cursor && cell">
        <span>Col <b>{{ cursor.col + 1 }}</b> Row <b>{{ cursor.row + 1 }}</b></span>
        <span>Char <b class="glyph">{{ cell.char === ' ' ? '␣' : cell.char }}</b> {{ origin('char') }}</span>
        <span>FG <i class="swatch" :style="{ backgroundColor: cell.fg.hex }"></i><b>{{ cell.fg.hex }}</b> {{ origin('fg') }}</span>
        <span>BG <i class="swatch" :style="{ backgroundColor: cell.bg.hex }"></i><b>{{ cell.bg.hex }}</b> {{ origin('bg') }}</span>
      </template>
      <span v-else>Col — Row —</span>
    </template>
    <template v-else-if="tool === 'select' && sel">
      <span>Selection <b>{{ sel.c1 - sel.c0 + 1 }} × {{ sel.r1 - sel.r0 + 1 }}</b></span>
      <span>at Col <b>{{ sel.c0 + offset.dc + 1 }}</b> Row <b>{{ sel.r0 + offset.dr + 1 }}</b></span>
    </template>
    <template v-else-if="tool === 'picker' && !workspace.pickSwapped && pick">
      <span>Picked Col <b>{{ pick.col + 1 }}</b> Row <b>{{ pick.row + 1 }}</b></span>
      <span>FG <i class="swatch" :style="{ backgroundColor: shown(pick.fg) }"></i><b>{{ pick.fg }}</b> {{ pick.fgFrom }}</span>
      <span v-if="pick.bg">BG <i class="swatch" :style="{ backgroundColor: shown(pick.bg) }"></i><b>{{ pick.bg }}</b> {{ pick.bgFrom }}</span>
    </template>
    <span class="spacer"></span>
    <span v-if="keyboard && hint" class="hint">
      <template v-if="typeof hint === 'string'">{{ hint }}</template>
      <template v-else v-for="([key, does], i) in hint" :key="key">{{ i ? ' · ' : '' }}<kbd>{{ key }}</kbd> {{ does }}</template>
    </span>
    <button
        :title="`Switch the ANSI view to its ${workspace.ansiRenderer === 'dom' ? 'canvas' : 'DOM'} renderer (trial)`"
        @click="workspace.ansiRenderer = workspace.ansiRenderer === 'dom' ? 'canvas' : 'dom'"
    >{{ workspace.ansiRenderer === 'dom' ? 'Canvas' : 'DOM' }}</button>
    <button
        :class="{ on: workspace.smoothText }"
        :aria-pressed="workspace.smoothText"
        :title="workspace.smoothText ? 'Smooth text (anti-aliased): on' : 'Smooth text (anti-aliased): off, every pixel the cell\'s colors'"
        @click="workspace.smoothText = !workspace.smoothText"
    >Smooth</button>
    <button
        v-if="tool === 'text'"
        :title="workspace.insertMode ? 'Insert: typing pushes the row right (Insert key)' : 'Overwrite: typing replaces the cell (Insert key)'"
        @click="workspace.insertMode = !workspace.insertMode"
    >{{ workspace.insertMode ? 'Insert' : 'Overwrite' }}</button>
  </footer>
</template>

<style scoped>
footer.ansi-status {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 4px 12px;
  background: var(--surface-1);
  color: var(--text-muted);
  font: 11px ui-monospace, Menlo, monospace;
  white-space: nowrap;
  overflow: hidden;
}

b {
  color: var(--text-dim);
  font-weight: 500;
}

span.hint {
  overflow: hidden;
  text-overflow: ellipsis;
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

.spacer {
  flex: 1;
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
