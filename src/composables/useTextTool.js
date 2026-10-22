import { onMounted, onBeforeUnmount } from 'vue';
import { textKeyAction, moveCursor } from '@/lib/TextKeys';
import { charRowsOf } from '@/lib/Cells';
import { hex2rgb, paletteIndex } from '@/lib/ColorUtils';
import { usePaletteStore } from '@/store/PaletteStore';
import { toast } from '@/composables/useToast';

// Type one character at the Text tool's cursor and move right (the keyboard and the F-key strip).
export function typeAtCursor(project, workspace, char) {
  const cursor = workspace.textCursor;
  if (!cursor) return;
  project.typeAt(cursor.col, cursor.row, char, workspace.typingAttrs(), { insert: workspace.insertMode });
  workspace.textCursor = moveCursor(cursor, 1, 0, project.cols, charRowsOf(project.rows));
}

// The Text tool's keyboard, while it's active in the ANSI view with a cursor placed. Keys aimed
// at a field (or anything TextKeys doesn't map) are left alone.
export function useTextTool(project, workspace) {
  const palettes = usePaletteStore();
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
    const { col, row } = workspace.textCursor ?? {};
    const insert = workspace.insertMode;
    switch (action.type) {
      case 'char': typeAtCursor(project, workspace, action.char); break;
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
      case 'slot': {
        const glyph = palettes.active.glyphs[action.index];
        if (!glyph) break;
        workspace.activeChar = glyph;
        typeAtCursor(project, workspace, glyph);
        break;
      }
      case 'grab': {
        // Ctrl+F-key: the character under the cursor (what's showing there) goes onto that slot.
        const char = project.underlyingAt(col, row).char;
        if (!char) break;
        const { forked } = palettes.setSlot(palettes.active.id, action.index, char);
        palettes.flash(action.index);
        if (forked) toast(`Built-ins are locked, so you're now editing your copy, "${forked}".`);
        break;
      }
      case 'palette': palettes.flip(action.delta); break;
    }
  };

  const onKeyDown = (event) => {
    if (workspace.editorTab !== 'output' || workspace.activeTool !== 'text' || workspace.paletteLayerOpen) return;
    const action = textKeyAction(event, { editable: editableFocus() });
    if (!action) return;
    // Without a cursor only palette flips and slot choices apply (a slot still sets the character to draw with).
    if (!workspace.textCursor && action.type !== 'palette' && action.type !== 'slot') return;
    event.preventDefault();
    apply(action);
  };

  onMounted(() => window.addEventListener('keydown', onKeyDown));
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeyDown));
}
