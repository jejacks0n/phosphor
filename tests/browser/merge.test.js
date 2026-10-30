// Merge down: exactly (crisp, untouched by effects), or into the picture (part of the image, so the
// effects reach it), for the whole edit layer or a selection (docs/layers.md, Moving things between
// layers).
import { describe, test, expect, vi } from 'vitest';
import { createTestApp, loadImage, settle, cellsKey, halves } from '../support/app.js';
import { drawnDocument } from '../support/scenes.js';

const maxDiff = (a, b, only) => (only ?? a.map((_, i) => i)).reduce((m, i) => Math.max(m, ...a[i].map((v, k) => Math.abs(v - b[i][k]))), 0);
const drawnCells = (project, rect) => {
  const at = new Set([...project.editCells.keys()]);
  const rows = Math.floor(project.rows / 2);
  for (let row = 0; row < rows; row++) for (let col = 0; col < project.cols; col++) if (project.cellHasPaint(col, row)) at.add(`${col},${row}`);
  return [...at].map((k) => k.split(',').map(Number))
    .filter(([c, r]) => !rect || (c >= rect.c0 && c <= rect.c1 && r >= rect.r0 && r <= rect.r1))
    .map(([c, r]) => r * project.cols + c);
};

describe('exactly', () => {
  test('the whole edit layer: nothing on the canvas changes, and undo/redo are exact', async () => {
    const { project, workspace } = await createTestApp();
    await drawnDocument(project, workspace);
    const before = cellsKey(project);
    project.mergeDown();
    await settle(project);
    expect(cellsKey(project)).toEqual(before);
    expect(project.editCells.size).toBe(0);
    expect(project.hasPaint).toBe(false);
    project.undo();
    await settle(project);
    expect(project.editCells.size).toBe(4);
    project.redo();
    await settle(project);
    expect(cellsKey(project)).toEqual(before);
  });

  test('a selection: only what is inside merges; edits and paint outside stay', async () => {
    const { project, workspace } = await createTestApp();
    await drawnDocument(project, workspace);
    const rect = { c0: 10, r0: 5, c1: 21, r1: 20 }; // the paint at y 40 (row 20) straddles c1
    const outside = [...project.editCells.keys()].filter((k) => { const [c, r] = k.split(',').map(Number); return c > rect.c1 || r > rect.r1 || c < rect.c0 || r < rect.r0; });
    const before = cellsKey(project);
    project.mergeDown(rect);
    await settle(project);
    expect(cellsKey(project)).toEqual(before);
    expect([...project.editCells.keys()].sort()).toEqual(outside.sort());
    expect(project.cellHasPaint(30, 20)).toBe(true);
    expect(project.cellHasPaint(20, 20)).toBe(false);
  });
});

