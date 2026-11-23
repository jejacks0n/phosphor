// The shortcut list (?) names each tool key by the tool it picks, as the tool's tooltip and ⋯ entry do.
import { test, expect, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import { createTestApp } from '../support/app.js';
import { TOOLS, keyLabel } from '@/tools';
import ShortcutsDialog from '@/components/ShortcutsDialog.vue';
import { COMMANDS, GROUPS, commandById } from '@/lib/commands';
import { keysFor, keyLabel as label } from '@/lib/keymap';

let app = null;
afterEach(() => {
  app?.unmount();
  app = null;
});

test('each key in the Tools section is named by the tool it picks', async () => {
  await createTestApp();
  app = createApp({ render: () => h(ShortcutsDialog) }).use(getActivePinia()).use(i18n);
  app.mount(document.body.appendChild(document.createElement('div')));
  await nextTick();
  const tools = [...document.querySelectorAll('section')].find((s) => s.querySelector('h4')?.textContent === 'Tools');
  const rows = new Map([...tools.querySelectorAll('dt')].flatMap((dt) =>
    [...dt.querySelectorAll('kbd')].map((kbd) => [kbd.textContent, dt.nextElementSibling.textContent])));
  const named = TOOLS.filter((tool) => !tool.views.includes('vector')).flatMap((tool) =>
    (tool.keys ?? []).map(keyLabel).filter((key) => rows.has(key)).map((key) => [tool, rows.get(key)]));
  expect(named.map(([tool]) => tool.id)).toContain('flip');
  for (const [tool, row] of named) expect(row.slice(0, tool.title.length), tool.id).toBe(tool.title);
});

test('the list is the command table: its groups in order, and every row with keys on one line with its words', async () => {
  await createTestApp();
  app = createApp({ render: () => h(ShortcutsDialog) }).use(getActivePinia()).use(i18n);
  app.mount(document.body.appendChild(document.createElement('div')));
  await nextTick();
  const sections = [...document.querySelectorAll('section')];
  const titles = sections.map((s) => s.querySelector('h4').textContent);
  expect(titles.slice(0, 4)).toEqual(['General', 'Tools', 'Drawing', 'View']);
  expect(titles.indexOf('Colors')).toBeLessThan(titles.indexOf('Edit Mode'));
  const general = sections[0].querySelectorAll('dt');
  expect([...general].slice(0, 3).map((dt) => dt.textContent)).toEqual(['?', label('Mod+Z'), label('Shift+Mod+Z')]);
  const lines = new Map(sections.flatMap((s) => [...s.querySelectorAll('dt')].map((dt) => [dt.nextElementSibling.textContent, dt.textContent])));
  for (const row of COMMANDS.filter((c) => (c.run || c.fixed) && (c.keys || c.shown) && c.group !== 'animation' && !c.hidden)) {
    expect(GROUPS, row.id).toContain(row.group);
    const words = row.label();
    expect(lines.has(words), row.id).toBe(true);
    if (!row.shown) for (const key of keysFor(row.keys)) expect(lines.get(words), row.id).toContain(label(key));
  }
  // A row with no key (the command list's alone: New project, Export .ans) has no line.
  const keyless = COMMANDS.filter((c) => c.run && !c.keys && !c.shown);
  expect(keyless.length).toBeGreaterThan(5);
  for (const row of keyless) expect(lines.has(row.label()), row.id).toBe(false);
  expect(lines.get(commandById('ui.commandList').label())).toBe(label(keysFor(commandById('ui.commandList').keys)[0]));
  // A hidden row (Alt+← and Alt+→ outside Edit Mode, taken so the browser doesn't go Back) has no line.
  expect(lines.has(commandById('edit.altArrowsElsewhere').label())).toBe(false);
});

test('it has the ×, with focus starting on Done; on a phone it is the whole window, the list taking the room over Done', async () => {
  await createTestApp();
  const closed = vi.fn();
  app = createApp({ render: () => h(ShortcutsDialog, { onClose: closed }) }).use(getActivePinia()).use(i18n);
  app.mount(document.body.appendChild(document.createElement('div')));
  await nextTick();
  const dialog = document.querySelector('dialog.modal-dialog');
  const done = [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Done');
  expect(document.activeElement).toBe(done);
  const box = dialog.getBoundingClientRect(); // the browser tests' window is a phone's
  expect([box.left, box.top, box.width, box.height]).toEqual([0, 0, innerWidth, innerHeight]);
  const list = dialog.querySelector('div.groups');
  expect(list.scrollHeight).toBeGreaterThan(list.clientHeight); // it scrolls, in the room there is
  expect(Math.round(innerHeight - done.getBoundingClientRect().bottom)).toBe(18); // Done at the bottom
  expect(Math.round(done.getBoundingClientRect().top - list.getBoundingClientRect().bottom)).toBe(16);
  dialog.querySelector(':scope > .head > button.close').click();
  expect(closed).toHaveBeenCalledOnce();
});
