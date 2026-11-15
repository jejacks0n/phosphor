// The desktop build's menu bar from the page's side (useDesktopMenu), with a fake desktop bridge for the main process:
// its words and state sent as they change, its commands, files it's asked to open, Save and Save As through the
// system's box, and Check for Updates.
import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import { effectScope, nextTick } from 'vue';
import { setLocale } from '@/i18n';
import { useFakeDesktop, resetDesktop } from '@/social/desktop';
import { MENU_LABELS, checkForUpdates, useDesktopMenu } from '@/composables/useDesktopMenu';
import { toastMessage } from '@/composables/useToast';
import { useRoomStore } from '@/store/RoomStore';
import { createTestApp, loadImage } from '../support/app.js';

let project, workspace, desktop, scope, command, opened;
beforeEach(async () => {
  ({ project, workspace } = await createTestApp());
  desktop = {
    setMenu: vi.fn(async () => {}),
    onMenu: vi.fn((cb) => { command = cb; }),
    onOpenedFile: vi.fn((cb) => { opened = cb; }),
    saveProject: vi.fn(async ({ name }) => `/art/${name}`),
    releases: vi.fn(async () => ({ version: '1.0.0', releases: [] })),
  };
  useFakeDesktop(desktop);
  toastMessage.value = null;
  scope = effectScope();
  scope.run(() => useDesktopMenu());
});
afterEach(async () => {
  scope.stop();
  resetDesktop();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await setLocale('en', { persist: false });
});
const lastMenu = () => desktop.setMenu.mock.lastCall;

test('the menu gets every label in the language showing, and what can be done, again as either changes', async () => {
  const [labels, state] = lastMenu();
  expect(Object.keys(labels)).toEqual(MENU_LABELS);
  expect(Object.values(labels).every((label) => typeof label === 'string' && label && !label.startsWith('menu.'))).toBe(true);
  expect([labels.file, labels.saveAs, labels.checkUpdates]).toEqual(['File', 'Save As…', 'Check for Updates…']);
  expect(state).toEqual({ hasImage: false, canChange: true, inRoom: false, hosting: false });

  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 8, rows: 8 });
  await nextTick();
  expect(lastMenu()[1].hasImage).toBe(true);
  useRoomStore().role = 'host';
  await nextTick();
  expect(lastMenu()[1]).toMatchObject({ inRoom: true, hosting: true });

  await setLocale('fr', { persist: false });
  await nextTick();
  expect(lastMenu()[0].file).toBe('Fichier');
});

test('the menu says the drawing’s name, for the window’s title, and its project’s file, for which window has it open', async () => {
  expect(lastMenu()[2]).toEqual({ title: 'Phosphor', file: null });
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 8, rows: 8 });
  await nextTick();
  expect(lastMenu()[2]).toEqual({ title: 'gradient', file: null });
  project.rename('night');
  await workspace.saveFile();
  await nextTick();
  expect(lastMenu()[2]).toEqual({ title: 'night', file: '/art/night.phosphor' });
  project.clearImage();
  await nextTick();
  expect(lastMenu()[2]).toEqual({ title: 'Phosphor', file: null });   // New: no file open
});

test('commands open what they name, and Undo from the menu is the drawing’s outside a text field', async () => {
  command('about');
  command('shortcuts');
  command('export');   // nothing to export yet
  expect([workspace.showAboutModal, workspace.shortcutsOpen, workspace.exportModal]).toEqual([true, true, false]);
  const requests = workspace.openRequest;
  command('open');
  expect(workspace.openRequest).toBe(requests + 1);

  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 8, rows: 8 });
  command('export');
  command('versions');
  expect([workspace.exportModal, workspace.versionsOpen]).toEqual([true, true]);
  const undo = vi.spyOn(project, 'undo'), redo = vi.spyOn(project, 'redo');
  command('undo');
  command('redo');
  expect([undo.mock.calls.length, redo.mock.calls.length]).toEqual([1, 1]);

  const field = document.body.appendChild(document.createElement('input'));
  field.focus();
  const typed = vi.spyOn(document, 'execCommand');
  command('undo');
  expect(typed).toHaveBeenCalledWith('undo');
  expect(undo).toHaveBeenCalledTimes(1);
  field.remove();
});

test('New asks first when there are unsaved changes (UnsavedDialog), and goes on once told to', async () => {
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 8, rows: 8 });
  project.cols = 9;
  command('new');
  expect(project.image).not.toBe(null);
  expect(workspace.unsavedAsk?.name).toBe(null);
  workspace.unsavedAsk.go(); // Start without saving
  expect(project.image).toBe(null);
});

