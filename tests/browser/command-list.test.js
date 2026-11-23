// The command list (Cmd+K, Ctrl+K off a Mac), mounted alone with the stores as App.vue mounts it: a search field over the
// commands the table can run here, Enter running the one picked after the list has gone (chooseCommand), the ones that
// can't run now greyed with the reason, and those run from it first when nothing's typed.
import { test, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import { createTestApp } from '../support/app.js';
import CommandList from '@/components/CommandList.vue';
import { chooseCommand, commandById } from '@/lib/commands';

let app = null, project, workspace;
beforeEach(async () => {
  localStorage.removeItem('phosphor.recentCommands');
  ({ project, workspace } = await createTestApp());
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
  }).use(getActivePinia()).use(i18n);
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

test('with no drawing, Export… is greyed with why and Enter on it does nothing; ↑ ↓ move the row picked', async () => {
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
