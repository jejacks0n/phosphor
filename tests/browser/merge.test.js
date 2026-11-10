// Merge down: exactly (crisp, untouched by effects), or into the picture (part of the image, so the
// effects reach it), for the whole edit layer or a selection (docs/layers.md, Moving things between
// layers).
import { describe, test, expect, vi } from 'vitest';
import { createTestApp, loadImage, settle, cellsKey, halves } from '../support/app.js';
import { drawnDocument } from '../support/scenes.js';
import { rectShape } from '@/document/shapes.js';
import { toastMessage } from '@/composables/useToast.js';
import { createApp } from 'vue';
import EditToolbar from '@/components/EditToolbar.vue';
import { i18n } from '@/i18n';

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
    expect(project.mergeDown('edit')).toBe(true);
    await settle(project);
    expect(cellsKey(project)).toEqual(before);
    expect(project.layers.map((l) => l.id)).toEqual(['base']); // the merged layer leaves the stack
    expect(project.hasPaint).toBe(false);
    project.undo();
    await settle(project);
    expect(project.cellsOf('edit').size).toBe(4);
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
    project.mergeDown('edit', rect);
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
    expect(project.layers.map((l) => l.id)).toEqual(['base']); // the merged layer left the stack: draw on a new one
    const next = project.addLayer('cells', 'base');
    workspace.pickLayer(next);
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
    expect(project.cellsOf(next).get('30,20')).toBeTruthy();
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

// Merge down between two layers above the bottom (docs/layers.md, Moving things between layers). The bottom, Layer 1 with
// A and B typed and red paint under them, and Layer 2 over it: C typed over B with no background of its own, D over the
// red paint, and see-through green paint across A and C.
async function twoLayers() {
  const app = await createTestApp(), { project, workspace } = app;
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 30, rows: 30 });
  project.typeAt(4, 4, 'A', { fg: '#ffee00', bg: '#0044aa' });
  project.typeAt(5, 4, 'B', { fg: '#ffee00', bg: '#0044aa' });
  project.commitEdit();
  project.paintStroke(Array.from({ length: 8 }, (_, k) => ({ x: 2 + k, y: 9, alpha: 1 })), '#ff3300');
  project.commitEdit();
  const top = project.addLayer('cells', 'edit');
  workspace.pickLayer(top);
  project.typeAt(5, 4, 'C', { fg: '#00ffff' });
  project.typeAt(3, 4, 'D', { fg: '#00ffff', bg: '#440044' });
  project.commitEdit();
  project.paintStroke(Array.from({ length: 6 }, (_, k) => ({ x: 4 + k, y: 8, alpha: 0.5 })), '#33ff66');
  project.commitEdit();
  await settle(project);
  return { ...app, top };
}
const ids = (project) => project.layers.map((l) => l.id);

