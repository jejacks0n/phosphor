<script setup>
import { ref, computed, watch } from 'vue';
import { useMediaQuery } from '@vueuse/core';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { TOOLS, getTool } from '@/tools';
import DropdownMenu from '@/components/DropdownMenu.vue';
import RangeField from '@/components/RangeField.vue';
import ColorPair from '@/components/ColorPair.vue';
import PaletteStrip from '@/components/PaletteStrip.vue';

const project = useProjectStore();
const workspace = useWorkspaceStore();

// The toolbar offers the tools that work in the current view (editorTab is 'input' or 'output' while editing),
// with a divider wherever the toolbar section changes.
const tools = computed(() => {
  const offered = TOOLS.filter(tool => tool.views.includes(workspace.editorTab) && (!tool.available || tool.available(project)));
  return offered.map((tool, i) => ({ tool, divider: i > 0 && (tool.section ?? 'draw') !== (offered[i - 1].section ?? 'draw') }));
});
const activeTool = computed(() => getTool(workspace.activeTool));
// A tool's options for the current view (an option may be for one view only).
const toolOptions = computed(() => (activeTool.value.options ?? []).filter(option => !option.views || option.views.includes(workspace.editorTab)));

// The pixel view's preview of the ANSI layer: authored cells drawn over the image at pixel scale.
const OVERLAY_SETTING = { key: 'ansiOverlay', label: 'ANSI overlay', title: 'ANSI layer opacity over the pixel view', min: 0, max: 100, unit: '%' };
// At 1100px and narrower the overlay controls fold into a button named for the art style.
const overlayFolded = useMediaQuery('(max-width: 1100px)');
const overlayRowOpen = ref(false);
const STYLE_NAMES = { ansi: 'ANSI', colorAscii: 'Color ASCII', ascii: 'ASCII' };
const styleName = computed(() => STYLE_NAMES[project.renderStyle] ?? 'ANSI');

// A tool that stops being offered (flip after switching to an ASCII art style) shouldn't stay active unseen.
watch(tools, (offered) => {
  if (!offered.some(({ tool }) => tool.id === workspace.activeTool)) workspace.setActiveTool('hand');
});

function confirmClear() {
  if (!project.hasEdits || confirm('Are you sure you want to clear all edits?')) {
    project.clearEditLayer();
  }
}

function confirmFlatten() {
  if (confirm('Apply all paint edits to the base image?')) {
    project.flattenEdits();
  }
}
</script>

