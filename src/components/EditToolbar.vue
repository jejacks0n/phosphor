<script setup>
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue';
import { useMediaQuery, useResizeObserver } from '@vueuse/core';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { TOOLS, getTool } from '@/tools';
import DropdownMenu from '@/components/DropdownMenu.vue';
import RangeField from '@/components/RangeField.vue';
import ColorPair from '@/components/ColorPair.vue';
import PaletteStrip from '@/components/PaletteStrip.vue';
import LayerToggles from '@/components/LayerToggles.vue';
import ToggleGroup from '@/components/ToggleGroup.vue';
import ChoiceDialog from '@/components/ChoiceDialog.vue';
import { copySelection as copyToClipboards } from '@/composables/clipboard';

const project = useProjectStore();
const workspace = useWorkspaceStore();

// The toolbar offers the tools that work in the current view (editorTab is 'input' or 'output' while editing),
// with a divider wherever the toolbar section changes.
const tools = computed(() => {
  const offered = TOOLS.filter(tool => tool.views.includes(workspace.editorTab) && (!tool.available || tool.available(project)));
  return offered.map((tool, i) => ({ tool, divider: i > 0 && (tool.section ?? 'draw') !== (offered[i - 1].section ?? 'draw') }));
});
const activeTool = computed(() => getTool(workspace.activeTool));

// Tools that don't fit the row move into the ⋯ menu after the last one that does. All of them stay
// in the row (clipped), so it always knows their full width. The room for tools is the tool group
// plus the spacer after it (plus the menu's own slot while it's showing).
const toolBox = useTemplateRef('toolBox');
const toolSpacer = useTemplateRef('toolSpacer');
const moreMenu = useTemplateRef('moreMenu');
const hiddenTools = ref([]);
const toolsWidth = ref(null); // the group's width while some tools are hidden: up to the last shown
const MORE_GAP = 6;           // the row's gap
function fitTools() {
  const box = toolBox.value, spacer = toolSpacer.value;
  if (!box || !spacer) return;
  const items = [...box.children];
  const right = (el) => el.offsetLeft + el.offsetWidth;
  const moreSlot = (moreMenu.value?.$el.offsetWidth || 34) + MORE_GAP;
  const room = box.clientWidth + spacer.offsetWidth + (hiddenTools.value.length ? moreSlot : 0);
  if (!items.length || right(items.at(-1)) <= room) {
    hiddenTools.value = [];
    toolsWidth.value = null;
    return;
  }
  const shown = items.filter(el => right(el) <= room - moreSlot);
  hiddenTools.value = items.filter(el => el.dataset.tool && !shown.includes(el)).map(el => el.dataset.tool);
  const lastTool = shown.filter(el => el.dataset.tool).at(-1);
  toolsWidth.value = lastTool ? right(lastTool) : 0;
}
useResizeObserver([toolBox, toolSpacer], fitTools);
watch(() => tools.value.length, () => nextTick(fitTools));
const moreTools = computed(() => tools.value.filter(({ tool }) => hiddenTools.value.includes(tool.id)).map(({ tool }) => tool));
const MORE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M96 320a56 56 0 1 1 112 0a56 56 0 1 1-112 0zm168 0a56 56 0 1 1 112 0a56 56 0 1 1-112 0zm224-56a56 56 0 1 1 0 112a56 56 0 1 1 0-112z"/></svg>';
// A tool's options for the current view (an option may be for one view only).
const toolOptions = computed(() => (activeTool.value.options ?? []).filter(option =>
  (!option.views || option.views.includes(workspace.editorTab)) && (!option.when || option.when(workspace))));

// The actions on the Select tool's selection (one undo step each), on its chosen layers.
const copySelection = () => copyToClipboards(project, workspace, workspace.selection, workspace.selectLayers);
const cutSelection = () => {
  copySelection();
  project.deleteSelection(workspace.selection, workspace.selectLayers);
};
const pasteSelection = () => {
  const sel = workspace.selection;
  workspace.selection = project.pasteSelection(workspace.clipboard, sel.c0, sel.r0) ?? sel;
};

