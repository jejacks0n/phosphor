// Alt+T (panels.social): the side panel on its SOCIAL tab, and in a room the cursor in the chat box (a guest's "Sign in
// to chat" focused, as a guest has no box); from the box, Alt+T or Escape puts focus back where it came from (the art when
// that's gone), and on a narrow screen shuts the panel over the art in the same press. Not while typing in Edit Mode.
// The events are built from the table's keys for the platform the tests run on (a Mac here, Linux on CI).
import { test, expect, afterEach, beforeAll, afterAll, onTestFinished, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, h, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import { createTestApp, settle } from '../support/app.js';
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts';
import { chooseCommand, commandById } from '@/lib/commands';
import { keysFor, parseKey } from '@/lib/keymap';
import { isMac } from '@/lib/keyLabels';
import { useRoomStore } from '@/store/RoomStore';
import { useSocialStore } from '@/store/SocialStore';
import AnsiEditor from '@/components/AnsiEditor.vue';
import SidePanel from '@/components/SidePanel.vue';

let app = null, host = null;
beforeAll(() => page.viewport(1200, 800)); // a wide screen, where the side panel sits beside the art
afterAll(() => page.viewport(414, 896));
afterEach(() => {
  app?.unmount();
  host?.remove();
  app = host = null;
});

const claims = (fields) => ({ sub: 'u_1', name: 'wren', guest: false, verified: true, key: 'k', exp: 0, ...fields });

// A blank drawing in ANSI and the side panel beside it, with the app's keys; in a room watched as `me` unless out of one.
async function mount({ me = claims({}), inRoom = true } = {}) {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 8, rows: 8 });
  await settle(project);
  workspace.pickLayer('edit');
  workspace.editorTab = 'output';
  useSocialStore().claims = me;
  const room = useRoomStore();
  if (inRoom) Object.assign(room, { role: 'watch', id: 'abcdefghij', status: 'live', room: { name: 'neon harbor', welcome: '' }, chat: [] });
  host = document.createElement('div');
  host.style.cssText = 'display:flex;height:600px';
  document.body.append(host);
  app = createApp({ setup() { useKeyboardShortcuts(project, workspace); return () => [h(AnsiEditor, { view: 'output' }), h(SidePanel)]; } })
    .use(getActivePinia()).use(i18n);
  app.mount(host);
  await nextTick();
  workspace.sidePanelTab = 'layers';
  await nextTick();
  return { project, workspace, room };
}

const art = () => host.querySelector('[data-art]');
const box = () => host.querySelector('aside.chat footer textarea');
// Alt+T as the platform sends it (on a Mac, Option+T carries †), at what has focus.
const altT = () => {
  const k = parseKey(keysFor(commandById('panels.social').keys)[0]);
  const e = new KeyboardEvent('keydown', { code: k.code, key: isMac ? '†' : 't', altKey: k.alt, shiftKey: k.shift, ctrlKey: k.ctrl,
    bubbles: true, cancelable: true });
  (document.activeElement ?? window).dispatchEvent(e);
  return e;
};
const escape = (init = {}) => {
  const e = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true, ...init });
  document.activeElement.dispatchEvent(e);
  return e;
};
const settled = async () => { for (let i = 0; i < 3; i++) await nextTick(); };

test('in a room Alt+T from the art puts the cursor in the chat box; hi and Enter send it, and Escape puts focus back on the art', async () => {
  const { workspace, room } = await mount();
  expect(commandById('panels.social').keys).toBe('Alt+KeyT');
  const say = vi.spyOn(room, 'say').mockResolvedValue(true);
  art().focus();
  expect(altT().defaultPrevented).toBe(true); // Option's † isn't typed anywhere
  await settled();
  expect(workspace.sidePanelTab).toBe('social');
  expect(document.activeElement).toBe(box());

  box().value = 'hi';
  box().dispatchEvent(new Event('input'));
  box().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
  await vi.waitFor(() => expect(box().value).toBe(''));
  expect(say).toHaveBeenCalledWith('hi');
  expect(document.activeElement).toBe(box());

  expect(escape().defaultPrevented).toBe(true);
  await settled();
  expect(document.activeElement).toBe(art());
  expect(workspace.sidePanelTab).toBe('social'); // the panel stays as it is on a wide screen
});

