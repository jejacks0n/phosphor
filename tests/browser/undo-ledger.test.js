// Everyone's undo goes through the ledger, position by position: what someone alone sees stays what it
// was (undo.test.js holds the whole of that), and these are the seams: fixed values at each step,
// whole-layer steps giving back the strokes under them, and what's held and dropped.
import { test, expect } from 'vitest';
import { createTestApp, loadImage, settle, cellsKey } from '../support/app.js';
import { TILE } from '@/document/History.js';

const RED = { r: 255, g: 0, b: 0, a: 1 }, BLUE = { r: 0, g: 0, b: 255, a: 1 };
const INK = { fg: '#ffffff', bg: '#000000' };

async function drawing(size = 40) {
  const app = await createTestApp();
  await loadImage(app.project, '/tests/fixtures/images/gradient.png', { cols: size, rows: size });
  app.project.ensureLayer();
  return app;
}

const paint = (project, pixels, color) => {
  project.paintStroke(pixels.map(([x, y]) => ({ x, y, alpha: 1 })), color);
  project.commitEdit();
};
const type = (project, col, row, char) => {
  project.typeAt(col, row, char, INK);
  project.commitEdit();
};
const strokes = (project) => project._ledger.kept().stacks.strokes;
const painted = (project, x, y) => project.paintLayer.pixelAt(x, y);
const char = (project, col, row) => project.editCellAt(col, row)?.char;
const sameLayer = (layer) => {
  const { width, height } = layer.canvas;
  return Array.from(layer.canvas.getContext('2d').getImageData(0, 0, width, height).data).join();
};

test('draw, draw, undo, undo, redo, redo gives the same cells and pixels at each step as the old way', async () => {
  const { project } = await drawing();

  // Paint
  paint(project, [[3, 3]], '#ff0000');
  paint(project, [[3, 3], [4, 3]], '#0000ff');
  expect(strokes(project).size).toBe(2);
  project.undo();
  expect([painted(project, 3, 3), painted(project, 4, 3)]).toEqual([RED, null]);
  project.undo();
  expect([painted(project, 3, 3), painted(project, 4, 3), project.hasPaint]).toEqual([null, null, false]);
  project.redo();
  expect([painted(project, 3, 3), painted(project, 4, 3), project.hasPaint]).toEqual([RED, null, true]);
  project.redo();
  expect([painted(project, 3, 3), painted(project, 4, 3)]).toEqual([BLUE, BLUE]);

  // Cells
  type(project, 10, 10, 'A');
  type(project, 10, 10, 'B');
  project.undo();
  expect(char(project, 10, 10)).toBe('A');
  project.undo();
  expect(project.editCells.has('10,10')).toBe(false);
  project.redo();
  expect(char(project, 10, 10)).toBe('A');
  project.redo();
  expect(char(project, 10, 10)).toBe('B');

  // One stroke doing both, with the base as well
  project.paintEditPixels([{ x: 8, y: 8, r: 255, g: 0, b: 0, alpha: 1 }]);
  project.editCell(12, 12, { char: 'C' });
  project.eraseBase([{ col: 14, row: 14 }]);
  project.commitEdit();
  const check = (on) => {
    expect(painted(project, 8, 8)).toEqual(on ? RED : null);
    expect(char(project, 12, 12)).toBe(on ? 'C' : undefined);
    expect(project.baseRecords.pins.get('14,14')).toBe(on ? ' ' : undefined);
    expect(project.renderer.baseStoredAt(14, 28)).toEqual(on ? { r: 0, g: 0, b: 0, a: 1 } : null);
  };
  check(true);
  project.undo();
  check(false);
  project.redo();
  check(true);
  await settle(project);
});

test('soft paint comes back exactly, and the cells show what they did', async () => {
  const { project } = await drawing();
  project.paintStroke([{ x: 5, y: 5, alpha: 0.37 }, { x: 6, y: 5, alpha: 0.61 }], '#c08040');
  project.commitEdit();
  await settle(project);
  const under = sameLayer(project.paintLayer), shown = cellsKey(project).join();
  project.paintStroke([{ x: 5, y: 5, alpha: 0.5 }, { x: 7, y: 5, alpha: 0.11 }], '#10e0a0');
  project.commitEdit();
  const over = sameLayer(project.paintLayer);
  project.undo();
  await settle(project);
  expect(sameLayer(project.paintLayer)).toBe(under);
  expect(cellsKey(project).join()).toBe(shown);
  project.redo();
  expect(sameLayer(project.paintLayer)).toBe(over);
});

