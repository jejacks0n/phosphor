import { onMounted, onBeforeUnmount, watch, toRaw } from 'vue';
import { getTool, offeredTools } from '@/tools';
import { clampOffset, normalizeRect } from '@/document/editCells';
import { stacked } from '@/document/shapes.js';
import { charRowsOf } from '@/lib/Cells';
import { copySelection, decodeBlock } from '@/composables/clipboard';
import { readClipboardHtml } from '@/lib/clipboardBlocks';
import { typeText } from '@/composables/useTextTool';
import { colorBoxKey, helpKey } from '@/lib/TextKeys';
import { isField } from '@/lib/fields';
import { usePlayback } from '@/composables/usePlayback';
import { useVectorStyle } from '@/composables/useVectorStyle.js';

export function useKeyboardShortcuts(projectStore, workspaceStore) {
  // The pair's swap: on VECTOR, the shapes' Fill and Stroke trade places.
  const vectorStyle = useVectorStyle();
  const swapColors = () => (workspaceStore.editorTab === 'vector' ? vectorStyle.swap() : workspaceStore.swapColors());
  const playback = usePlayback();

  // Not on SOCIAL: the art isn't showing, and its fields keep their own undo.
  const _handleUndoRedo = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && workspaceStore.editorTab !== 'social') { // Shift makes it 'Z'
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

  // Space pans unless the art isn't showing (SAUCE, SOCIAL), it types (a text field, Edit Mode's
  // typing) or it presses a focused control (a button, a menu) while the pointer isn't over the canvas.
  const TYPES = 'input:not([type=range]):not([type=checkbox]):not([type=radio]), textarea, select, [contenteditable]';
  const PRESSES = 'button, a, [role="tab"], [role="button"], input[type=checkbox], input[type=radio]';
  const _spacePans = (e) => {
    if (!workspaceStore.editMode || workspaceStore.paletteLayerOpen || workspaceStore.isPainting) return false;
    if (workspaceStore.activeTool === 'text' && workspaceStore.textCursor && workspaceStore.editorTab === 'output') return false; // typing, wherever focus is
    const target = e.target?.closest ? e.target : null;
    if (target?.closest(TYPES)) return false;
    return !target?.closest(PRESSES) || workspaceStore.pointerOverEditor;
  };

  const _handleToolSwap = (e) => {
    if (e.key === 'Alt' && !e.repeat && workspaceStore.editMode && !workspaceStore.isPainting && getTool(workspaceStore.activeTool).altPicks) {
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

  // X swaps the color pair while the art is showing, unless something is taking text (a field, or the
  // Text tool).
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
      swapColors();
      return true;
    }
    if (workspaceStore.heldTool?.by === 'alt') workspaceStore.releaseTool();
    // ASCII in the ANSI view has no colors to choose (ColorPair hides itself).
    if (!(workspaceStore.editorTab === 'output' && projectStore.renderStyle === 'ascii')) workspaceStore.colorBox = slot;
    return true;
  };

  // Typing in Edit Mode: the Text tool with its cursor placed, in the ANSI view.
  const _typing = () => workspaceStore.activeTool === 'text' && !!workspaceStore.textCursor && workspaceStore.editorTab === 'output';

  // L plays and pauses, comma and period step: with Animate on, in the art views, never while typing.
  const _animationKeysApply = (e) => projectStore.animate && projectStore.image && !e.ctrlKey && !e.metaKey && !e.altKey
    && workspaceStore.editMode && !isField(e.target) && !_typing()
    && !workspaceStore.isPainting && !workspaceStore.paletteLayerOpen && !workspaceStore.colorBox;

  // The shortcuts list: ?, or Alt+? while typing in Edit Mode (where ? types). Not in a field.
  const _handleHelp = (e) => {
    if (!helpKey(e, { typing: _typing() }) || isField(e.target) || workspaceStore.paletteLayerOpen) return false;
    e.preventDefault();
    workspaceStore.shortcutsOpen = true;
    return true;
  };

  const _handleSwapColors = (e) => {
    if (e.key.toLowerCase() !== 'x' || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return false;
    if (isField(e.target) || !workspaceStore.editMode || workspaceStore.activeTool === 'text') return false; // in Edit Mode, X types
    swapColors();
    return true;
  };

  // The ANSI view's selection keys: Cmd/Ctrl+C, X, V (on the chosen layers; a paste goes to the
  // selection, else the Text tool's cursor, else the top-left of the view, and becomes the
  // selection), Cmd/Ctrl+A (select all), and Escape (in Edit Mode it puts the cursor away, so letters
  // choose tools again). With the Select tool and a selection, Moebius's block keys: Delete,
  // Backspace or E erase it, C or S stamp it (a copy stays, the block floats on), Enter sets it down;
  // and the arrow keys nudge it a cell. Fields, the palette layer and the Text tool keep their keys.
  const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  // Shift+arrows select, as in a text editor: in Edit Mode from the cursor's cell (the Select tool
  // takes over, as it does a drag), and with the Select tool they move the selection's far corner, so
  // it grows or shrinks from the corner it started at (a selection made another way: its top-left).
  // Each press is an undo step, as a selection drawn is.
  let _shiftRun = null; // { rect, anchor, head }: the selection Shift+arrows made last
  const _shiftSelect = (dc, dr) => {
    const sel = workspaceStore.selection;
    let { anchor, head } = sel && toRaw(sel) === _shiftRun?.rect ? _shiftRun : {};
    const fromText = !anchor && _typing();
    if (fromText) anchor = head = workspaceStore.textCursor;
    else if (!anchor && workspaceStore.activeTool === 'select' && sel) [anchor, head] = [{ col: sel.c0, row: sel.r0 }, { col: sel.c1, row: sel.r1 }];
    if (!anchor) return false;
    const to = {
      col: Math.max(0, Math.min(projectStore.cols - 1, head.col + dc)),
      row: Math.max(0, Math.min(charRowsOf(projectStore.rows) - 1, head.row + dr)),
    };
    if (to.col === head.col && to.row === head.row) return true; // at the edge
    if (fromText) {
      workspaceStore.setActiveTool('select');
      workspaceStore.selectFromText = true;
    }
    projectStore.changeSelection((w) => { w.selection = normalizeRect(anchor, to); w.wand = null; });
    _shiftRun = { rect: toRaw(workspaceStore.selection), anchor, head: to };
    return true;
  };
  const _handleSelectionKeys = (e) => {
    // Something else already took the key (the palette layer, a popover).
    if (e.defaultPrevented || workspaceStore.paletteLayerOpen) return false;
    if (!['input', 'output'].includes(workspaceStore.editorTab) || e.altKey) return false; // the art views
    if (workspaceStore.isPainting) return false; // mid-drag: the drag's end decides
    // The Text tool's textarea isn't a field: Cmd/Ctrl+V there still pastes a Select block (and only
    // pastes text, through the textarea, when there's no block).
    if (isField(e.target)) return false;
    if (e.shiftKey) {
      if (!ARROWS[e.key] || e.metaKey || e.ctrlKey || !_shiftSelect(...ARROWS[e.key])) return false;
      e.preventDefault();
      return true;
    }
    const sel = workspaceStore.selection, layers = workspaceStore.selectLayers;
    const selecting = workspaceStore.activeTool === 'select' && sel;
    const command = e.metaKey || e.ctrlKey;
    if (!command) {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if ((e.key === 'Escape' || (selecting && e.key === 'Enter')) && sel) {
        projectStore.changeSelection((w) => { w.selection = null; });
        if (workspaceStore.activeTool === 'select' && workspaceStore.selectFromText) workspaceStore.setActiveTool('text'); // back to typing, at the cursor
      } else if (e.key === 'Escape' && _typing()) [workspaceStore.lastTextCursor, workspaceStore.textCursor] = [workspaceStore.textCursor, null];
      else if (selecting && (e.key === 'Delete' || e.key === 'Backspace' || key === 'e')) projectStore.deleteSelection(sel, layers);
      else if (selecting && (key === 'c' || key === 's') && !e.repeat) workspaceStore.selection = projectStore.stampSelection(sel, layers) ?? sel;
      else if (selecting && ARROWS[e.key]) {
        // A nudge stops at the grid's edge rather than pushing contents off it.
        const { dc, dr } = clampOffset(sel, ...ARROWS[e.key], projectStore.cols, charRowsOf(projectStore.rows));
        if (dc || dr) workspaceStore.selection = projectStore.floatSelection(sel, layers, dc, dr) ?? sel;
      }
      else return false;
      e.preventDefault();
      return true;
    }
    const key = e.key.toLowerCase();
    if (key === 'v') {
      // Left to the browser: its paste event carries the system clipboard (_handlePaste decides
      // what to paste). A browser that sends no paste event here pastes Phosphor's own block.
      // The Text cursor only counts in Edit Mode (it lingers, unseen, after switching tools), and there
      // it wins over a selection kept from another tool.
      const cursor = workspaceStore.activeTool === 'text' ? workspaceStore.textCursor : null;
      const origin = workspaceStore.editorTab === 'input' ? workspaceStore.pixelViewOrigin : workspaceStore.ansiViewOrigin;
      const at = cursor ?? (sel ? { col: sel.c0, row: sel.r0 } : origin);
      clearTimeout(_pendingPaste?.timer);
      _pendingPaste = { at, timer: setTimeout(() => { _pendingPaste = null; _pasteBlock(at); }, 50) };
      return true;
    }
    if (key === 'a') projectStore.changeSelection((w) => w.selectAll(projectStore.gridRect()));
    else if (key === 'c' && sel) copySelection(projectStore, workspaceStore, sel, layers);
    else if (key === 'x' && sel) {
      copySelection(projectStore, workspaceStore, sel, layers);
      projectStore.deleteSelection(sel, layers);
    } else return false;
    e.preventDefault();
    return true;
  };

  // Cmd/Ctrl+A on VECTOR: every shape on the frame, bottom to top, with Vector select (the Gradient tool keeps
  // itself: it works on the selection), not the page's text. A Pen shape under way ends first.
  const _handleVectorSelectAll = (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'a') return false;
    if (workspaceStore.editorTab !== 'vector' || isField(e.target) || workspaceStore.isPainting || !projectStore.image) return false;
    e.preventDefault();
    projectStore.commitPending();
    if (workspaceStore.activeTool !== 'vgradient') workspaceStore.setActiveTool('vselect');
    workspaceStore.vectorSelected = stacked(projectStore.shapes).map(([key]) => key);
    workspaceStore.vectorStop = null;
    return true;
  };

  // The Magic Wand's selection: Escape drops it; Delete or Backspace takes away what's drawn in it
  // (not in Edit Mode, where they edit the text).
  const _handleWandKeys = (e) => {
    const wand = workspaceStore.wand;
    if (!wand || e.defaultPrevented || isField(e.target) || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return false;
    if (workspaceStore.paletteLayerOpen || workspaceStore.isPainting) return false; // the palette has the keys; mid-drag, the drag's end decides
    if (e.key === 'Escape') projectStore.changeSelection((w) => { w.wand = null; });
    else if ((e.key === 'Delete' || e.key === 'Backspace') && workspaceStore.activeTool !== 'text') projectStore.deleteInWand(wand, workspaceStore.editorTab, workspaceStore.selectLayers);
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

  // Paste, from what the system clipboard holds (the paste event's text and HTML), the first that
  // applies: a Phosphor block (this tab's own copy pastes Phosphor's own block, which a Bake keeps
  // up to date; another tab's pastes as it came); a Moebius block; or text, typed in: at the Text
  // cursor in Edit Mode, else at the selection or the top-left of the view. Phosphor's own block
  // wins when the browser refused the copy, and over text that's what the last copy put there. A
  // block lands floating and selected, to drag into place.
  let _pendingPaste = null; // { at, timer } from Cmd/Ctrl+V until its paste event
  const _pasteBlock = (at, block = workspaceStore.clipboard) => {
    if (!block) return;
    const pasted = projectStore.pasteSelection(block, at.col, at.row);
    if (pasted) workspaceStore.selectAll(pasted); // selected, with the Select tool, to drag into place
  };
  const _typeText = (at, text) => {
    if (workspaceStore.activeTool !== 'text' || !workspaceStore.textCursor) workspaceStore.textCursor = at;
    typeText(projectStore, workspaceStore, text);
  };
  const _handlePaste = (e) => {
    if (!_pendingPaste) return; // not a Cmd/Ctrl+V we routed (a field's own paste, the context menu)
    const { at, timer } = _pendingPaste;
    clearTimeout(timer);
    _pendingPaste = null;
    e.preventDefault();
    if (projectStore._paused) return; // refused: nothing moves to where it would have gone
    const text = (e.clipboardData?.getData('text/plain') ?? '').replace(/\r\n/g, '\n'); // Windows' clipboard adds CRs
    const ours = workspaceStore.clipboardText?.replace(/\r\n/g, '\n') ?? null;
    const own = workspaceStore.clipboard;
    const found = own && ours === null ? null : readClipboardHtml(e.clipboardData?.getData('text/html'));
    if (found?.phosphor && !(own && found.phosphor.id === workspaceStore.clipboardId)) {
      decodeBlock(found.phosphor).then((block) => { if (!projectStore._paused) _pasteBlock(at, block); }, () => { if (text) _typeText(at, text); });
    } else if (found?.moebius) _pasteBlock(at, found.moebius);
    else if (own && (found?.phosphor || !text || ours === null || text === ours)) _pasteBlock(at);
    else if (text) _typeText(at, text);
  };

  // The active tool's own keys (Vector select's nudges, say), before the rest: not in a field, mid-drag, or
  // with the palette layer or the color box open.
  const _handleActiveToolKeys = (e) => {
    if (e.defaultPrevented || isField(e.target) || !workspaceStore.editMode || workspaceStore.isPainting) return false;
    if (workspaceStore.paletteLayerOpen || workspaceStore.colorBox || !projectStore.image) return false;
    const tool = getTool(workspaceStore.activeTool);
    if (!tool.keydown?.({ project: projectStore, workspace: workspaceStore, view: workspaceStore.editorTab }, e)) return false;
    e.preventDefault();
    return true;
  };

  const _handleGlobalKeyDown = (e) => {
    if (e.key === 'Control') {
      workspaceStore.isCtrlPressed = true;
    }
    if (e.key === 'Shift') workspaceStore.isShiftPressed = true;

    if (_animationKeysApply(e) && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      if (!e.repeat) playback.toggle();
      return;
    }
    // A key while playing pauses first, on the frame showing, so what it does lands there. The bar's
    // own controls have their keys, and they pause for themselves.
    if (workspaceStore.playing && !isField(e.target) && !e.target?.closest?.('[role="toolbar"]') && !['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) playback.pause();

    if (_animationKeysApply(e) && (e.key === ',' || e.key === '.')) {
      e.preventDefault();
      playback.pause();
      projectStore.stepFrame(e.key === ',' ? -1 : 1);
      return;
    }

    if (_handleUndoRedo(e)) return;
    if (_handleSave(e)) return;
    if (_handleHelp(e)) return;
    if (_handleVectorSelectAll(e)) return;
    if (_handleActiveToolKeys(e)) return;
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
