// The project store's actions, pinned: splitting the store into files (store/project/) must neither
// lose nor rename one. Adding or removing an action means updating this list on purpose.
import { test, expect } from 'vitest';
import { createTestApp } from '../support/app.js';

const ACTIONS = [
  'addFrame', 'addKey', 'addLayer', 'addPictureToLayer', 'addShape', 'addShapes', 'addShapesAbove', 'addSvg', 'animationCells', 'applyBase', 'applyChange', 'applyEditCells', 'applyLayers', 'applyNumbered', 'applySettings', 'artDrawingCells', 'askForStroke', 'askLayerOp', 'backspaceAt', 'bake', 'baseCellAt', 'baseColorAt', 'baseColorsOf', 'basePixelsOf', 'beginEdit', 'buildGhost', 'builtFrame',
  'cancelEdit', 'cancelKeyDrag', 'catchUpFor', 'cellHasPaint', 'cellReader', 'cellsOf', 'changeEverywhere', 'changeSelection', 'charsOf', 'clearEditCells', 'clearEditLayer', 'clearHistory', 'clearImage', 'clipRect', 'colorsOnlyCells', 'combineShapes', 'commitArt', 'commitEdit', 'commitLayerChars', 'commitPending', 'commitSliders', 'compareCheck', 'completeAt', 'composite', 'continueAsArtist', 'copySelection',
  'deleteAt', 'deleteColumn', 'deleteFrame', 'deleteIn', 'deleteInWand', 'deleteKeys', 'deleteLayer', 'deleteLine', 'deleteSelection', 'deleteShapes', 'documentNumber', 'dropEdits', 'dropHeard', 'dropOldUndo', 'dropWaiting', 'duplicateLayer', 'editCell', 'editCellAt', 'editLayerSum', 'editRun', 'endKeyDrag', 'ensureLayer', 'enterArt', 'eraseBase', 'eraseBasePixels', 'eraseEditPixels', 'exportAnimation',
  'exportFile', 'finishPen', 'fitFor', 'flattenDrawing', 'flipBase', 'flipCell', 'flipPaint', 'floatSelection', 'flushHeard', 'followPath', 'forgetAsked', 'gridRect', 'hasCharacters', 'hasEditsIn', 'hearDrawing', 'imageColorAt', 'inheritedShapes', 'inkCells', 'insertColumn', 'insertLine', 'joinShapes', 'keepLedger', 'keepMigratedLook', 'keptForHandOver',
  'layerById', 'layerFrames', 'layerHidden', 'layersFor', 'leaveArt', 'leavePending', 'loadArt', 'loadProject', 'lockedBy', 'lookUnder', 'makeArtLayer', 'markSaved', 'mergeCellOf', 'mergeDown', 'mergeIntoPicture', 'mergeShapes', 'mergeShapesIntoPicture', 'moveFrame', 'moveKeys', 'moveLayer', 'moveSelection', 'newConnection', 'newDocument', 'noteDrawn',
  'noteFrame', 'numberWaiting', 'onLayer', 'openArtFile', 'openFrames', 'openFromHost', 'openParts', 'openSvgFile', 'overLower', 'ownCellMaps', 'ownCharAt', 'ownStroke', 'paintBasePixels', 'paintEditPixels', 'paintOf', 'paintStroke', 'pasteAt', 'pasteSelection', 'penBack', 'penPoint', 'pickPalette', 'pictureCells', 'pixelsAsSeen', 'pressShapes', 'pressedKeys', 'processingScale',
  'projectFile', 'projectNow', 'projectParts', 'pushEdit', 'pushKeptStroke', 'pushWholeLayer', 'putEditPixels', 'putShapesBack', 'randomizeSeed', 'rawColorAt', 'readCell', 'readHandOver', 'readTile', 'rebuildCells', 'recolorCells', 'recolorSelection', 'recompose', 'recomposeEdit', 'recomposeUpper', 'redo', 'redoStroke', 'refreshCells', 'refreshChanged', 'refreshEdit', 'refreshShapes',
  'rename', 'renameLayer', 'render', 'replaceImage', 'replayOnPicture', 'resendPending', 'resetFrames', 'resetGroup', 'resetSliders', 'resolvedOf', 'restackShapes', 'restoreDocument', 'restoreLedger', 'sauceCommentFit', 'sauceFields', 'saveProject', 'selectShapes', 'selectionEdit', 'sendBase', 'sendHeld', 'sendHeldSoon', 'sendLayers', 'sendNumbered',
  'sendParts', 'sendSettings', 'sendSlice', 'separateShape', 'setAllFrames', 'setAnimate', 'setArtContent', 'setAspectLock', 'setBaseRecords', 'setBlankCanvas', 'setCells', 'setDrawingFont', 'setDrawingFontWidth', 'setEditCells', 'setFollow', 'setFps', 'setFrameState', 'setFramesArt', 'setGuide', 'setHold', 'setIceColors', 'setImageFromFile', 'setKeyEasing', 'setKeyMotion', 'setLayerChars', 'setLayerHidden', 'setPaused',
  'setShapes', 'setSlider', 'shadeCells', 'shapeRank', 'shapesBefore', 'shareWholeDocument', 'shiftBaseCells', 'shiftBaseColumns', 'shiftBaseLines', 'shiftCells', 'showFrame', 'sliderValues', 'staleFrames', 'stampSelection', 'startSharing', 'steadyCells', 'stepFrame', 'stopFollowing', 'stopSharing', 'storedLookAt', 'strokeRefused', 'syncShapeLayers', 'takeCatchUp', 'takeFromArtist', 'takeLayerOp', 'takeLedger', 'takeProject', 'throughPending', 'turnSelection', 'typeAt',
  'typing', 'underlyingAt', 'undo', 'undoStroke', 'unlockCells', 'updateCols', 'updateRows', 'updateShapes', 'useLayer', 'waitForAnswer', 'waitingBoxes', 'writeAt', 'writeBase', 'writeBaseCells', 'writeBlocks', 'writeEditCells',
];

test('the project store has exactly its actions', async () => {
  const { project } = await createTestApp();
  const names = Object.keys(project).filter((k) => typeof project[k] === 'function' && !k.startsWith('$') && !k.startsWith('_')).sort();
  expect(names).toEqual(ACTIONS);
});
