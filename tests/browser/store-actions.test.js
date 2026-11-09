// The project store's actions, pinned: splitting the store into files (store/project/) must neither
// lose nor rename one. Adding or removing an action means updating this list on purpose.
import { test, expect } from 'vitest';
import { createTestApp } from '../support/app.js';

const ACTIONS = [
  'addFrame', 'addKey', 'addShape', 'addShapes', 'addSvg', 'addVectorLayer', 'animationCells', 'applyBase', 'applyChange', 'applyEditCells', 'applyNumbered', 'applySettings', 'askForStroke', 'backspaceAt', 'bake', 'baseCellAt', 'baseColorAt', 'baseColorsOf', 'basePixelsOf', 'beginEdit', 'buildGhost', 'builtFrame',
  'cancelEdit', 'cancelKeyDrag', 'catchUpFor', 'cellHasPaint', 'changeEverywhere', 'changeSelection', 'clearEditCells', 'clearEditLayer', 'clearHistory', 'clearImage', 'clipRect', 'combineShapes',
  'commitArt', 'commitEdit', 'commitPending', 'commitSliders', 'compareCheck', 'completeAt', 'composite', 'continueAsArtist', 'copySelection',
  'deleteAt', 'deleteFrame', 'deleteIn', 'deleteInWand', 'deleteKeys', 'deleteSelection', 'deleteShapes', 'documentNumber', 'dropEdits', 'dropHeard', 'dropOldUndo', 'dropWaiting', 'editCell', 'editCellAt', 'editLayerSum', 'endKeyDrag', 'ensureLayer', 'enterArt',
  'eraseBase', 'eraseBasePixels', 'eraseEditPixels', 'exportAnimation', 'exportFile', 'finishPen', 'fitFor', 'flattenDrawing', 'flipBase', 'flipCell',
  'flipPaint', 'floatSelection', 'flushHeard', 'followPath', 'forgetAsked', 'gridRect', 'hasCharacters', 'hasEditsIn', 'hearDrawing', 'imageColorAt', 'inheritedCells', 'inheritedShapes', 'joinShapes', 'keepLedger', 'keepMigratedLook', 'keptForHandOver', 'layersFor', 'leaveArt', 'leavePending',
  'loadArt', 'loadProject', 'lockedBy', 'makeArtLayer', 'markSaved', 'mergeCellOf', 'mergeDown', 'mergeIntoPicture', 'mergeShapes', 'mergeUp',
  'moveFrame', 'moveKeys', 'moveSelection', 'newConnection', 'newDocument', 'noteDrawn', 'noteFrame', 'numberWaiting', 'openArtFile', 'openFrames', 'openFromHost', 'openParts', 'openSvgFile', 'ownStroke', 'paintEditPixels', 'paintStroke', 'pasteAt',
  'pasteSelection', 'penBack', 'penPoint', 'pickPalette', 'pictureCells', 'pressShapes', 'pressedKeys', 'processingScale', 'projectNow', 'projectParts', 'pushEdit', 'pushKeptStroke', 'pushWholeLayer', 'putShapesBack', 'randomizeSeed', 'rawColorAt', 'readCell', 'readHandOver', 'readTile', 'rebuildCells', 'recolorSelection', 'recompose', 'redo', 'redoStroke', 'refreshCells', 'refreshChanged', 'refreshShapes', 'rename', 'renameLayer',
  'render', 'replaceImage', 'replayOnPicture', 'resendPending', 'resetFrames', 'resetGroup', 'resetSliders', 'resolvedOf', 'restackShapes', 'restoreDocument', 'restoreLedger', 'sauceFields', 'saveProject', 'selectShapes', 'selectionEdit', 'sendBase', 'sendHeld', 'sendHeldSoon', 'sendNumbered', 'sendParts', 'sendSettings', 'sendSlice',
  'separateShape', 'setAllFrames', 'setAnimate', 'setArtContent', 'setBaseRecords', 'setBlankCanvas', 'setCells', 'setEditCells', 'setFollow', 'setFps', 'setFrameState', 'setFramesArt', 'setGuide', 'setHold', 'setImageFromFile', 'setKeyEasing', 'setKeyMotion', 'setLayerHidden', 'setPaused', 'setShapes', 'setSlider', 'shapesBefore', 'shareWholeDocument', 'shiftCells', 'showFrame',
  'sliderValues', 'staleFrames', 'stampSelection', 'startSharing', 'stepFrame', 'stopFollowing', 'stopSharing', 'strokeRefused', 'takeCatchUp', 'takeFromArtist', 'takeLedger', 'takeProject', 'throughPending', 'turnSelection', 'typeAt', 'typing', 'underlyingAt', 'undo', 'undoStroke', 'updateCols', 'updateRows', 'updateShapes', 'waitForAnswer', 'waitingBoxes', 'writeAt',
  'writeBase', 'writeBaseCells', 'writeEditCells',
];

test('the project store has exactly its actions', async () => {
  const { project } = await createTestApp();
  const names = Object.keys(project).filter((k) => typeof project[k] === 'function' && !k.startsWith('$') && !k.startsWith('_')).sort();
  expect(names).toEqual(ACTIONS);
});