test('Save asks where the first time, then writes over the same file; Save As always asks; a canceled box saves nothing', async () => {
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 8, rows: 8 });
  project.rename('night');
  command('save');
  await vi.waitFor(() => expect(project.filePath).toBe('/art/night.phosphor'));
  const [first] = desktop.saveProject.mock.lastCall;
  expect(first).toMatchObject({ name: 'night.phosphor', path: null, as: false });
  expect(first.bytes).toBeInstanceOf(Uint8Array);
  expect([project.isDirty, project.savedToFile]).toEqual([false, true]);

  project.cols = 9;
  await workspace.saveFile();
  expect(desktop.saveProject.mock.lastCall[0]).toMatchObject({ path: '/art/night.phosphor', as: false });
  expect(project.isDirty).toBe(false);

  desktop.saveProject.mockImplementationOnce(async () => '/elsewhere/day.phosphor');
  command('saveAs');
  await vi.waitFor(() => expect(project.filePath).toBe('/elsewhere/day.phosphor'));
  expect(desktop.saveProject.mock.lastCall[0]).toMatchObject({ path: '/art/night.phosphor', as: true });
  expect(project.filename).toBe('day');

  project.cols = 10;
  desktop.saveProject.mockImplementationOnce(async () => null);
  await workspace.saveFile({ as: true });
  expect([project.filePath, project.isDirty]).toEqual(['/elsewhere/day.phosphor', true]);
});

test('a second Save while the box is open opens no second box', async () => {
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 8, rows: 8 });
  let answer;
  desktop.saveProject.mockImplementationOnce(() => new Promise((resolve) => { answer = resolve; }));
  const first = workspace.saveFile();
  await vi.waitFor(() => expect(answer).toBeTypeOf('function'));
  await workspace.saveFile({ as: true });
  expect(desktop.saveProject).toHaveBeenCalledTimes(1);
  answer('/art/once.phosphor');
  await first;
  expect(project.filePath).toBe('/art/once.phosphor');
  await workspace.saveFile();
  expect(desktop.saveProject).toHaveBeenCalledTimes(2);
});

test('changes made while the save box is open are still unsaved after it', async () => {
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 8, rows: 8 });
  desktop.saveProject.mockImplementationOnce(async ({ name }) => {
    project.cols = 12;   // a room's change, heard meanwhile
    return `/art/${name}`;
  });
  await workspace.saveFile();
  expect(project.filePath).toMatch(/\.phosphor$/);
  expect(project.isDirty).toBe(true);
});

test('a save that fails says so and keeps the work unsaved', async () => {
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 8, rows: 8 });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  desktop.saveProject.mockImplementationOnce(async () => { throw new Error('disk full'); });
  await workspace.saveFile();
  expect(toastMessage.value).toBe('Could not save the file.');
  expect([project.filePath, project.savedToFile]).toEqual([null, false]);
});

test('a project opened from its file saves back there; any other document has no file to save over', async () => {
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 8, rows: 8 });
  await workspace.saveFile();
  const { bytes } = desktop.saveProject.mock.lastCall[0];

  await project.loadProject(Object.assign(new File([bytes], 'kept.phosphor'), { desktopPath: '/art/kept.phosphor' }));
  expect([project.filePath, project.filename]).toEqual(['/art/kept.phosphor', 'kept']);
  await loadImage(project, '/tests/fixtures/images/gradient.png');
  expect(project.filePath).toBe(null);
  await project.loadProject(new File([bytes], 'dropped.phosphor'));   // dropped: no path known
  expect(project.filePath).toBe(null);
});

test('files the app is asked to open go to the workspace as chosen files, typed and with their path; a missing one is named', () => {
  opened({ path: '/art/sky.png', name: 'sky.png', bytes: new Uint8Array([1, 2]) });
  const file = workspace.fileRequest;
  expect(file).toBeInstanceOf(File);
  expect([file.name, file.type, file.size, file.desktopPath]).toEqual(['sky.png', 'image/png', 2, '/art/sky.png']);

  workspace.fileRequest = null;
  opened({ name: 'gone.ans', missing: true });
  expect(workspace.fileRequest).toBe(null);
  expect(toastMessage.value).toBe("gone.ans isn't there anymore.");
});

test('Check for Updates offers a newer release’s page, says when this is the newest, and when GitHub can’t be reached', async () => {
  const open = vi.spyOn(window, 'open').mockImplementation(() => null);
  const confirm = vi.fn(() => true);
  vi.stubGlobal('confirm', confirm);
  desktop.releases.mockResolvedValueOnce({ version: '1.0.0', releases: [{ tag: 'v1.1.0', prerelease: false, url: 'https://github.com/jejacks0n/phosphor/releases/tag/v1.1.0' }] });
  await checkForUpdates();
  expect(confirm).toHaveBeenCalledWith('Phosphor 1.1.0 is out (you have 1.0.0). Open its download page?');
  expect(open).toHaveBeenCalledWith('https://github.com/jejacks0n/phosphor/releases/tag/v1.1.0', '_blank');

  await checkForUpdates();
  expect(toastMessage.value).toBe('Phosphor 1.0.0 is the newest version.');

  vi.spyOn(console, 'warn').mockImplementation(() => {});
  desktop.releases.mockRejectedValueOnce(new Error('offline'));
  command('checkUpdates');
  await vi.waitFor(() => expect(toastMessage.value).toBe("Couldn't check for updates. Check your connection and try again."));
});