// A dropdown's choices on offer right now, and the one it shows: the setting's own choice, or when
// that isn't on offer, the choice the tool draws instead.
const offered = (option) => option.choices.filter(c => !c.when || c.when(workspace));
const shownChoice = (option) => {
  const current = option.choices.find(c => c.value === workspace[option.key]), list = offered(option);
  return list.includes(current) ? current : list.find(c => c.value === current?.instead) ?? current;
};

// The pixel view's preview of the ANSI layer: edit cells drawn over the image at pixel scale.
const OVERLAY_SETTING = { key: 'ansiOverlay', label: 'Overlay', title: 'ANSI layer opacity over the pixel view', min: 0, max: 100, unit: '%' };
// At 1100px and narrower the overlay controls fold into a dropdown named for the art style (like the
// Actions dropdown), which opens them in a small floating toolbar under it.
const overlayFolded = useMediaQuery('(max-width: 1100px)');
const STYLE_NAMES = { ansi: 'ANSI', colorAscii: 'Color ASCII', ascii: 'ASCII' };
const styleName = computed(() => STYLE_NAMES[project.renderStyle] ?? 'ANSI');

// A tool that stops being offered (flip after switching to an ASCII art style) shouldn't stay active unseen.
watch(tools, (offered) => {
  if (!offered.some(({ tool }) => tool.id === workspace.activeTool)) workspace.setActiveTool('hand');
});

function confirmClear() {
  if (!project.hasEdits || confirm('Clear the edit layer? Everything drawn (typed, painted and pasted) is removed.')) {
    project.clearEditLayer();
  }
}

// Merge down asks how (MergeDialog): exactly, or into the picture. rect: a selection's, or null for
// the whole edit layer.
const merging = ref(null); // { rect } while the dialog is open
function openMerge(rect = null) {
  merging.value = { rect };
}
function merge(kind) {
  const { rect } = merging.value;
  merging.value = null;
  if (kind === 'exact') project.mergeDown(rect);
  else project.mergeIntoPicture(rect);
}
const MERGE_CHOICES = [
  { id: 'exact', title: 'Exactly as is', text: "Stays crisp, cell for cell, as it shows now. Effects like Edges and Sharpen don't touch it." },
  { id: 'picture', title: 'Into the image', text: 'Becomes part of the image itself, so every effect applies to it, live, like the photo.' },
];
const ORIGINAL_NOTE = 'The picture becomes the working-size copy the preview is made from (like Bake), so growing the grid later works from that, and effects like Edges can shift slightly across the picture this first time.';
const mergeChoices = computed(() => (project.pictureIsOriginal ? [MERGE_CHOICES[0], { ...MERGE_CHOICES[1], note: ORIGINAL_NOTE }] : MERGE_CHOICES));

// Bake under CGA or VGA asks whether to lock the picture to the palette (exact, but the in-between
// colors are gone) or keep full color (a few cells near palette boundaries can tip). Other
// palettes bake exactly either way.
const baking = ref(null); // the palette's name while the dialog is open
function bake() {
  const palette = { cga: 'CGA', vga: 'VGA' }[project.quantize];
  if (palette) baking.value = palette;
  else project.bake();
}
const bakeChoices = computed(() => [
  { id: 'full', title: 'Keep full color', text: `The picture keeps its in-between colors, so switching the palette later still has them. A few cells near the edges between ${baking.value} colors may change, more with many sliders on.` },
  { id: 'lock', title: `Lock to the ${baking.value} palette`, text: `Nothing on the canvas changes. The picture keeps only the ${baking.value} colors, so switching to full color later won't bring the in-between shades back (undo will).` },
]);
function chooseBake(id) {
  baking.value = null;
  project.bake({ lockPalette: id === 'lock' });
}

// The selection's Merge down: only when something's drawn inside it.
const selectionHasEdits = computed(() => {
  void project.editCells; void project.hasPaint; void project.historyVersion; // re-check after edits
  return !!workspace.selection && project.hasEditsIn(workspace.selection);
});
</script>

