import { watch } from 'vue';
import { t, locale } from '@/i18n';
import { toast, closeToast } from '@/composables/useToast';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { BLOCKS, blocksOf, fontId } from '@/lib/BitmapFont';

// A font's blocks set up from a toast: while the drawing's font has no lower half (project.paintOff) a toast says so
// until it's fixed, with Set up its blocks, which opens the Fonts page on that font with its first missing block
// picked. A font loaded or opened missing other blocks names them, for a while. In a room the drawing's font's blocks
// can't change (FontsPage's inRoom): no button, and the toast says so.
let shown = null; // the toast that stays, while it's up

const missingOf = (font) => blocksOf(font).flatMap((s, i) => (s === null ? [BLOCKS[i].key] : []));
const isDrawn = (font) => !!useProjectStore().drawingFont && fontId(useProjectStore().drawingFont) === fontId(font);
const blocked = (font) => useProjectStore().inRoom && isDrawn(font);
const said = (text, font) => (blocked(font) ? `${text} ${t('palette.fonts.setupHostOnly')}` : text);
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
  const font = useProjectStore().drawingFont;
  if (!font || blocksOf(font)[1] !== null) return;
  shown = toast(said(t('palette.fonts.setupNoLower', { name: font.name }), font), { stay: true, ...button(font) });
}

// A font just loaded or opened with an XBin: the blocks it's missing, when it has its lower half (else the toast
// that stays says so).
export function sayMissingBlocks(font) {
  const missing = missingOf(font);
  if (!missing.length || missing.includes('lower')) return;
  const names = new Intl.ListFormat(locale.value, { type: 'disjunction' }).format(missing.map((key) => t(`palette.fonts.blockName.${key}`)));
  toast(said(t('palette.fonts.setupMissing', { names }, missing.length), font), button(font));
}

// Installed once (App.vue): the toast that stays follows the drawing's font, and comes back with each document opened
// (project._layersStarted counts them). Lower given a slot, in the same document and font, says paint is on.
export function useFontSetup() {
  const project = useProjectStore();
  watch(() => [project.paintOff, project.drawingFont && fontId(project.drawingFont), project._layersStarted], ([off, id, opened], was) => {
    if (off) return showFontSetup();
    closeToast(shown);
    if (was?.[0] && id && id === was[1] && opened === was[2]) toast(t('palette.fonts.setupFixed', { n: blocksOf(project.drawingFont)[1] }));
  }, { immediate: true });
}
