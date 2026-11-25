// The drawing as its .pho file's bytes without saving it (ProjectStore.projectFile), for an issue report to carry: what
// Save writes, and nothing Save does besides.
import { test, expect, vi, afterEach } from 'vitest';
import { watch } from 'vue';
import { createTestApp, cellsKey, settle } from '../support/app.js';
import { busyMessage } from '@/composables/useBusy';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { startsAsProject } from '@/document/projectIO';
import { SKIPPED } from '@/dev/skipped.js';

afterEach(() => vi.restoreAllMocks());

const bytesOf = async (blob) => new Uint8Array(await blob.arrayBuffer());

async function drawn() {
  const { project } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 8 });
  project.typeAt(2, 1, 'A', { fg: '#ff5555', bg: '#000000' });
  project.typeAt(3, 1, 'B', { fg: '#55ff55', bg: '#000000' });
  project.commitPending();
  await settle(project);
  return project;
}

test('projectFile is the file Save writes: a PNG with the project inside, which opens as the drawing', async () => {
  const project = await drawn();
  const cells = cellsKey(project);
  const file = await project.projectFile();
  expect(startsAsProject(await bytesOf(file))).toBe(true);

  const downloads = vi.spyOn(URL, 'createObjectURL');
  await project.saveProject('sky');
  expect(await bytesOf(file)).toEqual(await bytesOf(downloads.mock.calls.at(-1)[0]));

  await project.loadProject(new File([file], 'sky.pho'));
  await settle(project);
  expect(cellsKey(project)).toEqual(cells);
  expect(cells.some((cell) => cell.startsWith('A'))).toBe(true);
});

test('its picture is hard-edged with Smooth text on: the drawing\'s own colors and no others', async () => {
  const project = await drawn();
  useWorkspaceStore().smoothText = true;
  const bitmap = await createImageBitmap(new Blob([await project.projectFile()], { type: 'image/png' }));
  const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height), colors = new Set();
  for (let i = 0; i < data.length; i += 4) colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
  expect([...colors].sort()).toEqual(['0,0,0', '255,85,85', '85,255,85']); // black, A's red and B's green: no shades between
});

test('making it saves nothing: no download, no Saving note, and the name, the unsaved mark and the undo history as they were', async () => {
  const project = await drawn();
  const downloads = vi.spyOn(URL, 'createObjectURL');
  const notes = [];
  const stop = watch(busyMessage, (note) => notes.push(note), { flush: 'sync' });
  const state = () => [project.filename, project.fileExt, project.savedToFile, project.unsavedChanges, project.canUndo, project.canRedo, project.editVersion, project.savedEditVersion];
  const before = state();
  expect(project.unsavedChanges).toBe(true);

  expect((await project.projectFile()).size).toBeGreaterThan(100);
  stop();
  expect(state()).toEqual(before);
  expect(downloads).not.toHaveBeenCalled();
  expect(notes).toEqual([]);
  project.undo();
  await settle(project);
  expect(cellsKey(project).some((cell) => cell.startsWith('B'))).toBe(false); // the last step is still the letter typed
});

test('with no drawing open there is no file, and making one is no step of the session\'s log', async () => {
  const { project } = await createTestApp();
  expect(await project.projectFile()).toBe(null);
  expect(SKIPPED.has('projectFile')).toBe(true);
});
