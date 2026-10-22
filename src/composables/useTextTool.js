import { onMounted, onBeforeUnmount, watch } from 'vue';
import { textKeyAction, moveCursor } from '@/lib/TextKeys';
import { charRowsOf } from '@/lib/Cells';
import { hex2rgb, paletteIndex } from '@/lib/ColorUtils';

// The Text tool's keyboard, while it's active in the ANSI view with a cursor placed. Keys aimed
// at a field (or anything TextKeys doesn't map) are left alone.
export function useTextTool(project, workspace) {
  const editableFocus = () => {
    const el = document.activeElement;
    return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
  };

  const move = (dc, dr) => {
    workspace.textCursor = moveCursor(workspace.textCursor, dc, dr, project.cols, charRowsOf(project.rows));
  };

  // Alt+Up/Down: the slot's colour steps through the active palette (nothing to step in 24-bit).
  const stepColor = (slot, delta) => {
    const palette = project.activePalette;
    if (!palette || !palette.length) return;
    const { r, g, b } = hex2rgb(slot === 'fg' ? workspace.editFgColor : workspace.editBgColor);
    const next = palette[(paletteIndex(r, g, b, palette) + delta + palette.length) % palette.length];
    workspace.setColor(slot, next.hex.toLowerCase());
  };

  const apply = (action) => {
    const { col, row } = workspace.textCursor;
    const insert = workspace.insertMode;
    switch (action.type) {
      case 'char':
        project.typeAt(col, row, action.char, workspace.typingAttrs(), { insert });
        move(1, 0);
        break;
      case 'move': move(action.dc, action.dr); break;
      case 'home': move(-col, 0); break;
      case 'end': move(project.cols, 0); break;
      case 'newline': move(-col, 1); break;
      case 'backspace':
        project.backspaceAt(col, row, workspace.typingAttrs(), { insert });
        move(-1, 0);
        break;
      case 'delete': project.deleteAt(col, row); break;
      case 'toggleInsert': workspace.insertMode = !workspace.insertMode; break;
      case 'color': stepColor(action.slot, action.delta); break;
      // 'slot', 'grab' and 'palette' arrive with the character palettes
    }
  };

  const onKeyDown = (event) => {
    if (workspace.editorTab !== 'output' || workspace.activeTool !== 'text' || !workspace.textCursor || workspace.paletteLayerOpen) return;
    const action = textKeyAction(event, { editable: editableFocus() });
    if (!action) return;
    event.preventDefault();
    apply(action);
  };

  // Keep the cursor on the grid when it changes size.
  watch(() => [project.cols, project.rows], () => {
    if (workspace.textCursor) move(0, 0);
  });

  onMounted(() => window.addEventListener('keydown', onKeyDown));
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeyDown));
}
