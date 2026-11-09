// .phosphor projects in and out: every fixture (real older files in examples/, the older layouts the
// loader migrates, one saved by the live site) loads to the same cells as its reference; save then
// load gives back the same document; a broken file is reported and leaves the open one alone.
import { describe, test, expect, afterEach, vi } from 'vitest';
import { createTestApp, loadImage, settle, cellsKey } from '../support/app.js';
import { matchReference } from '../support/references.js';
import { readProject, writeProject } from '@/document/projectIO.js';

const fileFrom = async (url) => new File([await (await fetch(url)).blob()], url.slice(url.lastIndexOf('/') + 1));

const FIXTURES = [
  '/examples/aeonflux.phosphor', '/examples/aeonflux1.phosphor', '/examples/aeonflux3.phosphor', '/examples/colortest.phosphor',
  '/tests/fixtures/projects/pre-cell-layer.phosphor', '/tests/fixtures/projects/no-haspaint.phosphor',
  '/tests/fixtures/projects/erased-cells.phosphor', '/tests/fixtures/projects/charmode.phosphor',
  '/tests/fixtures/projects/live-main.phosphor',
];

describe('every project fixture loads', () => {
  for (const url of FIXTURES) {
    test(url.slice(url.lastIndexOf('/') + 1), async () => {
      const { project } = await createTestApp();
      await project.loadProject(await fileFrom(url));
      await settle(project);
      expect(project.cells.length).toBeGreaterThan(0);
      await matchReference(`projects/${url.slice(url.lastIndexOf('/') + 1)}.cells.txt`, cellsKey(project).join('\n'));
    });
  }
});

// Saving goes through a download (no file picker): catch the link's blob.
async function save(project) {
  const saved = new Promise((resolve) => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { resolve(this.href); });
  });
  await project.saveProject();
  const blob = await (await fetch(await saved)).blob();
  vi.restoreAllMocks();
  return new File([blob], 'saved.phosphor');
}

const snapshot = (project) => ({
  cells: cellsKey(project),
  editCells: JSON.stringify([...project.editCells]),
  pins: JSON.stringify([...project.baseRecords.pins]),
  hasPaint: project.hasPaint,
  fit: JSON.stringify(project.fit),
  workingCopy: project.imageIsWorkingCopy,
  cols: project.cols,
  rows: project.rows,
  paint: project.paintLayer?.canvas.toDataURL(),
  base: project.baseLayer?.canvas.toDataURL(),
});

describe('save, then load', () => {
  afterEach(() => vi.restoreAllMocks());

  test('gives back the same document', async () => {
    const { project, workspace } = await createTestApp();
    await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 40, rows: 40 });
    workspace.editFgColor = '#ffee00';
    for (const [col, char] of [[2, '漢'], [5, '👍🏽'], [8, 'é'], [10, '█'], [11, 'A']]) project.typeAt(col, 3, char, { fg: '#ffee00', bg: '#0044aa' });
    project.commitEdit();
    project.paintStroke(Array.from({ length: 10 }, (_, k) => ({ x: 4 + k, y: 20, alpha: 1 })));
    project.commitEdit();
    project.beginEdit();
    project.eraseBase([{ col: 15, row: 12 }]);
    project.commitEdit();
    project.cols = 36; // a canvas resize (there are edits): the fit is frozen
    await settle(project);
    const before = snapshot(project);
    await project.loadProject(await save(project));
    await settle(project);
    expect(snapshot(project)).toEqual(before);
  });

  test('with shapes: a saved and opened project shows the same cells, its shapes still shapes', async () => {
    const { rectShape, ellipseShape } = await import('@/document/shapes.js');
    const { project } = await createTestApp();
    await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 30, rows: 30 });
    project.addShape(rectShape(2, 2, 14, 10, { fill: '#ff0000', stroke: '#ffffff', width: 1.5 }));
    project.addShape(ellipseShape(8, 6, 26, 24, { fill: '#0044aa' }));
    await settle(project);
    const before = { ...snapshot(project), shapes: JSON.stringify([...project.shapes]) };
    await project.loadProject(await save(project));
    await settle(project);
    expect({ ...snapshot(project), shapes: JSON.stringify([...project.shapes]) }).toEqual(before);
  });

  test('a moved block of the base comes back the same (the base is saved at its scale)', async () => {
    const { project } = await createTestApp();
    await loadImage(project, '/tests/fixtures/images/photo.jpg', { cols: 30, rows: 30 }); // 3 pixels per grid pixel
    Object.assign(project, { quantize: 'cga', brightness: 150 });
    await settle(project);
    project.floatSelection({ c0: 2, r0: 2, c1: 11, r1: 11 }, { base: true, edit: false }, 15, 0);
    project.render(); await settle(project);
    expect(project.baseLayer.scale).toBe(3);
    const before = snapshot(project);
    await project.loadProject(await save(project));
    await settle(project);
    expect(snapshot(project)).toEqual(before);
  });

  test('after a Bake: the baked image comes back', async () => {
    const { project } = await createTestApp();
    await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 40, rows: 40 });
    project.brightness = 130;
    await settle(project);
    await project.bake();
    await settle(project);
    const before = snapshot(project);
    await project.loadProject(await save(project));
    await settle(project);
    expect(snapshot(project)).toEqual(before);
    expect(project.imageIsWorkingCopy).toBe(true);
  });
});