<template>
  <article class="edit-toolbar">
    <div class="toolbar-row primary-row">
      <div class="color-group">
        <ColorPair/>
      </div>

      <div class="tool-group">
        <template v-for="{ tool, divider } in tools" :key="tool.id">
          <div v-if="divider" class="divider"/>
          <button
              :title="tool.title"
              :aria-label="tool.title"
              @click="workspace.setActiveTool(tool.id)"
              :class="{ active: workspace.activeTool === tool.id }"
              v-html="tool.icon"
          ></button>
        </template>
      </div>

      <div class="spacer"/>

      <template v-if="workspace.editorTab === 'input'">
        <!-- Narrow screens fold the overlay controls into a button that opens a row of their own. -->
        <button
            v-if="overlayFolded"
            class="text overlay-toggle"
            :class="{ open: overlayRowOpen }"
            :aria-expanded="overlayRowOpen"
            title="ANSI overlay settings"
            @click="overlayRowOpen = !overlayRowOpen"
        >{{ styleName }} <span class="caret">▾</span></button>
        <div v-else class="tool-setting-group overlay-group">
          <RangeField compact :setting="OVERLAY_SETTING" v-model="workspace.ansiOverlay"/>
          <label class="checkbox-wrapper" title="Preview every cell's characters, not just the ones you've authored">
            <span>All cells</span>
            <input type="checkbox" v-model="workspace.ansiOverlayAll"/>
          </label>
        </div>
      </template>

      <div class="desktop-only actions-container">
        <div class="history-group">
          <button
              title="Undo (Cmd+Z)"
              @click="project.undo"
              :disabled="!project.canUndo"
          ><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M88 256L232 256C241.7 256 250.5 250.2 254.2 241.2C257.9 232.2 255.9 221.9 249 215L202.3 168.3C277.6 109.7 386.6 115 455.8 184.2C530.8 259.2 530.8 380.7 455.8 455.7C380.8 530.7 259.3 530.7 184.3 455.7C174.1 445.5 165.3 434.4 157.9 422.7C148.4 407.8 128.6 403.4 113.7 412.9C98.8 422.4 94.4 442.2 103.9 457.1C113.7 472.7 125.4 487.5 139 501C239 601 401 601 501 501C601 401 601 239 501 139C406.8 44.7 257.3 39.3 156.7 122.8L105 71C98.1 64.2 87.8 62.1 78.8 65.8C69.8 69.5 64 78.3 64 88L64 232C64 245.3 74.7 256 88 256z"/></svg></button>
          <button
              title="Redo (Cmd+Shift+Z)"
              @click="project.redo"
              :disabled="!project.canRedo"
          ><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M552 256L408 256C398.3 256 389.5 250.2 385.8 241.2C382.1 232.2 384.1 221.9 391 215L437.7 168.3C362.4 109.7 253.4 115 184.2 184.2C109.2 259.2 109.2 380.7 184.2 455.7C259.2 530.7 380.7 530.7 455.7 455.7C463.9 447.5 471.2 438.8 477.6 429.6C487.7 415.1 507.7 411.6 522.2 421.7C536.7 431.8 540.2 451.8 530.1 466.3C521.6 478.5 511.9 490.1 501 501C401 601 238.9 601 139 501C39.1 401 39 239 139 139C233.3 44.7 382.7 39.4 483.3 122.8L535 71C541.9 64.1 552.2 62.1 561.2 65.8C570.2 69.5 576 78.3 576 88L576 232C576 245.3 565.3 256 552 256z"/></svg></button>
        </div>

        <button
            title="Merge layers into original image"
            @click="confirmFlatten"
            class="primary"
            :disabled="!project.hasPaint"
        ><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M296.5 69.2C311.4 62.3 328.6 62.3 343.5 69.2L562.1 170.2C570.6 174.1 576 182.6 576 192C576 201.4 570.6 209.9 562.1 213.8L343.5 314.8C328.6 321.7 311.4 321.7 296.5 314.8L77.9 213.8C69.4 209.8 64 201.3 64 192C64 182.7 69.4 174.1 77.9 170.2L296.5 69.2zM112.1 282.4L276.4 358.3C304.1 371.1 336 371.1 363.7 358.3L528 282.4L562.1 298.2C570.6 302.1 576 310.6 576 320C576 329.4 570.6 337.9 562.1 341.8L343.5 442.8C328.6 449.7 311.4 449.7 296.5 442.8L77.9 341.8C69.4 337.8 64 329.3 64 320C64 310.7 69.4 302.1 77.9 298.2L112 282.4zM77.9 426.2L112 410.4L276.3 486.3C304 499.1 335.9 499.1 363.6 486.3L527.9 410.4L562 426.2C570.5 430.1 575.9 438.6 575.9 448C575.9 457.4 570.5 465.9 562 469.8L343.4 570.8C328.5 577.7 311.3 577.7 296.4 570.8L77.9 469.8C69.4 465.8 64 457.3 64 448C64 438.7 69.4 430.1 77.9 426.2z"/></svg></button>
        <button
            title="Clear all edits"
            @click="confirmClear"
            class="primary"
            :disabled="!project.hasEdits"
        ><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M431.2 476.5L163.5 208.8C141.1 240.2 128 278.6 128 320C128 426 214 512 320 512C361.5 512 399.9 498.9 431.2 476.5zM476.5 431.2C498.9 399.8 512 361.4 512 320C512 214 426 128 320 128C278.5 128 240.1 141.1 208.8 163.5L476.5 431.2zM64 320C64 178.6 178.6 64 320 64C461.4 64 576 178.6 576 320C576 461.4 461.4 576 320 576C178.6 576 64 461.4 64 320z"/></svg></button>
      </div>

      <div class="mobile-only">
        <DropdownMenu label="Actions">
          <button @click="project.undo" :disabled="!project.canUndo">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
              <path d="M88 256L232 256C241.7 256 250.5 250.2 254.2 241.2C257.9 232.2 255.9 221.9 249 215L202.3 168.3C277.6 109.7 386.6 115 455.8 184.2C530.8 259.2 530.8 380.7 455.8 455.7C380.8 530.7 259.3 530.7 184.3 455.7C174.1 445.5 165.3 434.4 157.9 422.7C148.4 407.8 128.6 403.4 113.7 412.9C98.8 422.4 94.4 442.2 103.9 457.1C113.7 472.7 125.4 487.5 139 501C239 601 401 601 501 501C601 401 601 239 501 139C406.8 44.7 257.3 39.3 156.7 122.8L105 71C98.1 64.2 87.8 62.1 78.8 65.8C69.8 69.5 64 78.3 64 88L64 232C64 245.3 74.7 256 88 256z"/>
            </svg>
            Undo
          </button>
          <button @click="project.redo" :disabled="!project.canRedo">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
              <path d="M552 256L408 256C398.3 256 389.5 250.2 385.8 241.2C382.1 232.2 384.1 221.9 391 215L437.7 168.3C362.4 109.7 253.4 115 184.2 184.2C109.2 259.2 109.2 380.7 184.2 455.7C259.2 530.7 380.7 530.7 455.7 455.7C463.9 447.5 471.2 438.8 477.6 429.6C487.7 415.1 507.7 411.6 522.2 421.7C536.7 431.8 540.2 451.8 530.1 466.3C521.6 478.5 511.9 490.1 501 501C401 601 238.9 601 139 501C39.1 401 39 239 139 139C233.3 44.7 382.7 39.4 483.3 122.8L535 71C541.9 64.1 552.2 62.1 561.2 65.8C570.2 69.5 576 78.3 576 88L576 232C576 245.3 565.3 256 552 256z"/>
            </svg>
            Redo
          </button>
          <button @click="confirmFlatten" :disabled="!project.hasPaint">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
              <path d="M296.5 69.2C311.4 62.3 328.6 62.3 343.5 69.2L562.1 170.2C570.6 174.1 576 182.6 576 192C576 201.4 570.6 209.9 562.1 213.8L343.5 314.8C328.6 321.7 311.4 321.7 296.5 314.8L77.9 213.8C69.4 209.8 64 201.3 64 192C64 182.7 69.4 174.1 77.9 170.2L296.5 69.2zM112.1 282.4L276.4 358.3C304.1 371.1 336 371.1 363.7 358.3L528 282.4L562.1 298.2C570.6 302.1 576 310.6 576 320C576 329.4 570.6 337.9 562.1 341.8L343.5 442.8C328.6 449.7 311.4 449.7 296.5 442.8L77.9 341.8C69.4 337.8 64 329.3 64 320C64 310.7 69.4 302.1 77.9 298.2L112 282.4zM77.9 426.2L112 410.4L276.3 486.3C304 499.1 335.9 499.1 363.6 486.3L527.9 410.4L562 426.2C570.5 430.1 575.9 438.6 575.9 448C575.9 457.4 570.5 465.9 562 469.8L343.4 570.8C328.5 577.7 311.3 577.7 296.4 570.8L77.9 469.8C69.4 465.8 64 457.3 64 448C64 438.7 69.4 430.1 77.9 426.2z"/>
            </svg>
            Merge Layers
          </button>
          <button @click="confirmClear" :disabled="!project.hasEdits">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
              <path d="M431.2 476.5L163.5 208.8C141.1 240.2 128 278.6 128 320C128 426 214 512 320 512C361.5 512 399.9 498.9 431.2 476.5zM476.5 431.2C498.9 399.8 512 361.4 512 320C512 214 426 128 320 128C278.5 128 240.1 141.1 208.8 163.5L476.5 431.2zM64 320C64 178.6 178.6 64 320 64C461.4 64 576 178.6 576 320C576 461.4 461.4 576 320 576C178.6 576 64 461.4 64 320z"/>
            </svg>
            Clear Edits
          </button>
        </DropdownMenu>
      </div>
    </div>

    <div v-if="workspace.editorTab === 'input' && overlayFolded && overlayRowOpen" class="toolbar-row secondary-row">
      <div class="tool-setting-group overlay-group">
        <RangeField compact :setting="OVERLAY_SETTING" v-model="workspace.ansiOverlay"/>
        <label class="checkbox-wrapper" title="Preview every cell's characters, not just the ones you've authored">
          <span>All cells</span>
          <input type="checkbox" v-model="workspace.ansiOverlayAll"/>
        </label>
      </div>
    </div>

    <div class="toolbar-row secondary-row" v-if="activeTool.options || activeTool.palette || activeTool.id === 'select'">
      <PaletteStrip v-if="activeTool.palette"/>
      <div v-if="activeTool.id === 'select'" class="tool-setting-group">
        <span class="hint">{{ workspace.selection ? 'Drag inside the selection to move it' : 'Drag to select cells, or for the whole canvas:' }}</span>
        <template v-if="!workspace.selection">
          <button class="text" title="Freeze every image cell as authored" @click="project.bakeCells(null)">Bake all</button>
          <button class="text" title="Return every authored cell to the image" @click="project.releaseCellsIn(null)">Release all</button>
        </template>
      </div>
      <div v-if="activeTool.options" class="tool-setting-group">
        <template v-for="(option, i) in toolOptions" :key="option.key">
          <div v-if="i > 0" class="divider"/>
          <label v-if="option.type === 'checkbox'" class="checkbox-wrapper">
            <span>{{ option.label }}</span>
            <input type="checkbox" v-model="workspace[option.key]"/>
          </label>
          <div v-else-if="option.type === 'segmented'" class="segmented" role="group" :aria-label="option.label">
            <button
                v-for="choice in option.choices"
                :key="String(choice.value)"
                :class="{ on: workspace[option.key] === choice.value }"
                @click="workspace[option.key] = choice.value"
            >{{ choice.label }}</button>
          </div>
          <RangeField v-else compact :setting="option" v-model="workspace[option.key]"/>
        </template>
      </div>
    </div>
  </article>
