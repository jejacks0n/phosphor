<script setup>
import { computed, nextTick, onBeforeUnmount, onUpdated, ref, useTemplateRef, watch } from 'vue';
import { useElementSize, useMediaQuery, useMutationObserver, useResizeObserver } from '@vueuse/core';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { bakeWarning, mergeWarning, useDrawingStore } from '@/store/DrawingStore';
import { PAINT_OFF_TOOLS, getTool, keyLabel, optionValue, setOptionValue, slotFace, toolSlots, toolTitle } from '@/tools';
import { selectedKind } from '@/tools/vshape.js';
import DropdownMenu from '@/components/DropdownMenu.vue';
import RangeField from '@/components/RangeField.vue';
import ColorPair from '@/components/ColorPair.vue';
import PaletteStrip from '@/components/PaletteStrip.vue';
import CharPaletteLayer from '@/components/CharPaletteLayer.vue';
import ColorLayer from '@/components/ColorLayer.vue';
import CharField from '@/components/CharField.vue';
import ToggleGroup from '@/components/ToggleGroup.vue';
import ChoiceDialog from '@/components/ChoiceDialog.vue';
import VectorOptions from '@/components/VectorOptions.vue';
import { shortcut } from '@/lib/keyLabels';
import { isUniform } from '@/lib/ImageProcessor';
import { copySelection as copyToClipboards } from '@/composables/clipboard';
import { refusedHidden } from '@/store/project/shared.js';
import { sameChars } from '@/document/layerInfo.js';
import { isFrozen, isLaid, mergeKind, ownEntry, parseKey, shownEntry } from '@/document/editCells.js';
import { isWideChar } from '@/lib/Cells.js';
import { useLayerName } from '@/composables/useLayerName';
import { asking as merging, mergeBusy, useMergeDown } from '@/composables/useMergeDown';
import { busyWhile } from '@/composables/useBusy';
import { artLayerEmpty, artLayerOff, bakeOff as bakeWhy, flattenOff as flattenWhy, reasonWords } from '@/lib/offReasons';
import { showFontSetup } from '@/composables/useFontSetup';
import { CHECK_ICON, MORE_ICON } from '@/lib/icons';

const { t } = useI18n();
const project = useProjectStore();
const workspace = useWorkspaceStore();
const drawing = useDrawingStore();
const layerName = useLayerName();
const { below, offFor, hasAny, mergeDown, mergePicked } = useMergeDown();

// A control that's off for a reason: the reason in its title, and what it is still its name for screen readers.
const off = (reason, name) => (reason ? { disabled: true, title: reason, 'aria-label': name, 'data-off-reason': '' } : {});
// A tool's button as off while the drawing's font has no lower half (project.paintOff). A click or tap on it brings
// back the toast that sets up the font (useDisabledReason's offreason), in place of its title.
const sayFontSetup = (event) => {
  event.preventDefault();
  showFontSetup();
};
const toolOff = (tool) => (PAINT_OFF_TOOLS.includes(tool.id) && project.paintOff ? { ...off(project.paintOff, tool.title), onOffreason: sayFontSetup } : {});
// Inside an art layer, what changes the whole drawing (Clear, Merge down, Bake) is off: it would step out and
// change the drawing kept aside, not the layer (the store steps out first all the same).
const insideOff = computed(() => (project.artInside ? t('art.wholeLayerOff') : null));
// Merge down acts on the picked layer: off with the reason (useMergeDown's offFor), and only with something on it. On
// VECTOR, with shapes selected, it presses those (or, onto a vector layer, moves them there), without asking how.
const picked = computed(() => workspace.pickedLayer);
const mergeOff = () => off(offFor(picked.value), t('toolbar.mergeDown'));
const onVector = computed(() => workspace.editorTab === 'vector');
const vectorSelection = computed(() => workspace.vectorSelected.filter((key) => project.shapes.has(key)));
const mergeOn = computed(() => {
  void project.editCells; void project.hasPaint; void project.shapes; void project.historyVersion; // re-check after edits
  return hasAny(picked.value);
});
const mergeTitle = computed(() => (onVector.value && vectorSelection.value.length ? t(below(picked.value)?.kind === 'vector' ? 'toolbar.mergeShapesOntoVectorTitle' : 'toolbar.mergeShapesTitle') : t('toolbar.mergeDownTitle', { name: layerName(picked.value) })));
const mergeHere = () => mergePicked(workspace);
const warnedSub = (sub, warning = mergeWarning()) => (drawing.othersHere ? t('toolbar.mergeDialog.warnedSub', { warning, sub }) : sub);

// The toolbar offers the tools that work in the current view (editorTab is 'input' or 'output' while editing), a slot
// each, a group's sharing one (toolSlots), with a divider wherever the toolbar section changes (a tool's own, or its
// sections[tab] in that view). face: the tool a slot shows (slotFace).
const tools = computed(() => {
  const tab = workspace.editorTab, slots = toolSlots(tab, project);
  const section = (slot) => slot.tools[0].sections?.[tab] ?? slot.tools[0].section ?? 'draw';
  return slots.map((slot, i) => ({ slot, face: slotFace(slot, workspace), divider: i > 0 && section(slot) !== section(slots[i - 1]) }));
});
const activeTool = computed(() => getTool(workspace.activeTool));

// Slots that don't fit the row move into the ⋯ menu after the last one that does, a group's tools one by one. All of
// them stay in the row (clipped, out of sight), so it always knows their full width. The room for tools is the tool
// group plus the spacer after it (plus the menu's own slot while it's showing).
const toolBox = useTemplateRef('toolBox');
const toolSpacer = useTemplateRef('toolSpacer');
const moreMenu = useTemplateRef('moreMenu');
const hiddenSlots = ref([]);
const toolsWidth = ref(null); // the group's width while some slots are hidden: up to the last shown
const MORE_GAP = 6;           // the row's gap
function fitTools() {
  const box = toolBox.value, spacer = toolSpacer.value;
  if (!box || !spacer) return;
  const items = [...box.children];
  const right = (el) => el.offsetLeft + el.offsetWidth;
  const moreSlot = (moreMenu.value?.$el.offsetWidth || 34) + MORE_GAP;
  const room = box.clientWidth + spacer.offsetWidth + (hiddenSlots.value.length ? moreSlot : 0);
  if (!items.length || right(items.at(-1)) <= room) {
    hiddenSlots.value = [];
    toolsWidth.value = null;
    return;
  }
  const shown = items.filter(el => right(el) <= room - moreSlot);
  hiddenSlots.value = items.filter(el => el.dataset.slot && !shown.includes(el)).map(el => el.dataset.slot);
  const lastSlot = shown.filter(el => el.dataset.slot).at(-1);
  toolsWidth.value = lastSlot ? right(lastSlot) : 0;
}
// A frame later, not in the observer's callback: the fit sizes the box it watches (toolsWidth), and Vue lays that out
// before the browser's next round of the same frame's observers, which it reports as a loop (an error on the page).
useResizeObserver([toolBox, toolSpacer], () => requestAnimationFrame(fitTools));
watch(() => tools.value.length, () => nextTick(fitTools));
const moreTools = computed(() => tools.value.filter(({ slot }) => hiddenSlots.value.includes(slot.id)).flatMap(({ slot }) => slot.tools));

