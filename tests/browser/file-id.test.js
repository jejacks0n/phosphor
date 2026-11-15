// A drawing's file id (project.fileId): made with the drawing, carried by its .phosphor files and kept by opening them
// (autosave's restore: autosave.test.js), and never sent to a room.
import { test, expect, vi, afterEach } from 'vitest';
import { createTestApp, loadImage, settle } from '../support/app.js';
import { goodFileId, readProject, writeProject } from '@/document/projectIO.js';

afterEach(() => vi.restoreAllMocks());

// The .phosphor file saveProject downloads.
async function saved(project) {
  const spy = vi.spyOn(URL, 'createObjectURL');
  await project.saveProject();
  return spy.mock.calls.at(-1)[0];
}

test('a new drawing gets a file id; closing it clears it', async () => {
  const { project } = await createTestApp();
  await project.setBlankCanvas();
  const first = project.fileId;
  expect(goodFileId(first)).toBe(true);
  await project.setBlankCanvas();
  expect(goodFileId(project.fileId)).toBe(true);
  expect(project.fileId).not.toBe(first);
  project.clearImage();
  expect(project.fileId).toBe(null);
});

test('saving writes the id, and opening that file keeps it without showing unsaved', async () => {
  const { project } = await createTestApp();
  await project.setBlankCanvas();
  const id = project.fileId;
  const blob = await saved(project);
  await project.setBlankCanvas();
  await project.loadProject(new File([blob], 'x.phosphor'));
  expect(project.fileId).toBe(id);
  expect(project.isDirty).toBe(false);
});

test('Save project downloads the file gzipped, and it opens again as it was', async () => {
  const { project } = await createTestApp();
  await project.setBlankCanvas({ cols: 40, rows: 40 });
  for (let col = 0; col < 40; col++) project.typeAt(col, 3, '▒', { fg: '#aa0000', bg: '#aaaaaa' });
  project.commitEdit();
  const blob = await saved(project);
  expect([...new Uint8Array(await blob.slice(0, 2).arrayBuffer())]).toEqual([0x1f, 0x8b]);
  const plain = await writeProject({ imageBuffer: project.imageBuffer, ...await project.projectParts() });
  expect(blob.size).toBeLessThan(plain.size);
  await project.setBlankCanvas();
  await project.loadProject(new File([blob], 'x.phosphor'));
  expect([project.cols, project.editCellAt(39, 3)?.char, project.isDirty]).toEqual([40, '▒', false]);
});

test('a file from before file ids gets one, which the next save writes', async () => {
  const { project } = await createTestApp();
  await project.loadProject(new File([await (await fetch('/tests/fixtures/projects/charmode.phosphor')).arrayBuffer()], 'charmode.phosphor'));
  const id = project.fileId;
  expect(goodFileId(id)).toBe(true);
  expect(project.isDirty).toBe(false);
  expect((await readProject(await saved(project))).settings.fileId).toBe(id);
});

test('a room\'s layers being renamed keep it', async () => {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 20, rows: 20 });
  project.ensureLayer();
  project.addLayer('cells', 'edit');
  workspace.pickLayer('L1');
  project.deleteLayer('edit');
  const id = project.fileId;
  expect(goodFileId(id)).toBe(true);
  await project.roomLayers();
  expect(project.layers.map((l) => l.id)).toEqual(['base', 'edit']); // reopened under the room's names
  expect(project.fileId).toBe(id);
});

test('an artist\'s copy of the host\'s drawing has none', async () => {
  const { project } = await createTestApp();
  await project.setBlankCanvas();
  const parts = await readProject(await writeProject({ imageBuffer: project.imageBuffer, ...await project.projectParts() }));
  await project.openFromHost({ ...parts, imageBuffer: project.imageBuffer }, {});
  await settle(project);
  expect(project.fileId).toBe(null);
});

test('a room message never carries it', async () => {
  const { project } = await createTestApp();
  await project.setBlankCanvas();
  expect(project.fileId).toBeTruthy();
  expect((await project.projectParts()).settings.fileId).toBe(undefined);
});
