// Flatten: everything the drawing shows (the picture as converted, shapes and art layers, edit cells, paint) becomes
// plain ANSI cells exactly as they show, on the edit layer or the base, and the image is removed (docs/layers.md,
// Flattening).
import { test, expect, vi } from 'vitest';
import { createTestApp, loadImage, settle, cellsKey } from '../support/app.js';
import { rectShape } from '@/document/shapes';
import { makeArt } from '@/document/artLayers.js';
import { charRowsOf } from '@/lib/Cells';
import { slidersAtDefaults } from '@/store/settings';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { createApp, nextTick } from 'vue';
import EditToolbar from '@/components/EditToolbar.vue';
import ControlPanel from '@/components/ControlPanel.vue';
import { i18n } from '@/i18n';

const shown = (project) => cellsKey(project).map((key) => key.toLowerCase());

// The photo converted every way that makes a cell's look more than its two pixels (CGA, Best match, Dither, contrast
// moved), with a typed letter, paint (opaque and see-through), a shape and an art layer on it.
async function drawing(patch = {}) {
  const app = await createTestApp(), { project } = app;
  await loadImage(project, '/tests/fixtures/images/photo.jpg', { cols: 60, rows: 60 });
  Object.assign(project, { quantize: 'cga', charChoice: 'best', dither: 60, ...patch });
  project.setSlider('contrast', 130);
  project.typeAt(3, 3, 'A', { fg: '#ffee00' });
  project.commitEdit();
  project.paintStroke(Array.from({ length: 12 }, (_, k) => ({ x: 10 + k, y: 20, alpha: 1 })), '#ff3300');
  project.commitEdit();
  project.paintStroke(Array.from({ length: 12 }, (_, k) => ({ x: 10 + k, y: 23, alpha: 0.5 })), '#33ff66');
  project.commitEdit();
  project.addShape(rectShape(30, 30, 44, 40, '#00ff00'));
  const art = project.addShape(makeArt({ m: [1, 0, 0, 1, 40, 8], art: { cols: 2, rows: 1, cells: [[0, 'Z', null, '#ff0000'], [1, '╬', '#0000ff', '#ffffff']] } }));
  project.render();
  await settle(project);
  return { ...app, art };
}

for (const layer of ['edit', 'base']) {
  test(`nothing on the canvas changes (${layer})`, async () => {
    const { project } = await drawing();
    const before = shown(project);
    expect(await project.flattenDrawing({ layer })).toBe(true);
    await settle(project);
    expect(shown(project)).toEqual(before);
    expect(project.shapes.size).toBe(0);
    expect(project.hasPaint).toBe(false);
    expect(slidersAtDefaults(project)).toBe(true);
    expect(project.renderStyle).toBe('ansi');
    expect(Number(project.dither)).toBe(0);
    expect(project.charChoice).toBe('random');
    expect(project.history.canUndo).toBe(true);
  });
}

test('edit puts the grid on the edit layer over a black base', async () => {
  const { project } = await drawing();
  await project.flattenDrawing({ layer: 'edit' });
  await settle(project);
  expect(project.editCells.size).toBe(project.cols * charRowsOf(project.rows));
  expect(project.baseColorAt(0, 0)).toBe('#000000');
  expect(project.baseRecords.pins.size).toBe(0);
});

test('with the base picked, edit puts the grid on the topmost cells layer, picked', async () => {
  const { project, workspace } = await drawing();
  workspace.pickLayer('base');
  expect(project.editId).toBe('base');
  expect(await project.flattenDrawing({ layer: 'edit' })).toBe(true);
  await settle(project);
  expect(workspace.pickedLayer).toBe('edit');
  expect(project.cellsOf('edit').size).toBe(project.cols * charRowsOf(project.rows));
  expect(project.baseRecords.pins.size).toBe(0);
});

test('base stamps the grid onto the base, every character pinned', async () => {
  const { project } = await drawing();
  await project.flattenDrawing({ layer: 'base' });
  await settle(project);
  expect(project.editCells.size).toBe(0);
  expect(project.baseRecords.pins.size).toBe(project.cols * charRowsOf(project.rows));
});

test('nothing converts any more: a full render leaves every cell as it was', async () => {
  for (const layer of ['edit', 'base']) {
    const { project } = await drawing();
    const before = shown(project);
    await project.flattenDrawing({ layer });
    project.render();
    await settle(project);
    expect(shown(project), layer).toEqual(before);
  }
});

test('the eyedropper reads each cell\'s shown colors', async () => {
  for (const layer of ['edit', 'base']) {
    const { project } = await drawing();
    await project.flattenDrawing({ layer });
    await settle(project);
    const rows = charRowsOf(project.rows);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < project.cols; col++) {
        const cell = project.cells[row * project.cols + col], picked = project.underlyingAt(col, row, { withPaint: false });
        expect(`${picked.fg}${picked.bg}`.toLowerCase(), `${layer} ${col},${row}`).toBe(`${cell.fg.hex}${cell.bg.hex}`.toLowerCase());
      }
    }
  }
});