// The options row: its buttons and checkboxes that don't fit move, from the end, into a ⋯ menu after the last that
// fits, as the tool row's slots do, so nothing that can be pressed sits past the edge with no sign. A folded one stays
// where it is, out of the layout (data-folded: an attribute, so Vue's class patching leaves it), and the menu's items
// are copies of it that press it, taken again as the menu opens (a disabled state, a title or a check may have changed
// since). A divider, or a group, left with nothing after it folds too. A row too wide even with all of them folded
// (sliders and segmented choices can't fold) folds nothing and scrolls, as before.
const optionsRow = useTemplateRef('optionsRow');
const foldedOptions = ref([]);
const FOLDABLE = ':scope > .tool-setting-group > button, :scope > .tool-setting-group > label.checkbox-wrapper';
const isFolded = (el) => el.hasAttribute('data-folded');
// A folded checkbox's item presses its box, not its label (a label passing a script's click on to its box is the
// browser's to do), and shows a check where it's on.
function foldedItem(el) {
  const box = el.matches('label') ? el.querySelector('input') : null;
  return {
    row: el,
    el: box ?? el,
    label: (el.getAttribute('aria-label') || el.textContent).trim(),
    icon: box ? (box.checked ? CHECK_ICON : '') : el.querySelector('svg')?.outerHTML ?? '',
    title: el.title,
    disabled: !!(box ?? el).disabled,
    offReason: el.hasAttribute('data-off-reason'), // its title says why it's off
    checked: box ? String(box.checked) : null,
  };
}
const takeFolded = () => {
  const row = optionsRow.value;
  foldedOptions.value = row ? [...row.querySelectorAll(FOLDABLE)].filter(isFolded).map(foldedItem) : [];
};
function fitOptions() {
  const row = optionsRow.value, more = row?.querySelector(':scope > .options-more');
  if (!more) return;
  const over = () => row.scrollWidth > row.clientWidth + 1;
  row.querySelectorAll('[data-folded]').forEach((el) => el.removeAttribute('data-folded'));
  more.hidden = true;
  const folded = [];
  if (over()) {
    more.hidden = false;
    const foldables = [...row.querySelectorAll(FOLDABLE)];
    while (foldables.length && over()) {
      const el = foldables.pop();
      el.setAttribute('data-folded', '');
      folded.unshift(el);
      const group = el.parentElement, rest = [...group.children];
      for (let k = rest.length - 1; k >= 0 && (isFolded(rest[k]) || rest[k].matches('.divider')); k--) rest[k].setAttribute('data-folded', '');
      if (rest.every(isFolded)) group.setAttribute('data-folded', '');
    }
    if (over()) { // what overflows can't fold (sliders, say): folding wouldn't help, so the row scrolls as it is
      row.querySelectorAll('[data-folded]').forEach((el) => el.removeAttribute('data-folded'));
      more.hidden = true;
      folded.length = 0;
    }
  }
  const same = folded.length === foldedOptions.value.length && folded.every((el, k) => foldedOptions.value[k].row === el);
  if (!same) takeFolded();
}
useResizeObserver(optionsRow, fitOptions);
// Its buttons come and go with the tool and the selection; the menu's own items aren't the row's.
useMutationObserver(optionsRow, (records) => {
  if (records.some(({ target }) => !target.closest?.('.options-more') && !target.parentElement?.closest('.options-more'))) fitOptions();
}, { childList: true, subtree: true, characterData: true });
onUpdated(() => nextTick(fitOptions));

// A slot with more than one tool opens them (its flyout, a DropdownMenu) from its corner, a long press or a
// right-click (which a long press is, on some phones). A long press doesn't then also choose the tool shown.
const flyouts = {};
const LONG_PRESS_MS = 450;
let pressTimer = null, longPressed = false;
function pressSlot(id) {
  clearTimeout(pressTimer);
  longPressed = false;
  pressTimer = setTimeout(() => { longPressed = true; flyouts[id]?.open(); }, LONG_PRESS_MS);
}
const releaseSlot = () => clearTimeout(pressTimer);
function chooseFace(id, tool) {
  if (longPressed) { longPressed = false; return; }
  flyouts[id]?.close();
  workspace.setActiveTool(tool.id);
}
const keysOf = (tool) => tool.keys?.map(keyLabel).join(' ');
// A tool's options for the current view (an option may be for one view only).
const toolOptions = computed(() => (activeTool.value.options ?? []).filter(option =>
  (!option.views || option.views.includes(workspace.editorTab)) && (!option.when || option.when(workspace))));

// The actions on the Select tool's selection (one undo step each), on the picked layer, or the shown layers with All layers on.
// Delete and Paste go under the busy note: most of a second over a whole large drawing.
const copySelection = () => copyToClipboards(project, workspace, workspace.selection, workspace.selectionIds);
const deleteSelection = () => {
  const { selection, selectionIds } = workspace;
  busyWhile(t('busy.deleting'), () => project.deleteSelection(selection, selectionIds));
};
const cutSelection = () => {
  copySelection();
  deleteSelection();
};
const pasteSelection = () => {
  const sel = workspace.selection, block = workspace.clipboard;
  busyWhile(t('busy.pasting'), () => { workspace.selection = project.pasteSelection(block, sel.c0, sel.r0) ?? sel; });
};
// The Paste button pastes only what was copied in this tab: the system clipboard is Cmd/Ctrl+V's.
const pasteTitle = computed(() => (workspace.clipboard
  ? t('toolbar.selection.pasteTitle')
  : t('toolbar.selection.pasteElsewhereTitle', { key: shortcut('mod', 'V') })));
const stampSelection = () => {
  workspace.selection = project.stampSelection(workspace.selection, workspace.selectionIds) ?? workspace.selection;
};
// Flip across ('h') or down ('v'), or rotate 90° clockwise ('cw'): the selection follows the block.
const turnSelection = (op) => {
  workspace.selection = project.turnSelection(workspace.selection, workspace.selectionIds, op) ?? workspace.selection;
};

// A dropdown's choices on offer right now, and the one it shows: the setting's own choice, or when
// that isn't on offer, the choice for what the tool draws instead (the option's `drawn`).
const offered = (option) => option.choices.filter(c => !c.when || c.when(workspace));
const shownChoice = (option) => {
  const list = offered(option), value = optionValue(workspace, option);
  return list.find(c => c.value === value) ?? list.find(c => option.drawn && c.value === option.drawn(workspace))
    ?? option.choices.find(c => c.value === value);
};

