// Rooms in the desktop app, end to end: two or three real apps on this computer, each with its own room service on
// its own port, joining each other by address (127.0.0.1:<port>) with no server anywhere.
import { test, expect, launchApp, closeAll, hostRoom, joinRoom, letIn, live, role, inRoom, drawing, WAITING } from './desktop-support.js';
import { autosaved, chars, editAt, settled, store, tab } from './support.js';
import { chat, fromMenu, mayDraw } from './social-support.js';

let apps = [];
test.afterEach(async () => {
  await closeAll(apps);
  apps = [];
});
const launch = async (options) => {
  const launched = await launchApp(options);
  apps.push(launched);
  return launched;
};

const hostCells = (page) => store(page, 'project', (p) => p.cells.map((c) => c.char + c.fg.hex + c.bg.hex).join());
const roomCells = (page) => store(page, 'room', (r) => r.art?.cells.map((c) => c.char + c.fg.hex + c.bg.hex).join() ?? null);
const sameArt = async (watcher, host) => expect.poll(() => roomCells(watcher), { timeout: 10_000 }).toBe(await hostCells(host));
// Drawing again after a hand-over or the host's reload: mayDraw is so at once, but drawing stays paused until the
// host's room answers, and what's typed while paused changes nothing.
const drawsAgain = async (page) => {
  await mayDraw(page).toBe(true);
  await expect.poll(() => store(page, 'drawing', (d) => d.paused), { timeout: 20_000, intervals: [100] }).toBe(false);
};

// Types at a cell, and the run of typing ends.
async function typeAt(page, col, row, text) {
  await editAt(page, col, row);
  await page.keyboard.type(text);
  await page.keyboard.press('Escape');
}

async function makeHost(page, name) {
  await fromMenu(page, 'Make host', name);
  await page.getByRole('dialog', { name: `Make ${name} the host?` }).getByRole('button', { name: 'Make host' }).click();
}

test('join needs the host\'s yes, and nothing leaves the app', async () => {
  const ann = await launch({ name: 'ann', port: 31401 });
  const bob = await launch({ name: 'bob', port: 31402 });
  const urls = [];
  for (const { page } of [ann, bob]) page.on('request', (r) => urls.push(r.url()));
  const { address } = await hostRoom(ann);
  expect(address).toBe('127.0.0.1:31401');

  await joinRoom(bob, address);
  await expect(bob.page.getByText(WAITING)).toBeVisible();
  expect(await store(bob.page, 'room', (r) => r.art)).toBe(null);
  await letIn(ann.page, 'bob');
  await sameArt(bob.page, ann.page);
  await expect(chat(bob.page).getByRole('heading', { name: 'night shift' })).toBeVisible();
  await chat(bob.page).getByRole('textbox', { name: 'Message' }).fill('hello from bob');
  await chat(bob.page).getByRole('textbox', { name: 'Message' }).press('Enter');
  await expect(chat(ann.page).getByText('hello from bob')).toBeVisible();

  expect(urls.length).toBeGreaterThan(0);
  expect(urls.filter((u) => /^https?:/.test(u))).toEqual([]);
});

test('turn away tells the guest', async () => {
  const ann = await launch({ name: 'ann', port: 31401 });
  const bob = await launch({ name: 'bob', port: 31402 });
  const { address } = await hostRoom(ann);
  await joinRoom(bob, address);
  await expect(bob.page.getByText(WAITING)).toBeVisible();
  await ann.page.getByRole('button', { name: 'Turn bob away' }).first().click();
  await expect(bob.page.getByText('The host didn\'t let you in.').first()).toBeVisible();
  expect(await role(bob.page)).toBe(null);
});

test('removed, a guest has to ask again', async () => {
  const ann = await launch({ name: 'ann', port: 31401 });
  const bob = await launch({ name: 'bob', port: 31402 });
  const { address } = await hostRoom(ann);
  await inRoom(ann, bob, address);
  await fromMenu(ann.page, 'Remove from room', 'bob');
  await expect(bob.page.getByText('The host removed you').first()).toBeVisible();
  expect(await role(bob.page)).toBe(null);
  await joinRoom(bob, address);
  await expect(bob.page.getByText(WAITING)).toBeVisible();
  await expect(ann.page.getByRole('button', { name: 'Let bob in' }).first()).toBeVisible();
});

test('a room with a password asks for it, and again after a wrong one', async () => {
  const ann = await launch({ name: 'ann', port: 31401 });
  const bob = await launch({ name: 'bob', port: 31402 });
  const { address } = await hostRoom(ann, { password: 'tide' });
  await joinRoom(bob, address, { password: 'reef' });
  await expect(bob.page.getByText('Wrong password').first()).toBeVisible();
  expect(await role(bob.page)).toBe(null);
  await bob.page.getByRole('textbox', { name: 'Password' }).fill('tide');
  await bob.page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(bob.page.getByText(WAITING)).toBeVisible();
  await letIn(ann.page, 'bob');
  await sameArt(bob.page, ann.page);
});

test('drawing together: the host invites, the artist types, and the host sees it', async () => {
  const ann = await launch({ name: 'ann', port: 31401 });
  const bob = await launch({ name: 'bob', port: 31402 });
  const { address } = await hostRoom(ann);
  await inRoom(ann, bob, address);
  await drawing(ann, bob);
  await typeAt(bob.page, 3, 2, 'Z');
  await expect.poll(() => chars(ann.page, 2, 3, 3), { timeout: 10_000 }).toBe('Z');
});

