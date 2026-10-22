import { onMounted, onBeforeUnmount, ref } from 'vue';
import { getTool } from '@/tools';

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

  // Cmd/Ctrl+C, X, V and Escape for the ANSI view's selection (pasting goes to the selection, or
  // the Text tool's cursor). Without a selection or clipboard, the browser keeps these keys.
  const _handleSelectionKeys = (e) => {
    // Something else already took the key (the palette layer, a popover).
    if (e.defaultPrevented || workspaceStore.paletteLayerOpen) return false;
    if (workspaceStore.editorTab !== 'output' || e.altKey || e.shiftKey) return false;
    const target = e.target;
    if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)) return false;
    const sel = workspaceStore.selection;
    if (e.key === 'Escape' && sel && !e.metaKey && !e.ctrlKey) {
      workspaceStore.selection = null;
      return true;
    }
    if (!e.metaKey && !e.ctrlKey) return false;
    const key = e.key.toLowerCase();
    if (key === 'c' && sel) workspaceStore.cellClipboard = projectStore.copyCells(sel);
    else if (key === 'x' && sel) workspaceStore.cellClipboard = projectStore.cutCells(sel);
    else if (key === 'v' && workspaceStore.cellClipboard && (sel || workspaceStore.textCursor)) {
      const at = sel ? { col: sel.c0, row: sel.r0 } : workspaceStore.textCursor;
      projectStore.pasteCells(workspaceStore.cellClipboard, at.col, at.row);
    } else return false;
    e.preventDefault();
    return true;
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

  const _handleBlur = () => {
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
  });

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', _handleGlobalKeyDown);
    window.removeEventListener('keyup', _handleGlobalKeyUp);
    window.removeEventListener('blur', _handleBlur);
    window.removeEventListener('contextmenu', _handleContextMenu);
  });

  return {};
}
