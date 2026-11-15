// The desktop build's drops over a drawing: nothing opens in its place. A picture or an art file asks Add or Open in a
// new window (in someone's room too), a project goes to a new window without asking, and so does a picture where
// adding isn't offered; a new window that couldn't open says so.
import { test, expect, afterEach, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createTestApp } from '../support/app.js';
import EditWorkspace from '@/components/EditWorkspace.vue';
import { i18n } from '@/i18n';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { useDrawingStore } from '@/store/DrawingStore';
import { useFakeDesktop, resetDesktop } from '@/social/desktop';
import { toastMessage, closeToast } from '@/composables/useToast.js';

let mounted = null, host = null;
afterEach(() => {
  mounted?.unmount();
  host?.remove();
  mounted = host = null;
  closeToast();
  resetDesktop();
  vi.restoreAllMocks();
});

const settle = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));

// EditWorkspace with a blank canvas open and a fake desktop whose openInNewWindow answers `answer`.
async function overDrawing({ answer = true, before = () => {} } = {}) {
  const { project } = await createTestApp();
  const opened = [];
  useFakeDesktop({ openInNewWindow: vi.fn(async (file) => { opened.push(file); return answer; }) });
  await project.setBlankCanvas();
  await before({ project });
  host = document.body.appendChild(document.createElement('div'));
  mounted = createApp(EditWorkspace).use(i18n);
  mounted.mount(host);
  await settle();
  return { project, workspace: useWorkspaceStore(), opened };
}

const drop = async (file) => {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  event.dataTransfer = new DataTransfer();
  event.dataTransfer.items.add(file);
  host.querySelector('article.drop-zone').dispatchEvent(event);
  await settle();
};
// The question is a modal, on the body.
const choices = () => [...document.querySelectorAll('button.choice b')].map((b) => b.textContent.trim());
const choose = async (title) => {
  [...document.querySelectorAll('button.choice')].find((b) => b.querySelector('b').textContent.trim() === title).click();
  await settle();
};
const picture = async () => new File([await (await fetch('/tests/fixtures/images/gradient.png')).arrayBuffer()], 'gradient.png', { type: 'image/png' });
const art = () => new File([Uint8Array.from([0x41, 0x42, 0x0d, 0x0a])], 'tiny.ans');
const inSomeonesRoom = ({ project }) => { project._sharing = { role: 'artist' }; };

test('on the desktop, a picture dropped over a drawing offers Add or Open in a new window', async () => {
  const { project, workspace, opened } = await overDrawing();
  const [image, filename] = [project.image, project.filename];
  const file = await picture();
  await drop(file);
  expect(choices()).toEqual(['Add to this drawing', 'Open in a new window']);
  expect(document.body.textContent).toContain('Add it to this drawing, or open it in a new window.');
  expect(document.body.textContent).toContain('Opens it in a window of its own, beside this one.');

  await choose('Open in a new window');
  expect(opened).toEqual([file]);
  expect(workspace.artDrop).toBeNull();
  expect([project.image, project.filename]).toEqual([image, filename]);
});

test('an art file dropped over a drawing offers Add or Open in a new window, not the two opens in its place', async () => {
  const { opened } = await overDrawing();
  const file = art();
  await drop(file);
  expect(choices()).toEqual(['Add to this drawing', 'Open in a new window']);
  await choose('Open in a new window');
  expect(opened).toEqual([file]);
});

test('a project dropped over a drawing goes to a new window without asking', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  const { project, workspace, opened } = await overDrawing({ before: ({ project }) => { project.editVersion += 1; } });
  const image = project.image;
  const file = new File([new Uint8Array(8)], 'night.phosphor');
  await drop(file);
  expect(opened).toEqual([file]);
  expect(confirm).not.toHaveBeenCalled();
  expect(workspace.artDrop).toBeNull();
  expect(project.image).toBe(image);
});

test('drawing in someone\'s room still offers Open in a new window', async () => {
  const { opened } = await overDrawing({ before: inSomeonesRoom });
  expect(useDrawingStore().offWithOthers).toBeTruthy();
  await drop(art());
  expect(choices()).toEqual(['Add to this drawing', 'Open in a new window']);
  document.querySelector('button.cancel').click();
  await settle();

  const file = await picture();
  await drop(file);
  expect(opened).toEqual([file]);
  expect(toastMessage.value ?? '').toBe('');
});

test('openInNewWindow answering false says the file couldn\'t open', async () => {
  const { project } = await overDrawing({ answer: false });
  const image = project.image;
  await drop(new File([new Uint8Array(8)], 'night.phosphor'));
  await nextTick();
  expect(toastMessage.value).toBe('That file couldn\'t be opened.');
  expect(project.image).toBe(image);
});
