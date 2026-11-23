// The command table: every keyboard command's id, keys, words and group, where its key is the app's and what it runs.
// The keys useKeyboardShortcuts claimed by hand before are rows here, and takeKey claims them.
import { test, expect, vi } from 'vitest';
import { setLocale, te } from '@/i18n';
import { createTestApp } from '../support/app.js';
import { COMMANDS, GROUPS, commandById, commandContext, listedCommands, runCommand, takeKey, toolCommands } from '@/lib/commands';
import { keysFor, parseKey } from '@/lib/keymap';

const VIEWS = ['input', 'output', 'vector'];
const ctxOf = (project, workspace, event) => ({ project, workspace, event, view: workspace.editorTab, typing: false, uncommitted: false });
const keydown = (init) => new KeyboardEvent('keydown', { cancelable: true, ...init });

test('every id is unique, and every group is one of the ? list\'s', () => {
  const ids = COMMANDS.map(({ id }) => id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(GROUPS).toEqual(['general', 'tools', 'drawing', 'view', 'colors', 'editMode', 'select', 'vector', 'animation', 'tabs',
    'layers', 'panels', 'file', 'drawingCommands', 'rooms']);
  for (const { group } of COMMANDS) expect(GROUPS).toContain(group);
  for (const { label } of COMMANDS) expect(label()).toMatch(/\S/);
});

// The pairs of runnable commands that share a key, and why they can't both apply at once.
const SHARED = {
  'tool.pen tool.pencil': 'P: the Pencil in PIXEL and ANSI, the Pen on VECTOR',
  'tool.shapes tool.vshape': 'U: Shapes in PIXEL and ANSI, the Shape tool on VECTOR',
  // The column rows' keys are Edit Mode's typing (useTextTool), never takeKey's; elsewhere Alt+← and Alt+→ do nothing.
  'edit.altArrowsElsewhere edit.deleteColumn': 'Alt+←: a column out while typing, nothing elsewhere',
  'edit.altArrowsElsewhere edit.insertColumn': 'Alt+→: a column in while typing, nothing elsewhere',
};

// A key as what it is, so 'Alt+KeyF' and 'Alt+F' (or Shift+Mod+Z and Mod+Shift+Z) are one: its modifiers sorted, and a letter's code read as the letter.
const same = (key) => {
  const { mod, ctrl, alt, shift, code, key: value } = parseKey(key);
  const names = { Comma: ',', Period: '.', Slash: '/', BracketLeft: '[', BracketRight: ']' };
  const part = (code ? names[code] ?? code.replace(/^(Key|Digit)/, '') : value).toUpperCase();
  return [...[(mod || ctrl) && 'mod', alt && 'alt', shift && 'shift'].filter(Boolean), part].join('+'); // takeKey takes Cmd or Ctrl for Mod
};

test('no two runnable commands share a key on a platform, but for the pairs whose views or typing keep them apart', async () => {
  const { project } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 8, rows: 8 });
  const tools = [...new Map(VIEWS.flatMap((view) => toolCommands(view, project)).map((c) => [c.id, c])).values()];
  const runnable = [...COMMANDS.filter((c) => c.run), ...tools];
  for (const mac of [true, false]) {
    const byKey = new Map();
    for (const c of runnable) for (const key of keysFor(c.keys ?? [], { mac }).map(same)) byKey.set(key, [...(byKey.get(key) ?? []), c.id]);
    for (const [key, ids] of byKey) {
      if (ids.length < 2) continue;
      expect(SHARED[ids.sort().join(' ')], `${key} on ${mac ? 'a Mac' : 'Windows and Linux'}: ${ids.join(', ')}`).toBeTruthy();
    }
  }
});

test('Cmd+S saves, once, and is taken; Cmd+E opens Export, and with nothing open is taken and runs nothing', async () => {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 8, rows: 8 });
  const save = vi.spyOn(workspace, 'saveFile').mockImplementation(() => {});
  const e = keydown({ code: 'KeyS', key: 's', metaKey: true });
  expect(takeKey(e, ctxOf(project, workspace, e), ['file.save'])).toBe(true);
  expect(save).toHaveBeenCalledTimes(1);
  expect(e.defaultPrevented).toBe(true);

  const opens = keydown({ code: 'KeyE', key: 'e', metaKey: true });
  takeKey(opens, ctxOf(project, workspace, opens), ['file.export']);
  expect(workspace.exportModal).toBe(true);

  workspace.exportModal = false;
  project.image = null;
  const exp = keydown({ code: 'KeyE', key: 'e', metaKey: true });
  expect(takeKey(exp, ctxOf(project, workspace, exp), ['file.export'])).toBe(true);
  expect(exp.defaultPrevented).toBe(true);
  expect(workspace.exportModal).toBe(false);
  expect(commandById('file.export').available(ctxOf(project, workspace, exp))).not.toBe(true);
});

