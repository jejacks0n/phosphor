// .phosphor projects in and out: every fixture (real older files in examples/, the older layouts the
// loader migrates, one saved by the live site) loads to the same cells as its reference; save then
// load gives back the same document; a broken file is reported and leaves the open one alone.
import { describe, test, expect, afterEach, vi } from 'vitest';
import { createTestApp, loadImage, settle, cellsKey } from '../support/app.js';
import { matchReference } from '../support/references.js';

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
});
