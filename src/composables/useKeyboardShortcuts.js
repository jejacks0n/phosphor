import { onMounted, onBeforeUnmount, watch, toRaw } from 'vue';
import { getTool } from '@/tools';
import { clampOffset, normalizeRect } from '@/document/editCells';
import { stacked } from '@/document/shapes.js';
import { charRowsOf } from '@/lib/Cells';
import { copySelection, decodeBlock } from '@/composables/clipboard';
import { readClipboardHtml } from '@/lib/clipboardBlocks';
import { typeText } from '@/composables/useTextTool';
import { takeKey } from '@/lib/commands';
import { ownsKey, typesIn } from '@/lib/fields';
import { usePlayback } from '@/composables/usePlayback';
import { copyShapes, cutShapes, pasteShapes } from '@/composables/vectorClipboard.js';
import { busyWhile } from '@/composables/useBusy';
import { t } from '@/i18n';

export function useKeyboardShortcuts(projectStore, workspaceStore) {
  // Delete and paste go under the busy note: most of a second over a whole large drawing.
  const deleting = (sel, layers) => busyWhile(t('busy.deleting'), () => projectStore.deleteSelection(sel, layers));
  const playback = usePlayback();

  // Not on SOCIAL: the art isn't showing, and its fields keep their own undo. Nor in a field you type in (the Characters
  // set, the seed, a size) while it holds typing it hasn't committed: it undoes that itself. Once it has (Enter, its
  // change), the app's undo takes the step back, and the field shows what that leaves. A slider, a menu or a button
  // doesn't type.
  const typing = new WeakSet(); // the fields with typing not committed yet
  const _onInput = (e) => { if (typesIn(e.target)) typing.add(e.target); };
  const _onChange = (e) => typing.delete(e.target); // and on focusout: what's left was committed, or never typed

  // Held keys: Alt swaps a drawing tool for the picker (Shift added: the background color), Space any
  // tool for the hand. Let go mid-drag and the tool comes back when the drag ends, so a pick or a pan
  // never turns into a stroke.
  let _releasePending = false;
  const _release = () => {
    _releasePending = workspaceStore.isPainting;
    if (!_releasePending) workspaceStore.releaseTool();
  };
  watch(() => workspaceStore.isPainting, (painting) => { if (!painting && _releasePending) _release(); });

  // Space pans unless the art isn't showing (SAUCE, SOCIAL), it types (a text field, a menu, Edit Mode's
  // typing) or it presses a focused control (a button, a checkbox) while the pointer isn't over the canvas.
  const _spacePans = (e) => {
    if (!workspaceStore.editMode || workspaceStore.paletteLayerOpen || workspaceStore.colorBox || workspaceStore.isPainting) return false;
    if (workspaceStore.activeTool === 'text' && workspaceStore.textCursor && workspaceStore.editorTab === 'output') return false; // typing, wherever focus is
    if (typesIn(e.target) || e.target?.tagName === 'SELECT') return false;
    return !ownsKey(e.target, e) || workspaceStore.pointerOverEditor;
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

  // Typing in Edit Mode: the Text tool with its cursor placed, in the ANSI view.
  const _typing = () => workspaceStore.activeTool === 'text' && !!workspaceStore.textCursor && workspaceStore.editorTab === 'output';
  // What a command's where, available and run are asked with (src/lib/commands.js).
  const _ctx = (e) => ({ project: projectStore, workspace: workspaceStore, event: e, view: workspaceStore.editorTab, typing: _typing(), uncommitted: typing.has(e.target) });

  // The ANSI view's selection keys: Cmd/Ctrl+C, X, V (on the picked layer, or the shown layers with All layers on; a paste goes to the
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
    // Something else already took the key (the palette layer, the color layer, a popover).
    if (e.defaultPrevented || workspaceStore.paletteLayerOpen || workspaceStore.colorBox) return false;
    if (!['input', 'output'].includes(workspaceStore.editorTab) || e.altKey) return false; // the art views
    if (workspaceStore.isPainting) return false; // mid-drag: the drag's end decides
    // The Text tool's textarea isn't a field: Cmd/Ctrl+V there still pastes a Select block (and only
    // pastes text, through the textarea, when there's no block).
    if (ownsKey(e.target, e)) return false;
    if (e.shiftKey) {
      if (!ARROWS[e.key] || e.metaKey || e.ctrlKey || !_shiftSelect(...ARROWS[e.key])) return false;
      e.preventDefault();
      return true;
    }
    const sel = workspaceStore.selection, layers = workspaceStore.selectionIds;
    const selecting = workspaceStore.activeTool === 'select' && sel;
    const command = e.metaKey || e.ctrlKey;
    if (!command) {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if ((e.key === 'Escape' || (selecting && e.key === 'Enter')) && sel) {
        projectStore.changeSelection((w) => { w.selection = null; });
        if (workspaceStore.activeTool === 'select' && workspaceStore.selectFromText) workspaceStore.setActiveTool('text'); // back to typing, at the cursor
      } else if (e.key === 'Escape' && _typing()) [workspaceStore.lastTextCursor, workspaceStore.textCursor] = [workspaceStore.textCursor, null];
      else if (selecting && (e.key === 'Delete' || e.key === 'Backspace' || key === 'e')) deleting(sel, layers);
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
      deleting(sel, layers);
    } else return false;
    e.preventDefault();
    return true;
  };

  // Cmd/Ctrl+A, C, X and V on VECTOR, not the page's: A selects every shape on the frame, bottom to top, with
  // Vector select; C copies the selected shapes and X cuts them (vectorClipboard.js); V is left to the browser,
  // whose paste event has another tab's shapes (_handlePaste), and pastes this tab's when there's no paste event.
  // A Pen shape under way ends first.
  const _handleVectorKeys = (e) => {
    const key = e.key.toLowerCase();
    if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || !['a', 'c', 'x', 'v'].includes(key)) return false;
    if (workspaceStore.editorTab !== 'vector' || ownsKey(e.target, e) || workspaceStore.isPainting || !projectStore.image) return false;
    projectStore.commitPending();
    if (key === 'v') {
      clearTimeout(_pendingPaste?.timer);
      _pendingPaste = { vector: true, timer: setTimeout(() => { _pendingPaste = null; pasteShapes(projectStore, workspaceStore); }, 50) };
      return true;
    }
    if (key === 'a') {
      workspaceStore.setActiveTool('vselect');
      projectStore.selectShapes(stacked(projectStore.shapes, projectStore.shapeRank).map(([k]) => k));
    } else if (!{ c: copyShapes, x: cutShapes, v: pasteShapes }[key](projectStore, workspaceStore)) return false;
    e.preventDefault();
    return true;
  };

  // The Magic Wand's selection: Escape drops it; Delete or Backspace takes away what's drawn in it, on the picked layer or
  // the shown layers with All layers on (not in Edit Mode, where they edit the text).
  const _handleWandKeys = (e) => {
    const wand = workspaceStore.wand;
    if (!wand || e.defaultPrevented || ownsKey(e.target, e) || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return false;
    if (workspaceStore.paletteLayerOpen || workspaceStore.colorBox || workspaceStore.isPainting) return false; // the palettes have the keys; mid-drag, the drag's end decides
    if (e.key === 'Escape') projectStore.changeSelection((w) => { w.wand = null; });
    else if ((e.key === 'Delete' || e.key === 'Backspace') && workspaceStore.activeTool !== 'text') projectStore.deleteInWand(wand, workspaceStore.editorTab, workspaceStore.selectionIds);
    else return false;
    e.preventDefault();
    return true;
  };

  // Escape inside an art layer, with nothing else to cancel (the handlers before this one took it if there was): out of
  // the layer, to VECTOR.
  const _handleArtKeys = (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented || !projectStore.artInside || ownsKey(e.target, e)) return false;
    if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || workspaceStore.paletteLayerOpen || workspaceStore.colorBox || workspaceStore.isPainting) return false;
    projectStore.leaveArt();
    workspaceStore.editorTab = 'vector';
    e.preventDefault();
    return true;
  };

  // Paste, from what the system clipboard holds (the paste event's text and HTML), the first that
  // applies: a Phosphor block (this tab's own copy pastes Phosphor's own block, which a Bake keeps
  // up to date; another tab's pastes as it came); a Moebius block; or text, typed in: at the Text
  // cursor in Edit Mode, else at the selection or the top-left of the view. Phosphor's own block
  // wins when the browser refused the copy, and over text that's what the last copy put there. A
  // block lands floating and selected, to drag into place.
  let _pendingPaste = null; // { at, timer }, or { vector, timer } on VECTOR, from Cmd/Ctrl+V until its paste event
  const _pasteBlock = (at, block = workspaceStore.clipboard) => {
    if (!block) return;
    busyWhile(t('busy.pasting'), () => {
      const pasted = projectStore.pasteSelection(block, at.col, at.row);
      if (pasted) workspaceStore.selectAll(pasted); // selected, with the Select tool, to drag into place
    });
  };
  const _typeText = (at, text) => {
    if (workspaceStore.activeTool !== 'text' || !workspaceStore.textCursor) workspaceStore.textCursor = at;
    typeText(projectStore, workspaceStore, text);
  };
  const _handlePaste = (e) => {
    if (!_pendingPaste) return; // not a Cmd/Ctrl+V we routed (a field's own paste, the context menu)
    const { at, timer, vector } = _pendingPaste;
    clearTimeout(timer);
    _pendingPaste = null;
    e.preventDefault();
    if (projectStore._paused) return; // refused: nothing moves to where it would have gone
    if (vector) { // another tab's shapes, else this tab's
      const shapes = readClipboardHtml(e.clipboardData?.getData('text/html'))?.shapes;
      const theirs = shapes && shapes.id !== workspaceStore.vectorClipboardId;
      pasteShapes(projectStore, workspaceStore, theirs ? shapes.shapes : undefined, theirs ? shapes.keys : undefined);
      return;
    }
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
    if (e.defaultPrevented || ownsKey(e.target, e) || !workspaceStore.editMode || workspaceStore.isPainting) return false;
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
    if (e.key === 'Meta') workspaceStore.isMetaPressed = true;
    if (e.key === 'Shift') workspaceStore.isShiftPressed = true;
    if (e.key === 'Alt') workspaceStore.isAltPressed = true;

    // The commands' keys (src/lib/commands.js) and the handlers that aren't commands, in the order they claim a key.
    if (takeKey(e, _ctx(e), ['animation.play'])) return;
    // A key while playing pauses first, on the frame showing, so what it does lands there. The bar's
    // own controls have their keys, and they pause for themselves.
    if (workspaceStore.playing && !ownsKey(e.target, e) && !e.target?.closest?.('[role="toolbar"]') && !['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) playback.pause();

    const ctx = _ctx(e);
    if (takeKey(e, ctx, ['animation.prevFrame', 'animation.nextFrame', 'animation.newFrame'])) return;
    if (takeKey(e, ctx, ['general.undo', 'general.redo', 'file.save', 'file.saveAs', 'file.export', 'file.open',
      'view.zoomIn', 'view.zoomOut', 'view.zoomBack', 'general.help'])) return;
    if (_handleVectorKeys(e)) return;
    if (_handleActiveToolKeys(e)) return;
    if (takeKey(e, ctx, ['colors.openFg', 'colors.openBg', 'colors.swap', 'colors.fgPrev', 'colors.fgNext', 'colors.bgPrev', 'colors.bgNext',
      'characters.setPrev', 'characters.setNext', 'edit.altArrowsElsewhere'])) return;
    if (_handleToolSwap(e)) return;
    if (_handleWandKeys(e)) return;
    if (_handleSelectionKeys(e)) return;
    if (_handleArtKeys(e)) return;
    takeKey(e, ctx, ['tool.*', 'drawing.sizeUp', 'drawing.sizeDown']);
  };

  const _handleGlobalKeyUp = (e) => {
    if (e.key === 'Control') {
      workspaceStore.isCtrlPressed = false;
    }
    if (e.key === 'Meta') workspaceStore.isMetaPressed = false;

    if (e.key === 'Shift') workspaceStore.isShiftPressed = false;
    if (e.key === 'Alt') workspaceStore.isAltPressed = false;
    const held = workspaceStore.heldTool?.by;
    if ((e.key === 'Alt' && held === 'alt') || (e.code === 'Space' && held === 'space')) {
      if (e.code === 'Space') e.preventDefault(); // a focused button isn't pressed by the Space that panned
      _release();
    }
  };

  const _handleBlur = () => {
    workspaceStore.isCtrlPressed = workspaceStore.isMetaPressed = false;
    workspaceStore.isMiddleClick = false;
    workspaceStore.isShiftPressed = workspaceStore.isAltPressed = false;
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
    document.addEventListener('input', _onInput, true);
    document.addEventListener('change', _onChange, true);
    document.addEventListener('focusout', _onChange, true);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', _handleGlobalKeyDown);
    window.removeEventListener('keyup', _handleGlobalKeyUp);
    window.removeEventListener('blur', _handleBlur);
    window.removeEventListener('contextmenu', _handleContextMenu);
    document.removeEventListener('paste', _handlePaste, true);
    document.removeEventListener('input', _onInput, true);
    document.removeEventListener('change', _onChange, true);
    document.removeEventListener('focusout', _onChange, true);
    clearTimeout(_pendingPaste?.timer);
  });

  return {};
}