test('Cmd and Ctrl both make the chord on every platform, as they always have, and Shift makes Save As', async () => {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 8, rows: 8 });
  const save = vi.spyOn(workspace, 'saveFile').mockImplementation(() => {});
  for (const held of [{ metaKey: true }, { ctrlKey: true }]) {
    const e = keydown({ key: 's', ...held });
    expect(takeKey(e, ctxOf(project, workspace, e), ['file.save', 'file.saveAs'])).toBe(true);
  }
  const as = keydown({ key: 'S', shiftKey: true, ctrlKey: true });
  expect(takeKey(as, ctxOf(project, workspace, as), ['file.save', 'file.saveAs'])).toBe(true);
  expect(save.mock.calls).toEqual([[{ as: false }], [{ as: false }], [{ as: true }]]);
  const both = keydown({ key: 's', metaKey: true, ctrlKey: true });
  expect(takeKey(both, ctxOf(project, workspace, both), ['file.save'])).toBe(false);
});

test('a held Cmd+Z goes on undoing; a held P is taken and chooses nothing new', async () => {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 8, rows: 8 });
  workspace.editorTab = 'output';
  const undo = vi.spyOn(project, 'undo').mockImplementation(() => {});
  for (const repeat of [false, true]) {
    const e = keydown({ code: 'KeyZ', key: 'z', metaKey: true, repeat });
    expect(takeKey(e, ctxOf(project, workspace, e), ['general.undo', 'general.redo'])).toBe(true);
  }
  expect(undo).toHaveBeenCalledTimes(2);

  workspace.setActiveTool('brush');
  const p = keydown({ code: 'KeyP', key: 'p' });
  expect(takeKey(p, ctxOf(project, workspace, p), ['tool.*'])).toBe(true);
  expect(workspace.activeTool).toBe('pencil');
  workspace.setActiveTool('brush');
  const held = keydown({ code: 'KeyP', key: 'p', repeat: true });
  expect(takeKey(held, ctxOf(project, workspace, held), ['tool.*'])).toBe(true);
  expect(held.defaultPrevented).toBe(true);
  expect(workspace.activeTool).toBe('brush');
});

test('a key whose where doesn\'t hold isn\'t taken: X while typing, ] with a tool that has no Size', async () => {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 8, rows: 8 });
  workspace.editorTab = 'output';
  workspace.setActiveTool('text');
  const x = keydown({ code: 'KeyX', key: 'x' });
  expect(takeKey(x, ctxOf(project, workspace, x), ['colors.swap'])).toBe(false);
  expect(x.defaultPrevented).toBe(false);
  const shiftCmdX = keydown({ code: 'KeyX', key: 'x', shiftKey: true, metaKey: true });
  expect(takeKey(shiftCmdX, ctxOf(project, workspace, shiftCmdX), ['colors.swap'])).toBe(true);
  workspace.setActiveTool('pencil');
  const grow = keydown({ code: 'BracketRight', key: ']' });
  expect(takeKey(grow, ctxOf(project, workspace, grow), ['drawing.sizeUp', 'drawing.sizeDown'])).toBe(false);
});

// Moebius's Ctrl+arrows for the color steps; a Mac keeps Ctrl+arrows for Spaces, so there they take Option too. Ctrl+Alt
// is never bound off a Mac, where it's AltGr and types.
test('the color steps are Ctrl+arrows, Ctrl+Option+arrows on a Mac; no key off a Mac is Ctrl+Alt', () => {
  const keys = (id, mac) => keysFor(commandById(id).keys, { mac });
  for (const [id, arrow] of [['colors.fgPrev', 'ArrowUp'], ['colors.fgNext', 'ArrowDown'], ['colors.bgPrev', 'ArrowLeft'], ['colors.bgNext', 'ArrowRight']]) {
    expect(keys(id, true), id).toEqual([`Ctrl+Alt+${arrow}`]);
    expect(keys(id, false), id).toEqual([`Ctrl+${arrow}`]);
  }
  for (const c of COMMANDS) for (const key of keysFor(c.keys ?? [], { mac: false })) {
    const { mod, ctrl, alt } = parseKey(key);
    expect((mod || ctrl) && alt, `${c.id}: ${key}`).toBe(false);
  }
});

