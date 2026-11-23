// The color steps and the character set's steps, moved off Alt+arrows for Moebius's lines and columns: Ctrl+↑/↓ step the
// foreground through the palette and Ctrl+←/→ the background (Ctrl+Option+arrows on a Mac, which keeps Ctrl+arrows), in
// PIXEL and ANSI, typing or not; Ctrl+, and Ctrl+. step the character set. Alt+←/→ outside Edit mode are taken and do
// nothing, so the browser doesn't go Back; Alt+, and Alt+. type while typing, frames or not. The events are built from
// the table's keys for the platform the tests run on (a Mac here, Linux on CI).
import { test, expect, afterEach } from 'vitest';
import { createApp } from 'vue';
import { getActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import { createTestApp, settle, cellsKey } from '../support/app.js';
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts';
import { useTextTool } from '@/composables/useTextTool';
import { usePaletteStore } from '@/store/PaletteStore';
import { commandById } from '@/lib/commands';
import { keysFor, parseKey } from '@/lib/keymap';
import { isMac } from '@/lib/keyLabels';
import { PALETTES } from '@/lib/ColorUtils';

let app = null;
afterEach(() => {
  app?.unmount();
  app = null;
});

// A blank CGA drawing in the ANSI view, with the app's keys: the Text tool's first, as AnsiEditor's mount before
// EditWorkspace's.
async function mount() {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 8, rows: 8 });
  project.quantize = 'cga';
  await settle(project);
  workspace.editorTab = 'output';
  app = createApp({ setup() { useTextTool(project, workspace, null); useKeyboardShortcuts(project, workspace); return () => null; } })
    .use(getActivePinia()).use(i18n);
  app.mount(document.createElement('div'));
  return { project, workspace };
}

