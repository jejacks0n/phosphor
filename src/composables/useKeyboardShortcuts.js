import { onMounted, onBeforeUnmount, ref } from 'vue';
import { getTool } from '@/tools';
import { clampOffset } from '@/document/editCells';
import { charRowsOf } from '@/lib/Cells';

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
    if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)) return false;
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
    if (key === 'a') workspaceStore.selectAll(projectStore.gridRect());
    else if (key === 'c' && sel) workspaceStore.clipboard = projectStore.copySelection(sel, layers);
    else if (key === 'x' && sel) {
      workspaceStore.clipboard = projectStore.copySelection(sel, layers);
      projectStore.deleteSelection(sel, layers);
    } else if (key === 'v' && workspaceStore.clipboard) {
      // The Text cursor only counts in Edit Mode (it lingers, unseen, after switching tools).
      const cursor = workspaceStore.activeTool === 'text' ? workspaceStore.textCursor : null;
      const at = sel ? { col: sel.c0, row: sel.r0 } : cursor ?? workspaceStore.ansiViewOrigin;
      const pasted = projectStore.pasteSelection(workspaceStore.clipboard, at.col, at.row);
      if (pasted) workspaceStore.selectAll(pasted); // selected, with the Select tool, to drag into place
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