// The layers a drawing had before the stack keep the old form, magic word and all, so older copies still open it.
describe('the old form', () => {
  afterEach(() => vi.restoreAllMocks());
  const magicOf = async (blob) => new TextDecoder().decode((await blob.arrayBuffer()).slice(0, 8));
  const resaved = async (project) => writeProject({ imageBuffer: project.imageBuffer, ...await project.projectParts() });

  test('an old project saves in the old form and reads back the same', async () => {
    const all = [...FIXTURES, '/tests/fixtures/projects/animated.phosphor', '/tests/fixtures/projects/one-sided-curve.phosphor'];
    for (const url of all) {
      const { project } = await createTestApp();
      const file = await fileFrom(url);
      await project.loadProject(file);
      await settle(project);
      const blob = await resaved(project);
      expect(await magicOf(blob), url).toBe('PHOSPHOR');
      const [own, back] = [await readProject(file), await readProject(blob)];
      // The file's settings come back as it had them; a setting it's older than is written now, as its default.
      expect(Object.fromEntries(Object.keys(own.settings).map((key) => [key, back.settings[key]])), url).toEqual(own.settings);
      // Paint over cells moved from before the cell layer gave them colors when it opened (keepMigratedLook).
      if (!own.migrated || !own.paintBuffer) expect([...back.editCells], url).toEqual([...own.editCells]);
      expect(back.layers, url).toEqual(own.layers);
      expect(back.stack, url).toBe(undefined);
      expect(!!back.paintBuffer, url).toBe(!!own.paintBuffer); // the paint, made again: its bytes are the browser's
      expect(back.shapes, url).toEqual(own.shapes);
    }
  });

  test('a renamed, hidden edit layer from phase 1 opens hidden with its name', async () => {
    const { rectShape } = await import('@/document/shapes.js');
    const { withPins } = await import('@/document/baseRecords.js');
    const { project } = await createTestApp();
    const own = await readProject(await fileFrom('/tests/fixtures/projects/no-haspaint.phosphor')); // cells and paint
    const parts = {
      ...own, settings: { ...own.settings, hasPaint: true }, paintBlob: new Blob([own.paintBuffer]),
      shapes: new Map([['v:a', rectShape(2, 2, 10, 8, { fill: '#00ff00' })]]), baseRecords: withPins(own.baseRecords, [{ col: 6, row: 1, char: 'Q' }]),
    };
    const phase1 = (layers) => writeProject({ ...parts, layers }).then((blob) => new File([blob], 'phase1.phosphor'));
    await project.loadProject(await phase1(null));
    project.setLayerHidden('edit', true);
    project.render();
    await settle(project);
    const shown = { cells: cellsKey(project), rows: project.rows };

    await project.loadProject(await phase1({ edit: { name: 'Logo', hidden: true } }));
    await settle(project);
    expect(project.layers.map((l) => l.id)).toEqual(['base', 'vector', 'edit']);
    expect(project.layerById('edit')).toMatchObject({ name: 'Logo', hidden: true });
    expect(project.editCells.size).toBeGreaterThan(0);
    expect({ cells: cellsKey(project), rows: project.rows }).toEqual(shown);
    // Saved again: the same form, and the same layers key.
    const back = await readProject(await resaved(project));
    expect(back.layers).toEqual({ edit: { name: 'Logo', hidden: true } });
    expect(await magicOf(await resaved(project))).toBe('PHOSPHOR');
  });

  test('a stack whose only cells layer is L3 saves in the old form and reopens with the same cells', async () => {
    const { project } = await createTestApp();
    await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 20, rows: 20 });
    project.layers = [project.layers[0], Object.freeze({ id: 'L3', kind: 'cells', n: 3, name: 'Ink', hidden: false })]; // as Layer 1 and 2 deleted
    project._layerData.set('L3', { editCells: new Map(), paintLayer: null, hasPaint: false });
    project.useLayer('L3');
    project.typeAt(2, 2, 'Z', { fg: '#ffffff', bg: '#000000' });
    project.commitEdit();
    project.paintEditPixels([{ x: 5, y: 6, r: 255, g: 0, b: 0, alpha: 1 }]);
    project.commitEdit();
    project.render();
    await settle(project);
    const before = { cells: cellsKey(project), editCells: JSON.stringify([...project.editCells]), paint: project.paintLayer.colorAt(5, 6) };
    const file = await save(project);
    expect(await magicOf(file)).toBe('PHOSPHOR');
    expect((await readProject(file)).layers).toEqual({ edit: { name: 'Ink', n: 3 } });

    await project.loadProject(file);
    await settle(project);
    expect(project.layers.map((l) => [l.id, l.name, l.n])).toEqual([['base', null, 1], ['edit', 'Ink', 3]]);
    expect({ cells: cellsKey(project), editCells: JSON.stringify([...project.editCells]), paint: project.paintLayer.colorAt(5, 6) }).toEqual(before);
  });

  test('a stack that does not fit saves every layer under its own name and eye, and opens the same', async () => {
    const { project } = await createTestApp();
    await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 20, rows: 20 });
    project.typeAt(1, 1, 'E', { fg: '#ffffff', bg: '#000000' });
    project.commitEdit();
    const l1 = project.addLayer('cells', 'edit');
    project.addLayer('vector', 'base');
    project.renameLayer(l1, 'Logo');
    project.useLayer(l1); // the layer in use isn't the edit layer: its cells are its own, not the edit layer's
    project.typeAt(3, 3, 'L', { fg: '#ff0000', bg: '#000000' });
    project.commitEdit();
    project.paintEditPixels([{ x: 7, y: 8, r: 0, g: 0, b: 255, alpha: 1 }]);
    project.commitEdit();
    project.setLayerHidden('edit', true);
    const layers = project.layers;
    const file = await save(project);
    expect(await magicOf(file)).toBe('PHOSPHR2');

    await project.loadProject(file);
    await settle(project);
    expect(project.layers).toEqual(layers);
    expect([...project.cellsOf('edit')]).toEqual([['1,1', expect.objectContaining({ char: 'E' })]]);
    expect([...project.cellsOf(l1)]).toEqual([['3,3', expect.objectContaining({ char: 'L' })]]);
    expect(project.paintOf(l1).colorAt(7, 8)).toEqual({ r: 0, g: 0, b: 255 });
    expect(project.paintOf('edit')?.colorAt(7, 8) ?? null).toBe(null);
  });
});

