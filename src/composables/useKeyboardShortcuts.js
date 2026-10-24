import { onMounted, onBeforeUnmount, ref } from 'vue';
import { getTool } from '@/tools';
import { clampOffset } from '@/document/editCells';
import { charRowsOf } from '@/lib/Cells';
import { copySelection } from '@/composables/clipboard';
import { typeText } from '@/composables/useTextTool';

export function useKeyboardShortcuts(projectStore, workspaceStore) {
  const _isAltSwapped = ref(false);

  const _handleUndoRedo = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
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
      projectStore.saveProject();
      return true;
    }
    return false;
  };

  const _handleToolSwap = (e) => {
    if (e.key === 'Alt' && getTool(workspaceStore.activeTool).altPicks && !_isAltSwapped.value) {
      _isAltSwapped.value = true;
      workspaceStore.pickSwapped = true;
      workspaceStore.setActiveTool('picker');
      return true;
    }
    return false;
  };

  // X swaps the colour pair, unless something is taking text (a field, or the Text tool).
  const _handleSwapColors = (e) => {
    if (e.key.toLowerCase() !== 'x' || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return false;
    const target = e.target;
    if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)) return false;
    if (workspaceStore.activeTool === 'text') return false;
    workspaceStore.swapColors();
    return true;
  };

  // The ANSI view's selection keys: Cmd/Ctrl+C, X, V (on the chosen layers; a paste goes to the
  // selection, else the Text tool's cursor, else the top-left of the view, and becomes the
  // selection), Cmd/Ctrl+A (select all), and Escape. With the Select tool: Delete/Backspace, and the
  // arrow keys nudge the contents a cell. Fields, the palette layer and the Text tool keep their keys.
  const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  const _handleSelectionKeys = (e) => {
    // Something else already took the key (the palette layer, a popover).
    if (e.defaultPrevented || workspaceStore.paletteLayerOpen) return false;
    if (workspaceStore.editorTab !== 'output' || e.altKey || e.shiftKey) return false;
    if (workspaceStore.isPainting) return false; // mid-drag: the drag's end decides
    const target = e.target;
    // The Text tool's textarea isn't a field: Cmd/Ctrl+V there still pastes a Select block (and only
    // pastes text, through the textarea, when there's no block).
    const field = target?.dataset?.textInput === undefined && (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName));
    if (field) return false;
    const sel = workspaceStore.selection, layers = workspaceStore.selectLayers;
    const selecting = workspaceStore.activeTool === 'select' && sel;
    const command = e.metaKey || e.ctrlKey;
    if (!command) {
      if (e.key === 'Escape' && sel) workspaceStore.selection = null;
      else if (selecting && (e.key === 'Delete' || e.key === 'Backspace')) projectStore.deleteSelection(sel, layers);
      else if (selecting && ARROWS[e.key]) {
        // A nudge stops at the grid's edge rather than pushing contents off it.
        const { dc, dr } = clampOffset(sel, ...ARROWS[e.key], projectStore.cols, charRowsOf(projectStore.rows));
        if (dc || dr) workspaceStore.selection = projectStore.moveSelection(sel, layers, dc, dr);
      }
      else return false;
      e.preventDefault();
      return true;
    }
    const key = e.key.toLowerCase();
    if (key === 'v') {
      // Left to the browser: its paste event carries the system clipboard's text (_handlePaste
      // decides what to paste). A browser that sends no paste event here pastes Phosphor's own block.
      // The Text cursor only counts in Edit Mode (it lingers, unseen, after switching tools).
      const cursor = workspaceStore.activeTool === 'text' ? workspaceStore.textCursor : null;
      const at = sel ? { col: sel.c0, row: sel.r0 } : cursor ?? workspaceStore.ansiViewOrigin;
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
    const text = e.clipboardData?.getData('text/plain') ?? '';
    const ours = workspaceStore.clipboardText;
    if (ours !== null) workspaceStore.clipboardFresh = !text || text === ours; // now known
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

    if (_handleUndoRedo(e)) return;
    if (_handleSave(e)) return;
    if (_handleToolSwap(e)) return;
    if (_handleSwapColors(e)) return;
    if (_handleSelectionKeys(e)) return;
  };

  const _handleGlobalKeyUp = (e) => {
    if (e.key === 'Control') {
      workspaceStore.isCtrlPressed = false;
    }

    if (e.key === 'Alt' && _isAltSwapped.value) {
      workspaceStore.setActiveTool(workspaceStore.previousTool);
      _isAltSwapped.value = false;
      workspaceStore.pickSwapped = false;
    }
  };

  // Whether the system clipboard still holds Phosphor's copy (so the Paste button and Cmd/Ctrl+V
  // agree): a page can't watch it, so anything that may have changed it counts. Something copied in
  // the page outside Phosphor's copy, or leaving the window (another app may copy). Coming back, a
  // browser that already allows reading the clipboard is asked; Phosphor never prompts for it.
  const _handleOutsideCopy = () => { workspaceStore.clipboardFresh = false; };
  const _handleFocus = async () => {
    const ours = workspaceStore.clipboardText;
    if (ours === null || workspaceStore.clipboardFresh) return;
    try {
      const { state } = await navigator.permissions.query({ name: 'clipboard-read' });
      if (state === 'granted') workspaceStore.clipboardFresh = (await navigator.clipboard.readText()) === ours;
    } catch {
      // not allowed or not supported: it stays unknown until the next Cmd/Ctrl+V
    }
  };

  const _handleBlur = () => {
    workspaceStore.clipboardFresh = false;
    workspaceStore.isCtrlPressed = false;
    workspaceStore.isMiddleClick = false;
    if (_isAltSwapped.value) {
      workspaceStore.setActiveTool(workspaceStore.previousTool);
      _isAltSwapped.value = false;
      workspaceStore.pickSwapped = false;
    }
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
    document.addEventListener('copy', _handleOutsideCopy, true);
    document.addEventListener('cut', _handleOutsideCopy, true);
    window.addEventListener('focus', _handleFocus);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', _handleGlobalKeyDown);
    window.removeEventListener('keyup', _handleGlobalKeyUp);
    window.removeEventListener('blur', _handleBlur);
    window.removeEventListener('contextmenu', _handleContextMenu);
    document.removeEventListener('paste', _handlePaste, true);
    document.removeEventListener('copy', _handleOutsideCopy, true);
    document.removeEventListener('cut', _handleOutsideCopy, true);
    window.removeEventListener('focus', _handleFocus);
    clearTimeout(_pendingPaste?.timer);
  });

  return {};
}