// A selection the tools keep to, in both views: the Select tool's or the Magic Wand's (wandHere: one with a mask). Every
// tool but Select (which has its own) offers Deselect while there is one.
const kept = computed(() => !!workspace.selection && ['input', 'output'].includes(workspace.editorTab));
const wandHere = computed(() => kept.value && !!workspace.selection.mask);
const deselect = () => project.changeSelection((w) => { w.selection = null; });
// What Set FG, Set BG and Fill recolor: the selection, with the Select tool, or the Magic Wand's with the wand; on the
// picked layer, or the shown layers with All layers on.
const recolored = computed(() => (workspace.activeTool === 'wand' ? wandHere.value && workspace.selection : workspace.activeTool === 'select' && workspace.selection));
const recolor = (colors) => project.recolorSelection(recolored.value, workspace.editorTab, workspace.selectionIds, colors);
// Set FG and Set BG (Fill in PIXEL; no Set BG in the ASCII styles). On the Select row they show with nothing selected
// too, turned off, so they're where they'll be once there's a selection.
const recolorButtons = computed(() => {
  const on = !!recolored.value, sel = (key) => t(`toolbar.selection.${key}`);
  const button = (key, none, colors) => ({
    key, label: sel(key), colors, disabled: !on || none,
    title: !on ? t('toolbar.selection.selectFirstTitle', { action: sel(key) }) : sel(`${key}${none ? 'None' : ''}Title`),
  });
  const fg = button(workspace.editorTab === 'output' ? 'setFg' : 'fill', workspace.editFgNone, { fg: workspace.editFgColor, fgIndex: workspace.editFgIndex });
  if (workspace.editorTab !== 'output' || asciiStyle.value) return [fg];
  return [fg, button('setBg', workspace.editBgNone, { bg: workspace.editBgColor, bgIndex: workspace.editBgIndex })];
});
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

// The Shape tool's row of kinds follows the selection: a shape selected that remembers what made it (a polygon, a
// plugin's shape) chooses its kind, so its options are the ones showing. Only as the selection changes, so a kind
// clicked in the row with that shape still selected stays chosen, and only with another tool: the Shape tool selects
// what it draws, of the kind chosen already, and an undo there putting an older selection back mustn't change what the
// next drag draws.
watch(() => workspace.vectorSelected.join(' '), () => {
  const kind = workspace.activeTool !== 'vshape' && selectedKind(workspace);
  if (kind) workspace.vectorShapeKind = kind;
});

// A tool that stops being offered (flip after switching to an ASCII art style) shouldn't stay active unseen.
watch(tools, (offered) => {
  if (!offered.some(({ slot }) => slot.tools.some((tool) => tool.id === workspace.activeTool))) workspace.setActiveTool('hand');
});

// Clear asks in the app's own dialog (clearing): after the browser's confirm, the page could be left without the keys
// until a click, so the undo key right after did nothing.
const clearing = ref(null); // the layer's name while asked
// Clear is a drawing layer's: not on the toolbar on VECTOR, nor with the base picked, which has nothing of its own to clear.
const clearOffered = computed(() => workspace.editorTab !== 'vector' && workspace.shownPick !== 'base');
function confirmClear() {
  if (refusedHidden(project, [project.editId])) return; // as the store would, before asking
  if (!project.hasEditLayer) project.clearEditLayer();
  else clearing.value = layerName(project.editId);
}
const clearChoices = computed(() => [{ id: 'clear', title: t('toolbar.clearDialog.clear'), text: t('toolbar.clearDialog.clearText') }]);
function chooseClear() {
  clearing.value = null;
  project.clearEditLayer();
}

// Done: out of the art layer, and VECTOR with it selected.
function stepOut() {
  project.leaveArt();
  workspace.editorTab = 'vector';
}

// Merge down into the base asks how (a ChoiceDialog): exactly, or into the picture. merging (useMergeDown's asking):
// { id, rect, chars? } while it's open, rect a selection's or null for the whole layer. A vector layer's shapes are pressed
// (exactly), or go into the picture as paint does. chars: into a layer with other character settings, which asks only
// whether to merge (some characters can change).
function merge(kind) {
  const { id, rect } = merging.value;
  merging.value = null;
  mergeBusy(t, () => (kind === 'exact' || kind === 'merge' ? project.mergeDown(id, rect) : project.layerById(id)?.kind === 'vector' ? project.mergeShapesIntoPicture(id) : project.mergeIntoPicture(rect, id)));
}
const mergeChoices = computed(() => {
  if (merging.value?.chars) return [{ id: 'merge', title: t('toolbar.mergeDialog.charsMerge', { below: layerName(below(merging.value.id)?.id) }), text: t('toolbar.mergeDialog.charsText', { name: layerName(merging.value.id), below: layerName(below(merging.value.id)?.id) }) }];
  const choices = [
    { id: 'exact', title: t('toolbar.mergeDialog.exactTitle'), text: t('toolbar.mergeDialog.exactText') },
    { id: 'picture', title: t('toolbar.mergeDialog.intoImageTitle'), text: t('toolbar.mergeDialog.intoImageText') },
  ];
  // Into the picture, paint is pixels the base converts with its own characters: a layer with others of its own loses them
  // (a vector layer's shapes go in as paint).
  const { id } = merging.value ?? {}, layer = project.layerById(id);
  const ownChars = layer && (layer.kind === 'vector' || project.paintOf(id)?.hasPaint) && !sameChars(layer.chars, project.baseChars, layer.kind)
    && t('toolbar.mergeDialog.ownCharsNote', { name: layerName(id), below: layerName(below(id)?.id) });
  // Its blocks, typed, laid or paint blocks (in the selection), go in for the converter to pick again (mergeKind's 'glyph'
  // and 'halves'): some can change.
  // Characters of someone's own, the base's pins among them, merge exactly.
  const { rect } = merging.value ?? {}, style = project.renderStyle, entries = layer ? project.cellsOf(id) : new Map();
  const fit = layer && (project.processParams.fit ?? project.fitFor(project.cols, project.rows));
  const repicked = [...entries].some(([key, entry]) => {
    const { col, row } = parseKey(key), char = shownEntry(entry, style)?.char;
    const inPicture = col >= fit.dx && col < fit.dx + fit.dw && 2 * row >= fit.dy && 2 * row + 1 < fit.dy + fit.dh;
    return char !== undefined && !isFrozen(entry) && (!rect || (col >= rect.c0 && col <= rect.c1 && row >= rect.r0 && row <= rect.r1))
      && ['glyph', 'halves'].includes(mergeKind({ char, renderStyle: style, inPicture, wide: isWideChar(char), own: !!ownEntry(entry, style) && !isLaid(entry) }));
  }) && t('toolbar.mergeDialog.repickedNote', { name: layerName(id) });
  // A blank canvas's picture is one color, the same at any size: resizing it gives up nothing.
  const resized = project.pictureIsOriginal && !isUniform(project.image) && t('toolbar.mergeDialog.originalNote');
  const costs = [ownChars, repicked, resized].filter(Boolean);
  // Kept crisp, a vector layer's shapes cover cells whole as they show, but their soft edges go in as paint (R3), in the
  // base's characters.
  const edges = layer?.kind === 'vector' && ownChars && [t('toolbar.mergeDialog.ownCharsEdgesNote', { name: layerName(id), below: layerName(below(id)?.id) })];
  return [edges ? { ...choices[0], costs: edges } : choices[0], costs.length ? { ...choices[1], costs } : choices[1]];
});

