import { onMounted, onBeforeUnmount, watch } from 'vue';
import { getTool, offeredTools } from '@/tools';
import { clampOffset } from '@/document/editCells';
import { charRowsOf } from '@/lib/Cells';
import { copySelection } from '@/composables/clipboard';
import { typeText } from '@/composables/useTextTool';
import { colorBoxKey, helpKey } from '@/lib/TextKeys';
import { isField } from '@/lib/fields';

export function useKeyboardShortcuts(projectStore, workspaceStore) {

  const _handleUndoRedo = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { // Shift makes it 'Z'
      e.preventDefault();
      if (e.shiftKey) {
        projectStore.redo();
      } else {
        projectStore.undo();
      }
      return true;
    }
    return false;
  };

  const _handleSave = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (projectStore.image) workspaceStore.saveDialog = 'phosphor';
      return true;
    }
    return false;
  };

  // Held keys: Alt swaps a drawing tool for the picker (Shift added: the background color), Space any
  // tool for the hand. Let go mid-drag and the tool comes back when the drag ends, so a pick or a pan
  // never turns into a stroke.
  let _releasePending = false;
  const _release = () => {
    _releasePending = workspaceStore.isPainting;
    if (!_releasePending) workspaceStore.releaseTool();
  };
  watch(() => workspaceStore.isPainting, (painting) => { if (!painting && _releasePending) _release(); });

  // Space pans unless it types (a text field, Edit Mode's typing) or presses a focused control (a
  // button, a menu) while the pointer isn't over the canvas.
  const TYPES = 'input:not([type=range]):not([type=checkbox]):not([type=radio]), textarea, select, [contenteditable]';
  const PRESSES = 'button, a, [role="tab"], [role="button"], input[type=checkbox], input[type=radio]';
  const _spacePans = (e) => {
    if (workspaceStore.editorTab === 'sauce' || workspaceStore.paletteLayerOpen || workspaceStore.isPainting) return false;
    if (workspaceStore.activeTool === 'text' && workspaceStore.textCursor && workspaceStore.editorTab === 'output') return false; // typing, wherever focus is
    const target = e.target?.closest ? e.target : null;
    if (target?.closest(TYPES)) return false;
    return !target?.closest(PRESSES) || workspaceStore.pointerOverEditor;
  };

  const _handleToolSwap = (e) => {
    if (e.key === 'Alt' && !e.repeat && !workspaceStore.isPainting && getTool(workspaceStore.activeTool).altPicks) {
      return workspaceStore.holdTool('picker', 'alt');
    }
    if (e.code === 'Space' && workspaceStore.heldTool?.by === 'space') {
      e.preventDefault(); // held: no page scroll, no button press
      return true;
    }
    if (e.code === 'Space' && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey && _spacePans(e)) {
      e.preventDefault();
      return workspaceStore.holdTool('hand', 'space');
    }
    return false;
  };

  // X swaps the color pair, unless something is taking text (a field, or the Text tool).
  // Colors, Moebius-style: Alt+F (or Alt+A) opens the color box on the foreground, Alt+B on the
  // background (from a drawing tool too: the held eyedropper gives way), and Shift+Cmd/Ctrl+X swaps
  // the two. Not in a real field (they type there); in Edit Mode they work while typing.
  const _handleColorKeys = (e) => {
    const slot = colorBoxKey(e);
    const swap = e.code === 'KeyX' && e.shiftKey && (e.metaKey || e.ctrlKey) && !e.altKey;
    if (!slot && !swap) return false;
    if (isField(e.target) || !projectStore.image || !workspaceStore.editMode || workspaceStore.paletteLayerOpen) return false;
    e.preventDefault();
    if (swap) {
      workspaceStore.swapColors();
      return true;
    }
    if (workspaceStore.heldTool?.by === 'alt') workspaceStore.releaseTool();
    // ASCII in the ANSI view has no colors to choose (ColorPair hides itself).
    if (!(workspaceStore.editorTab === 'output' && projectStore.renderStyle === 'ascii')) workspaceStore.colorBox = slot;
    return true;
  };

  // Typing in Edit Mode: the Text tool with its cursor placed, in the ANSI view.
  const _typing = () => workspaceStore.activeTool === 'text' && !!workspaceStore.textCursor && workspaceStore.editorTab === 'output';

  // The shortcuts list: ?, or Alt+? while typing in Edit Mode (where ? types). Not in a field.
  const _handleHelp = (e) => {
    if (!helpKey(e, { typing: _typing() }) || isField(e.target) || workspaceStore.paletteLayerOpen) return false;
    e.preventDefault();
    workspaceStore.shortcutsOpen = true;
    return true;
  };

  const _handleSwapColors = (e) => {
    if (e.key.toLowerCase() !== 'x' || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return false;
    if (isField(e.target) || workspaceStore.activeTool === 'text') return false; // in Edit Mode, X types
    workspaceStore.swapColors();
    return true;
  };

  // The ANSI view's selection keys: Cmd/Ctrl+C, X, V (on the chosen layers; a paste goes to the
  // selection, else the Text tool's cursor, else the top-left of the view, and becomes the
  // selection), Cmd/Ctrl+A (select all), and Escape (in Edit Mode it puts the cursor away, so letters
  // choose tools again). With the Select tool and a selection, Moebius's block keys: Delete,
  // Backspace or E erase it, C or S stamp it (a copy stays, the block floats on), Enter sets it down;
  // and the arrow keys nudge it a cell. Fields, the palette layer and the Text tool keep their keys.
  const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  const _handleSelectionKeys = (e) => {
    // Something else already took the key (the palette layer, a popover).
    if (e.defaultPrevented || workspaceStore.paletteLayerOpen) return false;
    if (!['input', 'output'].includes(workspaceStore.editorTab) || e.altKey || e.shiftKey) return false; // the art views
    if (workspaceStore.isPainting) return false; // mid-drag: the drag's end decides
    // The Text tool's textarea isn't a field: Cmd/Ctrl+V there still pastes a Select block (and only
    // pastes text, through the textarea, when there's no block).
    if (isField(e.target)) return false;
    const sel = workspaceStore.selection, layers = workspaceStore.selectLayers;
    const selecting = workspaceStore.activeTool === 'select' && sel;
    const command = e.metaKey || e.ctrlKey;
    if (!command) {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (e.key === 'Escape' && sel) workspaceStore.selection = null;
      else if (e.key === 'Escape' && _typing()) workspaceStore.textCursor = null;
      else if (selecting && (e.key === 'Delete' || e.key === 'Backspace' || key === 'e')) projectStore.deleteSelection(sel, layers);
      else if (selecting && (key === 'c' || key === 's') && !e.repeat) workspaceStore.selection = projectStore.stampSelection(sel, layers) ?? sel;
      else if (selecting && e.key === 'Enter') workspaceStore.selection = null;
      else if (selecting && ARROWS[e.key]) {
        // A nudge stops at the grid's edge rather than pushing contents off it.
        const { dc, dr } = clampOffset(sel, ...ARROWS[e.key], projectStore.cols, charRowsOf(projectStore.rows));
        if (dc || dr) workspaceStore.selection = projectStore.floatSelection(sel, layers, dc, dr);
      }
      else return false;
      e.preventDefault();
      return true;
    }
    const key = e.key.toLowerCase();
    if (key === 'v') {
      // Left to the browser: its paste event carries the system clipboard's text (_handlePaste
      // decides what to paste). A browser that sends no paste event here pastes Phosphor's own block.
      // The Text cursor only counts in Edit Mode (it lingers, unseen, after switching tools), and there
      // it wins over a selection kept from another tool.
      const cursor = workspaceStore.activeTool === 'text' ? workspaceStore.textCursor : null;
      const origin = workspaceStore.editorTab === 'input' ? workspaceStore.pixelViewOrigin : workspaceStore.ansiViewOrigin;
      const at = cursor ?? (sel ? { col: sel.c0, row: sel.r0 } : origin);
      clearTimeout(_pendingPaste?.timer);
      _pendingPaste = { at, timer: setTimeout(() => { _pendingPaste = null; _pasteBlock(at); }, 50) };
      return true;
    }
    if (key === 'a') workspaceStore.selectAll(projectStore.gridRect());
    else if (key === 'c' && sel) copySelection(projectStore, workspaceStore, sel, layers);
    else if (key === 'x' && sel) {
      copySelection(projectStore, workspaceStore, sel, layers);
      projectStore.deleteSelection(sel, layers);
    } else return false;
    e.preventDefault();
    return true;
  };

  // The Magic Wand's selection: Escape drops it; Delete or Backspace takes away what's drawn in it
  // (not in Edit Mode, where they edit the text).
  const _handleWandKeys = (e) => {
    const wand = workspaceStore.wand;
    if (!wand || e.defaultPrevented || isField(e.target) || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return false;
    if (workspaceStore.paletteLayerOpen || workspaceStore.isPainting) return false; // the palette has the keys; mid-drag, the drag's end decides
    if (e.key === 'Escape') workspaceStore.wand = null;
    else if ((e.key === 'Delete' || e.key === 'Backspace') && workspaceStore.activeTool !== 'text') projectStore.deleteInWand(wand, workspaceStore.editorTab);
    else return false;
    e.preventDefault();
    return true;
  };

  // Tool keys (each tool's keys: P Pencil, B Brush, G Paint Bucket, T or K Edit Mode...): a plain
  // letter chooses the tool, when the view offers it. Not while typing (Edit Mode with its cursor, a
  // field), mid-drag, with a tool held by a key, or with the color box or palette layer open.
  const _handleToolKeys = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.repeat || !/^[a-z]$/i.test(e.key)) return false;
    if (isField(e.target) || !projectStore.image || !workspaceStore.editMode || _typing()) return false;
    if (workspaceStore.isPainting || workspaceStore.heldTool || workspaceStore.paletteLayerOpen || workspaceStore.colorBox) return false;
    const key = e.key.toUpperCase();
    const tool = offeredTools(workspaceStore.editorTab, projectStore).find(t => t.keys?.includes(key));
    if (!tool) return false;
    e.preventDefault();
    workspaceStore.setActiveTool(tool.id);
    return true;
  };

  // Paste: Phosphor's own block (a Select copy), unless the system clipboard holds something newer
  // (text that isn't what the last copy put there), which is typed in instead: at the Text cursor in
  // Edit Mode, else at the selection or the top-left of the view.
  let _pendingPaste = null; // { at, timer } from Cmd/Ctrl+V until its paste event
  const _pasteBlock = (at) => {
    if (!workspaceStore.clipboard) return;
    const pasted = projectStore.pasteSelection(workspaceStore.clipboard, at.col, at.row);
    if (pasted) workspaceStore.selectAll(pasted); // selected, with the Select tool, to drag into place
  };
  const _handlePaste = (e) => {
    if (!_pendingPaste) return; // not a Cmd/Ctrl+V we routed (a field's own paste, the context menu)
    const { at, timer } = _pendingPaste;
    clearTimeout(timer);
    _pendingPaste = null;
    e.preventDefault();
    const text = (e.clipboardData?.getData('text/plain') ?? '').replace(/\r\n/g, '\n'); // Windows' clipboard adds CRs
    const ours = workspaceStore.clipboardText?.replace(/\r\n/g, '\n') ?? null;
    if (workspaceStore.clipboard && (!text || ours === null || text === ours)) _pasteBlock(at);
    else if (text) {
      if (workspaceStore.activeTool !== 'text' || !workspaceStore.textCursor) workspaceStore.textCursor = at;
      typeText(projectStore, workspaceStore, text);
    }
  };

  const _handleGlobalKeyDown = (e) => {
    if (e.key === 'Control') {
      workspaceStore.isCtrlPressed = true;
    }
    if (e.key === 'Shift') workspaceStore.isShiftPressed = true;

    if (_handleUndoRedo(e)) return;
    if (_handleSave(e)) return;
    if (_handleHelp(e)) return;
    if (_handleColorKeys(e)) return;
    if (_handleToolSwap(e)) return;
    if (_handleSwapColors(e)) return;
    if (_handleWandKeys(e)) return;
    if (_handleSelectionKeys(e)) return;
    if (_handleToolKeys(e)) return;
  };

  const _handleGlobalKeyUp = (e) => {
    if (e.key === 'Control') {
      workspaceStore.isCtrlPressed = false;
    }

    if (e.key === 'Shift') workspaceStore.isShiftPressed = false;
    const held = workspaceStore.heldTool?.by;
    if ((e.key === 'Alt' && held === 'alt') || (e.code === 'Space' && held === 'space')) {
      if (e.code === 'Space') e.preventDefault(); // a focused button isn't pressed by the Space that panned
      _release();
    }
  };

  const _handleBlur = () => {
    workspaceStore.isCtrlPressed = false;
    workspaceStore.isMiddleClick = false;
    workspaceStore.isShiftPressed = false;
    if (workspaceStore.heldTool) _release(); // the keys were let go while the window was away
  };

  const _handleContextMenu = (e) => {
    if (workspaceStore.activeTool === 'picker') {
      e.preventDefault();
    }
  };

  onMounted(() => {
    window.addEventListener('keydown', _handleGlobalKeyDown);
    window.addEventListener('keyup', _handleGlobalKeyUp);
    window.addEventListener('blur', _handleBlur);
    window.addEventListener('contextmenu', _handleContextMenu);
    document.addEventListener('paste', _handlePaste, true);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', _handleGlobalKeyDown);
    window.removeEventListener('keyup', _handleGlobalKeyUp);
    window.removeEventListener('blur', _handleBlur);
    window.removeEventListener('contextmenu', _handleContextMenu);
    document.removeEventListener('paste', _handlePaste, true);
    clearTimeout(_pendingPaste?.timer);
  });

  return {};
}