const VALUES = { ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', Comma: ',', Period: '.' };
// A key in the table's grammar pressed, as this platform sends it.
const press = (key, init = {}) => {
  const k = parseKey(key);
  const e = new KeyboardEvent('keydown', { code: k.code, key: k.key ?? VALUES[k.code], altKey: k.alt, shiftKey: k.shift,
    ctrlKey: k.ctrl || (k.mod && !isMac), metaKey: k.mod && isMac, bubbles: true, cancelable: true, ...init });
  window.dispatchEvent(e);
  return e;
};
const pressCommand = (id) => press(keysFor(commandById(id).keys)[0]);
const cga = (i) => PALETTES.cga[i].hex.toLowerCase();

test('Ctrl+↓ steps the foreground to the palette\'s next color outside Edit mode and in it; Ctrl+→ steps the background', async () => {
  const { workspace } = await mount();
  workspace.setActiveTool('select');
  workspace.setColor('fg', cga(1));
  expect(pressCommand('colors.fgNext').defaultPrevented).toBe(true);
  expect(workspace.editFgColor).toBe(cga(2));
  pressCommand('colors.fgPrev');
  expect(workspace.editFgColor).toBe(cga(1));

  workspace.setActiveTool('text');
  workspace.textCursor = { col: 0, row: 0 };
  pressCommand('colors.fgNext');
  expect(workspace.editFgColor).toBe(cga(2));
  workspace.setColor('bg', cga(3));
  pressCommand('colors.bgNext');
  expect(workspace.editBgColor).toBe(cga(4));
  pressCommand('colors.bgPrev');
  expect(workspace.editBgColor).toBe(cga(3));
  expect(workspace.textCursor).toEqual({ col: 0, row: 0 }); // still typing
});

test('the color steps leave Monochrome ASCII and the color box alone', async () => {
  const { project, workspace } = await mount();
  workspace.setColor('fg', cga(1));
  project.renderStyle = 'ascii';
  expect(pressCommand('colors.fgNext').defaultPrevented).toBe(false);
  project.renderStyle = 'ansi';
  workspace.colorBox = 'fg';
  pressCommand('colors.fgNext');
  expect(workspace.editFgColor).toBe(cga(1));
});

test('Ctrl+. and Ctrl+, step the character set, with the cursor placed or not', async () => {
  const { workspace } = await mount();
  const palettes = usePaletteStore();
  workspace.setActiveTool('text');
  const first = palettes.active.id;
  expect(pressCommand('characters.setNext').defaultPrevented).toBe(true);
  const next = palettes.active.id;
  expect(next).not.toBe(first);
  pressCommand('characters.setPrev');
  expect(palettes.active.id).toBe(first);
  workspace.textCursor = { col: 0, row: 0 };
  pressCommand('characters.setNext');
  expect(palettes.active.id).toBe(next);
});

test('Alt+← with the Pencil chosen is taken and changes nothing; in Edit mode it takes the cursor\'s column out', async () => {
  const { project, workspace } = await mount();
  project.typeAt(1, 0, 'A', { fg: '#ffffff', bg: '#000000' });
  project.commitEdit();
  workspace.setActiveTool('pencil');
  const before = cellsKey(project), version = project.history.version;
  for (const key of ['Alt+ArrowLeft', 'Alt+ArrowRight']) expect(press(key).defaultPrevented, key).toBe(true);
  expect(cellsKey(project)).toEqual(before);
  expect(project.history.version).toBe(version);
  expect(workspace.activeTool).toBe('pencil');

  workspace.setActiveTool('text');
  workspace.textCursor = { col: 0, row: 0 };
  expect(press('Alt+ArrowLeft').defaultPrevented).toBe(true);
  expect(project.editCellAt(0, 0)?.char).toBe('A'); // pulled left a column
  expect(project.history.version).toBe(version + 1);
  press('Alt+ArrowDown'); // the cursor's line out
  expect(project.editCellAt(0, 0)?.char).not.toBe('A');
  press('Alt+ArrowUp'); // a line in: nothing there to push
  press('Alt+ArrowRight');
  expect(workspace.textCursor).toEqual({ col: 0, row: 0 }); // the cursor stays
});

test('with Animate on and the cursor placed, Alt+. types and the frame stays', async () => {
  const { project, workspace } = await mount();
  project.setAnimate(true);
  project.addFrame('blank');
  project.stepFrame(-1);
  workspace.setActiveTool('text');
  workspace.textCursor = { col: 0, row: 0 };
  const char = isMac ? '≥' : '.';
  press('Alt+Period', { key: char });
  expect(project.frame).toBe(0);
  expect(project.editCellAt(0, 0)?.char).toBe(char);
  workspace.textCursor = null; // Escape: now it steps
  press('Alt+Period', { key: char });
  expect(project.frame).toBe(1);
});

test('a line taken out that pulls a wide character up under the cursor puts it on the character\'s first column', async () => {
  const { project, workspace } = await mount();
  project.typeAt(0, 1, '漢', { fg: '#ffffff', bg: '#000000' });
  project.commitEdit();
  workspace.setActiveTool('text');
  workspace.textCursor = { col: 1, row: 0 };
  press('Alt+ArrowDown');
  expect(project.editCellAt(0, 0)?.char).toBe('漢');
  expect(workspace.textCursor).toEqual({ col: 0, row: 0 });
});

test('Alt+← is taken where typing won\'t take it: a field off a Mac (a Mac\'s field keeps it), the character palette open', async () => {
  const { workspace } = await mount();
  const field = document.body.appendChild(Object.assign(document.createElement('input'), { type: 'text' }));
  try {
    field.focus();
    const e = new KeyboardEvent('keydown', { code: 'ArrowLeft', key: 'ArrowLeft', altKey: true, bubbles: true, cancelable: true });
    field.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(!isMac); // Option+← moves by word on a Mac
    field.blur();
  } finally {
    field.remove();
  }
  workspace.setActiveTool('text');
  workspace.textCursor = { col: 0, row: 0 };
  workspace.paletteLayerOpen = true;
  expect(press('Alt+ArrowLeft').defaultPrevented).toBe(true);
});

test('the line and column rows run at the cursor (the command list\'s), and say why not without one', async () => {
  const { project, workspace } = await mount();
  const ctx = { project, workspace, view: 'output' };
  const insert = commandById('edit.insertLine');
  expect(insert.available(ctx)).toBe('shortcuts.reasons.noCursor');
  workspace.setActiveTool('text');
  workspace.textCursor = { col: 0, row: 0 };
  project.typeAt(0, 0, 'A', { fg: '#ffffff', bg: '#000000' });
  expect(insert.available(ctx)).toBe(true);
  insert.run(ctx);
  expect(project.editCellAt(0, 1)?.char).toBe('A');
  commandById('edit.deleteLine').run(ctx);
  expect(project.editCellAt(0, 0)?.char).toBe('A');
});

// Review, fix round 1: with the cursor placed, a checkbox reached with Tab or a button in an open dialog has focus, so
// Edit Mode's typing leaves Alt+← alone (useTextTool's own test); the hidden row takes it then, or Back would close the
// drawing. Neither owns Option+← on a Mac, so the Mac takes it too.
test('with the cursor placed, Alt+← on a focused checkbox or a dialog\'s button is taken and moves nothing', async () => {
  const { project, workspace } = await mount();
  project.typeAt(1, 0, 'A', { fg: '#ffffff', bg: '#000000' });
  project.commitEdit();
  workspace.setActiveTool('text');
  workspace.textCursor = { col: 0, row: 0 };
  const dialog = Object.assign(document.createElement('dialog'), { open: true });
  dialog.append(document.createElement('button'));
  const checkbox = Object.assign(document.createElement('input'), { type: 'checkbox' });
  document.body.append(checkbox, dialog);
  try {
    for (const el of [checkbox, dialog.firstElementChild]) {
      el.focus();
      const e = new KeyboardEvent('keydown', { code: 'ArrowLeft', key: 'ArrowLeft', altKey: true, bubbles: true, cancelable: true });
      el.dispatchEvent(e);
      expect(e.defaultPrevented, el.tagName).toBe(true);
      expect(project.editCellAt(1, 0)?.char, el.tagName).toBe('A'); // no column taken out
    }
  } finally {
    checkbox.remove();
    dialog.remove();
  }
});