test('Alt+T in the chat box goes back too; with where it came from gone, focus goes to the art', async () => {
  const { workspace } = await mount();
  const button = document.createElement('button');
  host.append(button);
  button.focus();
  altT();
  await settled();
  expect(document.activeElement).toBe(box());
  expect(altT().defaultPrevented).toBe(true);
  await settled();
  expect(document.activeElement).toBe(button);

  altT();
  await settled();
  button.remove();
  altT();
  await settled();
  expect(document.activeElement).toBe(art());
  expect(workspace.chatReturn).toBe(null);

  box().focus(); // clicked into, not reached by Alt+T: Escape goes to the art
  escape();
  await settled();
  expect(document.activeElement).toBe(art());

  const dialog = document.createElement('dialog'), inside = document.createElement('button'); // in a dialog that's shut
  dialog.append(inside);
  host.append(dialog);
  workspace.chatReturn = inside;
  box().focus();
  escape();
  await settled();
  expect(document.activeElement).toBe(art());
});

test('Escape while composing (an IME) stays the IME\'s', async () => {
  await mount();
  art().focus();
  altT();
  await settled();
  expect(escape({ isComposing: true }).defaultPrevented).toBe(false);
  await settled();
  expect(document.activeElement).toBe(box());
});

test('with Edit Mode\'s cursor placed, Alt+T is typing\'s: focus stays, and it types what it types today at the cursor', async () => {
  const { project, workspace } = await mount();
  workspace.setActiveTool('text');
  workspace.textCursor = { col: 2, row: 2 };
  await nextTick();
  art().focus();
  const focused = document.activeElement;
  altT();
  await settled();
  expect(document.activeElement).toBe(focused);
  expect(workspace.sidePanelTab).toBe('layers');
  expect(project.cells[2 * project.cols + 2].char).toBe(isMac ? '†' : 't'); // Option's character on a Mac
  expect(workspace.textCursor).toEqual({ col: 3, row: 2 });
});

test('a guest\'s Alt+T focuses Sign in to chat', async () => {
  await mount({ me: claims({ guest: true, verified: false }) });
  art().focus();
  altT();
  await settled();
  expect(document.activeElement.textContent.trim()).toBe('Sign in to chat');
});

test('out of a room Alt+T shows SOCIAL with focus on its first control', async () => {
  const { workspace } = await mount({ inRoom: false });
  art().focus();
  altT();
  await settled();
  expect(workspace.sidePanelTab).toBe('social');
  expect(host.querySelector('section.lobby').contains(document.activeElement)).toBe(true);
});

test('SOCIAL chosen from the command list in a room puts the cursor in the chat box too', async () => {
  const { project, workspace } = await mount();
  art().focus();
  await chooseCommand('panels.social', project, workspace);
  await settled();
  expect(document.activeElement).toBe(box());
  escape();
  await settled();
  expect(document.activeElement).toBe(art());
});

test('on a narrow screen Escape in the chat box shuts the panel over the art and focuses the art, in one press', async () => {
  await page.viewport(414, 896);
  onTestFinished(() => page.viewport(1200, 800));
  const { workspace } = await mount();
  art().focus();
  altT();
  await settled();
  expect(workspace.sidePanelOpen).toBe(true);
  expect(document.activeElement).toBe(box());
  escape();
  await settled();
  expect(workspace.sidePanelOpen).toBe(false);
  expect(document.activeElement).toBe(art());

  workspace.toggleSidePanel(true); // from the panel's own », which goes as it shuts: the art
  await settled();
  host.querySelector('.side-panel button.panel').focus();
  altT();
  await settled();
  expect(document.activeElement).toBe(box());
  escape();
  await settled();
  expect(document.activeElement).toBe(art());
});