test('a planned hand-over: ann makes bob host, cat follows bob to his address, and her art matches his', async () => {
  const ann = await launch({ name: 'ann', port: 31401 });
  const bob = await launch({ name: 'bob', port: 31402 });
  const cat = await launch({ name: 'cat', port: 31403 });
  const { address } = await hostRoom(ann);
  await inRoom(ann, bob, address);
  await inRoom(ann, cat, address);
  await drawing(ann, bob);
  await typeAt(bob.page, 3, 2, 'b');
  await expect.poll(() => chars(ann.page, 2, 3, 3), { timeout: 10_000 }).toBe('b');

  await makeHost(ann.page, 'bob');
  await expect.poll(() => role(bob.page), { timeout: 20_000 }).toBe('host');
  expect(await store(bob.page, 'room', (r) => r.addresses)).toEqual(['127.0.0.1:31422']);   // his standby's, 20 above his remembered port
  await expect.poll(() => role(ann.page)).toBe('watch');
  await expect.poll(() => store(cat.page, 'room', (r) => r._address), { timeout: 20_000 }).toBe('127.0.0.1:31422');
  await live(cat.page);
  await sameArt(cat.page, bob.page);

  await tab(bob.page, 'ANSI').click();
  await typeAt(bob.page, 5, 3, 'c');
  await sameArt(cat.page, bob.page);
  await drawsAgain(ann.page);
  await typeAt(ann.page, 7, 4, 'a');   // the old host draws on as an artist
  await expect.poll(() => chars(bob.page, 4, 7, 7), { timeout: 10_000 }).toBe('a');
  await sameArt(cat.page, bob.page);

  // And back: ann's own service stood by while she drew, so bob can hand it to her, and cat follows.
  await expect.poll(() => store(bob.page, 'room', (r) => Object.keys(r.hostable).length), { timeout: 10_000 }).toBe(1);
  await makeHost(bob.page, 'ann');
  await expect.poll(() => role(ann.page), { timeout: 20_000 }).toBe('host');
  await expect.poll(() => store(cat.page, 'room', (r) => r._address), { timeout: 20_000 }).toBe('127.0.0.1:31401');
  await live(cat.page);
  await drawsAgain(bob.page);
  await typeAt(bob.page, 9, 5, 'd');
  await expect.poll(() => chars(ann.page, 5, 9, 9), { timeout: 10_000 }).toBe('d');
  await sameArt(cat.page, ann.page);
});

test('the host vanishing ends the room for the people in it', async () => {
  const RETURN_WITHIN_MS = 3000;
  const ann = await launch({ name: 'ann', port: 31401 });
  const cat = await launch({ name: 'cat', port: 31403, env: { PHOSPHOR_RETURN_WITHIN_MS: String(RETURN_WITHIN_MS) } });
  const { address } = await hostRoom(ann);
  await inRoom(ann, cat, address);
  await ann.kill();
  await expect(cat.page.getByText('The host went away. You can try joining again later.').first()).toBeVisible({ timeout: RETURN_WITHIN_MS + 5000 });
  expect(await role(cat.page)).toBe(null);
});

test('the host\'s reload keeps the room: the artist stays in and draws on, and a join waiting is asked again', async () => {
  const ann = await launch({ name: 'ann', port: 31401 });
  const bob = await launch({ name: 'bob', port: 31402 });
  const cat = await launch({ name: 'cat', port: 31403 });
  const { address } = await hostRoom(ann);
  await inRoom(ann, bob, address);
  await drawing(ann, bob);
  await joinRoom(cat, address);
  await expect(cat.page.getByText(WAITING)).toBeVisible();
  await expect(ann.page.getByRole('button', { name: 'Let cat in' }).first()).toBeVisible();

  await autosaved(ann.page, { changed: true });   // a reload before autosave has Layer 1 (hostRoom's) comes back without it
  await ann.page.reload();
  await live(ann.page);
  expect(await role(ann.page)).toBe('host');
  await letIn(ann.page, 'cat');
  await sameArt(cat.page, ann.page);
  await settled(ann.page);
  await tab(ann.page, 'ANSI').click();
  await typeAt(ann.page, 4, 4, 'R');
  expect(await role(bob.page)).toBe('watch');
  await expect.poll(() => chars(bob.page, 4, 4, 4), { timeout: 10_000 }).toBe('R');
  await drawsAgain(bob.page);
  await typeAt(bob.page, 6, 4, 'S');
  await expect.poll(() => chars(ann.page, 4, 6, 6), { timeout: 10_000 }).toBe('S');
  await sameArt(cat.page, ann.page);
});

test('quitting as host hands the room to an artist', async () => {
  const ann = await launch({ name: 'ann', port: 31401 });
  const bob = await launch({ name: 'bob', port: 31402 });
  const { address } = await hostRoom(ann);
  await inRoom(ann, bob, address);
  await drawing(ann, bob);
  await expect.poll(() => store(ann.page, 'room', (r) => Object.keys(r.hostable).length), { timeout: 10_000 }).toBe(1);

  const exited = new Promise((resolve) => ann.app.process().once('exit', resolve));
  await ann.app.evaluate(({ app }) => app.quit());
  await exited;
  await expect.poll(() => role(bob.page), { timeout: 20_000 }).toBe('host');
  await live(bob.page);
  expect(await store(bob.page, 'room', (r) => r.addresses)).toEqual(['127.0.0.1:31422']);   // his standby's, 20 above his remembered port
});

test('quitting as host with no artist to hand to ends the room', async () => {
  const ann = await launch({ name: 'ann', port: 31401 });
  const bob = await launch({ name: 'bob', port: 31402 });
  const { address } = await hostRoom(ann);
  await inRoom(ann, bob, address);
  const exited = new Promise((resolve) => ann.app.process().once('exit', resolve));
  await ann.app.evaluate(({ app }) => app.quit());
  await exited;
  await expect(bob.page.getByText('The host ended the room').first()).toBeVisible();
  expect(await role(bob.page)).toBe(null);
});