</template>

<style scoped>
article.edit-toolbar {
  display: flex;
  flex-direction: column;
  background: var(--surface-1);
  min-height: 70px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

div.toolbar-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
}

div.secondary-row {
  padding: 0 10px 4px;
  gap: 12px;
}

div.tool-group,
div.color-group,
div.history-group,
div.actions-container {
  display: flex;
  align-items: center;
  gap: 3px;
  user-select: none;
}

div.history-group {
  margin-right: 4px;
}

div.segmented {
  display: flex;
  gap: 2px;
}

div.segmented button {
  width: auto;
  padding: 3px 8px;
  font-size: 11px;
  color: var(--text-dim);
}

div.segmented button.on {
  background: var(--accent);
  color: var(--white);
}

span.hint {
  font-size: 12px;
  color: var(--text-muted);
}

button.text {
  width: auto;
  padding: 4px 10px;
  font-size: 12px;
  color: var(--text-dim);
}

button.overlay-toggle {
  margin-right: 12px;
  white-space: nowrap;
}

button.overlay-toggle .caret {
  display: inline-block;
  transition: transform 0.15s;
}

button.overlay-toggle.open {
  background: var(--accent);
  color: var(--white);
}

button.overlay-toggle.open .caret {
  transform: rotate(180deg);
}

