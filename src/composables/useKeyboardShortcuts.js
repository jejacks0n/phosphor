import { onMounted, onBeforeUnmount, ref } from 'vue';

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
    const paintTools = ['pencil', 'brush', 'bucket'];
    if (e.key === 'Alt' && paintTools.includes(workspaceStore.activeTool) && !_isAltSwapped.value) {
      _isAltSwapped.value = true;
      workspaceStore.setActiveTool('picker');
      return true;
    }
    return false;
  };

  const _handleGlobalKeyDown = (e) => {
    if (e.key === 'Control') {
      workspaceStore.isCtrlPressed = true;
    }

    if (_handleUndoRedo(e)) return;
    if (_handleSave(e)) return;
    if (_handleToolSwap(e)) return;
  };

  const _handleGlobalKeyUp = (e) => {
    if (e.key === 'Control') {
      workspaceStore.isCtrlPressed = false;
    }

    if (e.key === 'Alt' && _isAltSwapped.value) {
      workspaceStore.setActiveTool(workspaceStore.previousTool);
      _isAltSwapped.value = false;
    }
  };

  const _handleBlur = () => {
    workspaceStore.isCtrlPressed = false;
    workspaceStore.isMiddleClick = false;
    if (_isAltSwapped.value) {
      workspaceStore.setActiveTool(workspaceStore.previousTool);
      _isAltSwapped.value = false;
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