test('a Number palette is kept as its colors', async () => {
  const { project } = await drawing({ quantize: 'count', colorCount: 8 });
  const before = shown(project);
  await project.flattenDrawing({ layer: 'edit' });
  project.render();
  await settle(project);
  expect(project.quantize).toBe('palette');
  expect(project.palette.split(' ')).toHaveLength(8);
  expect(shown(project)).toEqual(before);
});

test('ASCII styles become ANSI as they showed', async () => {
  for (const renderStyle of ['colorAscii', 'ascii']) {
    const { project } = await drawing({ renderStyle });
    const before = shown(project);
    await project.flattenDrawing({ layer: 'edit' });
    project.render();
    await settle(project);
    expect(project.renderStyle).toBe('ansi');
    expect(project.quantize).toBe(renderStyle === 'colorAscii' ? 'none' : 'cga'); // Color ASCII's in-between colors aren't CGA's
    expect(shown(project), renderStyle).toEqual(before);
  }
});

test('a wide character keeps its layout', async () => {
  const { project } = await createTestApp();
  await project.setBlankCanvas({ cols: 12, rows: 8 });
  project.typeAt(2, 2, '漢', { fg: '#ffee00', bg: '#0044aa' });
  project.commitEdit();
  project.render();
  await settle(project);
  const before = project.cells.map((c) => `${c.char}${c.wide ?? ''}${c.fg.hex}${c.bg.hex}`);
  await project.flattenDrawing({ layer: 'edit' });
  project.render();
  await settle(project);
  expect(project.cells.map((c) => `${c.char}${c.wide ?? ''}${c.fg.hex}${c.bg.hex}`)).toEqual(before);
});

test('undo brings it all back, redo flattens again', async () => {
  const { project } = await drawing();
  const image = project.image, before = shown(project), shapes = project.shapes.size;
  await project.flattenDrawing({ layer: 'edit' });
  await settle(project);
  const flattened = shown(project);
  project.undo();
  await settle(project);
  expect(project.image).toBe(image);
  expect(Number(project.contrast)).toBe(130);
  expect(project.charChoice).toBe('best');
  expect(Number(project.dither)).toBe(60);
  expect(project.shapes.size).toBe(shapes);
  expect(project.hasPaint).toBe(true);
  expect(shown(project)).toEqual(before);
  project.redo();
  await settle(project);
  expect(project.image).not.toBe(image);
  expect(shown(project)).toEqual(flattened);
});

test('off in an animation', async () => {
  const { project } = await drawing();
  project.addFrame('blank');
  const image = project.image;
  expect(project.canFlatten).toBe(false);
  expect(await project.flattenDrawing()).toBe(false);
  expect(project.image).toBe(image);
});

test('steps out of an art layer first', async () => {
  const { project, art } = await drawing();
  const before = shown(project);
  project.enterArt(art);
  await settle(project);
  await project.flattenDrawing({ layer: 'edit' });
  await settle(project);
  expect(project.artInside).toBe(null);
  expect(shown(project)).toEqual(before);
});

test('the toolbar asks Edit it or Draw on top of it', async () => {
  const { project } = await drawing();
  const host = document.createElement('div'), toolbar = createApp(EditToolbar).use(i18n);
  document.body.append(host);
  toolbar.mount(host);
  try {
    const button = [...host.querySelectorAll('button')].find((b) => b.title.startsWith('Flatten:'));
    expect(button?.disabled).toBe(false);
    button.click();
    await settle(project);
    const choice = [...document.querySelectorAll('button.choice')].find((b) => b.textContent.includes('Draw on top of it'));
    expect(choice).toBeTruthy();
    choice.click();
    for (let i = 0; i < 100 && project.image && project.shapes.size; i++) await settle(project); // the black picture encodes first
    expect(project.baseRecords.pins.size).toBeGreaterThan(0);
    expect(project.editCells.size).toBe(0);
  } finally {
    toolbar.unmount();
    host.remove();
  }
});

test('a palette without every color the cells show goes full color, so nothing snaps', async () => {
  for (const patch of [{ quantize: 'palette', palette: '#AA5601 #224488 #000000' }, { quantize: 'count', colorCount: 6 }]) {
    const { project } = await drawing({ renderStyle: 'ascii', ...patch }); // white on black, whatever the palette
    const before = shown(project);
    await project.flattenDrawing({ layer: 'edit' });
    project.render();
    await settle(project);
    expect(project.quantize, patch.quantize).toBe('none');
    expect(shown(project), patch.quantize).toEqual(before);
  }
});

test('drawn on top of, the PIXEL tab shows each cell as it looks, as an opened ANSI file does', async () => {
  const { project } = await drawing();
  useWorkspaceStore().ansiOverlayAll = false;
  await project.flattenDrawing({ layer: 'base' });
  expect(useWorkspaceStore().ansiOverlayAll).toBe(true);
});

