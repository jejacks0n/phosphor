// The project store's actions, pinned: splitting the store into files (store/project/) must neither
// lose nor rename one. Adding or removing an action means updating this list on purpose.
import { test, expect } from 'vitest';
import { createTestApp } from '../support/app.js';

const ACTIONS = [
  'applyBase', 'applyChange', 'applyEditCells', 'applyNumbered', 'applySettings', 'askForStroke', 'backspaceAt', 'bake', 'baseCellAt', 'baseColorAt', 'baseColorsOf', 'basePixelsOf', 'beginEdit',
  'cancelEdit', 'cellHasPaint', 'changeSelection', 'clearEditCells', 'clearEditLayer', 'clearHistory', 'clearImage', 'clipRect',
  'commitEdit', 'commitPending', 'commitSliders', 'completeAt', 'composite', 'copySelection',
  'deleteAt', 'deleteIn', 'deleteInWand', 'deleteSelection', 'dropEdits', 'dropHeard', 'dropOldUndo', 'editCell', 'editCellAt', 'editLayerSum', 'ensureLayer',
  'eraseBase', 'eraseBasePixels', 'eraseEditPixels', 'exportFile', 'fitFor', 'flipBase', 'flipCell',
  'flipPaint', 'floatSelection', 'flushHeard', 'gridRect', 'hasCharacters', 'hasEditsIn', 'hearDrawing', 'imageColorAt', 'keepMigratedLook', 'layersFor',
  'loadProject', 'markSaved', 'mergeCellOf', 'mergeDown', 'mergeIntoPicture', 'mergeUp',
  'moveSelection', 'newDocument', 'openFromHost', 'openParts', 'paintEditPixels', 'paintStroke', 'pasteAt', 'pasteBase',
  'pasteSelection', 'processingScale', 'projectNow', 'projectParts', 'pushEdit', 'pushWholeLayer', 'randomizeSeed', 'rawColorAt', 'readCell', 'readTile', 'rebuildCells', 'recolorSelection', 'recompose', 'redo', 'redoStroke', 'refreshCells', 'refreshChanged', 'rename',
  'render', 'replaceImage', 'resetGroup', 'resetSliders', 'restoreDocument', 'saveProject', 'selectionEdit', 'sendBase', 'sendHeld', 'sendNumbered', 'sendParts', 'sendSettings', 'sendSlice',
  'setBaseRecords', 'setBlankCanvas', 'setCells', 'setEditCells', 'setImageFromFile', 'setPaused', 'setSlider', 'shareWholeDocument', 'shiftCells',
  'sliderValues', 'stampSelection', 'startSharing', 'stopSharing', 'takeFromArtist', 'takeProject', 'throughPending', 'turnSelection', 'typeAt', 'typing', 'underlyingAt', 'undo', 'undoStroke', 'updateCols', 'updateRows', 'writeAt',
  'writeBase', 'writeEditCells',
];

test('the project store has exactly its actions', async () => {
  const { project } = await createTestApp();
  const names = Object.keys(project).filter((k) => typeof project[k] === 'function' && !k.startsWith('$') && !k.startsWith('_')).sort();
  expect(names).toEqual(ACTIONS);
});