<template>
  <ChoiceDialog
      v-if="merging"
      :title="merging.rect ? 'Merge the selection down' : 'Merge the edit layer down'"
      :sub="merging.rect
        ? 'Only what\'s drawn inside the selection moves into the base layer; the rest of the edit layer stays where it is.'
        : 'Everything you\'ve drawn moves into the base layer. Select how you want it to be merged:'"
      :choices="mergeChoices"
      @choose="merge"
      @cancel="merging = null"
  />
  <ChoiceDialog
      v-if="baking"
      :title="`Bake with the ${baking} palette`"
      sub="The picture as it looks now becomes the image, and the sliders go back to neutral. How should it keep its colors?"
      :choices="bakeChoices"
      @choose="chooseBake"
      @cancel="baking = null"
  />
  <article class="edit-toolbar">
    <div class="toolbar-row primary-row">
      <div class="color-group">
        <ColorPair/>
      </div>

      <div ref="toolBox" class="tool-group" :style="{ maxWidth: toolsWidth === null ? null : `${toolsWidth}px` }">
        <template v-for="{ tool, divider } in tools" :key="tool.id">
          <div v-if="divider" class="divider"/>
          <button
              :data-tool="tool.id"
              :tabindex="hiddenTools.includes(tool.id) ? -1 : null"
              :title="tool.title"
              :aria-label="tool.title"
              @click="workspace.setActiveTool(tool.id)"
              :class="{ active: workspace.activeTool === tool.id }"
              v-html="tool.icon"
          ></button>
        </template>
      </div>
      <DropdownMenu
          v-if="moreTools.length"
          ref="moreMenu"
          class="tools-menu"
          :class="{ 'holds-active': hiddenTools.includes(workspace.activeTool) }"
          label="More tools"
          align="left"
      >
        <template #trigger><span v-html="MORE_ICON"></span></template>
        <button v-for="tool in moreTools" :key="tool.id" class="choice" :class="{ on: workspace.activeTool === tool.id }" @click="workspace.setActiveTool(tool.id)">
          <span class="tool-icon" v-html="tool.icon"></span><span>{{ tool.title }}</span>
        </button>
      </DropdownMenu>

      <div ref="toolSpacer" class="spacer"/>

      <template v-if="workspace.editorTab === 'input'">
        <!-- Narrow screens fold the overlay controls into a button that opens a row of their own. -->
        <DropdownMenu v-if="overlayFolded" class="overlay-menu" :label="styleName" :close-on-select="false">
          <div class="tool-setting-group overlay-group overlay-panel" aria-label="ANSI overlay">
            <RangeField compact :setting="OVERLAY_SETTING" v-model="workspace.ansiOverlay"/>
            <label class="checkbox-wrapper" title="Preview every cell's characters, not just the edit cells">
              <span>All cells</span>
              <input type="checkbox" v-model="workspace.ansiOverlayAll"/>
            </label>
          </div>
        </DropdownMenu>
        <div v-else class="tool-setting-group overlay-group">
          <RangeField compact :setting="OVERLAY_SETTING" v-model="workspace.ansiOverlay"/>
          <label class="checkbox-wrapper" title="Preview every cell's characters, not just the edit cells">
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
            title="Bake: the picture as it looks now becomes the image, and the Transforms, Adjustments and Image Filters sliders go back to neutral. Your drawing keeps its colors; undo brings the original back."
            @click="bake"
            class="primary"
            :disabled="!project.canBake"
        ><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M320 64C346 152 464 216 464 376C464 480 400 568 320 568C240 568 176 480 176 376C176 304 214 254 248 214C254 274 280 308 312 318C292 230 296 136 320 64zM320 480C362 480 392 446 392 404C392 356 356 330 340 288C318 324 280 344 280 400C280 446 292 480 320 480z"/></svg></button>
        <button
            title="Merge Down: Merges the edit layer into the base layer."
            @click="openMerge()"
            class="primary"
            :disabled="!project.hasEdits"
        ><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M296.5 69.2C311.4 62.3 328.6 62.3 343.5 69.2L562.1 170.2C570.6 174.1 576 182.6 576 192C576 201.4 570.6 209.9 562.1 213.8L343.5 314.8C328.6 321.7 311.4 321.7 296.5 314.8L77.9 213.8C69.4 209.8 64 201.3 64 192C64 182.7 69.4 174.1 77.9 170.2L296.5 69.2zM112.1 282.4L276.4 358.3C304.1 371.1 336 371.1 363.7 358.3L528 282.4L562.1 298.2C570.6 302.1 576 310.6 576 320C576 329.4 570.6 337.9 562.1 341.8L343.5 442.8C328.6 449.7 311.4 449.7 296.5 442.8L77.9 341.8C69.4 337.8 64 329.3 64 320C64 310.7 69.4 302.1 77.9 298.2L112 282.4zM77.9 426.2L112 410.4L276.3 486.3C304 499.1 335.9 499.1 363.6 486.3L527.9 410.4L562 426.2C570.5 430.1 575.9 438.6 575.9 448C575.9 457.4 570.5 465.9 562 469.8L343.4 570.8C328.5 577.7 311.3 577.7 296.4 570.8L77.9 469.8C69.4 465.8 64 457.3 64 448C64 438.7 69.4 430.1 77.9 426.2z"/></svg></button>
        <button
            title="Clear edit layer"
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
          <button @click="bake" :disabled="!project.canBake">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M320 64C346 152 464 216 464 376C464 480 400 568 320 568C240 568 176 480 176 376C176 304 214 254 248 214C254 274 280 308 312 318C292 230 296 136 320 64zM320 480C362 480 392 446 392 404C392 356 356 330 340 288C318 324 280 344 280 400C280 446 292 480 320 480z"/></svg>
            Bake Effects
          </button>
          <button @click="openMerge()" :disabled="!project.hasEdits">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
              <path d="M296.5 69.2C311.4 62.3 328.6 62.3 343.5 69.2L562.1 170.2C570.6 174.1 576 182.6 576 192C576 201.4 570.6 209.9 562.1 213.8L343.5 314.8C328.6 321.7 311.4 321.7 296.5 314.8L77.9 213.8C69.4 209.8 64 201.3 64 192C64 182.7 69.4 174.1 77.9 170.2L296.5 69.2zM112.1 282.4L276.4 358.3C304.1 371.1 336 371.1 363.7 358.3L528 282.4L562.1 298.2C570.6 302.1 576 310.6 576 320C576 329.4 570.6 337.9 562.1 341.8L343.5 442.8C328.6 449.7 311.4 449.7 296.5 442.8L77.9 341.8C69.4 337.8 64 329.3 64 320C64 310.7 69.4 302.1 77.9 298.2L112 282.4zM77.9 426.2L112 410.4L276.3 486.3C304 499.1 335.9 499.1 363.6 486.3L527.9 410.4L562 426.2C570.5 430.1 575.9 438.6 575.9 448C575.9 457.4 570.5 465.9 562 469.8L343.4 570.8C328.5 577.7 311.3 577.7 296.4 570.8L77.9 469.8C69.4 465.8 64 457.3 64 448C64 438.7 69.4 430.1 77.9 426.2z"/>
            </svg>
            Merge Down
          </button>
          <button @click="confirmClear" :disabled="!project.hasEdits">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
              <path d="M431.2 476.5L163.5 208.8C141.1 240.2 128 278.6 128 320C128 426 214 512 320 512C361.5 512 399.9 498.9 431.2 476.5zM476.5 431.2C498.9 399.8 512 361.4 512 320C512 214 426 128 320 128C278.5 128 240.1 141.1 208.8 163.5L476.5 431.2zM64 320C64 178.6 178.6 64 320 64C461.4 64 576 178.6 576 320C576 461.4 461.4 576 320 576C178.6 576 64 461.4 64 320z"/>
            </svg>
            Clear Edit Layer
          </button>
        </DropdownMenu>
      </div>
    </div>

    <div class="toolbar-row secondary-row" v-if="toolOptions.length || activeTool.palette || activeTool.id === 'select'">
      <PaletteStrip v-if="activeTool.palette"/>
      <div v-if="activeTool.id === 'select'" class="tool-setting-group">
        <span class="option-label">Layers</span>
        <LayerToggles v-model="workspace.selectLayers" label="Layers the selection acts on"/>
        <div class="divider"/>
        <template v-if="workspace.selection">
          <button title="Copy (Cmd/Ctrl+C)" aria-label="Copy (Cmd/Ctrl+C)" @click="copySelection"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><path d="M240 64H528A48 48 0 0 1 576 112V400A48 48 0 0 1 528 448H448V384H512V128H256V192H192V112A48 48 0 0 1 240 64ZM112 192H400A48 48 0 0 1 448 240V528A48 48 0 0 1 400 576H112A48 48 0 0 1 64 528V240A48 48 0 0 1 112 192Z"/></svg></button>
          <button title="Cut (Cmd/Ctrl+X)" aria-label="Cut (Cmd/Ctrl+X)" @click="cutSelection"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><path fill-rule="evenodd" d="M192 368A96 96 0 1 1 192 560A96 96 0 1 1 192 368ZM192 416A48 48 0 1 0 192 512A48 48 0 1 0 192 416ZM448 368A96 96 0 1 1 448 560A96 96 0 1 1 448 368ZM448 416A48 48 0 1 0 448 512A48 48 0 1 0 448 416Z"/><path d="M480 48L544 88L310 408L254 372ZM160 48L96 88L330 408L386 372Z"/></svg></button>
          <button title="Paste what you copied in Phosphor, at the selection" aria-label="Paste what you copied in Phosphor, at the selection" :disabled="!workspace.clipboard" @click="pasteSelection"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><path fill-rule="evenodd" d="M160 96H208V176H432V96H480A64 64 0 0 1 544 160V528A64 64 0 0 1 480 592H160A64 64 0 0 1 96 528V160A64 64 0 0 1 160 96ZM160 224V528H480V224Z"/><path d="M256 48H384A32 32 0 0 1 416 80V144H224V80A32 32 0 0 1 256 48Z"/></svg></button>
          <button title="Delete (Delete)" aria-label="Delete (Delete)" @click="project.deleteSelection(workspace.selection, workspace.selectLayers)"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" aria-hidden="true"><path d="M135.2 17.7C140.6 6.8 151.7 0 163.8 0h120.4c12.1 0 23.2 6.8 28.6 17.7L320 32h96c17.7 0 32 14.3 32 32s-14.3 32-32 32H32C14.3 96 0 81.7 0 64s14.3-32 32-32h96l7.2-14.3zM32 128h384v320c0 35.3-28.7 64-64 64H96c-35.3 0-64-28.7-64-64V128zm96 64c-8.8 0-16 7.2-16 16v224c0 8.8 7.2 16 16 16s16-7.2 16-16V208c0-8.8-7.2-16-16-16zm96 0c-8.8 0-16 7.2-16 16v224c0 8.8 7.2 16 16 16s16-7.2 16-16V208c0-8.8-7.2-16-16-16zm96 0c-8.8 0-16 7.2-16 16v224c0 8.8 7.2 16 16 16s16-7.2 16-16V208c0-8.8-7.2-16-16-16z"/></svg></button>
          <div class="divider"/>
          <button class="text" title="Merge up: what the base layer shows here becomes edit cells" @click="project.mergeUp(workspace.selection)">Merge up</button>
          <button class="text" title="Merge down: what's drawn here goes into the base layer" :disabled="!selectionHasEdits" @click="openMerge(workspace.selection)">Merge down</button>
          <button class="text" title="Clear the selection (Esc)" @click="workspace.selection = null">Deselect</button>
        </template>
        <template v-else>
          <span class="hint">Drag to select cells, or:</span>
          <button class="text" title="Select the whole canvas (Cmd/Ctrl+A)" @click="workspace.selectAll(project.gridRect())">Select all</button>
          <button class="text" title="Merge up: what the base layer shows becomes edit cells, over the whole canvas" @click="project.mergeUp(null)">Merge up</button>
          <button class="text" title="Merge down: the whole edit layer into the base layer" :disabled="!project.hasEdits" @click="openMerge()">Merge down</button>
        </template>
      </div>
      <div v-if="toolOptions.length" class="tool-setting-group">
        <template v-for="(option, i) in toolOptions" :key="option.key">
          <div v-if="i > 0" class="divider"/>
          <label v-if="option.type === 'checkbox'" class="checkbox-wrapper" :title="option.title">
            <span>{{ option.label }}</span>
            <input type="checkbox" v-model="workspace[option.key]"/>
          </label>
          <div v-else-if="option.type === 'segmented'" class="segmented" role="group" :aria-label="option.label">
            <button
                v-for="choice in option.choices"
                class="text"
                :key="String(choice.value)"
                :class="{ on: workspace[option.key] === choice.value }"
                :title="choice.icon && choice.label"
                :aria-label="choice.icon && choice.label"
                @click="workspace[option.key] = choice.value"
            ><span v-if="choice.icon" v-html="choice.icon"></span><template v-else>{{ choice.label }}</template></button>
          </div>
          <template v-else-if="option.type === 'toggles'">
            <span class="option-label">{{ option.label }}</span>
            <ToggleGroup v-model="workspace[option.key]" :options="option.options" :label="option.label"/>
          </template>
          <template v-else-if="option.type === 'layers'">
            <span class="option-label">{{ option.label }}</span>
            <LayerToggles v-model="workspace[option.key]" :label="option.label"/>
          </template>
          <DropdownMenu v-else-if="option.type === 'dropdown'" class="option-menu" align="left" :label="shownChoice(option)?.label ?? option.label">
            <button
                v-for="choice in offered(option)"
                :key="String(choice.value)"
                class="choice"
                :class="{ on: shownChoice(option) === choice }"
                @click="workspace[option.key] = choice.value"
            ><span class="glyph">{{ typeof choice.glyph === 'function' ? choice.glyph(workspace) : choice.glyph }}</span><span>{{ choice.label }}</span></button>
          </DropdownMenu>
          <RangeField v-else compact :setting="option" v-model="workspace[option.key]"/>
        </template>
      </div>
    </div>
  </article>