test('edit cells past a shrunk grid\'s edge keep their look', async () => {
  const { project } = await drawing();
  project.setSlider('contrast', 200);
  project.typeAt(55, 5, 'q', { fg: '#336699', bg: '#664422' });
  project.commitEdit();
  project.render();
  await settle(project);
  const look = shown(project)[5 * 60 + 55];
  project.cols = 50;
  await settle(project);
  await project.flattenDrawing({ layer: 'edit' });
  await settle(project);
  project.cols = 60;
  await settle(project);
  expect(shown(project)[5 * 60 + 55]).toBe(look);
});

test('a failure partway leaves the drawing as it was', async () => {
  const { project } = await drawing();
  const before = shown(project), image = project.image;
  const real = project.baseLayer.snapshot.bind(project.baseLayer);
  let calls = 0;
  vi.spyOn(project.baseLayer, 'snapshot').mockImplementation(() => {
    if (++calls === 2) throw new Error('out of memory'); // the flattened base's
    return real();
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(window, 'alert').mockImplementation(() => {});
  try {
    expect(await project.flattenDrawing({ layer: 'base' })).toBe(false);
  } finally {
    vi.restoreAllMocks();
  }
  project.render();
  await settle(project);
  expect(project.image).toBe(image);
  expect(shown(project)).toEqual(before);
});

// drawing()'s, with Layer 2 above the edit layer (a letter and paint) and a vector layer on top with a shape.
async function stacked() {
  const app = await drawing(), { project, workspace } = app;
  const top = project.addLayer('cells', 'edit');
  workspace.pickLayer(top);
  project.typeAt(6, 6, 'W', { fg: '#00ffff', bg: '#440044' });
  project.commitEdit();
  project.paintStroke(Array.from({ length: 10 }, (_, k) => ({ x: 4 + k, y: 30, alpha: 0.6 })), '#ff00ff');
  project.commitEdit();
  const vector = project.addLayer('vector', top);
  workspace.pickLayer(vector);
  project.addShape(rectShape(14, 14, 26, 24, '#0000ff'));
  project.commitEdit();
  project.render();
  await settle(project);
  return { ...app, top, vector };
}

test('Flatten across the stack keeps what shows', async () => {
  for (const layer of ['edit', 'base']) {
    const { project } = await stacked();
    expect(project.layers).toHaveLength(5);
    const before = shown(project);
    expect(await project.flattenDrawing({ layer })).toBe(true);
    await settle(project);
    expect(project.layers.map((l) => l.id)).toEqual(layer === 'edit' ? ['base', 'edit'] : ['base']);
    expect(project.layers.every((l) => !l.hidden)).toBe(true);
    expect(project.shapes.size).toBe(0);
    expect(shown(project)).toEqual(before);
    project.render();
    await settle(project);
    expect(shown(project)).toEqual(before);
    project.undo();
    await settle(project);
    expect(project.layers).toHaveLength(5);
  }
});

test('Flatten drops hidden layers and says so first', async () => {
  const { project, top } = await stacked();
  project.setLayerHidden(top, true);
  await settle(project);
  const before = shown(project);
  const host = document.createElement('div'), toolbar = createApp(EditToolbar).use(i18n);
  document.body.append(host);
  toolbar.mount(host);
  try {
    [...host.querySelectorAll('button')].find((b) => b.title.startsWith('Flatten:')).click();
    await settle(project);
    expect(document.querySelector('.modal-dialog').textContent).toContain('The hidden layer is removed too.');
    [...document.querySelectorAll('button.choice')].find((b) => b.textContent.includes('Edit it')).click();
    for (let i = 0; i < 100 && project.layers.length > 2; i++) await settle(project); // the black picture encodes first
    expect(project.layers.map((l) => l.id)).toEqual(['base', 'edit']);
    expect(shown(project)).toEqual(before);
    project.undo();
    await settle(project);
    expect(project.layerById(top)?.hidden).toBe(true);
    expect(project.cellsOf(top).get('6,6').char).toBe('W');
  } finally {
    toolbar.unmount();
    host.remove();
  }
});

test('image filters panel hides after flatten and shows a note', async () => {
  const { project, workspace } = await drawing();
  workspace.pickedLayer = 'base';
  const host = document.createElement('div'), panel = createApp(ControlPanel).use(i18n);
  document.body.append(host);
  panel.mount(host);
  try {
    await nextTick();
    expect(host.querySelector('fieldset.effects')).not.toBeNull();
    expect(host.querySelector('.note')).toBeNull();
    await project.flattenDrawing({ layer: 'edit' });
    await settle(project);
    workspace.pickedLayer = 'base';  // flatten resets to edit; manually switch to base to see the picture section
    await nextTick();
    expect(host.querySelector('fieldset.effects')).toBeNull();
    expect(host.querySelector('.effects-note')?.textContent).toContain('Image filters need an image');
  } finally {
    panel.unmount();
    host.remove();
  }
});
