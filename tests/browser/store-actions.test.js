// The project store's actions, pinned: splitting the store into files (store/project/) must neither
// lose nor rename one. Adding or removing an action means updating this list on purpose.
import { test, expect } from 'vitest';
import { createTestApp } from '../support/app.js';

const ACTIONS = [
  'applyEditCells', 'backspaceAt', 'bake', 'baseCellAt', 'baseColorAt', 'baseColorsOf', 'basePixelsOf', 'beginEdit',
  'cancelEdit', 'cellHasPaint', 'clearEditCells', 'clearEditLayer', 'clearHistory', 'clearImage', 'clipRect',
  'commitEdit', 'commitPending', 'commitSliders', 'completeAt', 'composite', 'copySelection',
  'deleteAt', 'deleteIn', 'deleteSelection', 'dropEdits', 'editCell', 'editCellAt', 'ensureLayer',
  'eraseBase', 'eraseBasePixels', 'eraseEditPixels', 'exportFile', 'fitFor', 'flipBase', 'flipCell',
  'flipPaint', 'floatSelection', 'gridRect', 'hasEditsIn', 'imageColorAt', 'keepMigratedLook',
  'loadProject', 'markSaved', 'mergeCellOf', 'mergeDown', 'mergeIntoPicture', 'mergeUp',
  'moveSelection', 'newDocument', 'paintEditPixels', 'paintStroke', 'pasteAt', 'pasteBase',
  'pasteSelection', 'processingScale', 'pushEdit', 'randomizeSeed', 'rawColorAt', 'recompose', 'redo', 'refreshCells', 'refreshChanged', 'rename',
  'render', 'replaceImage', 'resetGroup', 'resetSliders', 'saveProject', 'selectionEdit',
  'setBaseRecords', 'setBlankCanvas', 'setCells', 'setImageFromFile', 'setSlider', 'shiftCells',
  'sliderValues', 'stampSelection', 'typeAt', 'typing', 'underlyingAt', 'undo', 'updateCols', 'updateRows', 'writeAt',
  'writeBase', 'writeEditCells',
];

test('the project store has exactly its actions', async () => {
  const { project } = await createTestApp();
  const names = Object.keys(project).filter((k) => typeof project[k] === 'function' && !k.startsWith('$') && !k.startsWith('_')).sort();
  expect(names).toEqual(ACTIONS);
});