test('an Alt chord that runs lets the Alt-held eyedropper go first; one that runs nothing leaves it held', async () => {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 8, rows: 8 });
  workspace.editorTab = 'output';
  workspace.setActiveTool('pencil');
  workspace.holdTool('picker', 'alt');
  const back = keydown({ code: 'ArrowLeft', key: 'ArrowLeft', altKey: true });
  expect(takeKey(back, ctxOf(project, workspace, back), ['edit.altArrowsElsewhere'])).toBe(true);
  expect(back.defaultPrevented).toBe(true);
  expect(workspace.activeTool).toBe('picker'); // Alt+← outside Edit Mode: taken, nothing more
  const box = keydown({ code: 'KeyF', key: 'ƒ', altKey: true });
  expect(takeKey(box, ctxOf(project, workspace, box), ['colors.openFg'])).toBe(true);
  expect(workspace.heldTool).toBe(null);
  expect(workspace.activeTool).toBe('pencil');
  expect(workspace.colorBox).toBe('fg');
});

// Every row the command list can run says what it does in English and French, and why it can't run when it can't.
test('every row with a run has words in en.json and fr.json, and its available is true or a reason with words in both', async () => {
  const { project, workspace } = await createTestApp();
  await setLocale('fr', { persist: false });
  try {
    const states = [() => {}, () => project.setBlankCanvas({ withLayer: true, cols: 8, rows: 8 })];
    for (const state of states) {
      await state();
      const ctx = commandContext(project, workspace);
      for (const c of COMMANDS.filter((row) => row.run)) {
        for (const said of [c.label, c.title].filter(Boolean)) {
          expect(said.path, c.id).toBeTruthy();
          expect(te(said.path, 'en') && te(said.path, 'fr'), `${c.id}: ${said.path}`).toBe(true);
        }
        const reason = c.available?.(ctx) ?? true;
        const [key] = [reason].flat(); // a key, or [key, values]
        if (reason !== true) expect(te(key, 'en') && te(key, 'fr'), `${c.id}: ${key}`).toBe(true);
      }
    }
    // The reasons a room gives (New project and Versions), which a drawing alone never shows.
    for (const reason of ['social.drawing.onlyHost', 'social.drawing.notWithOthers']) expect(te(reason, 'en') && te(reason, 'fr'), reason).toBe(true);
  } finally {
    await setLocale('en', { persist: false });
  }
});

// Cmd+K on a Mac, Ctrl+K elsewhere, and only that: a Mac's Ctrl+K is a text field's (kill to the end of the line).
test('the command list opens on Mod+K strictly: Cmd only on a Mac, Ctrl only elsewhere, typing or in a field too', async () => {
  const { project, workspace } = await createTestApp();
  const field = document.body.appendChild(document.createElement('input'));
  try {
    for (const [mac, held, opens] of [[true, { metaKey: true }, true], [true, { ctrlKey: true }, false], [false, { ctrlKey: true }, true], [false, { metaKey: true }, false]]) {
      workspace.commandListOpen = false;
      const e = new KeyboardEvent('keydown', { code: 'KeyK', key: 'k', cancelable: true, ...held });
      Object.defineProperty(e, 'target', { value: field });
      expect(takeKey(e, ctxOf(project, workspace, e), ['ui.commandList'], { mac }), `${mac} ${JSON.stringify(held)}`).toBe(opens);
      expect(workspace.commandListOpen).toBe(opens);
    }
    // The running platform's own key, as the page gets it.
    workspace.commandListOpen = false;
    const [key] = keysFor(commandById('ui.commandList').keys);
    const { mod } = parseKey(key);
    const own = keydown({ code: 'KeyK', key: 'k', [navigator.platform.includes('Mac') ? 'metaKey' : 'ctrlKey']: mod });
    expect(takeKey(own, ctxOf(project, workspace, own), ['ui.commandList'])).toBe(true);
    expect(workspace.commandListOpen).toBe(true);
    // Not over a dialog: the color box is open.
    workspace.commandListOpen = false;
    workspace.colorBox = 'fg';
    expect(takeKey(own, ctxOf(project, workspace, own), ['ui.commandList'])).toBe(false);
  } finally {
    field.remove();
  }
});

test('the list holds the rows that can run in this view, never a hidden one; a run by id checks where and available', async () => {
  const { project, workspace } = await createTestApp();
  const ctx = commandContext(project, workspace);
  const ids = listedCommands(ctx).map(({ id }) => id);
  expect(ids).toContain('file.open');
  expect(ids).toContain('file.export.ans');
  expect(ids).not.toContain('edit.altArrowsElsewhere');
  expect(runCommand('file.export', ctx)).toBe(undefined); // no drawing
  expect(workspace.exportModal).toBe(false);
  await project.setBlankCanvas({ withLayer: true, cols: 8, rows: 8 });
  runCommand('file.export.png', commandContext(project, workspace));
  expect(workspace.exportModal).toBe('png');
  workspace.exportModal = false;
  expect(commandById('file.export.gif').available(commandContext(project, workspace))).not.toBe(true); // not animated
});
