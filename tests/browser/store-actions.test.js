// The project store's actions, pinned: splitting the store into files (store/project/) must neither
// lose nor rename one. Adding or removing an action means updating this list on purpose.
import { test, expect } from 'vitest';
import { createTestApp } from '../support/app.js';

const ACTIONS = [
  'addFrame', 'addKey', 'addLayer', 'addPictureToLayer', 'addShape', 'addShapes', 'addSvg', 'animationCells', 'applyBase', 'applyChange', 'applyEditCells', 'applyNumbered', 'applySettings', 'askForStroke', 'backspaceAt', 'bake', 'baseCellAt', 'baseColorAt', 'baseColorsOf', 'basePixelsOf', 'beginEdit', 'buildGhost', 'builtFrame',
  'cancelEdit', 'cancelKeyDrag', 'catchUpFor', 'cellHasPaint', 'cellsOf', 'changeEverywhere', 'changeSelection', 'charsOf', 'clearEditCells', 'clearEditLayer', 'clearHistory', 'clearImage', 'clipRect', 'combineShapes', 'commitArt', 'commitEdit', 'commitPending', 'commitSliders', 'compareCheck', 'completeAt', 'composite', 'continueAsArtist', 'copySelection',
  'deleteAt', 'deleteFrame', 'deleteIn', 'deleteInWand', 'deleteKeys', 'deleteLayer', 'deleteSelection', 'deleteShapes', 'documentNumber', 'dropEdits', 'dropHeard', 'dropOldUndo', 'dropWaiting', 'duplicateLayer', 'editCell', 'editCellAt', 'editLayerSum', 'endKeyDrag', 'ensureLayer', 'enterArt', 'eraseBase', 'eraseBasePixels', 'eraseEditPixels', 'exportAnimation',
  'exportFile', 'finishPen', 'fitFor', 'flattenDrawing', 'flipBase', 'flipCell', 'flipPaint', 'floatSelection', 'flushHeard', 'followPath', 'forgetAsked', 'gridRect', 'hasCharacters', 'hasEditsIn', 'hearDrawing', 'imageColorAt', 'inheritedCells', 'inheritedShapes', 'joinShapes', 'keepLedger', 'keepMigratedLook', 'keptForHandOver',
  'layerById', 'layerFrames', 'layerHidden', 'layersFor', 'leaveArt', 'leavePending', 'loadArt', 'loadProject', 'lockedBy', 'lookUnder', 'makeArtLayer', 'markSaved', 'mergeCellOf', 'mergeDown', 'mergeIntoPicture', 'mergeShapes', 'mergeUp', 'moveFrame', 'moveKeys', 'moveLayer', 'moveSelection', 'newConnection', 'newDocument', 'noteDrawn',
  'noteFrame', 'numberWaiting', 'onLayer', 'openArtFile', 'openFrames', 'openFromHost', 'openParts', 'openSvgFile', 'overLower', 'ownStroke', 'paintBasePixels', 'paintEditPixels', 'paintOf', 'paintStroke', 'pasteAt', 'pasteSelection', 'penBack', 'penPoint', 'pickPalette', 'pictureCells', 'pressShapes', 'pressedKeys', 'processingScale',
  'projectNow', 'projectParts', 'pushEdit', 'pushKeptStroke', 'pushWholeLayer', 'putShapesBack', 'randomizeSeed', 'rawColorAt', 'readCell', 'readHandOver', 'readTile', 'rebuildCells', 'recolorSelection', 'recompose', 'recomposeEdit', 'recomposeUpper', 'redo', 'redoStroke', 'refreshCells', 'refreshChanged', 'refreshEdit', 'refreshShapes',
  'rename', 'renameLayer', 'render', 'replaceImage', 'replayOnPicture', 'resendPending', 'resetFrames', 'resetGroup', 'resetSliders', 'resolvedOf', 'restackShapes', 'restoreDocument', 'restoreLedger', 'roomLayers', 'sauceFields', 'saveProject', 'selectShapes', 'selectionEdit', 'sendBase', 'sendHeld', 'sendHeldSoon', 'sendNumbered',
  'sendParts', 'sendSettings', 'sendSlice', 'separateShape', 'setAllFrames', 'setAnimate', 'setArtContent', 'setBaseRecords', 'setBlankCanvas', 'setCells', 'setEditCells', 'setFollow', 'setFps', 'setFrameState', 'setFramesArt', 'setGuide', 'setHold', 'setImageFromFile', 'setKeyEasing', 'setKeyMotion', 'setLayerChars', 'setLayerHidden', 'setPaused',
  'setShapes', 'setSlider', 'shapesBefore', 'shareWholeDocument', 'shiftCells', 'showFrame', 'sliderValues', 'staleFrames', 'stampSelection', 'startSharing', 'stepFrame', 'stopFollowing', 'stopSharing', 'storedLookAt', 'strokeRefused', 'syncShapeLayers', 'takeCatchUp', 'takeFromArtist', 'takeLedger', 'takeProject', 'throughPending', 'turnSelection', 'typeAt',
  'typing', 'underlyingAt', 'undo', 'undoStroke', 'updateCols', 'updateRows', 'updateShapes', 'useLayer', 'waitForAnswer', 'waitingBoxes', 'writeAt', 'writeBase', 'writeBaseCells', 'writeEditCells',
];

test('the project store has exactly its actions', async () => {
  const { project } = await createTestApp();
  const names = Object.keys(project).filter((k) => typeof project[k] === 'function' && !k.startsWith('$') && !k.startsWith('_')).sort();
  expect(names).toEqual(ACTIONS);
});
