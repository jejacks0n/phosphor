import { onMounted, onBeforeUnmount, watch } from 'vue';
import { textKeyAction, moveCursor, typedText } from '@/lib/TextKeys';
import { charRowsOf } from '@/lib/Cells';
import { effectiveColor, paletteChoices } from '@/lib/PixelTransforms';
import { usePaletteStore } from '@/store/PaletteStore';
import { toast } from '@/composables/useToast';
import { cellWidth } from '@/lib/CharWidth';
import { isField, isTextInput } from '@/lib/fields';
import { snapCursor } from '@/document/wideChars';

// Type one character at the Text tool's cursor and move right by its width (the keyboard and the
// F-key strip). The cursor never rests on a wide character's trail.
export function typeAtCursor(project, workspace, char) {
  const cursor = workspace.textCursor;
  if (!cursor) return;
  if (!project.typeAt(cursor.col, cursor.row, char, workspace.typingAttrs(), { insert: workspace.insertMode })) {
    toast('No room for a two-column character in the last column.');
    return;
  }
  workspace.textCursor = snapCursor(project.cells, project.cols, moveCursor(cursor, cellWidth(char), 0, project.cols, charRowsOf(project.rows)), 1);
}

// A paste: typed from the cursor (typeLines), one undo step of its own.
export function typeText(project, workspace, text) {
  project.commitPending();
  typeLines(project, workspace, text);
  project.commitPending();
}

// Text as typing, from the Text tool's cursor (an input method, the emoji picker, a paste): a line
// break goes to the next row at the column the text started in, once a row is full the rest of that
// line is dropped, and lines with no row left are dropped too.
function typeLines(project, workspace, text) {
  const start = workspace.textCursor;
  if (!start) return;
  let full = false;
  for (const action of typedText(text)) {
    if (action.type === 'newline') {
      const { row } = workspace.textCursor;
      if (row === charRowsOf(project.rows) - 1) break;
      full = false;
      workspace.textCursor = snapCursor(project.cells, project.cols, moveCursor({ col: start.col, row }, 0, 1, project.cols, charRowsOf(project.rows)), 0);
    } else if (!full) {
      const before = workspace.textCursor.col;
      typeAtCursor(project, workspace, action.char);
      full = workspace.textCursor.col - before < cellWidth(action.char);
    }
  }
}

// The Text tool's keyboard, while it's active in the ANSI view with a cursor placed. Keys aimed
// at a field (or anything TextKeys doesn't map) are left alone. Text arrives through textInput, a
// hidden textarea at the cursor that has focus while the tool is in use: an input method's
// compositions, dead keys, the emoji picker and pastes all type into cells from there; the other
// keys (arrows, Backspace, F-keys...) still come through keydown.
export function useTextTool(project, workspace, textInput) {
  const palettes = usePaletteStore();
  // Keys belong elsewhere while focus is in a field or a dialog (the color picker, the palette layer).
  const editableFocus = () => {
    const el = document.activeElement;
    return isField(el) || (!!el && !isTextInput(el) && !!el.closest('[role="dialog"]'));
  };

  // Moving the cursor ends a run of typing (Backspace's move is part of it).
  const move = (dc, dr, { typing = false } = {}) => {
    if (!typing) project.commitPending();
    workspace.textCursor = snapCursor(project.cells, project.cols, moveCursor(workspace.textCursor, dc, dr, project.cols, charRowsOf(project.rows)), dc);
  };

  // Alt+Up/Down: the slot's color steps through the active palette (nothing to step in 24-bit), from
  // the palette color it displays as, to the next one's swatch color (as the color picker offers it).
  const stepColor = (slot, delta) => {
    const palette = project.activePalette;
    if (!palette || !palette.length) return;
    const { c } = effectiveColor(slot === 'fg' ? workspace.editFgColor : workspace.editBgColor, project, palette);
    const next = paletteChoices(project, palette)[(c + delta + palette.length) % palette.length];
    workspace.setColor(slot, next.toLowerCase());
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
        move(-project.backspaceAt(col, row, workspace.typingAttrs(), { insert }), 0, { typing: true });
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
    if (action.type === 'char' && isTextInput(document.activeElement)) return; // the textarea's input event types it
    event.preventDefault();
    apply(action);
  };

  // An input method commits with compositionend (its in-progress input events are skipped: Safari
  // and Firefox follow compositionend with one more, which would type it twice); everything else
  // inserted is typed as it arrives: keys and the emoji picker as typing, anything else (a paste, a
  // drop) as a paste. A paste's text is in the field, not the event.
  const COMPOSING = new Set(['insertCompositionText', 'insertFromComposition']);
  const onInput = (event) => {
    if (event.isComposing || COMPOSING.has(event.inputType)) return;
    const type = event.inputType === 'insertText' ? typeLines : typeText;
    if (event.inputType?.startsWith('insert')) type(project, workspace, event.data ?? event.target.value);
    event.target.value = '';
  };
  const onCompositionEnd = (event) => {
    if (event.data) typeLines(project, workspace, event.data);
    event.target.value = '';
  };

  // The textarea has focus while the tool is in use (after the click that placed the cursor has
  // focused whatever it focuses, and after the color box, the shortcuts list, the save dialog or
  // Versions closes), and never takes it from a real field.
  const inUse = () => workspace.editorTab === 'output' && workspace.activeTool === 'text' && !!workspace.textCursor && !workspace.paletteLayerOpen;
  watch(() => [inUse(), workspace.textCursor, workspace.colorBox, workspace.shortcutsOpen, workspace.saveDialog, workspace.versionsOpen], () => setTimeout(() => {
    const el = textInput?.value;
    if (!el) return;
    if (!inUse()) {
      if (document.activeElement === el) el.blur();
    } else if (document.activeElement !== el && !editableFocus()) {
      el.focus({ preventScroll: true });
    }
  }));

  // A click elsewhere (a toolbar button, the F-key strip) takes focus too; the textarea takes it
  // back, so an input method keeps typing into cells. Only after a pointer: Tab and other keyboard
  // moves keep their focus.
  let pointerDown = false;
  const onPointerDown = () => { pointerDown = true; };
  const onPointerUp = () => setTimeout(() => { pointerDown = false; });
  const onFocusOut = () => {
    if (!pointerDown) return;
    setTimeout(() => {
      const el = textInput?.value;
      if (el && inUse() && document.activeElement !== el && !editableFocus()) el.focus({ preventScroll: true });
    });
  };

  onMounted(() => {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('pointerup', onPointerUp, true);
    textInput?.value?.addEventListener('input', onInput);
    textInput?.value?.addEventListener('compositionend', onCompositionEnd);
    textInput?.value?.addEventListener('focusout', onFocusOut);
  });
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('pointerup', onPointerUp, true);
    textInput?.value?.removeEventListener('input', onInput);
    textInput?.value?.removeEventListener('compositionend', onCompositionEnd);
    textInput?.value?.removeEventListener('focusout', onFocusOut);
  });
}
