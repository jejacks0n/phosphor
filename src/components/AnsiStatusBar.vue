<script setup>
import { computed } from 'vue';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { getEffectiveColor } from '@/lib/PixelTransforms';

// Under the ANSI view, following the tool: Edit Mode shows its cursor's cell (each attribute from the
// edit layer or the base) and the overwrite/insert toggle; Select, the selection's size and place; the
// Color Picker, its last pick and where each color came from. Other tools leave it empty.
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
    <button
        title="ANSI view renderer (trial): canvas or DOM"
        @click="workspace.ansiRenderer = workspace.ansiRenderer === 'dom' ? 'canvas' : 'dom'"
    >{{ workspace.ansiRenderer === 'dom' ? 'DOM' : 'Canvas' }}</button>
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
</style>
