// The desktop end-to-end flows' helpers: the app as built by `npm run build:desktop`, launched in Electron from
// desktop/main.js. Each instance gets its own user data folder (so several can run at once) and lists only
// 127.0.0.1 as its address.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron } from 'playwright';
import { test, expect } from '@playwright/test';
import { fixture, imageInput, tab, settled, store } from './support.js';
import { openLobby } from './social-support.js';
export { test, expect };

// A launched app: { app, page, name, port, close }, close also removing its user data folder. Anything the page's
// Content-Security-Policy refuses is kept in `refused`, for the spec to check. `env` adds to the app's environment
// (PHOSPHOR_RETURN_WITHIN_MS, say), and `files` are named on its command line, as a file double-clicked is.
// The Leave/Stay question main.js asks before a reload or quit the page would ask about is answered Leave, so a host's
// reload or an app closed with unsaved art goes ahead; a spec that wants the question stands in for it again.
export async function launchApp({ name = 'ann', port = 31401, env = {}, files = [] } = {}) {
  const userData = mkdtempSync(join(tmpdir(), `phosphor-${name}-`));
  const app = await _electron.launch({
    args: ['desktop/main.js', ...files],
    env: { ...process.env, PHOSPHOR_USER_DATA: userData, PHOSPHOR_ADDRESSES: '127.0.0.1', ...env },
  });
  await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 0; });
  const page = await app.firstWindow();
  const refused = [];
  page.on('console', (m) => { if (m.text().includes('Content Security Policy')) refused.push(m.text()); });
  await page.waitForLoadState('domcontentloaded');
  // Its port as the one it last hosted on: Start a room offers it, and drawing in someone's room stands by on it.
  await page.evaluate((port) => localStorage.setItem('phosphor-desktop-port', String(port)), port);
  let closed = false;
  const close = async () => {
    if (!closed) await app.close();
    closed = true;
    rmSync(userData, { recursive: true, force: true });
  };
  // The app's process gone, as a crash or a pulled plug would: nothing of it is asked first.
  const kill = () => {
    closed = true;
    const exited = new Promise((resolve) => app.process().once('exit', resolve));
    app.process().kill('SIGKILL');
    return exited;
  };
  return { app, page, name, port, refused, close, kill };
}

// The app's menu bar: its menus' labels, and an item clicked by its labels down the menus (File, Save).
export const menuLabels = (app) => app.evaluate(({ Menu }) => Menu.getApplicationMenu()?.items.map((item) => item.label) ?? []);
export const clickMenu = (app, ...labels) => app.evaluate(({ Menu }, labels) => {
  let items = Menu.getApplicationMenu().items, item;
  for (const label of labels) {
    item = items.find((each) => each.label === label);
    if (!item) throw new Error(`No menu item ${labels.join(' > ')}`);
    items = item.submenu?.items ?? [];
  }
  item.click();
}, labels);

// Closes every app given (those that are set), each whatever the others do.
export const closeAll = (apps) => Promise.all(apps.filter(Boolean).map((a) => a.close().catch(() => {})));

// The image open on the ANSI tab.
export async function openImage(page, image = 'images/gradient.png') {
  await imageInput(page).setInputFiles(fixture(image));
  await tab(page, 'ANSI').click();
  await settled(page);
}

// The Social tab out of a room, with your name typed in.
async function startPage({ page, name }) {
  await openLobby(page);
  await page.getByRole('textbox', { name: 'Your name' }).fill(name);
}

// The launched app hosting a room on its own port through Start a room, with an image open; its address.
export async function hostRoom(launched, { roomName = 'night shift', password = '' } = {}) {
  const { page, port } = launched;
  await openImage(page);
  await startPage(launched);
  await page.getByRole('button', { name: 'Start a room' }).click();
  await page.getByRole('textbox', { name: 'Room name' }).fill(roomName);
  if (password) await page.getByRole('textbox', { name: 'Password' }).fill(password);
  await page.getByRole('spinbutton', { name: 'Port' }).fill(String(port));
  await page.getByRole('button', { name: 'Go live' }).click();
  await live(page);
  return { address: `127.0.0.1:${port}` };
}

// The launched app asking to join the room at `address`, by Join on the Social tab.
export async function joinRoom(launched, address, { password } = {}) {
  const { page } = launched;
  await startPage(launched);
  await page.getByRole('textbox', { name: 'Address' }).fill(address);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  if (password !== undefined) {
    await page.getByRole('textbox', { name: 'Password' }).fill(password);
    await page.getByRole('button', { name: 'Join', exact: true }).click();
  }
}

// The host lets `name` in, from the chat panel's asks.
export const letIn = (host, name) => host.getByRole('button', { name: `Let ${name} in` }).first().click();

export const live = (page) => expect.poll(() => store(page, 'room', (r) => r.status), { timeout: 20_000, intervals: [100] }).toBe('live');
export const role = (page) => store(page, 'room', (r) => r.role);
