// The cell's colors by key: Alt+U takes the colors of the cell at Edit Mode's cursor, or elsewhere in PIXEL and ANSI the
// cell under the pointer (workspace.pointerCell), as the Picker reads them; Shift+Alt+U its character too; Alt+X flips
// the cursor's cell as the Flip tool does, one undo step. On a Mac, Option+U is the umlaut's dead key, so while typing
// Alt+U and Shift+Alt+U are left to typing for now (TextKeys.js's MAC_TYPES_OPTION_U) and the command list has them. The
// events are built from the table's keys for the platform the tests run on (a Mac here, Linux on CI), with the code the
// keys are matched by.
import { test, expect, afterEach } from 'vitest';
import { createApp } from 'vue';
import { i18n } from '@/i18n';
import { createTestApp, settle } from '../support/app.js';
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts';
import { useTextTool } from '@/composables/useTextTool';
import { commandById, commandContext, runCommand } from '@/lib/commands';
import { keysFor, parseKey } from '@/lib/keymap';
import { isMac } from '@/lib/keyLabels';
import { typingKeepsAltU } from '@/lib/TextKeys';

let app = null;
afterEach(() => {
  app?.unmount();
  app = null;
});

const RED = '#ff0000', BLUE = '#0000ff', GREEN = '#00ff00', YELLOW = '#ffff00';
const at = (project, col, row) => project.cells[row * project.cols + col];

// A blank drawing in the ANSI view with Layer 1 picked, a red # on blue at 2,2 and a green @ on yellow at 5,5, and the
// app's keys (the Text tool's first, as AnsiEditor's mount before EditWorkspace's).
async function mount() {
  const { project, workspace, pinia } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 8, rows: 16 });
  await settle(project);
  workspace.editorTab = 'output';
  workspace.pickLayer('edit');
  project.typeAt(2, 2, '#', { fg: RED, bg: BLUE });
  project.typeAt(5, 5, '@', { fg: GREEN, bg: YELLOW });
  project.commitEdit();
  await settle(project);
  workspace.setColor('fg', '#ffffff');
  workspace.setColor('bg', '#000000');
  workspace.activeChar = '█';
  app = createApp({ setup() { useTextTool(project, workspace, null); useKeyboardShortcuts(project, workspace); return () => null; } })
    .use(pinia).use(i18n);
  app.mount(document.createElement('div'));
  return { project, workspace };
}
const typingAt = (workspace, col, row) => {
  workspace.setActiveTool('text');
  workspace.textCursor = { col, row };
};
const pointAt = (workspace, col, row, half = 0) => { workspace.pointerCell = { col, row, y: 2 * row + half }; };

// What the key types on a US layout: on a Mac, Option's characters (Option+U is a dead key).
const TYPED = isMac ? { KeyU: 'Dead', KeyX: '≈', KeyM: 'µ' } : { KeyU: 'u', KeyX: 'x', KeyM: 'm' };
const press = (id, init = {}) => {
  const k = parseKey(keysFor(commandById(id).keys)[0]);
  const key = k.shift && k.code === 'KeyU' ? (isMac ? '¨' : 'U') : TYPED[k.code];
  const e = new KeyboardEvent('keydown', { code: k.code, key, altKey: k.alt, shiftKey: k.shift, ctrlKey: k.ctrl,
    bubbles: true, cancelable: true, ...init });
  window.dispatchEvent(e);
  return e;
};
const pair = (workspace) => [workspace.editFgColor, workspace.editBgColor];

test('in Edit Mode Alt+U takes the cursor cell\'s colors and leaves the character; Shift+Alt+U takes the character too (off a Mac)', async () => {
  const { project, workspace } = await mount();
  typingAt(workspace, 2, 2);
  const taken = press('colors.takeUnder');
  if (typingKeepsAltU()) { // Option+U starts ü there and Shift+Option+U types ¨: left to typing
    expect(taken.defaultPrevented).toBe(false);
    press('colors.takeUnderWithChar');
    expect(pair(workspace)).toEqual(['#ffffff', '#000000']);
    expect(workspace.activeChar).toBe('█');
    expect(at(project, 2, 2).char).toBe('¨');
    return;
  }
  expect(taken.defaultPrevented).toBe(true);
  expect(pair(workspace)).toEqual([RED, BLUE]);
  expect(workspace.activeChar).toBe('█');
  expect(at(project, 2, 2).char).toBe('#'); // nothing typed
  expect(workspace.textCursor).toEqual({ col: 2, row: 2 });
  typingAt(workspace, 5, 5);
  press('colors.takeUnderWithChar');
  expect(pair(workspace)).toEqual([GREEN, YELLOW]);
  expect(workspace.activeChar).toBe('@');
  expect(at(project, 5, 5).char).toBe('@');
});

test('the command list takes the cursor cell\'s colors in Edit Mode on every platform', async () => {
  const { workspace, project } = await mount();
  typingAt(workspace, 2, 2);
  pointAt(workspace, 5, 5); // the cursor's, not the pointer's
  runCommand('colors.takeUnderWithChar', commandContext(project, workspace));
  expect(pair(workspace)).toEqual([RED, BLUE]);
  expect(workspace.activeChar).toBe('#');
});

