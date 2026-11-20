import { watch } from 'vue';
import { t } from '@/i18n';
import { toast, closeToast } from '@/composables/useToast';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { blocksOf, fontId } from '@/lib/BitmapFont';
import { missingBlocks, blockNames } from '@/lib/fontSetup';

// A font's blocks set up from a toast: while the drawing's font has no lower half (project.paintOff) a toast says so
// until it's fixed, with Set up its blocks, which opens the Fonts page on that font with its first missing block
// picked. A font loaded or opened missing other blocks names them, for a while. In a room the drawing's font's blocks
// can't change (FontsPage's inRoom): no button, and the toast says so. With no drawing open (the start screen, SOCIAL)
// there's nothing to paint, so nothing is said.
let shown = null; // the toast that stays, while it's up

const missingOf = missingBlocks;
const isDrawn = (font) => !!useProjectStore().drawingFont && fontId(useProjectStore().drawingFont) === fontId(font);
const blocked = (font) => useProjectStore().inRoom && isDrawn(font);
const said = (text, font) => (blocked(font) ? `${text} ${t('palette.fonts.setupInRoom')}` : text);
const button = (font) => (blocked(font) ? {} : { action: { label: t('palette.fonts.setupButton'), run: () => openFontSetup(font) } });

// The palette layer on its Fonts page, with this font chosen and its first missing block picked (Lower first).
export function openFontSetup(font) {
  const project = useProjectStore(), workspace = useWorkspaceStore(), missing = missingOf(font);
  if (project.image && !workspace.editMode) workspace.editorTab = 'output'; // as the Font field's Manage fonts does
  workspace.fontSetup = { id: fontId(font), block: missing.includes('lower') ? 'lower' : missing[0] ?? null };
  workspace.paletteLayerPage = 'fonts';
  workspace.paletteLayerOpen = true;
}

// The toast that stays, while the drawing's font has no lower half (again, once closed: a paint tool that's off asks).
export function showFontSetup() {
  const project = useProjectStore(), font = project.drawingFont;
  if (!project.image || !font || blocksOf(font)[1] !== null) return;
  shown = toast(said(t('palette.fonts.setupNoLower', { name: font.name }), font), { stay: true, ...button(font) });
}

// A font just loaded or opened with an XBin: the blocks it's missing, when it has its lower half (else the toast
// that stays says so).
export function sayMissingBlocks(font) {
  const missing = missingOf(font);
  if (!missing.length || missing.includes('lower')) return;
  const names = blockNames(missing);
  toast(said(t('palette.fonts.setupMissing', { names }, missing.length), font), button(font));
}

// Installed once (App.vue): the toast that stays follows the drawing's font, comes back with each document opened
// (project._layersStarted counts them), goes with the drawing, and changes as a room starts or ends. Each source
// on its own, so a block set other than Lower (the font rebuilt, the same id) doesn't bring it back. Lower given a
// slot, in the same document and font, says paint is on.
export function useFontSetup() {
  const project = useProjectStore();
  watch([
    () => project.paintOff,
    () => project.drawingFont && fontId(project.drawingFont),
    () => project._layersStarted,
    () => !!project.image,
    () => project.inRoom,
  ], ([off, id, opened, image], was) => {
    if (off && image) return showFontSetup();
    closeToast(shown);
    if (image && was?.[0] && id && id === was[1] && opened === was[2]) toast(t('palette.fonts.setupFixed', { n: blocksOf(project.drawingFont)[1] }));
  }, { immediate: true });
}
