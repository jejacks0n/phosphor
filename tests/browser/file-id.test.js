// A drawing's file id (project.fileId): made with the drawing, carried by its .phosphor files and kept by opening them
// (autosave's restore: autosave.test.js), and never sent to a room.
import { test, expect, vi, afterEach } from 'vitest';
import { createTestApp, settle } from '../support/app.js';
import { goodFileId, readProject, writeProject, projectChunkOf } from '@/document/projectIO.js';

afterEach(() => vi.restoreAllMocks());

// The .phosphor file saveProject downloads.
async function saved(project) {
  const spy = vi.spyOn(URL, 'createObjectURL');
  await project.saveProject();
  return spy.mock.calls.at(-1)[0];
}

test('a new drawing gets a file id; closing it clears it', async () => {
  const { project } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true });
  const first = project.fileId;
  expect(goodFileId(first)).toBe(true);
  await project.setBlankCanvas({ withLayer: true });
  expect(goodFileId(project.fileId)).toBe(true);
  expect(project.fileId).not.toBe(first);
  project.clearImage();
  expect(project.fileId).toBe(null);
});

test('saving writes the id, and opening that file keeps it without showing unsaved', async () => {
  const { project } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true });
  const id = project.fileId;
  const blob = await saved(project);
  await project.setBlankCanvas({ withLayer: true });
  await project.loadProject(new File([blob], 'x.phosphor'));
  expect(project.fileId).toBe(id);
  expect(project.isDirty).toBe(false);
});

test('Save project downloads a PNG holding the gzipped project, and it opens again as it was', async () => {
  const { project } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 40, rows: 40 });
  for (let col = 0; col < 40; col++) project.typeAt(col, 3, '▒', { fg: '#aa0000', bg: '#aaaaaa' });
  project.commitEdit();
  const blob = await saved(project);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  expect([...bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  expect([...projectChunkOf(bytes).slice(0, 2)]).toEqual([0x1f, 0x8b]);
  const plain = await writeProject({ imageBuffer: project.imageBuffer, ...await project.projectParts() });
  expect(projectChunkOf(bytes).length).toBeLessThan(plain.size);
  await project.setBlankCanvas({ withLayer: true });
  await project.loadProject(new File([blob], 'x.pho'));
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

test('an artist\'s copy of the host\'s drawing has none', async () => {
  const { project } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true });
  const parts = await readProject(await writeProject({ imageBuffer: project.imageBuffer, ...await project.projectParts() }));
  await project.openFromHost({ ...parts, imageBuffer: project.imageBuffer }, {});
  await settle(project);
  expect(project.fileId).toBe(null);
});

test('a room message never carries it', async () => {
  const { project } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true });
  expect(project.fileId).toBeTruthy();
  expect((await project.projectParts()).settings.fileId).toBe(undefined);
});
