// Saving over a project's file where the browser has File System Access (Chromium): the pickers are stand-ins giving
// real handles in the origin's private file system, so what's written can be read back.
import { test, expect, vi, afterEach } from 'vitest';
import { createApp, markRaw } from 'vue';
import { createTestApp } from '../support/app.js';
import { readProject, writeProject, pickFile } from '@/document/projectIO';
import { toastMessage } from '@/composables/useToast';
import DropZone from '@/components/DropZone.vue';

afterEach(() => {
  window.showSaveFilePicker = window.showOpenFilePicker = undefined; // as tests/support/noFilePickers.js leaves them
  toastMessage.value = null;
  vi.restoreAllMocks();
});

const privateFile = async (name) => (await navigator.storage.getDirectory()).getFileHandle(name, { create: true });
const written = async (handle) => (await handle.getFile()).size;

// The save picker, giving the file named: what it's asked is in its calls.
const savePicker = (name) => {
  window.showSaveFilePicker = vi.fn(async () => privateFile(name));
  return window.showSaveFilePicker;
};

async function drawing() {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 6, rows: 4 });
  project.typeAt(1, 0, 'A', { fg: '#ffee00', bg: '#0044aa' });
  project.commitEdit();
  return { project, workspace };
}

test('Save asks where once, writes the project there, and after that writes over it without asking; Save As asks again', async () => {
  const { project, workspace } = await drawing();
  const picker = savePicker('first.phosphor');
  const download = vi.spyOn(HTMLAnchorElement.prototype, 'click');

  await workspace.saveFile();
  expect(workspace.saveDialog).toBe(null);
  expect(picker).toHaveBeenCalledTimes(1);
  expect(picker.mock.calls[0][0]).toMatchObject({ suggestedName: 'untitled.phosphor', types: [{ accept: { 'application/octet-stream': ['.phosphor'] } }] });
  const first = await privateFile('first.phosphor');
  expect((await readProject(await first.getFile())).editCells.size).toBe(1);
  expect(project.filename).toBe('first');
  expect([project.savedToFile, project.isDirty]).toEqual([true, false]);

  project.typeAt(2, 0, 'B', { fg: '#ffee00', bg: '#0044aa' });
  project.commitEdit();
  expect(project.isDirty).toBe(true);
  await workspace.saveFile();
  expect(picker).toHaveBeenCalledTimes(1);
  expect((await readProject(await first.getFile())).editCells.size).toBe(2);
  expect(project.isDirty).toBe(false);

  savePicker('second.phosphor');
  await workspace.saveFile({ as: true });
  expect(window.showSaveFilePicker).toHaveBeenCalledTimes(1);
  expect(project.filename).toBe('second');
  expect(await project.fileHandle.isSameEntry(await privateFile('second.phosphor'))).toBe(true);
  expect(download).not.toHaveBeenCalled();
});

test('a canceled save picker saves nothing and says nothing', async () => {
  const { project, workspace } = await drawing();
  window.showSaveFilePicker = vi.fn(async () => { throw new DOMException('The user aborted a request.', 'AbortError'); });
  await workspace.saveFile();
  expect([project.savedToFile, project.isDirty, project.fileHandle]).toEqual([false, true, null]);
  expect(toastMessage.value).toBe(null);
});

test('a file it may not write yet is asked for first; refused, the save picker asks where', async () => {
  const { project, workspace } = await drawing();
  const file = await privateFile('asked.phosphor');
  const asked = vi.fn(async () => 'granted');
  project.fileHandle = markRaw({ name: file.name, queryPermission: async () => 'prompt', requestPermission: asked, createWritable: () => file.createWritable() });
  const picker = savePicker('elsewhere.phosphor');
  await workspace.saveFile();
  expect(asked).toHaveBeenCalledWith({ mode: 'readwrite' });
  expect(picker).not.toHaveBeenCalled();
  expect(await written(file)).toBeGreaterThan(0);

  asked.mockResolvedValue('denied');
  project.typeAt(2, 0, 'B', { fg: '#ffee00', bg: '#0044aa' });
  await workspace.saveFile();
  expect(picker).toHaveBeenCalledTimes(1);
  expect(project.filename).toBe('elsewhere');
});

test('a project opened with its handle saves back over its file', async () => {
  const { project, workspace } = await drawing();
  const file = await privateFile('opened.phosphor');
  const writable = await file.createWritable();
  await writable.write(await writeProject({ ...await project.projectParts(), imageBuffer: project.imageBuffer }));
  await writable.close();
  project.clearImage();

  await project.loadProject(Object.assign(await file.getFile(), { fileHandle: file }));
  expect(project.filename).toBe('opened');
  project.typeAt(3, 0, 'C', { fg: '#ffee00', bg: '#0044aa' });
  project.commitEdit();
  const picker = savePicker('never.phosphor');
  await workspace.saveFile();
  expect(picker).not.toHaveBeenCalled();
  expect((await readProject(await file.getFile())).editCells.size).toBe(2);
});

test('the open picker gives a project its handle, and anything else none; canceled, nothing', async () => {
  const file = await privateFile('picked.phosphor');
  const picture = await privateFile('picked.png');
  const types = [{ description: 'Files', accept: { 'image/*': [] } }];
  window.showOpenFilePicker = vi.fn(async () => [file]);
  expect((await pickFile(types)).fileHandle).toBe(file);
  expect(window.showOpenFilePicker).toHaveBeenCalledWith({ types });
  window.showOpenFilePicker = vi.fn(async () => [picture]);
  expect((await pickFile(types)).fileHandle).toBeUndefined();
  window.showOpenFilePicker = vi.fn(async () => { throw new DOMException('The user aborted a request.', 'AbortError'); });
  expect(await pickFile(types)).toBe(null);
});

test('without File System Access, Save is the save dialog', async () => {
  const { workspace } = await drawing();
  await workspace.saveFile();
  expect(workspace.saveDialog).toBe('phosphor');
});

// A drop with the file in it; items as the browser gives them.
async function drop(file, getAsFileSystemHandle) {
  const dropped = vi.fn();
  const app = createApp(DropZone, { onFileDropped: dropped });
  const host = document.createElement('div');
  document.body.append(host);
  app.mount(host);
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { files: [file], items: [{ getAsFileSystemHandle }] } });
  await new Promise((resolve) => setTimeout(resolve, 5)); // Vue drops an event in the millisecond its listener was added
  host.querySelector('.drop-zone').dispatchEvent(event);
  await vi.waitUntil(() => dropped.mock.calls.length, { interval: 5 });
  app.unmount();
  host.remove();
  return dropped.mock.calls[0][0];
}

test('a project dropped brings its handle where the browser saves in place; a picture, or with no File System Access, none', async () => {
  const handle = await privateFile('dropped.phosphor');
  const asked = vi.fn(async () => handle);
  expect((await drop(new File(['x'], 'dropped.phosphor'), asked)).fileHandle).toBeUndefined(); // no pickers
  expect(asked).not.toHaveBeenCalled();
  savePicker('unused.phosphor');
  expect((await drop(new File(['x'], 'dropped.phosphor'), asked)).fileHandle).toBe(handle);
  expect((await drop(new File(['x'], 'dropped.png'), asked)).fileHandle).toBeUndefined();
  expect(asked).toHaveBeenCalledTimes(1);
});