test('undoing a merge brings back the strokes before it, and they still undo', async () => {
  const { project } = await drawing();
  paint(project, [[3, 3]], '#ff0000');
  type(project, 10, 10, 'A');
  project.mergeDown('edit', project.gridRect()); // the whole grid: the layer stays, to draw on
  expect(strokes(project).size).toBe(0);
  expect([painted(project, 3, 3), project.editCells.size]).toEqual([null, 0]);

  // A stroke after it goes away with the merge and comes back with it
  paint(project, [[3, 3]], '#0000ff');
  project.undo();
  project.undo();
  expect(strokes(project).size).toBe(2);
  expect([painted(project, 3, 3), char(project, 10, 10)]).toEqual([RED, 'A']);
  project.redo();
  expect(strokes(project).size).toBe(1);
  project.redo();
  expect(painted(project, 3, 3)).toEqual(BLUE);
  project.undo();
  project.undo();

  project.undo();
  expect(project.editCells.has('10,10')).toBe(false);
  expect(painted(project, 3, 3)).toEqual(RED);
  project.undo();
  expect([painted(project, 3, 3), project.hasPaint]).toEqual([null, false]);
  await settle(project);
});

test('undoing Clear edit layer brings back everything, and those strokes still undo', async () => {
  const { project } = await drawing();
  paint(project, [[3, 3]], '#ff0000');
  type(project, 10, 10, 'A');
  project.clearEditLayer();
  expect(strokes(project).size).toBe(0);
  expect(project.hasEdits).toBe(false);
  project.undo();
  expect(strokes(project).size).toBe(2);
  expect([painted(project, 3, 3), char(project, 10, 10)]).toEqual([RED, 'A']);
  project.undo();
  expect(project.editCells.size).toBe(0);
  project.undo();
  expect(project.hasPaint).toBe(false);
  project.redo();
  project.redo();
  project.redo();
  expect(project.hasEdits).toBe(false);
  expect(strokes(project).size).toBe(0);
  await settle(project);
});

test('an eraser stroke across base and edit undoes both', async () => {
  const { project } = await drawing();
  paint(project, [[6, 12], [6, 13]], '#ff0000');
  project.eraseEditPixels([{ x: 6, y: 12 }, { x: 6, y: 13 }]);
  project.eraseBase([{ col: 6, row: 6 }]);
  project.commitEdit();
  expect(project.hasPaint).toBe(false);
  expect(project.baseRecords.pins.get('6,6')).toBe(' ');
  project.undo();
  expect(painted(project, 6, 12)).toEqual(RED);
  expect(project.hasPaint).toBe(true);
  expect(project.baseRecords.pins.has('6,6')).toBe(false);
  expect(project.renderer.baseStoredAt(6, 12)).toBe(null);
  await settle(project);
});

test('undo after typing puts the text cursor back', async () => {
  const { project, workspace } = await drawing();
  workspace.textCursor = { col: 2, row: 2 };
  project.typeAt(2, 2, 'A', INK);
  workspace.textCursor = { col: 3, row: 2 };
  project.typeAt(3, 2, 'B', INK);
  workspace.textCursor = { col: 4, row: 2 };
  project.commitEdit();
  project.undo();
  expect(workspace.textCursor).toEqual({ col: 2, row: 2 });
  expect(project.editCells.size).toBe(0);
  project.redo();
  expect([char(project, 2, 2), char(project, 3, 2)]).toEqual(['A', 'B']);
});

test('undoing the only paint leaves hasPaint false', async () => {
  const { project } = await drawing();
  paint(project, [[3, 3]], '#ff0000');
  expect(project.hasPaint).toBe(true);
  project.undo();
  expect([project.hasPaint, project.paintLayer.hasPaint, project.hasEdits]).toEqual([false, false, false]);
  project.redo();
  expect(project.hasPaint).toBe(true);
});

