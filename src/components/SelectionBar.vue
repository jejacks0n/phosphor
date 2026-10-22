<script setup>
import { computed } from 'vue';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';

// The floating actions under a selection. Its pointer events stay here, so clicking a button
// doesn't start a stroke on the canvas underneath.
const props = defineProps({
  rect: { type: Object, required: true }, // the selection
  style: { type: Object, required: true }, // where to sit (AnsiEditor positions it from the metrics)
});

const project = useProjectStore();
const workspace = useWorkspaceStore();
const size = computed(() => `${props.rect.c1 - props.rect.c0 + 1} × ${props.rect.r1 - props.rect.r0 + 1}`);

const copy = () => { workspace.cellClipboard = project.copyCells(props.rect); };
const cut = () => { workspace.cellClipboard = project.cutCells(props.rect); };
const paste = () => project.pasteCells(workspace.cellClipboard, props.rect.c0, props.rect.r0);
const fill = () => project.fillCells(props.rect, { char: workspace.activeChar, ...workspace.typingAttrs() });
</script>

<template>
  <div class="selection-bar" :style="style" @pointerdown.stop @mousedown.stop @touchstart.stop>
    <button title="Copy (Cmd/Ctrl+C)" @click="copy">Copy</button>
    <button title="Cut (Cmd/Ctrl+X)" @click="cut">Cut</button>
    <button title="Paste at the selection (Cmd/Ctrl+V)" :disabled="!workspace.cellClipboard" @click="paste">Paste</button>
    <button :title="`Fill with ${workspace.activeChar} in the colour pair`" @click="fill">Fill</button>
    <button class="hot" title="Freeze the image's cells here as authored" @click="project.bakeCells(rect)">Bake</button>
    <button title="Return these cells to the image" @click="project.releaseCellsIn(rect)">Release</button>
    <span>{{ size }}</span>
  </div>
</template>

<style scoped>
div.selection-bar {
  position: absolute;
  z-index: 1002;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  background: var(--surface-1);
  border: 1px solid var(--accent);
  border-radius: 6px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.6);
  font-size: 11px;
  white-space: nowrap;
  pointer-events: auto;
}

button {
  padding: 3px 7px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-dim);
  font-size: 11px;
  cursor: pointer;
}

button:hover:not(:disabled) {
  background: var(--surface-3);
}

button:disabled {
  opacity: 0.4;
  cursor: default;
}

button.hot {
  background: var(--accent);
  color: var(--white);
}

span {
  padding: 0 6px;
  color: var(--text-muted);
}
</style>
