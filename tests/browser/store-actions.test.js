// The project store's actions, pinned: splitting the store into files (store/project/) must neither
// lose nor rename one. Adding or removing an action means updating this list on purpose.
import { test, expect } from 'vitest';
import { createTestApp } from '../support/app.js';

const ACTIONS = [
  'applyBase', 'applyChange', 'applyEditCells', 'applyNumbered', 'applySettings', 'askForStroke', 'backspaceAt', 'bake', 'baseCellAt', 'baseColorAt', 'baseColorsOf', 'basePixelsOf', 'beginEdit',
  'cancelEdit', 'catchUpFor', 'cellHasPaint', 'changeSelection', 'clearEditCells', 'clearEditLayer', 'clearHistory', 'clearImage', 'clipRect',
  'commitEdit', 'commitPending', 'commitSliders', 'compareCheck', 'completeAt', 'composite', 'continueAsArtist', 'copySelection',
  'deleteAt', 'deleteIn', 'deleteInWand', 'deleteSelection', 'documentNumber', 'dropEdits', 'dropHeard', 'dropOldUndo', 'dropWaiting', 'editCell', 'editCellAt', 'editLayerSum', 'ensureLayer',
  'eraseBase', 'eraseBasePixels', 'eraseEditPixels', 'exportFile', 'fitFor', 'flipBase', 'flipCell',
  'flipPaint', 'floatSelection', 'flushHeard', 'gridRect', 'hasCharacters', 'hasEditsIn', 'hearDrawing', 'imageColorAt', 'keepLedger', 'keepMigratedLook', 'keptForHandOver', 'layersFor', 'leavePending',
  'loadProject', 'markSaved', 'mergeCellOf', 'mergeDown', 'mergeIntoPicture', 'mergeUp',
  'moveSelection', 'newConnection', 'newDocument', 'numberWaiting', 'openFromHost', 'openParts', 'paintEditPixels', 'paintStroke', 'pasteAt', 'pasteBase',
  'pasteSelection', 'processingScale', 'projectNow', 'projectParts', 'pushEdit', 'pushKeptStroke', 'pushWholeLayer', 'randomizeSeed', 'rawColorAt', 'readCell', 'readHandOver', 'readTile', 'rebuildCells', 'recolorSelection', 'recompose', 'redo', 'redoStroke', 'refreshCells', 'refreshChanged', 'rename',
  'render', 'replaceImage', 'replayOnPicture', 'resendPending', 'resetGroup', 'resetSliders', 'restoreDocument', 'restoreLedger', 'saveProject', 'selectionEdit', 'sendBase', 'sendHeld', 'sendHeldSoon', 'sendNumbered', 'sendParts', 'sendSettings', 'sendSlice',
  'setBaseRecords', 'setBlankCanvas', 'setCells', 'setEditCells', 'setImageFromFile', 'setPaused', 'setSlider', 'shareWholeDocument', 'shiftCells',
  'sliderValues', 'stampSelection', 'startSharing', 'stopSharing', 'takeCatchUp', 'takeFromArtist', 'takeLedger', 'takeProject', 'throughPending', 'turnSelection', 'typeAt', 'typing', 'underlyingAt', 'undo', 'undoStroke', 'updateCols', 'updateRows', 'waitForAnswer', 'waitingBoxes', 'writeAt',
  'writeBase', 'writeEditCells',
];

test('the project store has exactly its actions', async () => {
  const { project } = await createTestApp();
  const names = Object.keys(project).filter((k) => typeof project[k] === 'function' && !k.startsWith('$') && !k.startsWith('_')).sort();
  expect(names).toEqual(ACTIONS);
});