// Bake under CGA or VGA asks whether to lock the picture to the palette (exact, but the in-between
// colors are gone) or keep full color (a few cells near palette boundaries can tip). Other
// palettes bake exactly either way, and so do CGA and VGA dithered or resolved (they snap on the grid then). Others
// drawing, it can't be undone: it asks first. The asking is the workspace's (workspace.bake), so the command list's Bake
// asks the same.
const BAKE_CHOICE = computed(() => [{ id: 'bake', title: t('toolbar.bake'), text: t('toolbar.bakeDialog.choiceText') }]);
function chooseBakeFinal() {
  workspace.bakingFinal = false;
  project.bake();
}
const bakeChoices = computed(() => [
  { id: 'full', title: t('toolbar.bakeDialog.keepFullTitle'), text: t('toolbar.bakeDialog.keepFullText', { palette: workspace.baking }) },
  { id: 'lock', title: t('toolbar.bakeDialog.lockPaletteTitle', { palette: workspace.baking }), text: t('toolbar.bakeDialog.lockPaletteText', { palette: workspace.baking }) },
]);
function chooseBake(id) {
  workspace.baking = null;
  project.bake({ lockPalette: id === 'lock' });
}

// Flatten asks where the drawing goes: the edit layer (the default) or the base, worded as opening an .ans file asks.
// Off with frames (the picture is under every one), inside an art layer, and for artists; others drawing, it warns.
const bakeOff = () => off(reasonWords(bakeWhy(project, drawing)), t('toolbar.bake'));
const flattenOff = () => off(reasonWords(flattenWhy(project, drawing)), t('toolbar.flatten'));
// The hidden layers Flatten removes, which its dialog says first.
const hiddenCount = computed(() => project.layers.filter((layer, at) => at && layer.hidden).length);
const flattenSub = computed(() => [t('toolbar.flattenDialog.sub'), hiddenCount.value ? t('toolbar.flattenDialog.hidden', { n: hiddenCount.value }, hiddenCount.value) : null].filter(Boolean).join(' '));
const flattenChoices = computed(() => [
  { id: 'edit', title: t('actions.artEdit'), text: t('actions.artEditText') },
  { id: 'base', title: t('actions.artDrawOn'), text: t('actions.artDrawOnText') },
]);
// The questions are the workspace's (so the command list asks them too), but they go with the toolbar, as they did
// when they were its own: one open as the drawing closes doesn't come back with the next.
onBeforeUnmount(() => Object.assign(workspace, { baking: null, bakingFinal: false, flattening: false }));
function chooseFlatten(layer) {
  workspace.flattening = false;
  project.flattenDrawing({ layer });
}

// The selection's Merge down: only when something's drawn inside it.
const selectionHasEdits = computed(() => {
  void project.editCells; void project.hasPaint; void project.historyVersion; // re-check after edits
  return !!workspace.selection && project.hasEditsIn(workspace.selection);
});

// Make art layer: the Select tool's selection or the Magic Wand's, with something drawn in it.
const artReady = computed(() => {
  void project.editCells; void project.hasPaint; void project.historyVersion; // re-check after edits
  return !artOff.value && !artLayerEmpty(project, workspace);
});
// In a room it goes on the vector layer above the one in use: with none, it's off, as adding one is a stack change.
const artOff = computed(() => reasonWords(artLayerOff(project)));

// Rotate turns only pixels: not while the selection has characters on its layers.
const selectionHasCharacters = computed(() => {
  void project.editCells; void project.baseRecords; void project.historyVersion; // re-check after edits
  return !!workspace.selection && project.hasCharacters(workspace.selection, workspace.selectionIds);
});
// A toggle group as shown: one with shiftFlips (the Eyedropper's one-lit choices) shows the other lit while Shift is
// held, as that's what a click then picks.
const shownToggles = (option) => {
  const value = optionValue(workspace, option);
  return option.shiftFlips && workspace.isShiftPressed ? Object.fromEntries(Object.entries(value).map(([k, on]) => [k, !on])) : value;
};
const SNAP_MODES = ['none', 'cells', 'half'];
const SNAP_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><path d="M128 96H256V160H128ZM384 96H512V160H384ZM128 176H256V320A64 64 0 0 0 384 320V176H512V320A192 192 0 0 1 128 320Z"/></svg>';
</script>

