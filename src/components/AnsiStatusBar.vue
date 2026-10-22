<script setup>
import { computed } from 'vue';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';

// Under the ANSI view: the Text tool's cursor, what's in that cell (each attribute authored or
// from the image), and the overwrite/insert toggle.
const project = useProjectStore();
const workspace = useWorkspaceStore();

const cursor = computed(() => workspace.textCursor);
const cell = computed(() => cursor.value && project.cells[cursor.value.row * project.cols + cursor.value.col]);
const entry = computed(() => cursor.value && project.cellEditAt(cursor.value.col, cursor.value.row));
const origin = (attr) => (entry.value?.[attr] !== undefined ? 'authored' : 'image');
</script>

<template>
  <footer class="ansi-status">
    <template v-if="cursor && cell">
      <span>Col <b>{{ cursor.col + 1 }}</b> Row <b>{{ cursor.row + 1 }}</b></span>
      <span>Char <b class="glyph">{{ cell.char === ' ' ? '␣' : cell.char }}</b> {{ origin('char') }}</span>
      <span>FG <i class="swatch" :style="{ backgroundColor: cell.fg.hex }"></i><b>{{ cell.fg.hex }}</b> {{ origin('fg') }}</span>
      <span>BG <i class="swatch" :style="{ backgroundColor: cell.bg.hex }"></i><b>{{ cell.bg.hex }}</b> {{ origin('bg') }}</span>
    </template>
    <span v-else>Col — Row —</span>
    <span class="spacer"></span>
    <button
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