test('history past its limit drops the oldest stroke, and the drawing stays', async () => {
  const { project } = await drawing();
  project.history.limit = 3;
  for (let i = 0; i < 5; i++) paint(project, [[i, 0], [0, 20]], ['#ff0000', '#00ff00', '#0000ff', '#ffffff', '#00ffff'][i]);
  expect(strokes(project).size).toBe(3);
  while (project.canUndo) project.undo();
  expect(painted(project, 1, 0)).toMatchObject({ g: 255 });
  expect(painted(project, 0, 0)).toMatchObject({ r: 255 });
  expect(painted(project, 2, 0)).toBe(null);
  expect(painted(project, 0, 20)).toMatchObject({ g: 255 }); // the newest of the dropped, under the rest
  project.redo();
  expect(painted(project, 0, 20)).toMatchObject({ b: 255 });
});

test('a new edit drops what could be redone, and the ledger lets go of it', async () => {
  const { project } = await drawing();
  paint(project, [[3, 3]], '#ff0000');
  paint(project, [[4, 4]], '#ff0000');
  project.undo();
  paint(project, [[5, 5]], '#ff0000');
  expect(strokes(project).size).toBe(2);
  expect(project.canRedo).toBe(false);
  expect(painted(project, 4, 4)).toBe(null);
});

test('dropOldUndo keeps strokes after the last merge and drops the merge and what came before', async () => {
  const { project } = await drawing();
  paint(project, [[3, 3]], '#ff0000');
  project.mergeDown('edit', project.gridRect()); // the whole grid: the layer stays, to draw on
  paint(project, [[4, 4]], '#ff0000');
  project.clearEditLayer();
  paint(project, [[5, 5]], '#ff0000');
  paint(project, [[6, 6]], '#ff0000');
  project.dropOldUndo();
  expect(project.canUndo).toBe(true);
  project.undo();
  project.undo();
  expect(project.canUndo).toBe(false);
  expect(project.hasPaint).toBe(false); // what the Clear left: nothing of the older strokes comes back
  project.redo();
  project.redo();
  expect(strokes(project).size).toBe(2);
  expect([painted(project, 5, 5), painted(project, 6, 6)]).toEqual([RED, RED]);
  await settle(project);
});

test('dropOldUndo with a merge that could still be redone drops it, and everything that needs it', async () => {
  const { project } = await drawing();
  paint(project, [[3, 3]], '#ff0000');
  project.mergeDown('edit', project.gridRect()); // the whole grid: the layer stays, to draw on
  paint(project, [[4, 4]], '#ff0000');
  project.undo();
  project.undo();
  project.dropOldUndo();
  expect([project.canUndo, project.canRedo]).toEqual([false, false]);
  expect(painted(project, 3, 3)).toEqual(RED);
  await settle(project);
});

test('dropOldUndo with no whole-layer step keeps everything', async () => {
  const { project } = await drawing();
  paint(project, [[3, 3]], '#ff0000');
  project.dropOldUndo();
  project.undo();
  expect(project.hasPaint).toBe(false);
});

test('undo of a soft-brush stroke across the layer holds no more than its tiles would have', async () => {
  // The old patches held a before and an after of each tile it touched, clipped to the layer. A ledger
  // tile is always full size, so this measures against full-size tiles, on a layer of the usual size.
  const { project } = await drawing(160);
  const k = project.paintLayer.scale, tiles = new Set(), pixels = [];
  for (let i = 0; i < 160; i++) {
    for (let w = -3; w <= 3; w++) {
      const x = i, y = Math.max(0, Math.min(159, i + w));
      pixels.push({ x, y, alpha: 1 - Math.abs(w) / 4 });
      for (let py = y * k; py < (y + 1) * k; py++) for (let px = x * k; px < (x + 1) * k; px++) tiles.add(`${Math.floor(px / TILE)},${Math.floor(py / TILE)}`);
    }
  }
  project.paintStroke(pixels, '#ff0000');
  project.commitEdit();
  expect(project.history.bytes).toBeGreaterThan(0);
  expect(project.history.bytes).toBeLessThanOrEqual(tiles.size * 2 * TILE * TILE * 4);
  await settle(project);
});

