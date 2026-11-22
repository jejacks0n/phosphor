import { t } from '@/i18n';
import { toast } from '@/composables/useToast';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { addBitmapFont } from '@/lib/userFonts';
import { fontId, narrowWidthOf } from '@/lib/BitmapFont';

// The question a font narrower than 8 asks once it's the drawing's font with no answer (setDrawingFont's { ask: true }):
// a toast that stays, with Draw it n wide and Keep it 8 wide. Either is the drawing's width (setDrawingFontWidth) and
// the answer remembered on the browser's copy of the font, which joins Yours first when it isn't there. Closed
// unanswered, nothing is kept, so it's asked next time. Not asked with no drawing, nor in someone else's room (the
// host's width is theirs). An answer once the drawing's font is another does nothing.
export function askFontWidth(font) {
  const project = useProjectStore(), n = narrowWidthOf(font), id = fontId(font);
  if (!project.image || !n || (project._sharing && project._sharing.role !== 'host')) return;
  const answer = (width) => async () => {
    if (!project.drawingFont || fontId(project.drawingFont) !== id) return;
    const workspace = useWorkspaceStore();
    if (!workspace.userFonts?.some((f) => f.id === id)) { // so the answer has somewhere to live
      const kept = await addBitmapFont(new File([font.bytes], `${font.name}.F${String(font.height).padStart(2, '0')}`));
      workspace.userFonts = [...(workspace.userFonts ?? []).filter((f) => f.id !== kept.id), kept];
    }
    project.setDrawingFontWidth(width);
  };
  toast(t('palette.fonts.widthQuestion', { name: font.name, n }), {
    stay: true,
    action: { label: t('palette.fonts.widthNarrow', { n }), run: answer(n) },
    second: { label: t('palette.fonts.widthKeep'), run: answer(8) },
  });
}