<template>
  <ChoiceDialog
      v-if="merging"
      :title="t('toolbar.mergeDialog.title')"
      :sub="warnedSub(merging.chars
        ? t('toolbar.mergeDialog.subChars', { name: layerName(merging.id), below: layerName(below(merging.id)?.id) })
        : merging.rect
        ? t('toolbar.mergeDialog.subSelection')
        : t('toolbar.mergeDialog.subAll', { name: layerName(merging.id), below: layerName(below(merging.id)?.id) }))"
      :choices="mergeChoices"
      @choose="merge"
      @cancel="merging = null"
  />
  <ChoiceDialog
      v-if="workspace.baking"
      :title="t('toolbar.bakeDialog.titlePalette', { palette: workspace.baking })"
      :sub="warnedSub(t('toolbar.bakeDialog.subPalette'), bakeWarning())"
      :choices="bakeChoices"
      @choose="chooseBake"
      @cancel="workspace.baking = null"
  />
  <ChoiceDialog
      v-if="workspace.bakingFinal"
      :title="t('toolbar.bakeDialog.title')"
      :sub="bakeWarning()"
      :choices="BAKE_CHOICE"
      @choose="chooseBakeFinal"
      @cancel="workspace.bakingFinal = false"
  />
  <ChoiceDialog
      v-if="clearing"
      :title="t('toolbar.clearDialog.title', { name: clearing })"
      :sub="t('toolbar.clearDialog.sub')"
      :choices="clearChoices"
      @choose="chooseClear"
      @cancel="clearing = null"
  />
  <ChoiceDialog
      v-if="workspace.flattening"
      :title="t('toolbar.flattenDialog.title')"
      :sub="warnedSub(flattenSub, t('toolbar.flattenDialog.warning'))"
      :choices="flattenChoices"
      @choose="chooseFlatten"
      @cancel="workspace.flattening = false"
  />
  <article ref="toolbar" class="edit-toolbar" :class="{ 'actions-folded': actionsFolded }">
    <div class="toolbar-row primary-row">
      <div class="color-group">
        <ColorPair/>
      </div>

      <div ref="toolBox" class="tool-group" :style="{ maxWidth: toolsWidth === null ? null : `${toolsWidth}px` }">
        <template v-for="{ slot, face, divider } in tools" :key="slot.id">
          <div v-if="divider" class="divider"/>
          <button
              v-if="slot.tools.length === 1"
              :data-slot="slot.id"
              :data-tool="face.id"
              :class="{ active: workspace.activeTool === face.id, clipped: hiddenSlots.includes(slot.id) }"
              :title="toolTitle(face)"
              :aria-label="face.title"
              :aria-keyshortcuts="face.keys?.join(' ')"
              v-bind="toolOff(face)"
              @click="workspace.setActiveTool(face.id)"
              v-html="face.icon"
          ></button>
          <DropdownMenu
              v-else
              :ref="(menu) => { flyouts[slot.id] = menu; }"
              class="tool-slot tools-menu"
              :class="{ clipped: hiddenSlots.includes(slot.id) }"
              :data-slot="slot.id"
              :label="t(`tools.groups.${slot.id}`)"
              :trigger-label="t(`tools.groups.${slot.id}`)"
              align="left"
          >
            <template #before>
              <button
                  :data-tool="face.id"
                  :class="{ active: workspace.activeTool === face.id }"
                  :title="toolTitle(face)"
                  :aria-label="face.title"
                  :aria-keyshortcuts="face.keys?.join(' ')"
                  v-bind="toolOff(face)"
                  @click="chooseFace(slot.id, face)"
                  @pointerdown="pressSlot(slot.id)"
                  @pointerup="releaseSlot"
                  @pointerleave="releaseSlot"
                  @pointercancel="releaseSlot"
                  @contextmenu.prevent="flyouts[slot.id]?.open()"
                  v-html="face.icon"
              ></button>
            </template>
            <template #trigger><span class="slot-corner" :class="{ lit: workspace.activeTool === face.id }"></span></template>
            <button v-for="tool in slot.tools" :key="tool.id" class="choice" :class="{ on: workspace.activeTool === tool.id }" v-bind="toolOff(tool)" @click="workspace.setActiveTool(tool.id)">
              <span class="tool-icon" v-html="tool.icon"></span><span class="slot-name">{{ tool.title }}</span><span v-if="!phoneLayout && tool.keys" class="slot-keys">{{ keysOf(tool) }}</span>
            </button>
          </DropdownMenu>
        </template>
      </div>
      <DropdownMenu
          v-if="moreTools.length"
          ref="moreMenu"
          class="tools-menu"
          :class="{ 'holds-active': moreTools.some((tool) => tool.id === workspace.activeTool) }"
          :label="t('tools.moreTools')"
          align="left"
      >
        <template #trigger><span v-html="MORE_ICON"></span></template>
        <button v-for="tool in moreTools" :key="tool.id" class="choice" :class="{ on: workspace.activeTool === tool.id }" v-bind="toolOff(tool)" @click="workspace.setActiveTool(tool.id)">
          <span class="tool-icon" v-html="tool.icon"></span><span>{{ tool.title }}</span>
        </button>
      </DropdownMenu>

      <!-- VECTOR's Snap to: where points placed or dragged land (vectorSnap.js). -->
      <template v-if="workspace.editorTab === 'vector'">
        <div v-if="!phoneLayout" class="divider"/>
        <DropdownMenu class="option-menu snap-menu" :class="{ on: phoneLayout && workspace.vectorSnap !== 'none' }" align="left" :label="t('vector.snapTo', { mode: t(`vector.snap.${workspace.vectorSnap}`) })">
          <template v-if="phoneLayout" #trigger><span v-html="SNAP_ICON"></span></template><!-- a phone: a magnet, lit when it snaps -->
          <button v-for="mode in SNAP_MODES" :key="mode" class="choice" :class="{ on: workspace.vectorSnap === mode }" :title="t('vector.snapToTitle', { key: shortcut('mod') })" @click="workspace.vectorSnap = mode"><span>{{ t(`vector.snap.${mode}`) }}</span></button>
        </DropdownMenu>
      </template>

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
            @click="workspace.bake()"
            class="primary"
            :disabled="!project.canBake"
            v-bind="bakeOff()"
        ><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M320 64C346 152 464 216 464 376C464 480 400 568 320 568C240 568 176 480 176 376C176 304 214 254 248 214C254 274 280 308 312 318C292 230 296 136 320 64zM320 480C362 480 392 446 392 404C392 356 356 330 340 288C318 324 280 344 280 400C280 446 292 480 320 480z"/></svg></button>
        <button
            :title="t('toolbar.flattenTitle')"
            @click="workspace.flattening = true"
            class="primary"
            :disabled="!project.canFlatten"
            v-bind="flattenOff()"
        ><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M296.5 69.2C311.4 62.3 328.6 62.3 343.5 69.2L562.1 170.2C570.6 174.1 576 182.6 576 192C576 201.4 570.6 209.9 562.1 213.8L343.5 314.8C328.6 321.7 311.4 321.7 296.5 314.8L77.9 213.8C69.4 209.8 64 201.3 64 192C64 182.7 69.4 174.1 77.9 170.2L296.5 69.2zM112.1 282.4L276.4 358.3C304.1 371.1 336 371.1 363.7 358.3L528 282.4L562.1 298.2C570.6 302.1 576 310.6 576 320C576 329.4 570.6 337.9 562.1 341.8L343.5 442.8C328.6 449.7 311.4 449.7 296.5 442.8L77.9 341.8C69.4 337.8 64 329.3 64 320C64 310.7 69.4 302.1 77.9 298.2L112 282.4zM77.9 426.2L112 410.4L276.3 486.3C304 499.1 335.9 499.1 363.6 486.3L527.9 410.4L562 426.2C570.5 430.1 575.9 438.6 575.9 448C575.9 457.4 570.5 465.9 562 469.8L343.4 570.8C328.5 577.7 311.3 577.7 296.4 570.8L77.9 469.8C69.4 465.8 64 457.3 64 448C64 438.7 69.4 430.1 77.9 426.2z"/></svg></button>
        <button
            :title="mergeTitle"
            @click="mergeHere"
            class="primary"
            :disabled="!mergeOn"
            v-bind="mergeOff()"
        ><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><path d="M288 64H352V320L416 256L461 301L320 442L179 301L224 256L288 320ZM96 496H544V576H96Z"/></svg></button>
        <button
            v-if="clearOffered"
            :title="t('toolbar.clearEditTitle', { name: layerName(project.editId) })"
            @click="confirmClear"
            class="primary"
            :disabled="!project.hasEditLayer || !workspace.pickedCells"
            v-bind="off(insideOff ?? drawing.offWithOthers, t('toolbar.clearEdit'))"
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
          <button @click="workspace.bake()" :disabled="!project.canBake" v-bind="bakeOff()">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M320 64C346 152 464 216 464 376C464 480 400 568 320 568C240 568 176 480 176 376C176 304 214 254 248 214C254 274 280 308 312 318C292 230 296 136 320 64zM320 480C362 480 392 446 392 404C392 356 356 330 340 288C318 324 280 344 280 400C280 446 292 480 320 480z"/></svg>
            {{ t('toolbar.bake') }}
          </button>
          <button @click="workspace.flattening = true" :disabled="!project.canFlatten" v-bind="flattenOff()">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
              <path d="M296.5 69.2C311.4 62.3 328.6 62.3 343.5 69.2L562.1 170.2C570.6 174.1 576 182.6 576 192C576 201.4 570.6 209.9 562.1 213.8L343.5 314.8C328.6 321.7 311.4 321.7 296.5 314.8L77.9 213.8C69.4 209.8 64 201.3 64 192C64 182.7 69.4 174.1 77.9 170.2L296.5 69.2zM112.1 282.4L276.4 358.3C304.1 371.1 336 371.1 363.7 358.3L528 282.4L562.1 298.2C570.6 302.1 576 310.6 576 320C576 329.4 570.6 337.9 562.1 341.8L343.5 442.8C328.6 449.7 311.4 449.7 296.5 442.8L77.9 341.8C69.4 337.8 64 329.3 64 320C64 310.7 69.4 302.1 77.9 298.2L112 282.4zM77.9 426.2L112 410.4L276.3 486.3C304 499.1 335.9 499.1 363.6 486.3L527.9 410.4L562 426.2C570.5 430.1 575.9 438.6 575.9 448C575.9 457.4 570.5 465.9 562 469.8L343.4 570.8C328.5 577.7 311.3 577.7 296.4 570.8L77.9 469.8C69.4 465.8 64 457.3 64 448C64 438.7 69.4 430.1 77.9 426.2z"/>
            </svg>
            {{ t('toolbar.flatten') }}
          </button>
          <button @click="mergeHere" :disabled="!mergeOn" v-bind="mergeOff()">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><path d="M288 64H352V320L416 256L461 301L320 442L179 301L224 256L288 320ZM96 496H544V576H96Z"/></svg>
            {{ t('toolbar.mergeDown') }}
          </button>
          <button v-if="clearOffered" @click="confirmClear" :disabled="!project.hasEditLayer || !workspace.pickedCells" v-bind="off(insideOff ?? drawing.offWithOthers, t('toolbar.clearEdit'))">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
              <path d="M431.2 476.5L163.5 208.8C141.1 240.2 128 278.6 128 320C128 426 214 512 320 512C361.5 512 399.9 498.9 431.2 476.5zM476.5 431.2C498.9 399.8 512 361.4 512 320C512 214 426 128 320 128C278.5 128 240.1 141.1 208.8 163.5L476.5 431.2zM64 320C64 178.6 178.6 64 320 64C461.4 64 576 178.6 576 320C576 461.4 461.4 576 320 576C178.6 576 64 461.4 64 320z"/>
            </svg>
            {{ t('toolbar.clearEdit') }}
          </button>
        </DropdownMenu>
      </div>
    </div>

    <div ref="optionsRow" class="toolbar-row secondary-row" v-if="project.artInside || toolOptions.length || activeTool.palette || activeTool.id === 'select' || kept || vectorRow">
      <!-- Stepped into an art layer: say so, and the way out (also Esc: useKeyboardShortcuts). -->
      <div v-if="project.artInside" class="tool-setting-group">
        <span class="option-label">{{ t('art.editing') }}</span>
        <button class="text" :title="t('art.doneTitle')" aria-keyshortcuts="Escape" @click="stepOut">{{ t('art.done') }}</button>
        <div class="divider"/>
      </div>
      <VectorOptions v-if="workspace.editorTab === 'vector'"/>
      <PaletteStrip v-if="activeTool.palette"/>
      <div v-if="activeTool.id === 'select'" class="tool-setting-group">
        <template v-if="workspace.selection">
          <button v-for="b in recolorButtons" :key="b.key" class="text" :title="b.title" :disabled="b.disabled" :data-off-reason="b.disabled ? '' : undefined" @click="recolor(b.colors)">{{ b.label }}</button>
          <div class="divider"/>
          <button :title="t('toolbar.selection.copyTitle', { key: shortcut('mod', 'C') })" :aria-label="t('toolbar.selection.copyTitle', { key: shortcut('mod', 'C') })" @click="copySelection"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><path d="M240 64H528A48 48 0 0 1 576 112V400A48 48 0 0 1 528 448H448V384H512V128H256V192H192V112A48 48 0 0 1 240 64ZM112 192H400A48 48 0 0 1 448 240V528A48 48 0 0 1 400 576H112A48 48 0 0 1 64 528V240A48 48 0 0 1 112 192Z"/></svg></button>
          <button :title="t('toolbar.selection.cutTitle', { key: shortcut('mod', 'X') })" :aria-label="t('toolbar.selection.cutTitle', { key: shortcut('mod', 'X') })" @click="cutSelection"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><path fill-rule="evenodd" d="M192 368A96 96 0 1 1 192 560A96 96 0 1 1 192 368ZM192 416A48 48 0 1 0 192 512A48 48 0 1 0 192 416ZM448 368A96 96 0 1 1 448 560A96 96 0 1 1 448 368ZM448 416A48 48 0 1 0 448 512A48 48 0 1 0 448 416Z"/><path d="M480 48L544 88L310 408L254 372ZM160 48L96 88L330 408L386 372Z"/></svg></button>
          <button :title="pasteTitle" :aria-label="pasteTitle" :disabled="!workspace.clipboard" @click="pasteSelection"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><path fill-rule="evenodd" d="M160 96H208V176H432V96H480A64 64 0 0 1 544 160V528A64 64 0 0 1 480 592H160A64 64 0 0 1 96 528V160A64 64 0 0 1 160 96ZM160 224V528H480V224Z"/><path d="M256 48H384A32 32 0 0 1 416 80V144H224V80A32 32 0 0 1 256 48Z"/></svg></button>
          <button :title="t('toolbar.selection.deleteTitle')" :aria-label="t('toolbar.selection.delete')" aria-keyshortcuts="Delete E" @click="deleteSelection"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" aria-hidden="true"><path d="M135.2 17.7C140.6 6.8 151.7 0 163.8 0h120.4c12.1 0 23.2 6.8 28.6 17.7L320 32h96c17.7 0 32 14.3 32 32s-14.3 32-32 32H32C14.3 96 0 81.7 0 64s14.3-32 32-32h96l7.2-14.3zM32 128h384v320c0 35.3-28.7 64-64 64H96c-35.3 0-64-28.7-64-64V128zm96 64c-8.8 0-16 7.2-16 16v224c0 8.8 7.2 16 16 16s16-7.2 16-16V208c0-8.8-7.2-16-16-16zm96 0c-8.8 0-16 7.2-16 16v224c0 8.8 7.2 16 16 16s16-7.2 16-16V208c0-8.8-7.2-16-16-16zm96 0c-8.8 0-16 7.2-16 16v224c0 8.8 7.2 16 16 16s16-7.2 16-16V208c0-8.8-7.2-16-16-16z"/></svg></button>
          <button :title="t('toolbar.selection.stampTitle')" :aria-label="t('toolbar.selection.stamp')" aria-keyshortcuts="S C" @click="stampSelection"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><path d="M272 64H368A48 48 0 0 1 416 112V176C416 224 384 256 384 304H480A64 64 0 0 1 544 368V432H96V368A64 64 0 0 1 160 304H256C256 256 224 224 224 176V112A48 48 0 0 1 272 64ZM96 480H544V544H96Z"/></svg></button>
          <button :title="t('toolbar.selection.flipHTitle')" :aria-label="t('toolbar.selection.flipH')" @click="turnSelection('h')"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><path d="M272 128V512H64Z"/><path fill-rule="evenodd" d="M368 128L576 512H368ZM416 320V464H494Z"/><path d="M304 64H336V576H304Z"/></svg></button>
          <button :title="t('toolbar.selection.flipV')" :aria-label="t('toolbar.selection.flipV')" @click="turnSelection('v')"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><path d="M128 272H512L128 64Z"/><path fill-rule="evenodd" d="M128 368H512L128 576ZM320 416H176V494Z"/><path d="M64 304H576V336H64Z"/></svg></button>
          <button :title="selectionHasCharacters ? t('toolbar.selection.rotateCharsDisabled') : t('toolbar.selection.rotateTitle')" :aria-label="t('toolbar.selection.rotateAria')" :disabled="selectionHasCharacters" :data-off-reason="selectionHasCharacters ? '' : undefined" @click="turnSelection('cw')"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><path d="M320 96A224 224 0 1 0 544 320H480A160 160 0 1 1 433.1 206.9L384 256H544V96L478.4 161.6A223.3 223.3 0 0 0 320 96Z"/></svg></button>
          <div class="divider"/>
          <button class="text" :title="t('toolbar.selection.mergeDownSelectionTitle')" :disabled="!selectionHasEdits" v-bind="mergeOff()" @click="mergeDown(picked, workspace.selection)">{{ t('toolbar.mergeDown') }}</button>
          <button class="text" :title="artOff || t('art.makeTitle')" :disabled="!artReady" :data-off-reason="!artReady && artOff ? '' : undefined" @click="project.makeArtLayer()">{{ t('art.make') }}</button>
          <button class="text" :title="t('toolbar.selection.deselectBlockTitle')" aria-keyshortcuts="Escape Enter" @click="deselect">{{ t('toolbar.selection.deselect') }}</button>
        </template>
        <template v-else>
          <span class="hint"><span class="mouse">{{ t('toolbar.selection.dragHint') }}</span><span class="touch">{{ t('toolbar.selection.tapHint') }}</span></span>
          <button v-for="b in recolorButtons" :key="b.key" class="text" :title="b.title" :disabled="b.disabled" :data-off-reason="b.disabled ? '' : undefined" @click="recolor(b.colors)">{{ b.label }}</button>
          <button class="text" :title="t('toolbar.selection.selectAllTitle', { key: shortcut('mod', 'A') })" @click="project.changeSelection((w) => w.selectAll(project.gridRect()))">{{ t('toolbar.selection.selectAll') }}</button>
          <button class="text" :title="t('toolbar.selection.mergeDownAllTitle')" :disabled="!mergeOn" v-bind="mergeOff()" @click="mergeDown(picked)">{{ t('toolbar.mergeDown') }}</button>
        </template>
      </div>
      <div v-if="toolOptions.length" class="tool-setting-group">
        <template v-for="(option, i) in toolOptions" :key="option.key">
          <div v-if="i > 0" class="divider"/>
          <label v-if="option.type === 'checkbox'" class="checkbox-wrapper" :title="option.title">
            <span>{{ option.label }}</span>
            <input type="checkbox" :checked="optionValue(workspace, option)" @change="setOptionValue(workspace, option, $event.target.checked)"/>
          </label>
          <label v-else-if="option.type === 'color'" class="color-wrapper" :title="option.title">
            <span>{{ option.label }}</span>
            <input type="color" class="option-color" :value="optionValue(workspace, option)" :aria-label="option.label" @input="setOptionValue(workspace, option, $event.target.value)" @change="option.commit?.()"/>
          </label>
          <div v-else-if="option.type === 'segmented'" class="segmented" role="group" :aria-label="option.label">
            <button
                v-for="choice in option.choices"
                class="text"
                :key="String(choice.value)"
                :class="{ on: optionValue(workspace, option) === choice.value }"
                :title="choice.icon && choice.label"
                :aria-label="choice.icon && choice.label"
                @click="setOptionValue(workspace, option, choice.value)"
            ><span v-if="choice.icon" v-html="choice.icon"></span><template v-else>{{ choice.label }}</template></button>
          </div>
          <template v-else-if="option.type === 'toggles'">
            <span class="option-label">{{ option.label }}</span>
            <ToggleGroup :model-value="shownToggles(option)" :options="option.options" :label="option.label" :single="!!option.single" @update:model-value="setOptionValue(workspace, option, $event)"/>
          </template>
          <DropdownMenu v-else-if="option.type === 'dropdown'" class="option-menu" align="left" :label="shownChoice(option)?.label ?? option.label">
            <template v-for="choice in offered(option)" :key="String(choice.value)">
              <div v-if="choice.divider" class="menu-rule" role="separator"/><!-- not a button: the arrow keys pass over it -->
              <button
                  class="choice"
                  :class="{ on: shownChoice(option) === choice }"
                  @click="setOptionValue(workspace, option, choice.value)"
              ><span v-if="offered(option).some((c) => c.glyph)" class="glyph" :class="{ 'display-font': choice.glyphFont }">{{ typeof choice.glyph === 'function' ? choice.glyph(workspace) : choice.glyph }}</span><span>{{ choice.label }}</span></button>
            </template>
          </DropdownMenu>
          <CharField v-else-if="option.type === 'char'" :model-value="optionValue(workspace, option)" :label="option.label" @update:model-value="setOptionValue(workspace, option, $event)"/>
          <RangeField v-else compact :setting="option" :model-value="optionValue(workspace, option)" @update:model-value="setOptionValue(workspace, option, $event)" @commit="option.commit?.($event)"/>
        </template>
      </div>
      <div v-if="activeTool.id === 'hand'" class="tool-setting-group">
        <div class="divider"/>
        <button class="text" :title="t('tools.hand.clearGuidesTitle')" :disabled="!workspace.guides.length" @click="workspace.clearGuides()">{{ t('tools.hand.clearGuides') }}</button>
        <!-- Mirror mode's switch, as Alt+M and the rulers' corner have it; VECTOR's tools don't mirror. -->
        <label v-if="workspace.editorTab !== 'vector'" class="checkbox-wrapper" :title="t('tools.hand.mirrorTitle')">
          <span>{{ t('tools.hand.mirror') }}</span>
          <input type="checkbox" v-model="workspace.mirror"/>
        </label>
      </div>
      <div v-if="recolored && activeTool.id === 'wand'" class="tool-setting-group">
        <div class="divider"/>
        <button v-for="b in recolorButtons" :key="b.key" class="text" :title="b.title" :disabled="b.disabled" :data-off-reason="b.disabled ? '' : undefined" @click="recolor(b.colors)">{{ b.label }}</button>
      </div>
      <div v-if="kept && activeTool.id !== 'select'" class="tool-setting-group">
        <div class="divider"/>
        <button v-if="wandHere && activeTool.id === 'wand'" class="text" :title="t('toolbar.selection.wandDeleteTitle')" aria-keyshortcuts="Delete" @click="project.deleteInWand(workspace.selection.mask, workspace.editorTab, workspace.selectionIds)">{{ t('common.delete') }}</button>
        <button v-if="wandHere && activeTool.id === 'wand'" class="text" :title="artOff || t('art.makeTitle')" :disabled="!artReady" :data-off-reason="!artReady && artOff ? '' : undefined" @click="project.makeArtLayer()">{{ t('art.make') }}</button>
        <button class="text" :title="t('toolbar.selection.wandDeselectTitle')" aria-keyshortcuts="Escape" @click="deselect">{{ t('toolbar.selection.deselect') }}</button>
        <!-- The wand's All layers (Select's is its tool option): last on the row, so short of room it's what folds into ⋯, not Delete. -->
        <label v-if="wandHere && activeTool.id === 'wand'" class="checkbox-wrapper" :title="t('tools.select.allLayersTitle')">
          <span>{{ t('tools.select.allLayers') }}</span>
          <input type="checkbox" v-model="workspace.selectAllLayers"/>
        </label>
      </div>
      <DropdownMenu class="options-more" hidden :label="t('toolbar.moreOptions')" align="left" @click.capture="takeFolded">
        <template #trigger><span v-html="MORE_ICON"></span></template>
        <button
            v-for="item in foldedOptions"
            :key="item.label"
            class="choice"
            :title="item.title"
            :disabled="item.disabled"
            :data-off-reason="item.disabled && item.offReason ? '' : undefined"
            :role="item.checked && 'menuitemcheckbox'"
            :aria-checked="item.checked"
            @click="item.el.click()"
        ><span class="tool-icon" v-html="item.icon"></span><span>{{ item.label }}</span></button>
      </DropdownMenu>
    </div>
    <!-- Opened by the Text tool's strip or the Font field's Manage fonts, with any tool; from the toolbar's bottom edge, so no scrolling row clips it. -->
    <CharPaletteLayer v-if="workspace.paletteLayerOpen" @close="workspace.paletteLayerOpen = false"/>
    <!-- The color box, opened by the color pair's chips (one layer at a time: ColorLayer closes the other). -->
    <ColorLayer v-if="workspace.colorBox"/>
  </article>