describe('a broken file', () => {
  const broken = {
    'not a project': new TextEncoder().encode('NOTAPROJECTFILE'),
    'cut off after the header': new TextEncoder().encode('PHOSPHOR'),
  };
  for (const [name, bytes] of Object.entries(broken)) {
    test(`${name}: is reported and leaves the open document alone`, async () => {
      const { project } = await createTestApp();
      await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 40, rows: 40 });
      project.typeAt(3, 3, 'Z', { fg: '#ffffff', bg: '#000000' });
      project.commitEdit();
      await settle(project);
      const before = snapshot(project);
      const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});
      await project.loadProject(new File([bytes], 'broken.phosphor'));
      await settle(project);
      expect(alert).toHaveBeenCalled();
      expect(snapshot(project)).toEqual(before);
    });
  }

  test('one that fails partway through opening is reported and leaves no half a document', async () => {
    const { project } = await createTestApp();
    await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 40, rows: 40 });
    const file = new File([await save(project)], 'mine.phosphor');
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(project, 'render').mockImplementationOnce(() => { throw new Error('partway'); });
    await project.loadProject(file);
    expect(alert).toHaveBeenCalled();
    expect(project.image).toBe(null);
    expect(project.documentId).toBe(null);
    expect(project.savedToFile).toBe(false);
  });
});
