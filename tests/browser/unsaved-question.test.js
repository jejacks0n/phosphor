// Leaving unsaved changes asks Phosphor's own question, not the browser's. A file whose question already offers to
// open it in this drawing's place (an art file, a picture) warns on those choices instead of asking again; New project
// and a project file ask Save project first / … without saving / Cancel (UnsavedDialog).
import { test, expect, afterEach, vi } from 'vitest';
import { createApp, h } from 'vue';
import { createTestApp } from '../support/app.js';
import EditWorkspace from '@/components/EditWorkspace.vue';
import UnsavedDialog from '@/components/UnsavedDialog.vue';
import { i18n } from '@/i18n';
import { useWorkspaceStore } from '@/store/WorkspaceStore';

let mounted = null, host = null;
afterEach(() => {
  mounted?.unmount();
  host?.remove();
  mounted = host = null;
  vi.restoreAllMocks();
});

const settle = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));

// A blank canvas open in the workspace, with a change not saved unless `clean`.
async function drawing({ clean = false } = {}) {
  const { project } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 10 });
  if (!clean) {
    project.typeAt(1, 1, 'A', { fg: '#ffee00', bg: '#0044aa' });
    project.commitEdit();
  }
  host = document.body.appendChild(document.createElement('div'));
  mounted = createApp({ render: () => [h(EditWorkspace), h(UnsavedDialog)] }).use(i18n);
  mounted.mount(host);
  await settle();
  return { project, workspace: useWorkspaceStore() };
}

const drop = async (file) => {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  event.dataTransfer = new DataTransfer();
  event.dataTransfer.items.add(file);
  host.querySelector('article.drop-zone').dispatchEvent(event);
  // The file is read before its question shows, so wait for the question: a fixed settle can end first on a slow runner.
  await vi.waitFor(() => expect(document.querySelector('button.choice')).not.toBe(null));
};
// The questions are modals, on the body.
const dialog = () => document.querySelector('dialog[open]');
const choices = () => [...document.querySelectorAll('button.choice')].map((b) => [b.querySelector('b').textContent.trim(), b.querySelector('.warn')?.textContent.trim() ?? null]);
const choose = async (title) => {
  [...document.querySelectorAll('button.choice')].find((b) => b.querySelector('b').textContent.trim() === title).click();
  await settle();
};
const cancel = async () => {
  document.querySelector('button.cancel').click();
  await settle();
};
const art = () => new File([Uint8Array.from([0x41, 0x42, 0x0d, 0x0a])], 'tiny.ans');
const projectFile = async () => new File([await (await fetch('/tests/fixtures/projects/charmode.phosphor')).arrayBuffer()], 'night.phosphor');
const confirmSpy = () => vi.spyOn(window, 'confirm').mockImplementation(() => { throw new Error('the browser was asked'); });

const WARNING = "Replaces this drawing's unsaved changes. It stays in this browser, under Pick up where you left off.";

test('an art file over unsaved changes warns on the choices that replace the drawing, and opens with no second question', async () => {
  confirmSpy();
  const { project, workspace } = await drawing();
  const before = project.documentId;
  await drop(art());
  expect(choices()).toEqual([['Add to this drawing', null], ['Open to edit', WARNING], ['Open to draw on top', WARNING]]);
  await choose('Open to edit');
  expect(workspace.unsavedAsk).toBe(null);
  await vi.waitFor(() => expect(project.filename).toBe('tiny')); // the file opens in a moment
  expect(project.documentId).not.toBe(before);
});

test('with nothing unsaved, the art file\'s choices carry no warning', async () => {
  await drawing({ clean: true });
  await drop(art());
  expect(choices().map(([, warn]) => warn)).toEqual([null, null, null]);
});

test('a project over unsaved changes asks: Cancel stays, Open without saving opens it', async () => {
  confirmSpy();
  const { project } = await drawing();
  const image = project.image;
  await drop(await projectFile());
  expect(dialog().textContent).toContain('Open night.phosphor?');
  expect(dialog().textContent).toContain("This drawing has changes you haven't saved.");
  expect(choices().map(([title]) => title)).toEqual(['Save project first', 'Open without saving']);
  expect(document.activeElement.textContent).toContain('Save project first'); // the first, focused
  await cancel();
  expect(project.image).toBe(image);
  expect(dialog()).toBe(null);

  await drop(await projectFile());
  await choose('Open without saving');
  await vi.waitFor(() => expect(project.filename).toBe('night'));
});

test('Save project first opens the save dialog; canceled it stays, saved it goes on', async () => {
  const { project, workspace } = await drawing();
  const image = project.image;
  await drop(await projectFile());
  await choose('Save project first');
  expect(workspace.saveDialog).toBe('phosphor');
  expect(dialog()).toBe(null); // the save dialog in its place, not over it
  workspace.saveDialog = null; // canceled
  await settle();
  expect(project.image).toBe(image);
  expect(workspace.unsavedAsk).toBe(null);

  await drop(await projectFile());
  await choose('Save project first');
  await project.saveProject();
  workspace.saveDialog = null; // saved
  await vi.waitFor(() => expect(project.filename).toBe('night'));
});

test('New project asks Start a new project?, and Start without saving goes to the start screen', async () => {
  confirmSpy();
  const { project, workspace } = await drawing();
  workspace.newProject();
  await settle();
  expect(dialog().textContent).toContain('Start a new project?');
  expect(choices().map(([title]) => title)).toEqual(['Save project first', 'Start without saving']);
  expect(dialog().textContent).toContain('This drawing stays in this browser, under Pick up where you left off.');
  await choose('Start without saving');
  expect(project.image).toBe(null);
});
