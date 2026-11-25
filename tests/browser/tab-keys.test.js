// The editor's tabs by key: Alt+1 the picture tab (PIXEL, or VECTOR with a vector layer picked), Alt+2 ANSI, Alt+3
// SAUCE, Alt+4 the room you watch, each only when EditTabs shows it and it's on (workspace.shownTabs), and taken where it
// applies even when it isn't there. Not while typing in Edit Mode, where Option's digits type on a Mac, but on Linux,
// whose browser switches its own tabs on them, they're taken there and do nothing. The events are built from the
// table's keys for the platform the tests run on (a Mac here, Linux on CI), with the code the keys are matched by.
import { test, expect, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { i18n } from '@/i18n';
import { createTestApp, settle } from '../support/app.js';
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts';
import { useTextTool } from '@/composables/useTextTool';
import { commandById, commandContext, listedCommands, takeKey } from '@/lib/commands';
import { keysFor, parseKey } from '@/lib/keymap';
import { isLinux, isMac } from '@/lib/keyLabels';
import { useRoomStore } from '@/store/RoomStore';
import SauceEditor from '@/components/SauceEditor.vue';

let app = null, host = null;
afterEach(() => {
  app?.unmount();
  host?.remove();
  app = host = null;
});

// A blank drawing with Layer 1 picked, in the view given, and the app's keys (the Text tool's first, as AnsiEditor's
// mount before EditWorkspace's); with sauce, the SAUCE tab's fields too.
async function mount(tab = 'output', { sauce = false, drawing = true } = {}) {
  const { project, workspace, pinia } = await createTestApp();
  if (drawing) {
    await project.setBlankCanvas({ withLayer: true, cols: 8, rows: 8 });
    await settle(project);
    workspace.pickLayer('edit');
  }
  workspace.editorTab = tab;
  host = document.createElement('div');
  document.body.append(host);
  app = createApp({ setup() { useTextTool(project, workspace, null); useKeyboardShortcuts(project, workspace); return () => (sauce ? h(SauceEditor) : null); } })
    .use(pinia).use(i18n);
  app.mount(host);
  await nextTick();
  return { project, workspace, pinia };
}

// What Option types on a US Mac's digits; elsewhere the digit.
const TYPED = isMac ? { Digit1: '¡', Digit2: '™', Digit3: '£', Digit4: '¢' } : { Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4' };
const keyOf = (id) => parseKey(keysFor(commandById(id).keys)[0]);
const press = (id, { at = window, ...init } = {}) => {
  const k = keyOf(id);
  const e = new KeyboardEvent('keydown', { code: k.code, key: TYPED[k.code], altKey: k.alt, shiftKey: k.shift, ctrlKey: k.ctrl,
    bubbles: true, cancelable: true, ...init });
  at.dispatchEvent(e);
  return e;
};

test('on a cells layer Alt+2 shows ANSI, Alt+1 PIXEL and Alt+3 SAUCE, and from SAUCE Alt+1 PIXEL again', async () => {
  const { workspace } = await mount('input');
  expect(keyOf('tab.picture')).toMatchObject({ alt: true, code: 'Digit1', shift: false, ctrl: false, mod: false });
  expect(press('tab.ansi').defaultPrevented).toBe(true);
  expect(workspace.editorTab).toBe('output');
  press('tab.picture');
  expect(workspace.editorTab).toBe('input');
  press('tab.sauce');
  expect(workspace.editorTab).toBe('sauce');
  press('tab.picture');
  expect(workspace.editorTab).toBe('input');
});

test('Alt+4 out of a room is taken and changes nothing, grayed in the command list; watching one it shows ROOM', async () => {
  const { project, workspace, pinia } = await mount('output');
  const e = press('tab.room');
  expect(e.defaultPrevented).toBe(true);
  expect(workspace.editorTab).toBe('output');
  const ctx = commandContext(project, workspace);
  const row = listedCommands(ctx).find((c) => c.id === 'tab.room');
  expect(row.available(ctx)).toBe('shortcuts.reasons.notWatching');
  useRoomStore(pinia).role = 'host'; // a host has no ROOM tab
  press('tab.room');
  expect(workspace.editorTab).toBe('output');
  useRoomStore(pinia).role = 'watch';
  press('tab.room');
  expect(workspace.editorTab).toBe('room');
  press('tab.ansi'); // back to the art
  expect(workspace.editorTab).toBe('output');
});

test('with a vector layer picked Alt+1 shows VECTOR, and Alt+2 (no ANSI tab then) changes nothing', async () => {
  const { project, workspace } = await mount('output');
  project.addLayer('vector', 'base');
  workspace.pickLayer('vector');
  workspace.editorTab = 'sauce';
  press('tab.picture');
  expect(workspace.editorTab).toBe('vector');
  expect(press('tab.ansi').defaultPrevented).toBe(true);
  expect(workspace.editorTab).toBe('vector');
  expect(commandById('tab.ansi').available(commandContext(project, workspace))).toBe('shortcuts.reasons.vectorPicked');
});

test('with nothing open the tabs are off: Alt+2 is taken and changes nothing', async () => {
  const { project, workspace } = await mount('input', { drawing: false });
  expect(press('tab.ansi').defaultPrevented).toBe(true);
  expect(workspace.editorTab).toBe('input');
  expect(commandById('tab.ansi').available(commandContext(project, workspace))).toBe('shortcuts.reasons.noDrawing');
});

test('typing in Edit Mode Alt+2 doesn\'t switch: it types Option\'s character on a Mac, and on Linux is taken and does nothing', async () => {
  const { project, workspace } = await mount('output');
  workspace.setActiveTool('text');
  workspace.textCursor = { col: 2, row: 2 };
  const e = press('tab.ansi');
  expect(workspace.editorTab).toBe('output');
  if (isLinux) {
    expect(e.defaultPrevented).toBe(true);
    expect(project.cells[2 * project.cols + 2].char).not.toBe('2');
    expect(workspace.textCursor).toEqual({ col: 2, row: 2 });
  } else {
    expect(project.cells[2 * project.cols + 2].char).toBe(TYPED.Digit2); // ™ on a Mac
    expect(workspace.textCursor).toEqual({ col: 3, row: 2 });
  }
  // Whichever platform this runs on, Linux's rule, asked of the table directly: taken and nothing run.
  const linux = new KeyboardEvent('keydown', { code: 'Digit3', key: '3', altKey: true, cancelable: true });
  const ctx = { project, workspace, event: linux, view: 'output', typing: true, uncommitted: false, linux: true };
  expect(takeKey(linux, ctx, ['tab.picture', 'tab.ansi', 'tab.sauce', 'tab.room', 'tab.keptFromBrowser'])).toBe(true);
  expect(linux.defaultPrevented).toBe(true);
  expect(workspace.editorTab).toBe('output');
  const mac = new KeyboardEvent('keydown', { code: 'Digit3', key: '£', altKey: true, cancelable: true });
  expect(takeKey(mac, { ...ctx, event: mac, linux: false }, ['tab.picture', 'tab.ansi', 'tab.sauce', 'tab.room', 'tab.keptFromBrowser'])).toBe(false);
});

test('with focus in SAUCE\'s title field Alt+2 does nothing', async () => {
  const { workspace } = await mount('sauce', { sauce: true });
  const title = host.querySelector('#sauce-title');
  title.focus();
  const e = press('tab.ansi', { at: title });
  expect(e.defaultPrevented).toBe(false);
  expect(workspace.editorTab).toBe('sauce');
});

test('a held key switches once', async () => {
  const { workspace } = await mount('output');
  press('tab.sauce', { repeat: true });
  expect(workspace.editorTab).toBe('output');
});

test('on Linux the keys are taken wherever the tabs don\'t apply, mid-stroke and with the color box open, and do nothing', async () => {
  const { project, workspace } = await mount('output');
  const ids = ['tab.picture', 'tab.ansi', 'tab.sauce', 'tab.room', 'tab.keptFromBrowser'];
  const tryKey = (linux) => {
    const e = new KeyboardEvent('keydown', { code: 'Digit3', key: '3', altKey: true, cancelable: true });
    return [takeKey(e, { project, workspace, event: e, view: 'output', typing: false, uncommitted: false, linux }, ids), e.defaultPrevented];
  };
  workspace.isPainting = true;
  expect(tryKey(true)).toEqual([true, true]);
  expect(tryKey(false)).toEqual([false, false]);
  workspace.isPainting = false;
  workspace.colorBox = 'fg';
  expect(tryKey(true)).toEqual([true, true]);
  expect(tryKey(false)).toEqual([false, false]);
  expect(workspace.editorTab).toBe('output');
  workspace.colorBox = null;
});