</template>

<style scoped>
article.edit-toolbar {
  position: relative; /* the palette and color layers open from its bottom edge */
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

div.secondary-row [data-folded],
div.secondary-row > .options-more[hidden] {
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

.tools-menu :deep(svg),
.options-more :deep(svg),
.snap-menu :deep(.dropdown-trigger svg) {
  display: block;
  width: 16px;
  height: 16px;
  fill: var(--text-faint);
  color: var(--text-faint);
}

.tools-menu :deep(.dropdown-trigger:hover) svg,
.options-more :deep(.dropdown-trigger:hover) svg,
.snap-menu :deep(.dropdown-trigger:hover svg),
.tools-menu button.choice.on :deep(svg) {
  fill: var(--text-on-accent);
  color: var(--text-on-accent);
}

/* The active tool is in the menu: the ⋯ lights up like a tool button; so does a phone's magnet when it snaps. */
.tools-menu.holds-active :deep(.dropdown-trigger),
.snap-menu.on :deep(.dropdown-trigger) {
  background: var(--accent);
  border-color: var(--accent);
}

.tools-menu.holds-active :deep(svg),
.snap-menu.on :deep(.dropdown-trigger svg) {
  fill: var(--text-on-accent);
  color: var(--text-on-accent);
}

/* Menu items are an icon (or glyph) and a label; a label that wraps stays in its own column. */
.tools-menu button.choice,
.options-more button.choice,
.option-menu button.choice {
  display: flex;
  align-items: flex-start;
  text-align: left;
}

.tools-menu span.tool-icon,
.options-more span.tool-icon {
  flex-shrink: 0;
  margin-right: 8px;
}

/* A checkbox's item may have no icon (it's off): its label stays in the column. */
.options-more span.tool-icon {
  min-width: 16px;
}

/* A slot of several tools: its tool's button, with a corner that opens the rest (a triangle, lit with the button). */
article.tool-slot {
  display: flex;
}

/* Its hover, too (DropdownMenu's trigger look): clear, only the triangle lit. */
.tool-slot :deep(.dropdown-trigger),
.tool-slot :deep(button.dropdown-trigger:hover:not(:disabled)) {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 12px;
  height: 12px;
  padding: 0;
  background: transparent;
  border: none;
  box-shadow: none;
  transform: none;
}

span.slot-corner {
  position: absolute;
  right: 2px;
  bottom: 2px;
  border-left: 5px solid transparent;
  border-bottom: 5px solid var(--text-faint);
  pointer-events: none;
}

span.slot-corner.lit,
.tool-slot :deep(.dropdown-trigger:hover) span.slot-corner {
  border-bottom-color: var(--text-on-accent);
}

.tool-slot > button {
  -webkit-touch-callout: none; /* a long press opens the slot, not the phone's own menu */
}

.tool-slot button.choice span.slot-name {
  flex: 1;
}

.tool-slot button.choice span.slot-keys {
  margin-left: 16px;
  color: var(--text-muted);
}

.tool-slot button.choice.on span.slot-keys {
  color: inherit;
}

/* A slot moved into the ⋯ menu stays in the row, measured but out of sight (and out of the Tab order). */
.clipped {
  visibility: hidden;
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
  color: var(--text-on-accent);
}

span.hint,
div.vector-options > :deep(span.hint) {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
}

/* "Click" for a mouse, "Tap" for a finger. */
span.hint span.touch {
  display: none;
}
@media (pointer: coarse) {
  span.hint span.mouse {
    display: none;
  }
  span.hint span.touch {
    display: inline;
  }
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

/* A choice in the row (Smooth or Corner, Fill or Stroke), lit as a segmented one is. */
div.vector-options > :deep(button.text[aria-pressed='true']) {
  background: var(--accent);
  color: var(--text-on-accent);
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

/* A slider's value beside it (setting.readout), two digits wide so the row doesn't shift. */
div.tool-setting-group :deep(span.readout) {
  min-width: 2ch;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--text);
}

/* A compact slider is as wide as its 80px range, not the row (its wrapper is 100% elsewhere). */
div.tool-setting-group :deep(div.range-wrapper) {
  width: auto;
}

label.checkbox-wrapper,
label.color-wrapper {
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

/* A color option's swatch: the page's color field, a little smaller to sit in the row. */
input.option-color {
  flex-shrink: 0;
  width: 32px;
  height: 22px;
  padding: 3px;
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

/* A phone's VECTOR row is its widest: its buttons a little narrower and closer, it fits a 375px phone. */
@media (max-width: 768px) {
  div.tool-setting-group.vector-options {
    gap: 4px;
  }

  div.vector-options > :deep(button) {
    padding: 3px 5px;
  }
}

button :deep(svg) {
  fill: var(--text-faint);
  color: var(--text-faint);
  width: 16px;
  height: 16px;
  display: block;
}

@media (hover: hover) { /* a tap on a touch screen leaves no hover look behind */
  button:hover :deep(svg) {
    fill: var(--text);
    color: var(--text);
  }
}

/* The VECTOR row's icon buttons (Copy, Cut, Paste) are its component's, which the rule above doesn't reach. */
div.vector-options > :deep(button svg) {
  fill: var(--text-faint);
  color: var(--text-faint);
  width: 16px;
  height: 16px;
  display: block;
}

@media (hover: hover) {
  div.vector-options > :deep(button:hover svg) {
    fill: var(--text);
    color: var(--text);
  }
}

button.primary :deep(svg) {
  fill: var(--text);
  color: var(--text);
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
    color: var(--text-inverted);
  }
}

button.active {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--text-on-accent);
}

button.active :deep(svg) {
  fill: var(--text-on-accent);
  color: var(--text-on-accent);
}

button:disabled,
div.vector-options > :deep(button:disabled) {
  opacity: 0.35;
}

/* Option dropdowns list their glyphs in an even column; the current choice is lit. */
.option-menu button.choice.on,
.tools-menu button.choice.on {
  background: var(--accent);
  color: var(--text-on-accent);
}

.option-menu span.glyph {
  flex-shrink: 0;
  width: 2ch;
  margin-right: 8px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  line-height: 1;
}

/* The rule between Single and Double and the font's own line styles. */
.option-menu div.menu-rule {
  margin: 4px 0;
  border-top: 1px solid var(--surface-3);
}

.option-menu span.glyph.display-font {
  font-family: var(--display-font-family);
}

/* Icon choices take the button's text color, and are as tall as a text label. */
button.text :deep(svg) {
  color: inherit;
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