test('outside Edit Mode Alt+U takes the cell under the pointer, a wide character\'s trail its lead; off the art, nothing', async () => {
  const { project, workspace } = await mount();
  workspace.setActiveTool('pencil');
  pointAt(workspace, 5, 5, 1);
  expect(press('colors.takeUnder').defaultPrevented).toBe(true);
  expect(pair(workspace)).toEqual([GREEN, YELLOW]);
  expect(workspace.activeChar).toBe('█');
  expect(workspace.recentColors).toEqual(expect.arrayContaining([GREEN, YELLOW, '#ffffff', '#000000'])); // the pick ended: old and new
  project.typeAt(0, 4, '中', { fg: BLUE, bg: RED }); // wide: 0,4 and its trail 1,4
  project.commitEdit();
  await settle(project);
  pointAt(workspace, 1, 4);
  press('colors.takeUnderWithChar');
  expect(pair(workspace)).toEqual([BLUE, RED]);
  expect(workspace.activeChar).toBe('中');
  workspace.pointerCell = null;
  workspace.setColor('fg', '#ffffff');
  expect(press('colors.takeUnder').defaultPrevented).toBe(true);
  expect(pair(workspace)).toEqual(['#ffffff', RED]);
  expect(commandById('colors.takeUnder').available(commandContext(project, workspace))).toBe('shortcuts.reasons.noCell');
});

test('in PIXEL Alt+U takes the pixel under the pointer as the foreground, Shift+Alt+U as the background', async () => {
  const { project, workspace } = await mount();
  project.paintStroke([{ x: 3, y: 6, alpha: 1 }], GREEN); // cell 3,3: green over yellow
  project.paintStroke([{ x: 3, y: 7, alpha: 1 }], YELLOW);
  project.commitEdit();
  await settle(project);
  workspace.editorTab = 'input';
  workspace.setActiveTool('brush');
  pointAt(workspace, 3, 3, 0); // the top half
  press('colors.takeUnder');
  expect(workspace.editFgColor).toBe(GREEN);
  expect(workspace.editBgColor).toBe('#000000');
  pointAt(workspace, 3, 3, 1); // the bottom half
  press('colors.takeUnderWithChar');
  expect(workspace.editBgColor).toBe(YELLOW);
  expect(workspace.editFgColor).toBe(GREEN);
  expect(workspace.activeChar).toBe('█'); // a pixel has no character
});

test('on VECTOR the keys do nothing', async () => {
  const { workspace } = await mount();
  workspace.editorTab = 'vector';
  pointAt(workspace, 2, 2);
  expect(press('colors.takeUnder').defaultPrevented).toBe(false);
  expect(pair(workspace)).toEqual(['#ffffff', '#000000']);
});

test('Alt+X flips the cursor\'s cell, a trail its lead, types nothing, and one undo flips it back after typing', async () => {
  const { project, workspace } = await mount();
  typingAt(workspace, 4, 3);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', bubbles: true, cancelable: true })); // typed, open as a run
  expect(at(project, 4, 3).char).toBe('a');
  typingAt(workspace, 2, 2);
  expect(press('edit.flipCell').defaultPrevented).toBe(true);
  await settle(project);
  expect([at(project, 2, 2).fg.hex, at(project, 2, 2).bg.hex]).toEqual([BLUE, RED]);
  expect(at(project, 2, 2).char).toBe('#');
  expect(press('edit.flipCell', { repeat: true }).defaultPrevented).toBe(true); // held: once
  await settle(project);
  expect([at(project, 2, 2).fg.hex, at(project, 2, 2).bg.hex]).toEqual([BLUE, RED]);
  project.undo();
  await settle(project);
  expect([at(project, 2, 2).fg.hex, at(project, 2, 2).bg.hex]).toEqual([RED, BLUE]);
  expect(at(project, 4, 3).char).toBe('a'); // the typing is its own step
  project.typeAt(0, 6, '中', { fg: GREEN, bg: YELLOW });
  project.commitEdit();
  await settle(project);
  typingAt(workspace, 1, 6);
  press('edit.flipCell');
  await settle(project);
  expect([at(project, 0, 6).fg.hex, at(project, 0, 6).bg.hex]).toEqual([YELLOW, GREEN]);
});

test('Alt+X is taken in Edit Mode only, and outside the ANSI art style it flips nothing', async () => {
  const { project, workspace } = await mount();
  workspace.setActiveTool('pencil');
  pointAt(workspace, 2, 2);
  expect(press('edit.flipCell').defaultPrevented).toBe(false);
  typingAt(workspace, 2, 2);
  project.renderStyle = 'colorAscii';
  await settle(project);
  const before = project.history.version;
  expect(press('edit.flipCell').defaultPrevented).toBe(true); // taken, so ≈ isn't typed
  expect(project.history.version).toBe(before);
  expect(commandById('edit.flipCell').available(commandContext(project, workspace))).toBe('shortcuts.reasons.ansiOnly');
});

test('a new drawing leaves no pointer cell behind', async () => {
  const { project, workspace } = await mount();
  pointAt(workspace, 5, 5);
  await project.setBlankCanvas({ withLayer: true, cols: 8, rows: 16 });
  expect(workspace.pointerCell).toBe(null);
});

test('Alt+M, sent to the window as the app listens for it, turns mirror mode on and off', async () => {
  const { workspace } = await mount();
  press('edit.mirror');
  expect(workspace.mirror).toBe(true);
  press('edit.mirror');
  expect(workspace.mirror).toBe(false);
});
