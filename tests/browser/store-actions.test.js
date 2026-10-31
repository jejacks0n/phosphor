// The project store's actions, pinned: splitting the store into files (store/project/) must neither
// lose nor rename one. Adding or removing an action means updating this list on purpose.
import { test, expect } from 'vitest';
import { createTestApp } from '../support/app.js';

const ACTIONS = [
  'applyChange', 'applyEditCells', 'backspaceAt', 'bake', 'baseCellAt', 'baseColorAt', 'baseColorsOf', 'basePixelsOf', 'beginEdit',
  'cancelEdit', 'cellHasPaint', 'changeSelection', 'clearEditCells', 'clearEditLayer', 'clearHistory', 'clearImage', 'clipRect',
  'commitEdit', 'commitPending', 'commitSliders', 'completeAt', 'composite', 'copySelection',
  'deleteAt', 'deleteIn', 'deleteInWand', 'deleteSelection', 'dropEdits', 'dropOldUndo', 'editCell', 'editCellAt', 'ensureLayer',
  'eraseBase', 'eraseBasePixels', 'eraseEditPixels', 'exportFile', 'fitFor', 'flipBase', 'flipCell',
  'flipPaint', 'floatSelection', 'gridRect', 'hasCharacters', 'hasEditsIn', 'imageColorAt', 'keepMigratedLook',
  'loadProject', 'markSaved', 'mergeCellOf', 'mergeDown', 'mergeIntoPicture', 'mergeUp',
  'moveSelection', 'newDocument', 'openParts', 'paintEditPixels', 'paintStroke', 'pasteAt', 'pasteBase',
  'pasteSelection', 'processingScale', 'projectParts', 'pushEdit', 'pushWholeLayer', 'randomizeSeed', 'rawColorAt', 'readCell', 'readTile', 'rebuildCells', 'recolorSelection', 'recompose', 'redo', 'redoStroke', 'refreshCells', 'refreshChanged', 'rename',
  'render', 'replaceImage', 'resetGroup', 'resetSliders', 'restoreDocument', 'saveProject', 'selectionEdit',
  'setBaseRecords', 'setBlankCanvas', 'setCells', 'setImageFromFile', 'setSlider', 'shiftCells',
  'sliderValues', 'stampSelection', 'turnSelection', 'typeAt', 'typing', 'underlyingAt', 'undo', 'undoStroke', 'updateCols', 'updateRows', 'writeAt',
  'writeBase', 'writeEditCells',
];

test('the project store has exactly its actions', async () => {
  const { project } = await createTestApp();
  const names = Object.keys(project).filter((k) => typeof project[k] === 'function' && !k.startsWith('$') && !k.startsWith('_')).sort();
  expect(names).toEqual(ACTIONS);
});
