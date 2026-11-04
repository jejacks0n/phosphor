<script setup>
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue';
import { useElementSize, useMediaQuery, useResizeObserver } from '@vueuse/core';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { bakeWarning, mergeWarning, useDrawingStore } from '@/store/DrawingStore';
import { getTool, offeredTools, toolTitle } from '@/tools';
import DropdownMenu from '@/components/DropdownMenu.vue';
import RangeField from '@/components/RangeField.vue';
import ColorPair from '@/components/ColorPair.vue';
import PaletteStrip from '@/components/PaletteStrip.vue';
import LayerToggles from '@/components/LayerToggles.vue';
import ToggleGroup from '@/components/ToggleGroup.vue';
import ChoiceDialog from '@/components/ChoiceDialog.vue';
import VectorOptions from '@/components/VectorOptions.vue';
import { shapeBounds } from '@/document/shapes.js';
import { shortcut } from '@/lib/keyLabels';
import { snapsLate } from '@/lib/CharResolver';
import { copySelection as copyToClipboards } from '@/composables/clipboard';

const { t } = useI18n();
const project = useProjectStore();
const workspace = useWorkspaceStore();
const drawing = useDrawingStore();

// A control that's off for a reason: the reason in its title, and what it is still its name for screen readers.
const off = (reason, name) => (reason ? { disabled: true, title: reason, 'aria-label': name } : {});
// Off with frames: it would put one frame in the base, under all of them.
const mergeOff = () => off(drawing.hostOnly ?? (project.hasFrames ? t(onVector.value ? 'toolbar.mergeShapesOneFrame' : 'toolbar.mergeOneFrame') : null), t('toolbar.mergeDown'));
// On VECTOR, Merge down presses the selected shapes (or all of them) into the base layer, without asking how.
const onVector = computed(() => workspace.editorTab === 'vector');
const vectorSelection = computed(() => workspace.vectorSelected.filter((key) => project.shapes.has(key)));
const mergeOn = computed(() => (onVector.value ? project.shapes.size > 0 : project.hasEdits));
const mergeTitle = computed(() => t(onVector.value ? 'toolbar.mergeShapesTitle' : 'toolbar.mergeDownTitle'));
function mergeHere() {
  if (!onVector.value) return openMerge();
  project.mergeShapes(vectorSelection.value.length ? vectorSelection.value : null);
  workspace.vectorSelected = [];
}
const warnedSub = (sub, warning = mergeWarning()) => (drawing.othersHere ? t('toolbar.mergeDialog.warnedSub', { warning, sub }) : sub);

