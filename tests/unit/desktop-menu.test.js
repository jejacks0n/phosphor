// The desktop app's menu bar (desktop/menu.js): its items in the page's words, what's enabled for what the page can do,
// the commands each sends, Open Recent, the links, and what's only on macOS or only unpackaged.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { REPO, issueUrl, menuTemplate } from '../../desktop/menu.js';

const labels = new Proxy({}, { get: (_target, key) => `<${String(key)}>` });   // every label its own key
const IDLE = { hasImage: false, canChange: true, inRoom: false, hosting: false };
const SYSTEM = { version: '1.2.3-beta', platform: 'darwin', systemVersion: '15.1', arch: 'arm64' };

function menu({ state = IDLE, recent = [], mac = true, packaged = true } = {}) {
  const calls = [];
  const act = {
    command: (name) => calls.push(['command', name]),
    newWindow: () => calls.push(['newWindow']),
    openRecent: (file) => calls.push(['openRecent', file]),
    clearRecent: () => calls.push(['clearRecent']),
    openUrl: (url) => calls.push(['openUrl', url]),
  };
  return { template: menuTemplate({ labels, state, recent, act, mac, packaged, ...SYSTEM }), calls };
}
const top = (template, label) => template.find((m) => m.label === label);
const item = (template, menuLabel, label) => top(template, menuLabel).submenu.find((i) => i.label === label);

test('the menus, in the page’s words: the app menu only on macOS, where About and updates move to Help elsewhere', () => {
  const mac = menu().template;
  assert.deepEqual(mac.map((m) => m.label), ['Phosphor', '<file>', '<edit>', '<room>', '<view>', '<window>', '<help>']);
  assert.ok(item(mac, 'Phosphor', '<about>') && item(mac, 'Phosphor', '<checkUpdates>'));
  assert.deepEqual(top(mac, 'Phosphor').submenu.slice(0, 3).map((i) => i.label), ['<about>', '<checkUpdates>', '<plugins>']);
  assert.equal(item(mac, '<help>', '<about>'), undefined);
  assert.equal(item(mac, '<help>', '<plugins>'), undefined);
  assert.equal(item(mac, '<file>', '<quit>'), undefined);

  const other = menu({ mac: false }).template;
  assert.deepEqual(other.map((m) => m.label), ['<file>', '<edit>', '<room>', '<view>', '<help>']);
  assert.ok(item(other, '<help>', '<about>') && item(other, '<help>', '<checkUpdates>'));
  const help = top(other, '<help>').submenu.map((i) => i.label);
  assert.equal(help.indexOf('<plugins>'), help.indexOf('<checkUpdates>') + 1);
  assert.equal(item(other, '<file>', '<quit>').role, 'quit');
});

test('each app action sends its command, with the shortcuts the page also answers', () => {
  const { template, calls } = menu({ state: { hasImage: true, canChange: true, inRoom: false, hosting: false } });
  const expected = [
    ['<file>', '<new>', 'new', 'CmdOrCtrl+N'], ['<file>', '<open>', 'open', 'CmdOrCtrl+O'], ['<file>', '<save>', 'save', 'CmdOrCtrl+S'],
    ['<file>', '<saveAs>', 'saveAs', 'CmdOrCtrl+Shift+S'], ['<file>', '<export>', 'export', 'CmdOrCtrl+E'], ['<file>', '<versions>', 'versions', undefined],
    ['<edit>', '<undo>', 'undo', 'CmdOrCtrl+Z'], ['<edit>', '<redo>', 'redo', 'CmdOrCtrl+Shift+Z'],
    ['<room>', '<hostRoom>', 'hostRoom', undefined], ['<room>', '<joinRoom>', 'joinRoom', undefined],
    ['<help>', '<shortcuts>', 'shortcuts', undefined], ['Phosphor', '<about>', 'about', undefined], ['Phosphor', '<checkUpdates>', 'checkUpdates', undefined],
    ['Phosphor', '<plugins>', 'plugins', undefined],
  ];
  for (const [menuLabel, label, name, accelerator] of expected) {
    const found = item(template, menuLabel, label);
    assert.equal(found.accelerator, accelerator, label);
    found.click();
    assert.deepEqual(calls.pop(), ['command', name]);
  }
  // Cut, copy, paste and select all are the system's, so text fields have them on macOS.
  assert.deepEqual(top(template, '<edit>').submenu.filter((i) => i.role).map((i) => i.role), ['cut', 'copy', 'paste', 'selectAll']);
});