div.overlay-group {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-right: 12px;
}

div.overlay-group :deep(label),
div.overlay-group span {
  white-space: nowrap;
}

div.tool-setting-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

div.tool-setting-group :deep(label) {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-muted);
  user-select: none;
}

div.tool-setting-group :deep(input[type=range]) {
  width: 80px;
  accent-color: var(--accent);
}

label.checkbox-wrapper {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-muted);
  user-select: none;
}

div.divider {
  width: 1px;
  height: 18px;
  background: var(--border);
  margin: 0 2px;
  flex-shrink: 0;
}

div.spacer {
  flex: 1;
}

button {
  padding: 3px 8px;
  border-radius: 3px;
  border: 1px solid var(--border);
}

button :deep(svg) {
  fill: var(--text-faint);
  width: 16px;
  height: 16px;
  display: block;
}

button:hover :deep(svg) {
  fill: var(--text);
}

button.primary :deep(svg) {
  fill: var(--text);
}

button.primary:hover {
  background: var(--surface-light);
  border-color: var(--surface-light);
}

button.primary:hover :deep(svg) {
  fill: var(--text-inverted);
}

button.active {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--white);
}

button.active :deep(svg) {
  fill: var(--white);
}

button:disabled {
  opacity: 0.35;
}

div.mobile-only {
  display: none;
}

@media (max-width: 768px) {
  div.desktop-only {
    display: none;
  }

  div.mobile-only {
    display: block;

    svg {
      display: initial;
      position: relative;
      top: 0.2em;
    }
  }
}
</style>
