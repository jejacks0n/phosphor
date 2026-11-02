// The project store's actions, pinned: splitting the store into files (store/project/) must neither
// lose nor rename one. Adding or removing an action means updating this list on purpose.
import { test, expect } from 'vitest';
import { createTestApp } from '../support/app.js';

const ACTIONS = [
  'addFrame', 'applyBase', 'applyChange', 'applyEditCells', 'applyNumbered', 'applySettings', 'askForStroke', 'backspaceAt', 'bake', 'baseCellAt', 'baseColorAt', 'baseColorsOf', 'basePixelsOf', 'beginEdit', 'builtFrame',
  'cancelEdit', 'catchUpFor', 'cellHasPaint', 'changeSelection', 'clearEditCells', 'clearEditLayer', 'clearHistory', 'clearImage', 'clipRect',
  'commitEdit', 'commitPending', 'commitSliders', 'compareCheck', 'completeAt', 'composite', 'continueAsArtist', 'copySelection',
  'deleteAt', 'deleteFrame', 'deleteIn', 'deleteInWand', 'deleteSelection', 'documentNumber', 'dropEdits', 'dropHeard', 'dropOldUndo', 'dropWaiting', 'editCell', 'editCellAt', 'editLayerSum', 'ensureLayer',
  'eraseBase', 'eraseBasePixels', 'eraseEditPixels', 'exportFile', 'fitFor', 'flipBase', 'flipCell',
  'flipPaint', 'floatSelection', 'flushHeard', 'forgetAsked', 'gridRect', 'hasCharacters', 'hasEditsIn', 'hearDrawing', 'imageColorAt', 'keepLedger', 'keepMigratedLook', 'keptForHandOver', 'layersFor', 'leavePending',
  'loadProject', 'markSaved', 'mergeCellOf', 'mergeDown', 'mergeIntoPicture', 'mergeUp',
  'moveFrame', 'moveSelection', 'newConnection', 'newDocument', 'noteFrame', 'numberWaiting', 'openFromHost', 'openParts', 'ownStroke', 'paintEditPixels', 'paintStroke', 'pasteAt', 'pasteBase',
  'pasteSelection', 'processingScale', 'projectNow', 'projectParts', 'pushEdit', 'pushKeptStroke', 'pushWholeLayer', 'randomizeSeed', 'rawColorAt', 'readCell', 'readHandOver', 'readTile', 'rebuildCells', 'recolorSelection', 'recompose', 'redo', 'redoStroke', 'refreshCells', 'refreshChanged', 'rename',
  'render', 'replaceImage', 'replayOnPicture', 'resendPending', 'resetFrames', 'resetGroup', 'resetSliders', 'resolvedOf', 'restoreDocument', 'restoreLedger', 'saveProject', 'selectionEdit', 'sendBase', 'sendHeld', 'sendHeldSoon', 'sendNumbered', 'sendParts', 'sendSettings', 'sendSlice',
  'setAllFrames', 'setAnimate', 'setBaseRecords', 'setBlankCanvas', 'setCells', 'setEditCells', 'setFps', 'setFrameState', 'setHold', 'setImageFromFile', 'setPaused', 'setSlider', 'shareWholeDocument', 'shiftCells', 'showFrame',
  'sliderValues', 'staleFrames', 'stampSelection', 'startSharing', 'stopSharing', 'strokeRefused', 'takeCatchUp', 'takeFromArtist', 'takeLedger', 'takeProject', 'throughPending', 'turnSelection', 'typeAt', 'typing', 'underlyingAt', 'undo', 'undoStroke', 'updateCols', 'updateRows', 'waitForAnswer', 'waitingBoxes', 'writeAt',
  'writeBase', 'writeEditCells',
];

test('the project store has exactly its actions', async () => {
  const { project } = await createTestApp();
  const names = Object.keys(project).filter((k) => typeof project[k] === 'function' && !k.startsWith('$') && !k.startsWith('_')).sort();
  expect(names).toEqual(ACTIONS);
});