</template>

<style scoped>
article.edit-toolbar {
  position: relative; /* the palette layer opens from its bottom edge */
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

/* The options row scrolls sideways when it doesn't fit, without a scrollbar. */
div.secondary-row {
  padding: 0 10px 4px;
  gap: 12px;
  overflow-x: auto;
  scrollbar-width: none;
}

div.secondary-row::-webkit-scrollbar {
  display: none;
}

div.secondary-row > *,
div.tool-setting-group > * {
  flex-shrink: 0;
}

/* Only the tool group gives way; it clips (sideways only, so hover lifts still show). */
div.primary-row > * {
  flex-shrink: 0;
}

div.primary-row > div.tool-group {
  position: relative; /* its tools' offsets are measured from it */
  flex-shrink: 1;
  min-width: 0;
  overflow-x: clip;
}

div.tool-group > * {
  flex-shrink: 0;
}

.tools-menu :deep(svg) {
  display: block;
  width: 16px;
  height: 16px;
  fill: var(--text-faint);
}

.tools-menu :deep(.dropdown-trigger:hover) svg,
.tools-menu button.choice.on :deep(svg) {
  fill: var(--white);
}

/* The active tool is in the menu: the ⋯ lights up like a tool button. */
.tools-menu.holds-active :deep(.dropdown-trigger) {
  background: var(--accent);
  border-color: var(--accent);
}

.tools-menu.holds-active :deep(svg) {
  fill: var(--white);
}

/* Menu items are an icon (or glyph) and a label; a label that wraps stays in its own column. */
.tools-menu button.choice,
.option-menu button.choice {
  display: flex;
  align-items: flex-start;
  text-align: left;
}

.tools-menu span.tool-icon {
  flex-shrink: 0;
  margin-right: 8px;
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

div.segmented button.on {
  background: var(--accent);
  color: var(--white);
}

span.hint {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
}

span.option-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-muted);
  user-select: none;
}

button.text {
  width: auto;
  padding: 4px 10px;
  font-size: 12px;
  color: var(--text-dim);
}

/* The two dropdowns sit 4px apart (the row's 6px gap, less 2px). */
.overlay-menu {
  margin-right: -2px;
}

div.overlay-panel.overlay-group {
  margin: 0;
  padding: 4px 8px;
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

/* A compact slider is as wide as its 80px range, not the row (its wrapper is 100% elsewhere). */
div.tool-setting-group :deep(div.range-wrapper) {
  width: auto;
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

/* Option dropdowns list their glyphs in an even column; the current choice is lit. */
.option-menu button.choice.on,
.tools-menu button.choice.on {
  background: var(--accent);
  color: var(--white);
}

.option-menu span.glyph {
  flex-shrink: 0;
  width: 2ch;
  margin-right: 8px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  line-height: 1;
}

/* Icon choices take the button's text color, and are as tall as a text label. */
button.text :deep(svg) {
  width: 15px;
  height: 15px;
  fill: currentColor;
}

div.mobile-only {
  display: none;
}

/* At 900px and narrower, undo/redo, merge and clear fold into the Actions dropdown. */
@media (max-width: 900px) {
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