test('File > New Window comes second, with its shortcut, on even with no drawing, and opens a window', () => {
  const { template, calls } = menu();
  const newWindow = top(template, '<file>').submenu[1];
  assert.equal(newWindow.label, '<newWindow>');
  assert.equal(newWindow.accelerator, 'CmdOrCtrl+Shift+N');
  assert.notEqual(newWindow.enabled, false);
  newWindow.click();
  assert.deepEqual(calls, [['newWindow']]);
});

test('what needs a drawing, a free document or a room is off without one', () => {
  const off = (template, menuLabel, label) => item(template, menuLabel, label).enabled === false;
  let { template } = menu();
  for (const label of ['<new>', '<save>', '<saveAs>', '<export>', '<versions>']) assert.ok(off(template, '<file>', label), label);
  assert.ok(!off(template, '<file>', '<open>'));
  assert.ok(off(template, '<room>', '<copyAddress>') && off(template, '<room>', '<leaveRoom>'));

  ({ template } = menu({ state: { hasImage: true, canChange: false, inRoom: true, hosting: false } }));   // drawing in someone's room
  assert.ok(off(template, '<file>', '<new>') && off(template, '<file>', '<versions>') && !off(template, '<file>', '<save>'));
  assert.ok(off(template, '<room>', '<hostRoom>') && off(template, '<room>', '<joinRoom>') && off(template, '<room>', '<copyAddress>'));
  assert.ok(!off(template, '<room>', '<leaveRoom>'));

  ({ template } = menu({ state: { hasImage: true, canChange: true, inRoom: true, hosting: true } }));
  assert.ok(!off(template, '<room>', '<copyAddress>'));
  assert.equal(item(template, '<room>', '<leaveRoom>'), undefined);   // a host ends it
  assert.ok(!off(template, '<room>', '<endRoom>'));
});

test('Open Recent lists the files by name, newest first, and clears; empty, it says so', () => {
  const { template, calls } = menu({ recent: ['/art/one.phosphor', 'C:\\art\\two.ans'] });
  const recent = item(template, '<file>', '<openRecent>').submenu;
  assert.deepEqual(recent.map((i) => i.label ?? i.type), ['one.phosphor', 'two.ans', 'separator', '<clearRecent>']);
  recent[1].click();
  recent[3].click();
  assert.deepEqual(calls, [['openRecent', 'C:\\art\\two.ans'], ['clearRecent']]);

  const empty = item(menu().template, '<file>', '<openRecent>').submenu;
  assert.deepEqual(empty, [{ label: '<noRecent>', enabled: false }]);
});

test('Help links GitHub, this version’s release notes and a new issue naming the version and system', () => {
  const { template, calls } = menu();
  for (const label of ['<github>', '<releaseNotes>', '<reportIssue>']) item(template, '<help>', label).click();
  assert.deepEqual(calls.map(([, url]) => url), [REPO, `${REPO}/releases/tag/v1.2.3-beta`, issueUrl(SYSTEM)]);
  const body = new URL(issueUrl(SYSTEM)).searchParams.get('body');
  assert.match(body, /Phosphor 1\.2\.3-beta, macOS 15\.1 \(arm64\)$/);
  assert.match(new URL(issueUrl({ ...SYSTEM, platform: 'win32', systemVersion: '10.0.22631', arch: 'x64' })).searchParams.get('body'), /Windows 10\.0\.22631 \(x64\)$/);
});

test('the developer tools and a reload with plugins off are under Help > Troubleshooting; reload only unpackaged', () => {
  const { template: packaged, calls } = menu();
  const [devTools, pluginsOff, ...rest] = item(packaged, '<help>', '<troubleshooting>').submenu;
  assert.deepEqual(devTools, { role: 'toggleDevTools', label: '<devTools>' });
  assert.equal(pluginsOff.label, '<startPluginsOff>');
  assert.deepEqual(rest, []);
  pluginsOff.click();
  assert.deepEqual(calls.pop(), ['command', 'pluginsOff']);
  assert.ok(!top(packaged, '<view>').submenu.some((i) => i.role === 'reload'));
  assert.ok(top(menu({ packaged: false }).template, '<view>').submenu.some((i) => i.role === 'reload'));
});