describe('down between layers', () => {
  test('Merge down of cells into cells keeps what shows and removes the layer', async () => {
    const { project, workspace, top } = await twoLayers();
    const before = cellsKey(project);
    expect(project.mergeDown(top)).toBe(true);
    await settle(project);
    expect(cellsKey(project)).toEqual(before);
    expect(ids(project)).toEqual(['base', 'edit']);
    expect(workspace.pickedLayer).toBe('edit'); // the pick moves to the layer it went into
    expect(project.cellsOf('edit').get('5,4')).toMatchObject({ char: 'C', fg: '#00ffff', bg: '#0044aa' });
    project.render();
    await settle(project);
    expect(cellsKey(project)).toEqual(before);
    project.undo();
    await settle(project);
    expect(ids(project)).toEqual(['base', 'edit', top]);
    expect(project.cellsOf('edit').get('5,4').char).toBe('B');
    expect(project.cellsOf(top).get('5,4').char).toBe('C');
    expect(cellsKey(project)).toEqual(before);
    project.redo();
    await settle(project);
    expect(ids(project)).toEqual(['base', 'edit']);
    expect(cellsKey(project)).toEqual(before);
  });

  test('Merge down is off onto a vector layer', async () => {
    const { project } = await createTestApp();
    await project.setBlankCanvas({ cols: 20, rows: 20 });
    await settle(project);
    project.addLayer('vector', 'base');
    project.typeAt(2, 2, 'A', { fg: '#ffffff' });
    project.commitEdit();
    const version = project.history.version;
    toastMessage.value = null;
    expect(project.mergeDown('edit')).toBe(false);
    expect(toastMessage.value).toBe("Cells can't go into a vector layer. Use Make art layer instead.");
    expect(ids(project)).toEqual(['base', 'vector', 'edit']);
    expect(project.history.version).toBe(version);
    const host = document.createElement('div'), toolbar = createApp(EditToolbar).use(i18n);
    document.body.append(host);
    toolbar.mount(host);
    try {
      const button = host.querySelector('button[aria-label="Merge down"]');
      expect(button.disabled).toBe(true);
      expect(button.title).toBe("Cells can't go into a vector layer. Use Make art layer instead.");
    } finally {
      toolbar.unmount();
      host.remove();
    }
  });

  test('Merge down of a vector layer into a cells layer freezes what shows', async () => {
    const { project, workspace } = await createTestApp();
    await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 30, rows: 30 });
    project.charChoice = 'best'; // its characters follow the colors: a palette change picks others
    project.typeAt(4, 4, 'A', { fg: '#ffee00', bg: '#0044aa' });
    project.commitEdit();
    const vector = project.addLayer('vector', 'edit');
    workspace.pickLayer(vector);
    project.addShape(rectShape(2, 5, 13, 16, { fill: '#ff0000' }));
    project.commitEdit();
    project.addShape(rectShape(6, 3, 20, 12, { fill: '#33ff66', stroke: '#0000ff', width: 1.5 }));
    project.commitEdit();
    project.render();
    await settle(project);
    expect(ids(project)).toEqual(['base', 'edit', vector]);
    const before = cellsKey(project);
    expect(project.mergeDown(vector)).toBe(true);
    await settle(project);
    expect(ids(project)).toEqual(['base', 'edit']);
    expect(project.shapes.size).toBe(0);
    expect(cellsKey(project)).toEqual(before);
    const reached = [...project.cellsOf('edit').keys()].map((key) => key.split(',').map(Number)).map(([c, r]) => r * project.cols + c);
    expect(reached.length).toBeGreaterThan(20);
    const chars = reached.map((i) => project.cells[i].char);
    project.quantize = 'cga';
    project.render();
    await settle(project);
    expect(reached.map((i) => project.cells[i].char)).toEqual(chars);
    project.quantize = 'none';
    project.undo();
    await settle(project);
    expect(ids(project)).toEqual(['base', 'edit', vector]);
    expect(project.shapes.size).toBe(2);
    expect(cellsKey(project)).toEqual(before);
  });

  test('in a room, Merge down into the bottom keeps the layer, emptied', async () => {
    const { project, workspace, top } = await twoLayers();
    project.shareWholeDocument = vi.fn(); // the host's step goes to the room as the whole document
    project._sharing = { role: 'host', heardCells: new Map(), heardRuns: [] };
    try {
      toastMessage.value = null;
      expect(project.mergeDown(top)).toBe(false); // only into the bottom: the room keeps its layers
      expect(toastMessage.value).toBe("Adding, deleting and moving layers isn't available in a room yet.");
      const before = cellsKey(project);
      workspace.pickLayer('edit');
      expect(project.mergeDown('edit')).toBe(true);
      await settle(project);
      expect(ids(project)).toEqual(['base', 'edit', top]);
      expect(project.cellsOf('edit').size).toBe(0);
      expect(project.paintOf('edit').hasPaint).toBe(false);
      expect(cellsKey(project)).toEqual(before);
      expect(project.shareWholeDocument).toHaveBeenCalled();
    } finally {
      project._sharing = null;
    }
  });

  test('Merge down refuses a hidden layer or a hidden one under it', async () => {
    const { project, top } = await twoLayers();
    const version = project.history.version;
    for (const id of [top, 'edit']) {
      project.setLayerHidden(id, true);
      toastMessage.value = null;
      expect(project.mergeDown(top)).toBe(false);
      expect(toastMessage.value).toBe('Show the layer to merge it');
      expect(ids(project)).toEqual(['base', 'edit', top]);
      project.setLayerHidden(id, false);
    }
    expect(project.history.version).toBe(version);
  });

  test('Merge down is off with the base picked: nothing is under it', async () => {
    const { project } = await twoLayers();
    expect(project.mergeDown('base')).toBe(false);
    expect(ids(project).length).toBe(3);
  });
});

test('Into the image from a row that isn\'t the layer in use merges that row\'s layer, as the dialog names it', async () => {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 20, rows: 20 });
  project.paintStroke([{ x: 3, y: 6, alpha: 1 }, { x: 6, y: 6, alpha: 1 }], '#ff3300');
  project.commitEdit();
  const top = project.addLayer('cells', 'edit');
  workspace.pickLayer(top);
  project.typeAt(9, 9, 'Q', { fg: '#00ffff' });
  project.commitEdit();
  await settle(project);
  const { asking } = await import('@/composables/useMergeDown.js');
  const host = document.createElement('div'), toolbar = createApp(EditToolbar).use(i18n);
  document.body.append(host);
  toolbar.mount(host);
  try {
    asking.value = { id: 'edit', rect: null }; // as LAYERS' ⋯ Merge down on Layer 1 asks
    await settle(project);
    const blend = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Blend into source image'));
    expect(document.body.textContent).toContain('Choose how to merge Layer 1 into Base:');
    blend.click();
    await vi.waitFor(() => expect(project.layerById('edit')).toBe(undefined), { timeout: 10_000 }); // the picture's encoded first
    expect(project.layers.map((l) => l.id)).toEqual(['base', top]);
    expect(project.cellsOf(top).get('9,9')?.char).toBe('Q');
  } finally {
    toolbar.unmount();
    host.remove();
  }
});