// The toolbar offers the tools that work in the current view (editorTab is 'input' or 'output' while editing),
// with a divider wherever the toolbar section changes.
const tools = computed(() => {
  const offered = offeredTools(workspace.editorTab, project);
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
// The Paste button pastes only what was copied in this tab: the system clipboard is Cmd/Ctrl+V's.
const pasteTitle = computed(() => (workspace.clipboard
  ? t('toolbar.selection.pasteTitle')
  : t('toolbar.selection.pasteElsewhereTitle', { key: shortcut('mod', 'V') })));
const stampSelection = () => {
  workspace.selection = project.stampSelection(workspace.selection, workspace.selectLayers) ?? workspace.selection;
};
// Flip across ('h') or down ('v'), or rotate 90° clockwise ('cw'): the selection follows the block.
const turnSelection = (op) => {
  workspace.selection = project.turnSelection(workspace.selection, workspace.selectLayers, op) ?? workspace.selection;
};

// A dropdown's choices on offer right now, and the one it shows: the setting's own choice, or when
// that isn't on offer, the choice the tool draws instead.
const offered = (option) => option.choices.filter(c => !c.when || c.when(workspace));
const shownChoice = (option) => {
  const current = option.choices.find(c => c.value === workspace[option.key]), list = offered(option);
  return list.includes(current) ? current : list.find(c => c.value === current?.instead) ?? current;
};

// A selection the tools keep to: the Magic Wand's or the Select tool's rectangle (either, in both
// views). Every tool but Select (which has its own) offers Deselect while there is one.
const wandHere = computed(() => !!workspace.wand && ['input', 'output'].includes(workspace.editorTab));
const kept = computed(() => wandHere.value || (!!workspace.selection && ['input', 'output'].includes(workspace.editorTab)));
const deselect = () => project.changeSelection((w) => { w.selection = null; w.wand = null; });
// What Set FG, Set BG and Fill recolor: the active tool's own selection.
const recolored = computed(() => (workspace.activeTool === 'wand' ? wandHere.value && workspace.wand : workspace.activeTool === 'select' && workspace.selection));
const recolor = (colors) => project.recolorSelection(recolored.value, workspace.editorTab, workspace.selectLayers, colors);
const asciiStyle = computed(() => ['ascii', 'colorAscii'].includes(project.renderStyle));
// VECTOR's options row (VectorOptions), with Vector select, the Pen and the Shape tool. It stays up with
// nothing selected, so selecting a shape doesn't move the canvas under the pointer.
const vectorRow = computed(() => workspace.editorTab === 'vector' && ['vselect', 'vnode', 'pen', 'vshape'].includes(workspace.activeTool));

// The pixel view's preview of the ANSI layer: edit cells drawn over the image at pixel scale.
const OVERLAY_SETTING = computed(() => ({ key: 'ansiOverlay', label: t('toolbar.overlay.shortLabel'), title: t('toolbar.overlay.title'), min: 0, max: 100, unit: '%' }));
// The toolbar folds by its own width (the window's, less the side panel, and the chat column while it's open).
// 1030px and narrower, the overlay controls fold into a dropdown named for the art style (like the Actions
// dropdown), which opens them in a small floating toolbar under it. 630px and narrower, undo/redo, merge and
// clear fold into the Actions dropdown, as they do in a phone's layout (the side panel a drawer) at any width.
const toolbar = useTemplateRef('toolbar');
const { width: toolbarWidth } = useElementSize(toolbar);
const phoneLayout = useMediaQuery('(max-width: 768px)');
const narrowerThan = (px) => toolbarWidth.value > 0 && toolbarWidth.value <= px;   // 0: not measured yet
const overlayFolded = computed(() => narrowerThan(1030));
const actionsFolded = computed(() => phoneLayout.value || narrowerThan(630));
const STYLE_NAMES = computed(() => ({
  ansi: t('toolbar.overlay.styles.ansi'),
  colorAscii: t('toolbar.overlay.styles.colorAscii'),
  ascii: t('toolbar.overlay.styles.ascii'),
}));
const styleName = computed(() => STYLE_NAMES.value[project.renderStyle] ?? 'ANSI');
// Unfolded, the slider names the layer itself ("ANSI Overlay"); folded, the dropdown's button does.
const overlaySetting = computed(() => ({ ...OVERLAY_SETTING.value, label: t('toolbar.overlay.styleOverlay', { style: styleName.value }) }));

// A tool that stops being offered (flip after switching to an ASCII art style) shouldn't stay active unseen.
watch(tools, (offered) => {
  if (!offered.some(({ tool }) => tool.id === workspace.activeTool)) workspace.setActiveTool('hand');
});

function confirmClear() {
  if (!project.hasEditLayer || confirm(t('toolbar.clearConfirm'))) {
    project.clearEditLayer();
  }
}

// Merge down asks how (a ChoiceDialog): exactly, or into the picture. rect: a selection's, or null for
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
// Whether merging exactly takes shapes too: any touching the selection, or any at all.
const mergeTakesShapes = computed(() => {
  const rect = merging.value?.rect;
  if (!rect) return project.shapes.size > 0;
  const area = { x: rect.c0, y: 2 * rect.r0, w: rect.c1 - rect.c0 + 1, h: 2 * (rect.r1 - rect.r0 + 1) };
  return [...project.shapes.values()].some((shape) => {
    const b = shapeBounds(shape);
    return b.x < area.x + area.w && area.x < b.x + b.w && b.y < area.y + area.h && area.y < b.y + b.h;
  });
});
const mergeChoices = computed(() => {
  const choices = [
    { id: 'exact', title: t('toolbar.mergeDialog.exactTitle'), text: t('toolbar.mergeDialog.exactText'), ...(mergeTakesShapes.value && { note: t('toolbar.mergeDownShapes') }) },
    { id: 'picture', title: t('toolbar.mergeDialog.intoImageTitle'), text: t('toolbar.mergeDialog.intoImageText') },
  ];
  return project.pictureIsOriginal ? [choices[0], { ...choices[1], note: t('toolbar.mergeDialog.originalNote') }] : choices;
});

// Bake under CGA or VGA asks whether to lock the picture to the palette (exact, but the in-between
// colors are gone) or keep full color (a few cells near palette boundaries can tip). Other
// palettes bake exactly either way, and so do CGA and VGA dithered or resolved (they snap on the grid then).
const baking = ref(null); // the palette's name while the dialog is open
const bakingFinal = ref(false); // others are drawing, and it can't be undone: it asks first
function bake() {
  const palette = !snapsLate(project.processParams) && { cga: 'CGA', vga: 'VGA' }[project.quantize];
  if (palette) baking.value = palette;
  else if (drawing.othersHere) bakingFinal.value = true;
  else project.bake();
}
const BAKE_CHOICE = computed(() => [{ id: 'bake', title: t('toolbar.bake'), text: t('toolbar.bakeDialog.choiceText') }]);
function chooseBakeFinal() {
  bakingFinal.value = false;
  project.bake();
}
const bakeChoices = computed(() => [
  { id: 'full', title: t('toolbar.bakeDialog.keepFullTitle'), text: t('toolbar.bakeDialog.keepFullText', { palette: baking.value }) },
  { id: 'lock', title: t('toolbar.bakeDialog.lockPaletteTitle', { palette: baking.value }), text: t('toolbar.bakeDialog.lockPaletteText', { palette: baking.value }) },
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

// Rotate turns only pixels: not while the selection has characters on its layers.
const selectionHasCharacters = computed(() => {
  void project.editCells; void project.baseRecords; void project.historyVersion; // re-check after edits
  return !!workspace.selection && project.hasCharacters(workspace.selection, workspace.selectLayers);
});
</script>

<template>
  <ChoiceDialog
      v-if="merging"
      :title="t('toolbar.mergeDialog.title')"
      :sub="warnedSub(merging.rect
        ? t('toolbar.mergeDialog.subSelection')
        : t('toolbar.mergeDialog.subAll'))"
      :choices="mergeChoices"
      @choose="merge"
      @cancel="merging = null"
  />
  <ChoiceDialog
      v-if="baking"
      :title="t('toolbar.bakeDialog.titlePalette', { palette: baking })"
      :sub="warnedSub(t('toolbar.bakeDialog.subPalette'), bakeWarning())"
      :choices="bakeChoices"
      @choose="chooseBake"
      @cancel="baking = null"
  />
  <ChoiceDialog
      v-if="bakingFinal"
      :title="t('toolbar.bakeDialog.title')"
      :sub="bakeWarning()"
      :choices="BAKE_CHOICE"
      @choose="chooseBakeFinal"
      @cancel="bakingFinal = false"
  />
  <article ref="toolbar" class="edit-toolbar" :class="{ 'actions-folded': actionsFolded }">
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
              :title="toolTitle(tool)"
              :aria-label="tool.title"
              :aria-keyshortcuts="tool.keys?.join(' ')"
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
          :label="t('tools.moreTools')"
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
          <div class="tool-setting-group overlay-group overlay-panel" :aria-label="t('toolbar.overlay.aria')">
            <RangeField compact :setting="OVERLAY_SETTING" v-model="workspace.ansiOverlay"/>
            <label class="checkbox-wrapper" :title="t('toolbar.overlay.allCellsTitle')">
              <span>{{ t('toolbar.overlay.allCells') }}</span>
              <input type="checkbox" v-model="workspace.ansiOverlayAll"/>
            </label>
          </div>
        </DropdownMenu>
        <div v-else class="tool-setting-group overlay-group">
          <RangeField compact :setting="overlaySetting" v-model="workspace.ansiOverlay"/>
          <label class="checkbox-wrapper" :title="t('toolbar.overlay.allCellsTitle')">
            <span>{{ t('toolbar.overlay.allCells') }}</span>
            <input type="checkbox" v-model="workspace.ansiOverlayAll"/>
          </label>
        </div>
      </template>

      <div class="desktop-only actions-container">
        <div class="history-group">
          <button
              :title="t('toolbar.undoTitle', { key: shortcut('mod', 'Z') })"
              @click="project.undo"
              :disabled="!project.canUndo && !workspace.vectorPen"
          ><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M88 256L232 256C241.7 256 250.5 250.2 254.2 241.2C257.9 232.2 255.9 221.9 249 215L202.3 168.3C277.6 109.7 386.6 115 455.8 184.2C530.8 259.2 530.8 380.7 455.8 455.7C380.8 530.7 259.3 530.7 184.3 455.7C174.1 445.5 165.3 434.4 157.9 422.7C148.4 407.8 128.6 403.4 113.7 412.9C98.8 422.4 94.4 442.2 103.9 457.1C113.7 472.7 125.4 487.5 139 501C239 601 401 601 501 501C601 401 601 239 501 139C406.8 44.7 257.3 39.3 156.7 122.8L105 71C98.1 64.2 87.8 62.1 78.8 65.8C69.8 69.5 64 78.3 64 88L64 232C64 245.3 74.7 256 88 256z"/></svg></button>
          <button
              :title="t('toolbar.redoTitle', { key: shortcut('shift', 'mod', 'Z') })"
              @click="project.redo"
              :disabled="!project.canRedo"
          ><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M552 256L408 256C398.3 256 389.5 250.2 385.8 241.2C382.1 232.2 384.1 221.9 391 215L437.7 168.3C362.4 109.7 253.4 115 184.2 184.2C109.2 259.2 109.2 380.7 184.2 455.7C259.2 530.7 380.7 530.7 455.7 455.7C463.9 447.5 471.2 438.8 477.6 429.6C487.7 415.1 507.7 411.6 522.2 421.7C536.7 431.8 540.2 451.8 530.1 466.3C521.6 478.5 511.9 490.1 501 501C401 601 238.9 601 139 501C39.1 401 39 239 139 139C233.3 44.7 382.7 39.4 483.3 122.8L535 71C541.9 64.1 552.2 62.1 561.2 65.8C570.2 69.5 576 78.3 576 88L576 232C576 245.3 565.3 256 552 256z"/></svg></button>
        </div>

        <button
            :title="t('toolbar.bakeTitle')"
            @click="bake"
            class="primary"
            :disabled="!project.canBake"
            v-bind="off(drawing.hostOnly, t('toolbar.bake'))"
        ><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M320 64C346 152 464 216 464 376C464 480 400 568 320 568C240 568 176 480 176 376C176 304 214 254 248 214C254 274 280 308 312 318C292 230 296 136 320 64zM320 480C362 480 392 446 392 404C392 356 356 330 340 288C318 324 280 344 280 400C280 446 292 480 320 480z"/></svg></button>
        <button
            :title="mergeTitle"
            @click="mergeHere"
            class="primary"
            :disabled="!mergeOn"
            v-bind="mergeOff()"
        ><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M296.5 69.2C311.4 62.3 328.6 62.3 343.5 69.2L562.1 170.2C570.6 174.1 576 182.6 576 192C576 201.4 570.6 209.9 562.1 213.8L343.5 314.8C328.6 321.7 311.4 321.7 296.5 314.8L77.9 213.8C69.4 209.8 64 201.3 64 192C64 182.7 69.4 174.1 77.9 170.2L296.5 69.2zM112.1 282.4L276.4 358.3C304.1 371.1 336 371.1 363.7 358.3L528 282.4L562.1 298.2C570.6 302.1 576 310.6 576 320C576 329.4 570.6 337.9 562.1 341.8L343.5 442.8C328.6 449.7 311.4 449.7 296.5 442.8L77.9 341.8C69.4 337.8 64 329.3 64 320C64 310.7 69.4 302.1 77.9 298.2L112 282.4zM77.9 426.2L112 410.4L276.3 486.3C304 499.1 335.9 499.1 363.6 486.3L527.9 410.4L562 426.2C570.5 430.1 575.9 438.6 575.9 448C575.9 457.4 570.5 465.9 562 469.8L343.4 570.8C328.5 577.7 311.3 577.7 296.4 570.8L77.9 469.8C69.4 465.8 64 457.3 64 448C64 438.7 69.4 430.1 77.9 426.2z"/></svg></button>
        <button
            v-if="workspace.editorTab !== 'vector'"
            :title="t('toolbar.clearEditTitle')"
            @click="confirmClear"
            class="primary"
            :disabled="!project.hasEditLayer"
            v-bind="off(drawing.offWithOthers, t('toolbar.clearEdit'))"
        ><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M431.2 476.5L163.5 208.8C141.1 240.2 128 278.6 128 320C128 426 214 512 320 512C361.5 512 399.9 498.9 431.2 476.5zM476.5 431.2C498.9 399.8 512 361.4 512 320C512 214 426 128 320 128C278.5 128 240.1 141.1 208.8 163.5L476.5 431.2zM64 320C64 178.6 178.6 64 320 64C461.4 64 576 178.6 576 320C576 461.4 461.4 576 320 576C178.6 576 64 461.4 64 320z"/></svg></button>
      </div>

      <div class="mobile-only">
        <DropdownMenu :label="t('common.actions')">
          <button @click="project.undo" :disabled="!project.canUndo && !workspace.vectorPen">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
              <path d="M88 256L232 256C241.7 256 250.5 250.2 254.2 241.2C257.9 232.2 255.9 221.9 249 215L202.3 168.3C277.6 109.7 386.6 115 455.8 184.2C530.8 259.2 530.8 380.7 455.8 455.7C380.8 530.7 259.3 530.7 184.3 455.7C174.1 445.5 165.3 434.4 157.9 422.7C148.4 407.8 128.6 403.4 113.7 412.9C98.8 422.4 94.4 442.2 103.9 457.1C113.7 472.7 125.4 487.5 139 501C239 601 401 601 501 501C601 401 601 239 501 139C406.8 44.7 257.3 39.3 156.7 122.8L105 71C98.1 64.2 87.8 62.1 78.8 65.8C69.8 69.5 64 78.3 64 88L64 232C64 245.3 74.7 256 88 256z"/>
            </svg>
            {{ t('toolbar.undo') }}
          </button>
          <button @click="project.redo" :disabled="!project.canRedo">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
              <path d="M552 256L408 256C398.3 256 389.5 250.2 385.8 241.2C382.1 232.2 384.1 221.9 391 215L437.7 168.3C362.4 109.7 253.4 115 184.2 184.2C109.2 259.2 109.2 380.7 184.2 455.7C259.2 530.7 380.7 530.7 455.7 455.7C463.9 447.5 471.2 438.8 477.6 429.6C487.7 415.1 507.7 411.6 522.2 421.7C536.7 431.8 540.2 451.8 530.1 466.3C521.6 478.5 511.9 490.1 501 501C401 601 238.9 601 139 501C39.1 401 39 239 139 139C233.3 44.7 382.7 39.4 483.3 122.8L535 71C541.9 64.1 552.2 62.1 561.2 65.8C570.2 69.5 576 78.3 576 88L576 232C576 245.3 565.3 256 552 256z"/>
            </svg>
            {{ t('toolbar.redo') }}
          </button>
          <button @click="bake" :disabled="!project.canBake" v-bind="off(drawing.hostOnly, t('toolbar.bake'))">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M320 64C346 152 464 216 464 376C464 480 400 568 320 568C240 568 176 480 176 376C176 304 214 254 248 214C254 274 280 308 312 318C292 230 296 136 320 64zM320 480C362 480 392 446 392 404C392 356 356 330 340 288C318 324 280 344 280 400C280 446 292 480 320 480z"/></svg>
            {{ t('toolbar.bake') }}
          </button>
          <button @click="mergeHere" :disabled="!mergeOn" v-bind="mergeOff()">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
              <path d="M296.5 69.2C311.4 62.3 328.6 62.3 343.5 69.2L562.1 170.2C570.6 174.1 576 182.6 576 192C576 201.4 570.6 209.9 562.1 213.8L343.5 314.8C328.6 321.7 311.4 321.7 296.5 314.8L77.9 213.8C69.4 209.8 64 201.3 64 192C64 182.7 69.4 174.1 77.9 170.2L296.5 69.2zM112.1 282.4L276.4 358.3C304.1 371.1 336 371.1 363.7 358.3L528 282.4L562.1 298.2C570.6 302.1 576 310.6 576 320C576 329.4 570.6 337.9 562.1 341.8L343.5 442.8C328.6 449.7 311.4 449.7 296.5 442.8L77.9 341.8C69.4 337.8 64 329.3 64 320C64 310.7 69.4 302.1 77.9 298.2L112 282.4zM77.9 426.2L112 410.4L276.3 486.3C304 499.1 335.9 499.1 363.6 486.3L527.9 410.4L562 426.2C570.5 430.1 575.9 438.6 575.9 448C575.9 457.4 570.5 465.9 562 469.8L343.4 570.8C328.5 577.7 311.3 577.7 296.4 570.8L77.9 469.8C69.4 465.8 64 457.3 64 448C64 438.7 69.4 430.1 77.9 426.2z"/>
            </svg>
            {{ t('toolbar.mergeDown') }}
          </button>
          <button v-if="workspace.editorTab !== 'vector'" @click="confirmClear" :disabled="!project.hasEditLayer" v-bind="off(drawing.offWithOthers, t('toolbar.clearEdit'))">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
              <path d="M431.2 476.5L163.5 208.8C141.1 240.2 128 278.6 128 320C128 426 214 512 320 512C361.5 512 399.9 498.9 431.2 476.5zM476.5 431.2C498.9 399.8 512 361.4 512 320C512 214 426 128 320 128C278.5 128 240.1 141.1 208.8 163.5L476.5 431.2zM64 320C64 178.6 178.6 64 320 64C461.4 64 576 178.6 576 320C576 461.4 461.4 576 320 576C178.6 576 64 461.4 64 320z"/>
            </svg>
            {{ t('toolbar.clearEdit') }}
          </button>
        </DropdownMenu>
      </div>
    </div>

    <div class="toolbar-row secondary-row" v-if="toolOptions.length || activeTool.palette || activeTool.id === 'select' || kept || vectorRow">
      <VectorOptions v-if="workspace.editorTab === 'vector'"/>
      <PaletteStrip v-if="activeTool.palette"/>
      <div v-if="activeTool.id === 'select'" class="tool-setting-group">
        <span class="option-label">{{ t('toolbar.selection.layers') }}</span>
        <LayerToggles v-model="workspace.selectLayers" :label="t('toolbar.selection.layersAria')"/>
        <div class="divider"/>
        <template v-if="workspace.selection">
          <button :title="t('toolbar.selection.copyTitle', { key: shortcut('mod', 'C') })" :aria-label="t('toolbar.selection.copyTitle', { key: shortcut('mod', 'C') })" @click="copySelection"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><path d="M240 64H528A48 48 0 0 1 576 112V400A48 48 0 0 1 528 448H448V384H512V128H256V192H192V112A48 48 0 0 1 240 64ZM112 192H400A48 48 0 0 1 448 240V528A48 48 0 0 1 400 576H112A48 48 0 0 1 64 528V240A48 48 0 0 1 112 192Z"/></svg></button>
          <button :title="t('toolbar.selection.cutTitle', { key: shortcut('mod', 'X') })" :aria-label="t('toolbar.selection.cutTitle', { key: shortcut('mod', 'X') })" @click="cutSelection"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><path fill-rule="evenodd" d="M192 368A96 96 0 1 1 192 560A96 96 0 1 1 192 368ZM192 416A48 48 0 1 0 192 512A48 48 0 1 0 192 416ZM448 368A96 96 0 1 1 448 560A96 96 0 1 1 448 368ZM448 416A48 48 0 1 0 448 512A48 48 0 1 0 448 416Z"/><path d="M480 48L544 88L310 408L254 372ZM160 48L96 88L330 408L386 372Z"/></svg></button>
          <button :title="pasteTitle" :aria-label="pasteTitle" :disabled="!workspace.clipboard" @click="pasteSelection"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><path fill-rule="evenodd" d="M160 96H208V176H432V96H480A64 64 0 0 1 544 160V528A64 64 0 0 1 480 592H160A64 64 0 0 1 96 528V160A64 64 0 0 1 160 96ZM160 224V528H480V224Z"/><path d="M256 48H384A32 32 0 0 1 416 80V144H224V80A32 32 0 0 1 256 48Z"/></svg></button>
          <button :title="t('toolbar.selection.deleteTitle')" :aria-label="t('toolbar.selection.delete')" aria-keyshortcuts="Delete E" @click="project.deleteSelection(workspace.selection, workspace.selectLayers)"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" aria-hidden="true"><path d="M135.2 17.7C140.6 6.8 151.7 0 163.8 0h120.4c12.1 0 23.2 6.8 28.6 17.7L320 32h96c17.7 0 32 14.3 32 32s-14.3 32-32 32H32C14.3 96 0 81.7 0 64s14.3-32 32-32h96l7.2-14.3zM32 128h384v320c0 35.3-28.7 64-64 64H96c-35.3 0-64-28.7-64-64V128zm96 64c-8.8 0-16 7.2-16 16v224c0 8.8 7.2 16 16 16s16-7.2 16-16V208c0-8.8-7.2-16-16-16zm96 0c-8.8 0-16 7.2-16 16v224c0 8.8 7.2 16 16 16s16-7.2 16-16V208c0-8.8-7.2-16-16-16zm96 0c-8.8 0-16 7.2-16 16v224c0 8.8 7.2 16 16 16s16-7.2 16-16V208c0-8.8-7.2-16-16-16z"/></svg></button>
          <button :title="t('toolbar.selection.stampTitle')" :aria-label="t('toolbar.selection.stamp')" aria-keyshortcuts="S C" @click="stampSelection"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><path d="M272 64H368A48 48 0 0 1 416 112V176C416 224 384 256 384 304H480A64 64 0 0 1 544 368V432H96V368A64 64 0 0 1 160 304H256C256 256 224 224 224 176V112A48 48 0 0 1 272 64ZM96 480H544V544H96Z"/></svg></button>
          <button :title="t('toolbar.selection.flipHTitle')" :aria-label="t('toolbar.selection.flipH')" @click="turnSelection('h')"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><path d="M272 128V512H64Z"/><path fill-rule="evenodd" d="M368 128L576 512H368ZM416 320V464H494Z"/><path d="M304 64H336V576H304Z"/></svg></button>
          <button :title="t('toolbar.selection.flipV')" :aria-label="t('toolbar.selection.flipV')" @click="turnSelection('v')"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><path d="M128 272H512L128 64Z"/><path fill-rule="evenodd" d="M128 368H512L128 576ZM320 416H176V494Z"/><path d="M64 304H576V336H64Z"/></svg></button>
          <button :title="selectionHasCharacters ? t('toolbar.selection.rotateCharsDisabled') : t('toolbar.selection.rotateTitle')" :aria-label="t('toolbar.selection.rotateAria')" :disabled="selectionHasCharacters" @click="turnSelection('cw')"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><path d="M320 96A224 224 0 1 0 544 320H480A160 160 0 1 1 433.1 206.9L384 256H544V96L478.4 161.6A223.3 223.3 0 0 0 320 96Z"/></svg></button>
          <div class="divider"/>
          <button class="text" :title="t('toolbar.selection.mergeUpSelectionTitle')" v-bind="off(drawing.hostOnly, t('toolbar.selection.mergeUp'))" @click="project.mergeUp(workspace.selection)">{{ t('toolbar.selection.mergeUp') }}</button>
          <button class="text" :title="t('toolbar.selection.mergeDownSelectionTitle')" :disabled="!selectionHasEdits" v-bind="mergeOff()" @click="openMerge(workspace.selection)">{{ t('toolbar.mergeDown') }}</button>
          <button class="text" :title="t('toolbar.selection.deselectBlockTitle')" aria-keyshortcuts="Escape Enter" @click="deselect">{{ t('toolbar.selection.deselect') }}</button>
        </template>
        <template v-else>
          <span class="hint">{{ t('toolbar.selection.dragHint') }}</span>
          <button class="text" :title="t('toolbar.selection.selectAllTitle', { key: shortcut('mod', 'A') })" @click="project.changeSelection((w) => w.selectAll(project.gridRect()))">{{ t('toolbar.selection.selectAll') }}</button>
          <button class="text" :title="t('toolbar.selection.mergeUpAllTitle')" v-bind="off(drawing.hostOnly, t('toolbar.selection.mergeUp'))" @click="project.mergeUp(null)">{{ t('toolbar.selection.mergeUp') }}</button>
          <button class="text" :title="t('toolbar.selection.mergeDownAllTitle')" :disabled="!project.hasEdits" v-bind="mergeOff()" @click="openMerge()">{{ t('toolbar.mergeDown') }}</button>
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
      <div v-if="recolored" class="tool-setting-group">
        <div class="divider"/>
        <template v-if="workspace.editorTab === 'output'">
          <button class="text" :title="workspace.editFgNone ? t('toolbar.selection.setFgNoneTitle') : t('toolbar.selection.setFgTitle')" :disabled="workspace.editFgNone" @click="recolor({ fg: workspace.editFgColor })">{{ t('toolbar.selection.setFg') }}</button>
          <button v-if="!asciiStyle" class="text" :title="workspace.editBgNone ? t('toolbar.selection.setBgNoneTitle') : t('toolbar.selection.setBgTitle')" :disabled="workspace.editBgNone" @click="recolor({ bg: workspace.editBgColor })">{{ t('toolbar.selection.setBg') }}</button>
        </template>
        <button v-else class="text" :title="workspace.editFgNone ? t('toolbar.selection.fillNoneTitle') : t('toolbar.selection.fillTitle')" :disabled="workspace.editFgNone" @click="recolor({ fg: workspace.editFgColor })">{{ t('toolbar.selection.fill') }}</button>
      </div>
      <div v-if="kept && (activeTool.id !== 'select' || wandHere)" class="tool-setting-group">
        <div class="divider"/>
        <button v-if="wandHere && activeTool.id === 'wand'" class="text" :title="t('toolbar.selection.wandDeleteTitle')" aria-keyshortcuts="Delete" @click="project.deleteInWand(workspace.wand, workspace.editorTab, workspace.selectLayers)">{{ t('common.delete') }}</button>
        <button class="text" :title="t('toolbar.selection.wandDeselectTitle')" aria-keyshortcuts="Escape" @click="deselect">{{ t('toolbar.selection.deselect') }}</button>
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

/* VECTOR's options row is a component of its own: its buttons, labels and dividers take these styles too
   (div.vector-options > :deep(…)), so the row looks and measures as every other tool's does. */

/* The options row scrolls sideways when it doesn't fit, without a scrollbar. It's as tall as a row of
   sliders whatever the tool's options are, so they line up from tool to tool and the view below
   doesn't move. */
div.secondary-row {
  min-height: 32px;
  box-sizing: border-box;
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

span.hint,
div.vector-options > :deep(span.hint) {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
}

span.option-label,
div.vector-options > :deep(span.option-label) {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-muted);
  user-select: none;
}

button.text,
div.vector-options > :deep(button.text) {
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

div.divider,
div.vector-options > :deep(div.divider) {
  width: 1px;
  height: 18px;
  background: var(--border);
  margin: 0 2px;
  flex-shrink: 0;
}

div.spacer {
  flex: 1;
}

button,
div.vector-options > :deep(button) {
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

@media (hover: hover) { /* a tap on a touch screen leaves no hover look behind */
  button:hover :deep(svg) {
    fill: var(--text);
  }
}

button.primary :deep(svg) {
  fill: var(--text);
}

@media (hover: hover) {
  button.primary:hover {
    background: var(--surface-light);
    border-color: var(--surface-light);
  }
}

@media (hover: hover) {
  button.primary:hover :deep(svg) {
    fill: var(--text-inverted);
  }
}

button.active {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--white);
}

button.active :deep(svg) {
  fill: var(--white);
}

button:disabled,
div.vector-options > :deep(button:disabled) {
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

/* Folded (actionsFolded), undo/redo, merge and clear are in the Actions dropdown. */
article.actions-folded div.desktop-only {
  display: none;
}
article.actions-folded div.mobile-only {
  display: block;

  svg {
    display: initial;
    position: relative;
    top: 0.2em;
  }
}
</style>
