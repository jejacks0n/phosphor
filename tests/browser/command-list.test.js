// The command list (Cmd+K, Ctrl+K off a Mac), mounted alone with the stores as App.vue mounts it: a search field over the
// commands the table can run here, Enter running the one picked after the list has gone (chooseCommand), the ones that
// can't run now grayed with the reason, and those run from it first when nothing's typed.
import { test, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { i18n } from '@/i18n';
import { createTestApp } from '../support/app.js';
import CommandList from '@/components/CommandList.vue';
import { chooseCommand, commandById } from '@/lib/commands';

let app = null, project, workspace, pinia;
beforeEach(async () => {
  localStorage.removeItem('phosphor.recentCommands');
  ({ project, workspace, pinia } = await createTestApp());
});
afterEach(() => {
  app?.unmount();
  app = null;
  localStorage.removeItem('phosphor.recentCommands');
});

async function open() {
  workspace.commandListOpen = true;
  app ??= createApp({
    render: () => (workspace.commandListOpen ? h(CommandList, { onClose: (id) => chooseCommand(id, project, workspace) }) : null),
  }).use(pinia).use(i18n);
  if (!app._container) app.mount(document.body.appendChild(document.createElement('div')));
  await nextTick();
  return document.querySelector('dialog.modal-dialog');
}
const field = () => document.querySelector('dialog.modal-dialog input');
async function type(text) {
  field().value = text;
  field().dispatchEvent(new Event('input'));
  await nextTick();
}
const press = async (key) => {
  field().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  await nextTick();
};
const options = () => [...document.querySelectorAll('[role="option"]')];
const words = (option) => option.querySelector('.words').textContent;
const named = (id) => (commandById(id).title ?? commandById(id).label)(); // a row's words in the list

test('typing save as and Enter saves as, once, after the list has gone; focus starts in the field, which keeps it', async () => {
  await project.setBlankCanvas({ withLayer: true, cols: 8, rows: 8 });
  let open_ = null;
  const save = vi.spyOn(workspace, 'saveFile').mockImplementation(() => { open_ = !!document.querySelector('dialog.modal-dialog'); });
  const dialog = await open();
  expect(document.activeElement).toBe(field());
  expect(dialog.querySelector('[role="listbox"]')).not.toBe(null);
  await type('save as');
  expect(words(options()[0])).toBe(named('file.saveAs'));
  expect(field().getAttribute('aria-activedescendant')).toBe(options()[0].id);
  await press('Enter');
  await vi.waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(save).toHaveBeenCalledWith({ as: true });
  expect(open_).toBe(false);
  expect(workspace.commandListOpen).toBe(false);
});

test('with no drawing, Export… is grayed with why and Enter on it does nothing; ↑ ↓ move the row picked', async () => {
  await open();
  await type('export');
  const picked = () => field().getAttribute('aria-activedescendant');
  expect(picked()).toBe(options()[0].id);
  await press('ArrowDown');
  expect(picked()).toBe(options()[1].id);
  await press('ArrowUp');
  await press('ArrowUp'); // stops at the first
  expect(picked()).toBe(options()[0].id);
  const row = options().find((o) => words(o) === 'Export…');
  expect(row.getAttribute('aria-disabled')).toBe('true');
  expect(row.textContent).toContain('No drawing open');
  while (picked() !== row.id) await press('ArrowDown');
  await press('Enter');
  await nextTick();
  expect(workspace.exportModal).toBe(false);
  expect(workspace.commandListOpen).toBe(true);
  // Its own key again is taken from the browser (Ctrl+K is its search box off a Mac).
  const again = new KeyboardEvent('keydown', { code: 'KeyK', key: 'k', [navigator.platform.includes('Mac') ? 'metaKey' : 'ctrlKey']: true, bubbles: true, cancelable: true });
  field().dispatchEvent(again);
  expect(again.defaultPrevented).toBe(true);
});

test('a search finds the rows that can run first, best first, then the grayed ones; Enter runs the first that can', async () => {
  await open(); // no drawing: Save As and the ROOM tab grayed
  for (const [query, first] of [['file', 'file.open'], ['room', 'rooms.start']]) {
    await type(query);
    const off = options().map((o) => o.getAttribute('aria-disabled') === 'true');
    expect(off, query).toContain(true);
    expect(off.indexOf(true), query).toBe(off.lastIndexOf(false) + 1); // every runnable row ahead of every grayed one
    expect(words(options()[0]), query).toBe(named(first));
    expect(field().getAttribute('aria-activedescendant')).toBe(options()[0].id);
  }
  await type('file');
  const before = workspace.openRequest;
  await press('Enter');
  await vi.waitFor(() => expect(workspace.openRequest).toBe(before + 1));
});

test('with nothing typed, the first row that can run is picked', async () => {
  localStorage.setItem('phosphor.recentCommands', JSON.stringify(['file.saveAs', 'file.open'])); // Save As grayed with no drawing
  await open();
  expect(words(options()[0])).toBe(named('file.saveAs'));
  expect(field().getAttribute('aria-activedescendant')).toBe(options()[1].id);
});

test('with nothing typed, the commands run from it lead, then every command by group; a row shows its key', async () => {
  await project.setBlankCanvas({ withLayer: true, cols: 8, rows: 8 });
  await open();
  const first = options().map(words);
  expect(first).toContain(named('file.saveAs'));
  expect(document.querySelector('[role="listbox"] [role="group"]')).not.toBe(null);
  const undo = options().find((o) => words(o) === named('general.undo'));
  expect(undo.querySelector('kbd')).not.toBe(null);

  vi.spyOn(project, 'undo').mockImplementation(() => {});
  await type('undo');
  await press('Enter');
  await vi.waitFor(() => expect(project.undo).toHaveBeenCalledOnce());
  await open();
  expect(words(options()[0])).toBe(named('general.undo'));
  expect(options().filter((o) => words(o) === named('general.undo'))).toHaveLength(1);
});

test('typing in Edit Mode, the lines and columns and the ? list are offered; Escape closes, running nothing', async () => {
  await project.setBlankCanvas({ withLayer: true, cols: 8, rows: 8 });
  workspace.editorTab = 'output';
  workspace.setActiveTool('text');
  workspace.textCursor = { col: 1, row: 1 };
  const dialog = await open();
  const all = options().map(words);
  for (const id of ['edit.insertLine', 'edit.deleteColumn', 'general.help']) expect(all, id).toContain(named(id));
  expect(all).not.toContain(named('edit.altArrowsElsewhere')); // hidden
  dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await vi.waitFor(() => expect(workspace.commandListOpen).toBe(false));
  expect(workspace.shortcutsOpen).toBe(false);
});

test('with the Text tool chosen, Swap colors is offered, and Enter swaps them as X does outside typing', async () => {
  await project.setBlankCanvas({ withLayer: true, cols: 8, rows: 8 });
  workspace.editorTab = 'output';
  workspace.setActiveTool('text');
  workspace.textCursor = { col: 1, row: 1 };
  const [fg, bg] = [workspace.editFgColor, workspace.editBgColor];
  await open();
  expect(options().map(words)).toContain(named('colors.swap'));
  await type('swap foreground');
  expect(words(options()[0])).toBe(named('colors.swap'));
  await press('Enter');
  await vi.waitFor(() => expect([workspace.editFgColor, workspace.editBgColor]).toEqual([bg, fg]));
});

test('the tabs are offered: SAUCE chosen shows SAUCE after the list has gone, and ROOM out of a room is grayed with why', async () => {
  await project.setBlankCanvas({ withLayer: true, cols: 8, rows: 8 });
  workspace.editorTab = 'output';
  await open();
  await type('show the');
  const row = (id) => options().find((o) => words(o) === named(id));
  expect(row('tab.room').getAttribute('aria-disabled')).toBe('true');
  expect(row('tab.room').textContent).toContain('Only while watching a room');
  await type('sauce tab');
  expect(words(options()[0])).toBe(named('tab.sauce'));
  await press('Enter');
  await vi.waitFor(() => expect(workspace.editorTab).toBe('sauce'));
  expect(workspace.commandListOpen).toBe(false);
});

test('a long reason wraps beside its words, never over them; the field is a search field that filters', async () => {
  await project.setBlankCanvas({ withLayer: true, cols: 8, rows: 8 });
  await open();
  expect(field().type).toBe('search');
  expect(field().placeholder).toBe('Filter commands…');
  await type('bake');
  const row = options().find((o) => o.querySelector('.reason')?.textContent.startsWith('Nothing to bake'));
  const text = document.createRange();
  text.selectNodeContents(row.querySelector('.words')); // the words as drawn, which can spill out of a squeezed box
  const w = text.getBoundingClientRect(), r = row.querySelector('.reason').getBoundingClientRect();
  expect(r.height).toBeGreaterThan(w.height); // wrapped, on lines of its own column
  expect(w.right).toBeLessThanOrEqual(r.left);
});
