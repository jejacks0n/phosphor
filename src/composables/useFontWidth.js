import { t } from '@/i18n';
import { toast } from '@/composables/useToast';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { addBitmapFont } from '@/lib/userFonts';
import { blocksOf, fontId, narrowWidthOf } from '@/lib/BitmapFont';

// The question a font narrower than 8 asks once it's the drawing's font with no answer (setDrawingFont's { ask: true }):
// a toast that stays, with Draw it n wide and Keep it 8 wide. Either is the drawing's width (setDrawingFontWidth) and
// the answer remembered on the browser's copy of the font, which joins Yours first when it isn't there (when it can't,
// the width still changes and a toast says the answer wasn't kept). Closed unanswered, nothing is kept, so it's asked
// next time. Not asked with no drawing, nor in someone else's room (the host's width is theirs: useFontActions'
// hostsFont), nor for a font with no lower half: "Set up its blocks" has the one toast (useFontSetup), and the width
// is asked the next time the font is chosen. An answer once the drawing's font is another does nothing.
export function askFontWidth(font) {
  const project = useProjectStore(), workspace = useWorkspaceStore(), n = narrowWidthOf(font), id = fontId(font);
  if (!project.image || !n || workspace.roomFont || blocksOf(font)[1] === null) return;
  const answer = (width) => async () => {
    if (!project.drawingFont || fontId(project.drawingFont) !== id) return;
    let kept = workspace.userFonts?.some((f) => f.id === id);
    if (!kept) { // so the answer has somewhere to live
      try {
        const entry = await addBitmapFont(new File([font.bytes], `${font.name}.F${String(font.height).padStart(2, '0')}`));
        workspace.userFonts = [...(workspace.userFonts ?? []).filter((f) => f.id !== entry.id), entry];
        kept = true;
      } catch {
        // the browser's storage refused it: the drawing still takes the width
      }
    }
    project.setDrawingFontWidth(width);
    if (!kept) toast(t('palette.fonts.widthNotKept', { name: font.name }));
  };
  toast(t('palette.fonts.widthQuestion', { name: font.name, n }), {
    stay: true,
    action: { label: t('palette.fonts.widthNarrow', { n }), run: answer(n) },
    second: { label: t('palette.fonts.widthKeep'), run: answer(8) },
  });
}