test('a stroke at the layer\'s edge undoes exactly, and still does after the layer grows', async () => {
  const { project } = await drawing(40);
  const { width, height } = project.paintLayer.canvas;
  const k = project.paintLayer.scale;
  expect(width % TILE).not.toBe(0); // the corner tile is clipped
  const last = [(width / k) - 1, (height / k) - 1];
  paint(project, [last], '#ff0000');
  paint(project, [last], '#0000ff');
  project.cols += 8;
  project.rows += 8;
  await settle(project);
  expect(project.canUndo).toBe(true);
  project.undo();
  expect(painted(project, ...last)).toEqual(RED);
  project.undo();
  expect(painted(project, ...last)).toBe(null);
  expect(project.hasPaint).toBe(false);
  project.redo();
  expect(painted(project, ...last)).toEqual(RED);
  await settle(project);
});

test('a stroke that changed only base pixels or pins has nothing for the ledger, and an entry still undoes it', async () => {
  const { project } = await drawing();
  const n = project._ledger.n;
  project.beginEdit();
  project.eraseBase([{ col: 6, row: 6 }]);
  project.commitEdit();
  expect(project._ledger.n).toBe(n);
  expect(strokes(project).size).toBe(0);
  project.undo();
  expect(project.baseRecords.pins.has('6,6')).toBe(false);
  project.redo();
  expect(project.baseRecords.pins.get('6,6')).toBe(' ');
  await settle(project);
});

test('a stroke that changed no pixel is still a step, and undoing it does nothing', async () => {
  const { project } = await drawing();
  paint(project, [[3, 3]], '#ff0000');
  const version = project.history.version;
  paint(project, [[3, 3]], '#ff0000');
  expect(project.history.version).toBe(version + 1);
  await settle(project);
  const shown = cellsKey(project).join();
  project.undo();
  expect(painted(project, 3, 3)).toEqual(RED);
  await settle(project);
  expect(cellsKey(project).join()).toBe(shown);
});

test('cancelEdit leaves no trace in the ledger', async () => {
  const { project } = await drawing();
  paint(project, [[3, 3]], '#ff0000');
  const n = project._ledger.n;
  project.paintStroke([{ x: 3, y: 3, alpha: 1 }, { x: 9, y: 9, alpha: 1 }], '#0000ff');
  project.editCell(5, 5, { char: 'Z' });
  project.cancelEdit();
  expect(project._ledger.n).toBe(n);
  expect(strokes(project).size).toBe(1);
  expect(project._ledger.kept().stacks.cells.size).toBe(0);
  expect(painted(project, 3, 3)).toEqual(RED);
  project.undo();
  expect(painted(project, 3, 3)).toBe(null);
  await settle(project);
});

test('selection and slider steps stay as they are, among strokes', async () => {
  const { project, workspace } = await drawing();
  paint(project, [[3, 3]], '#ff0000');
  project.changeSelection((w) => { w.selection = { c0: 1, r0: 1, c1: 2, r1: 2 }; });
  project.setSlider('brightness', 150);
  project.commitSliders('brightness');
  paint(project, [[4, 4]], '#ff0000');
  expect(strokes(project).size).toBe(2);
  project.undo();
  expect(painted(project, 4, 4)).toBe(null);
  project.undo();
  expect(project.brightness).toBe(100);
  project.undo();
  expect(workspace.selection).toBe(null);
  project.undo();
  expect(project.hasPaint).toBe(false);
  await settle(project);
});

test('a grid rescale, clearHistory and opening a document start the ledger over', async () => {
  const { project } = await drawing();
  type(project, 3, 3, 'A');
  project.clearHistory();
  expect(strokes(project).size).toBe(0);

  type(project, 3, 3, 'B');
  project.undo();
  expect(char(project, 3, 3)).toBe('A'); // what was there when the ledger started over is what it started with

  project.undo(); // nothing left
  const blank = await createTestApp();
  await loadImage(blank.project, '/tests/fixtures/images/gradient.png', { cols: 20, rows: 20 });
  blank.project.ensureLayer();
  blank.project.setSlider('brightness', 150);
  blank.project.commitSliders('brightness');
  blank.project.paintStroke([{ x: 2, y: 2, alpha: 1 }], '#ff0000');
  blank.project.commitEdit();
  blank.project.undo(); // nothing shows, and the ledger still holds it, for a redo
  expect(blank.project._ledger.kept().stacks.strokes.size).toBe(1);
  blank.project.cols = 24; // nothing on the edit layer: a rescale
  await settle(blank.project);
  expect(blank.project._ledger.kept().stacks.strokes.size).toBe(0);
  expect(blank.project.canUndo).toBe(true); // the slider's step
  expect(blank.project.canRedo).toBe(false);

  type(blank.project, 1, 1, 'A');
  await loadImage(blank.project, '/tests/fixtures/images/gradient.png', { cols: 20, rows: 20 });
  expect(blank.project._ledger.kept().stacks.strokes.size).toBe(0);
});

