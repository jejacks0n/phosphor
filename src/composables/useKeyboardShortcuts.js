import { onMounted, onBeforeUnmount, ref } from 'vue';

export function useKeyboardShortcuts(projectStore, workspaceStore) {
  const isAltSwapped = ref(false);

  const handleGlobalKeyDown = (e) => {
    if (e.key === 'Control') {
      workspaceStore.isCtrlPressed = true;
    }

    // Undo/Redo shortcuts
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      if (e.shiftKey) {
        projectStore.redo();
      } else {
        projectStore.undo();
      }
      return;
    }

    // Save shortcut
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      projectStore.saveProject();
      return;
    }

    const paintTools = ['pencil', 'brush', 'bucket'];
    if (e.key === 'Alt' && paintTools.includes(workspaceStore.activeTool) && !isAltSwapped.value) {
      isAltSwapped.value = true;
      workspaceStore.setActiveTool('picker');
    }
  };

  const handleGlobalKeyUp = (e) => {
    if (e.key === 'Control') {
      workspaceStore.isCtrlPressed = false;
    }

    if (e.key === 'Alt' && isAltSwapped.value) {
      workspaceStore.setActiveTool(workspaceStore.previousTool);
      isAltSwapped.value = false;
    }
  };

  const handleBlur = () => {
    workspaceStore.isCtrlPressed = false;
    workspaceStore.isMiddleClick = false;
    if (isAltSwapped.value) {
      workspaceStore.setActiveTool(workspaceStore.previousTool);
      isAltSwapped.value = false;
    }
  };

  const handleContextMenu = (e) => {
    if (workspaceStore.activeTool === 'picker') {
      e.preventDefault();
    }
  };

  onMounted(() => {
    window.addEventListener('keydown', handleGlobalKeyDown);
    window.addEventListener('keyup', handleGlobalKeyUp);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('contextmenu', handleContextMenu);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleGlobalKeyDown);
    window.removeEventListener('keyup', handleGlobalKeyUp);
    window.removeEventListener('blur', handleBlur);
    window.removeEventListener('contextmenu', handleContextMenu);
  });

  return {
    isAltSwapped
  };
}
