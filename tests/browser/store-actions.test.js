// The project store's actions, pinned: splitting the store into files (store/project/) must neither
// lose nor rename one. Adding or removing an action means updating this list on purpose.
import { test, expect } from 'vitest';
import { createTestApp } from '../support/app.js';

const ACTIONS = [
  'addFrame', 'addShape', 'addShapes', 'addSvg', 'animationCells', 'applyBase', 'applyChange', 'applyEditCells', 'applyNumbered', 'applySettings', 'askForStroke', 'backspaceAt', 'bake', 'baseCellAt', 'baseColorAt', 'baseColorsOf', 'basePixelsOf', 'beginEdit', 'builtFrame',
  'cancelEdit', 'catchUpFor', 'cellHasPaint', 'changeSelection', 'clearEditCells', 'clearEditLayer', 'clearHistory', 'clearImage', 'clipRect', 'combineShapes',
  'commitEdit', 'commitPending', 'commitSliders', 'compareCheck', 'completeAt', 'composite', 'continueAsArtist', 'copySelection',
  'deleteAt', 'deleteFrame', 'deleteIn', 'deleteInWand', 'deleteSelection', 'deleteShapes', 'documentNumber', 'dropEdits', 'dropHeard', 'dropOldUndo', 'dropWaiting', 'editCell', 'editCellAt', 'editLayerSum', 'ensureLayer',
  'eraseBase', 'eraseBasePixels', 'eraseEditPixels', 'exportAnimation', 'exportFile', 'finishPen', 'fitFor', 'flipBase', 'flipCell',
  'flipPaint', 'floatSelection', 'flushHeard', 'forgetAsked', 'gridRect', 'hasCharacters', 'hasEditsIn', 'hearDrawing', 'imageColorAt', 'inheritedCells', 'inheritedShapes', 'joinShapes', 'keepLedger', 'keepMigratedLook', 'keptForHandOver', 'layersFor', 'leavePending',
  'loadProject', 'markSaved', 'mergeCellOf', 'mergeDown', 'mergeIntoPicture', 'mergeShapes', 'mergeUp',
  'moveFrame', 'moveSelection', 'newConnection', 'newDocument', 'noteDrawn', 'noteFrame', 'numberWaiting', 'openArtFile', 'openFrames', 'openFromHost', 'openParts', 'openSvgFile', 'ownStroke', 'paintEditPixels', 'paintStroke', 'pasteAt', 'pasteBase',
  'pasteSelection', 'penBack', 'penPoint', 'pickPalette', 'pressShapes', 'pressedKeys', 'processingScale', 'projectNow', 'projectParts', 'pushEdit', 'pushKeptStroke', 'pushWholeLayer', 'putShapesBack', 'randomizeSeed', 'rawColorAt', 'readCell', 'readHandOver', 'readTile', 'rebuildCells', 'recolorSelection', 'recompose', 'redo', 'redoStroke', 'refreshCells', 'refreshChanged', 'refreshShapes', 'rename',
  'render', 'replaceImage', 'replayOnPicture', 'resendPending', 'resetFrames', 'resetGroup', 'resetSliders', 'resolvedOf', 'restackShapes', 'restoreDocument', 'restoreLedger', 'sauceFields', 'saveProject', 'selectShapes', 'selectionEdit', 'sendBase', 'sendHeld', 'sendHeldSoon', 'sendNumbered', 'sendParts', 'sendSettings', 'sendSlice',
  'separateShape', 'setAllFrames', 'setAnimate', 'setBaseRecords', 'setBlankCanvas', 'setCells', 'setEditCells', 'setFps', 'setFrameState', 'setHold', 'setImageFromFile', 'setMotion', 'setPaused', 'setShapes', 'setSlider', 'setTween', 'shapesBefore', 'shareWholeDocument', 'shiftCells', 'showFrame',
  'sliderValues', 'staleFrames', 'stampSelection', 'startSharing', 'stepFrame', 'stopSharing', 'strokeRefused', 'takeCatchUp', 'takeFromArtist', 'takeLedger', 'takeProject', 'throughPending', 'turnSelection', 'typeAt', 'typing', 'underlyingAt', 'undo', 'undoStroke', 'updateCols', 'updateRows', 'updateShapes', 'waitForAnswer', 'waitingBoxes', 'writeAt',
  'writeBase', 'writeBaseCells', 'writeEditCells',
];

test('the project store has exactly its actions', async () => {
  const { project } = await createTestApp();
  const names = Object.keys(project).filter((k) => typeof project[k] === 'function' && !k.startsWith('$') && !k.startsWith('_')).sort();
  expect(names).toEqual(ACTIONS);
});