test('alone, numbering costs nothing: the tail stays empty and the check isn\'t worked out', async () => {
  const { project } = await drawing();
  paint(project, [[3, 3]], '#ff0000');
  type(project, 3, 3, 'A');
  project.undo();
  project.redo();
  expect(project._ledger.tail.items).toEqual([]);
  expect(project._ledger.sum).toBe(0);
});

test('stroke ids are short text and never repeat', async () => {
  const { project } = await drawing();
  paint(project, [[3, 3]], '#ff0000');
  paint(project, [[4, 4]], '#ff0000');
  const ids = [...strokes(project).keys()];
  expect(new Set(ids).size).toBe(2);
  for (const id of ids) expect(id.length).toBeLessThanOrEqual(40);
});

test('a stroke on Layer 2 undone while Layer 1 is picked takes only Layer 2\'s cells back', async () => {
  const { project, workspace } = await drawing();
  type(project, 1, 1, 'E');
  paint(project, [[3, 3]], '#0000ff');
  const id = project.addLayer('cells', 'edit');
  workspace.pickLayer(id);
  paint(project, [[5, 5]], '#ff0000');
  type(project, 2, 2, 'L');
  workspace.pickLayer('edit');
  const edit = project.cellsOf('edit'), editPaint = sameLayer(project.paintOf('edit'));
  project.undo();
  project.undo();
  expect(project.cellsOf(id).size).toBe(0);
  expect(project.paintOf(id).pixelAt(5, 5)).toBe(null);
  expect(project._layerData.get(id).hasPaint).toBe(false);
  expect(project.cellsOf('edit')).toBe(edit);
  expect(sameLayer(project.paintOf('edit'))).toBe(editPaint);
  expect(project.editId).toBe('edit');
  project.redo();
  project.redo();
  expect(project.cellsOf(id).get('2,2').char).toBe('L');
  expect(project.paintOf(id).pixelAt(5, 5)).toEqual(RED);
  expect(project.cellsOf('edit')).toBe(edit);
  expect(project.editId).toBe('edit');
});

// One edit's cells and paint on the edit layer and another, through onLayer.
function acrossLayers(project, id) {
  project.beginEdit();
  project.onLayer('edit', () => project.writeEditCells([{ col: 1, row: 1, attrs: { char: 'A', ...INK } }]));
  project.onLayer(id, () => {
    project.writeEditCells([{ col: 2, row: 2, attrs: { char: 'B', ...INK } }]);
    project.paintEditPixels([{ x: 6, y: 6, r: 255, g: 0, b: 0, alpha: 1 }]);
  });
}

test('onLayer writes two layers in one undo step', async () => {
  const { project } = await drawing();
  const id = project.addLayer('cells', 'edit');
  project.clearHistory();
  acrossLayers(project, id);
  expect(project.editId).toBe('edit');
  project.commitEdit();
  expect(project.cellsOf('edit').get('1,1').char).toBe('A');
  expect(project.cellsOf(id).get('2,2').char).toBe('B');
  expect(project.paintOf(id).pixelAt(6, 6)).toEqual(RED);
  expect(project.paintOf('edit').pixelAt(6, 6)).toBe(null);
  project.undo();
  expect(project.canUndo).toBe(false);
  expect([project.cellsOf('edit').size, project.cellsOf(id).size, project.paintOf(id).pixelAt(6, 6)]).toEqual([0, 0, null]);
  project.redo();
  expect(project.cellsOf('edit').get('1,1').char).toBe('A');
  expect(project.cellsOf(id).get('2,2').char).toBe('B');
  expect(project.paintOf(id).pixelAt(6, 6)).toEqual(RED);
});