describe('into the picture', () => {
  test('a picture that can\'t be encoded says so and changes nothing', async () => {
    const { project, workspace } = await createTestApp();
    await drawnDocument(project, workspace);
    const before = halves(project), image = project.image;
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const encoding = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((done) => done(null));
    try {
      await project.mergeIntoPicture();
      expect(alert).toHaveBeenCalledWith("Couldn't merge into the image.");
    } finally {
      encoding.mockRestore();
      alert.mockRestore();
      error.mockRestore();
    }
    await settle(project);
    expect(project.image).toBe(image);
    expect(halves(project)).toEqual(before);
  });

  test('at neutral: the same look; solid cells pinned ▄, letters kept', async () => {
    const { project, workspace } = await createTestApp();
    await drawnDocument(project, workspace);
    const before = halves(project);
    await project.mergeIntoPicture();
    await settle(project);
    expect(maxDiff(before, halves(project))).toBeLessThanOrEqual(1); // soft paint can round a level
    const char = (c, r) => project.cells[r * project.cols + c].char;
    expect(char(14, 8)).toBe('A');
    expect(char(20, 8)).toBe('▄');
    expect(project.imageIsWorkingCopy).toBe(true);
    expect(project.editCells.size).toBe(0);
  });

  test('with Edges on, the effects reach the merged drawing and follow the slider', async () => {
    const { project, workspace } = await createTestApp();
    await drawnDocument(project, workspace);
    project.edges = 3;
    await settle(project);
    const merged = drawnCells(project);
    const before = halves(project);
    await project.mergeIntoPicture();
    await settle(project);
    const atThree = halves(project);
    expect(maxDiff(before, atThree, merged)).toBeGreaterThan(0);
    project.edges = 6;
    await settle(project);
    expect(maxDiff(atThree, halves(project), merged)).toBeGreaterThan(0);
  });

  test('a selection merges only what is inside it', async () => {
    const { project, workspace } = await createTestApp();
    await drawnDocument(project, workspace);
    const rect = { c0: 10, r0: 5, c1: 21, r1: 12 };
    const before = halves(project);
    await project.mergeIntoPicture(rect);
    await settle(project);
    expect(maxDiff(before, halves(project))).toBeLessThanOrEqual(1);
    expect(project.editCellAt(14, 8)).toBeUndefined();
    expect(project.hasPaint).toBe(true); // the paint below the selection stays
  });

  test('drawing in the letterbox merges exactly into the base layer', async () => {
    const { project } = await createTestApp();
    await loadImage(project, '/tests/fixtures/images/tall.png', { cols: 40, rows: 40 }); // pillarboxed
    project.paintStroke([{ x: 1, y: 10, alpha: 1 }, { x: 1, y: 11, alpha: 1 }], '#00ffff');
    project.commitEdit();
    await settle(project);
    const before = halves(project);
    await project.mergeIntoPicture();
    await settle(project);
    expect(maxDiff(before, halves(project))).toBe(0);
    expect(project.baseLayer.pixelAt(1, 10)).toBeTruthy();
  });

  test('twice in a row keeps the working size; undo and redo are exact', async () => {
    const { project, workspace } = await createTestApp();
    await drawnDocument(project, workspace);
    await project.mergeIntoPicture();
    await settle(project);
    const size = `${project.image.width}x${project.image.height}`;
    project.typeAt(30, 20, '█', { fg: '#00ffff', bg: '#000000' });
    project.commitEdit();
    await settle(project);
    const beforeSecond = cellsKey(project);
    await project.mergeIntoPicture();
    await settle(project);
    const afterSecond = cellsKey(project);
    expect(`${project.image.width}x${project.image.height}`).toBe(size);
    project.undo();
    await settle(project);
    expect(project.editCellAt(30, 20)).toBeTruthy();
    expect(cellsKey(project)).toEqual(beforeSecond);
    project.redo();
    await settle(project);
    expect(cellsKey(project)).toEqual(afterSecond);
  });

  test('paint past a shrunk grid edge survives', async () => {
    const { project } = await createTestApp();
    await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 60, rows: 60 });
    project.paintStroke(Array.from({ length: 10 }, (_, k) => ({ x: 48 + k, y: 30, alpha: 1 })), '#00ff00');
    project.commitEdit();
    project.cols = 52;
    await settle(project);
    await project.mergeIntoPicture();
    await settle(project);
    project.cols = 60;
    await settle(project);
    expect(project.cellHasPaint(55, 15)).toBe(true);
  });

  test('another image loaded while merging is left alone', async () => {
    const { project, workspace } = await createTestApp();
    await drawnDocument(project, workspace);
    const merging = project.mergeIntoPicture();
    const blob = await (await fetch('/tests/fixtures/images/rgba.png')).blob();
    await project.setImageFromFile(new File([blob], 'rgba.png', { type: 'image/png' }));
    const loaded = project.image;
    await merging;
    await settle(project);
    expect(project.image).toBe(loaded);
    expect(project.canUndo).toBe(false);
  });
});