test('cancelEdit puts back every layer it touched', async () => {
  const { project } = await drawing();
  const id = project.addLayer('cells', 'edit');
  type(project, 4, 4, 'K');
  acrossLayers(project, id);
  project.cancelEdit();
  expect(project._stroke).toBe(null);
  expect([...project.cellsOf('edit').keys()]).toEqual(['4,4']);
  expect(project.cellsOf(id).size).toBe(0);
  expect(project.paintOf(id).pixelAt(6, 6)).toBe(null);
  expect(project.editId).toBe('edit');
});

test('a canceled edit across layers records nothing, and what could be redone still can', async () => {
  const { project } = await drawing();
  const id = project.addLayer('cells', 'edit');
  project.clearHistory();
  type(project, 4, 4, 'K');
  type(project, 5, 5, 'R');
  project.undo();
  acrossLayers(project, id);
  project.cancelEdit();
  expect([...project.cellsOf('edit').keys()]).toEqual(['4,4']);
  expect(project.cellsOf(id).size).toBe(0);
  expect(project.paintOf(id).pixelAt(6, 6)).toBe(null);
  expect(strokes(project).size).toBe(2); // K, and R undone: nothing of the canceled edit
  expect(project.canRedo).toBe(true);
  project.redo();
  expect(char(project, 5, 5)).toBe('R');
  expect(project.canRedo).toBe(false);
  project.undo();
  project.undo();
  expect(project.cellsOf('edit').size).toBe(0);
  expect(project.canUndo).toBe(false);
});

test('applyChange writes cells and runs, and only what it names changes', async () => {
  const { project } = await drawing();
  type(project, 7, 7, 'K');
  await settle(project);
  const shown = project.cells;
  project.applyChange({ cells: [['2,1', { char: 'Q', fg: '#112233', bg: '#445566' }], ['7,7', null]], runs: [] });
  expect(project.editCells.has('7,7')).toBe(false);
  expect(project.cells[1 * 40 + 2]).toMatchObject({ char: 'Q' });
  expect(project.cells[7 * 40 + 7].char).not.toBe('K');
  expect(project.cells[30]).toBe(shown[30]); // another row: the same object, not rebuilt

  const k = project.paintLayer.scale;
  project.applyChange({ cells: [], runs: [[3 * k, 3 * k, k, 0xff0000ff], [3 * k, 3 * k + 1, k, 0xff0000ff]] });
  expect(project.hasPaint).toBe(true);
  const ctx = project.paintLayer.canvas.getContext('2d');
  expect(Array.from(ctx.getImageData(3 * k, 3 * k, 1, 1).data)).toEqual([255, 0, 0, 255]);
  project.applyChange({ cells: [], runs: [[3 * k, 3 * k, k, 0], [3 * k, 3 * k + 1, k, 0]] });
  expect(project.hasPaint).toBe(k > 2);
  await settle(project);
});

test('a paint layer reads a whole tile, transparent past its edge, and writes runs across tiles', async () => {
  const { project } = await drawing();
  const layer = project.paintLayer, ctx = layer.canvas.getContext('2d');
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(layer.canvas.width - 1, 0, 1, 1);
  const x = Math.floor((layer.canvas.width - 1) / TILE) * TILE;
  const data = layer.readTile(x, 0);
  expect(data.length).toBe(TILE * TILE * 4);
  expect(Array.from(data.slice((layer.canvas.width - 1 - x) * 4, (layer.canvas.width - x) * 4))).toEqual([255, 0, 0, 255]);
  expect(data[(layer.canvas.width - x) * 4 + 3] ?? 0).toBe(0);

  const version = layer.version;
  const { tiles } = layer.writeRuns([[TILE - 1, 2, 3, 0x00ff00ff], [layer.canvas.width - 1, 1, 5, 0x0000ff80]]);
  expect(layer.version).toBe(version + 1);
  expect(tiles.map(({ x: tx, y }) => `${tx},${y}`)).toEqual([...new Set(['0,0', `${TILE},0`, `${x},0`])]);
  expect(Array.from(ctx.getImageData(TILE - 1, 2, 3, 1).data)).toEqual([0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255]);
  expect(ctx.getImageData(layer.canvas.width - 1, 1, 1, 1).data[3]).toBe(128);
  expect(layer.hasPaint).toBe(true);
});
