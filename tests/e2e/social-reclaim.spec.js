// A host whose tab closed goes back to the room from a new tab in the same browser: the lobby's card or a plain
// line offers it, or the question a link asks, and pressing it reloads the tab into the room as a host's reload would.
import { test, expect, tab, store, chars, editAt, settled, openApp, otherBrowser } from './support.js';
import { fakeRoom, fakeServer, member, ROOM_ID, shown, goLive, chat, live, joins, artistPage, asked, mayDraw as mayDrawOf, openLobby } from './social-support.js';

const BACK = 'Back to your room';
const AWAY = 'Your room closed while you were away.';
const REPLACES = 'Going back replaces your open art, which has unsaved changes.';
const LOOKS = 4500;   // long enough for two looks to have passed
const OFFERED = 15_000;   // how long an offer that's coming may take on a busy machine; a wait for one that isn't stays LOOKS

const listing = () => [{ id: ROOM_ID, name: 'neon harbor', host: 'ansi-fan', count: 0, max: 12, allowGuests: true, signal: null, liveSince: Date.now(), thumbnail: null, blockedInside: false }];
const card = (page) => shown(page, 'lobby').getByRole('article').filter({ hasText: 'neon harbor' });
const back = (page) => page.getByRole('button', { name: BACK });
const chatTab = (page) => page.locator('.side-panel').getByRole('tab', { name: 'Chat' });

// The same browser's next tab, signed in as `me`, on the lobby.
async function newTab(context, room, { me = member(), rooms = listing(), open = async (page) => { await page.goto('/'); } } = {}) {
  const page = await context.newPage();
  await fakeServer(page, { me, room, rooms });
  page.on('dialog', () => { throw new Error('Going back asked about leaving the page'); });
  await open(page);
  await openLobby(page);
  return page;
}

async function say(page, text) {
  const box = chat(page).getByRole('textbox', { name: 'Message' });
  await box.fill(text);
  await box.press('Enter');
  await expect(chat(page).getByRole('log').locator('.message')).toHaveCount(1);
}

// Long enough for the regular keep to have written what just changed.
const kept = (page) => page.waitForTimeout(1500);

// Pressed, and the tab has reloaded.
const press = (page, button) => Promise.all([page.waitForEvent('load'), button.click()]);

test('a closed tab\'s room: its card offers Back to your room in Join\'s place, and pressing it is a host\'s reload', async ({ page: host, context }) => {
  const room = fakeRoom();
  await goLive(host, room);
  await say(host, 'hello room');
  await kept(host);
  const art = await chars(host, 0, 0, 20);
  await host.close();

  const again = await newTab(context, room);
  await expect(back(again)).toBeVisible({ timeout: OFFERED });
  await expect(card(again).getByRole('button', { name: BACK })).toHaveClass(/primary/);
  await expect(card(again).getByRole('button', { name: /^Join/ })).toHaveCount(0);

  await press(again, back(again));
  await live(again);
  expect(await store(again, 'room', (r) => r.role)).toBe('host');
  expect(await chars(again, 0, 0, 20)).toBe(art);
  await expect(chatTab(again)).toHaveAttribute('aria-selected', 'true');   // in the room: the panel on its chat
  await expect(chat(again).getByRole('log').locator('.message').first()).toContainText('hello room');
  expect(joins(room)).toBe(0);
  await expect(back(again)).toHaveCount(0);
});

test('a host\'s reload doesn\'t flash the offer in another tab, and that tab offers it once the host has really gone', async ({ page: host, context }) => {
  const room = fakeRoom();
  await goLive(host, room);
  host.on('dialog', (dialog) => dialog.accept());
  const second = await newTab(context, room);
  await second.waitForTimeout(LOOKS);
  await host.reload();
  await live(host);
  await expect.poll(async () => {
    await second.waitForTimeout(200);
    return store(second, 'room', (r) => r.reclaimable.length);
  }).toBe(0);
  await second.waitForTimeout(LOOKS);
  await expect(back(second)).toHaveCount(0);
  await expect(back(host)).toHaveCount(0);

  await host.close();
  await expect(back(second)).toBeVisible({ timeout: OFFERED });
});

test('leaving the lobby and coming back looks again from the start: nothing from before counts', async ({ page: host, context }) => {
  const room = fakeRoom();
  await goLive(host, room);
  await kept(host);
  await host.close();
  const again = await newTab(context, room);
  await expect(back(again)).toBeVisible({ timeout: OFFERED });
  await again.locator('.side-panel').getByRole('tab', { name: 'Layers' }).click();
  await expect(shown(again, 'lobby')).toHaveCount(0);
  await openLobby(again);
  await again.waitForTimeout(800);
  await expect(back(again)).toHaveCount(0);
  await expect(back(again)).toBeVisible({ timeout: OFFERED });
});

test('a room that isn\'t listed is offered in a line at the top of the lobby', async ({ page: host, context }) => {
  const room = fakeRoom({ password: 'a good password' });
  await goLive(host, room, { password: 'a good password' });
  await kept(host);
  await host.close();

  const again = await newTab(context, room, { rooms: [] });
  await expect(back(again)).toBeVisible({ timeout: OFFERED });
  await expect(shown(again, 'lobby').getByText('Your room neon harbor is waiting for you.')).toBeVisible();
  await press(again, back(again));
  await live(again);
  expect(await store(again, 'room', (r) => [r.role, r.hasPassword])).toEqual(['host', true]);
  expect(room.from('host').filter((m) => m.type === 'host')).toHaveLength(2);
});

test('a link to your own room offers it as well as the question', async ({ page: host, context }) => {
  const room = fakeRoom();
  await goLive(host, room);
  await kept(host);
  await host.close();

  const again = await context.newPage();
  await fakeServer(again, { me: member(), room, rooms: [] });
  await again.goto(`/?room=${ROOM_ID}`);
  await expect(asked(again)).toBeVisible();
  await expect(asked(again).getByRole('button', { name: BACK })).toBeVisible({ timeout: OFFERED });
  await expect(asked(again).getByRole('button', { name: 'Join', exact: true })).toBeVisible();
  await press(again, asked(again).getByRole('button', { name: BACK }));
  await live(again);
  expect(await store(again, 'room', (r) => r.role)).toBe('host');
  await expect(asked(again)).toHaveCount(0);
  expect(joins(room)).toBe(0);
});

test('unsaved art in the new tab: it says it\'s replaced, on the card and as its Back to your room\'s description, and what was open stays in the browser\'s list', async ({ page: host, context }) => {
  const room = fakeRoom();
  await goLive(host, room);
  const art = await chars(host, 0, 0, 20);
  await kept(host);
  await host.close();

  const again = await newTab(context, room, { open: (page) => openApp(page, 'images/gradient.png') });
  const own = await store(again, 'project', (p) => p.documentId);
  await tab(again, 'ANSI').click();
  await editAt(again, 3, 3);
  await again.keyboard.type('m');
  await openLobby(again);
  await expect(card(again).getByText(REPLACES)).toBeVisible({ timeout: OFFERED });
  await expect(card(again).getByRole('button', { name: BACK })).toHaveAccessibleDescription(REPLACES, { timeout: OFFERED });
  await press(again, back(again));
  await live(again);
  expect(await store(again, 'project', (p) => p.documentId)).not.toBe(own);
  expect(await chars(again, 0, 0, 20)).toBe(art);
  const documents = await again.evaluate(() => new Promise((resolve) => {
    const open = indexedDB.open('phosphor-autosave', 1);
    open.onsuccess = () => {
      const all = open.result.transaction('documents').objectStore('documents').getAllKeys();
      all.onsuccess = () => { open.result.close(); resolve(all.result); };
    };
  }));
  expect(documents).toContain(own);
});

test('pressed once the room is over: it says so, and it isn\'t offered again', async ({ page: host, context }) => {
  const room = fakeRoom({ hostWaitMs: 500 });
  await goLive(host, room);
  await kept(host);
  await host.close();
  const again = await newTab(context, room);
  await expect(back(again)).toBeVisible({ timeout: OFFERED });
  await press(again, back(again));
  await expect(again.locator('.app-toast')).toHaveText(AWAY);   // a toast, and the lobby's notice
  await openLobby(again);
  await expect(shown(again, 'lobby').getByRole('button', { name: /^Join/ })).toBeVisible();
  await expect(shown(again, 'lobby').locator('p.notice')).toContainText(AWAY);
  expect(await store(again, 'room', (r) => r.role)).toBe(null);
  await again.waitForTimeout(LOOKS);
  await expect(back(again)).toHaveCount(0);
});

test('pressed after the role moved: back in as an artist, with the existing words', async ({ page: host, context, browser }) => {
  const room = fakeRoom({ hostWaitMs: 2000 });
  await goLive(host, room);
  const artist = await artistPage(await otherBrowser(browser), host, room);   // their own browser
  await kept(host);
  await host.close();

  const again = await newTab(context, room);
  await expect(back(again)).toBeVisible({ timeout: OFFERED });
  await expect.poll(() => store(artist, 'room', (r) => r.role), { timeout: 10_000 }).toBe('host');
  await press(again, back(again));
  await expect.poll(() => store(again, 'room', (r) => r.role), { timeout: 10_000 }).toBe('watch');
  await expect(chatTab(again)).toHaveAttribute('aria-selected', 'true');
  await expect(chat(again).getByText('is now the host. What you had open is saved')).toBeVisible();
  await mayDrawOf(again).toBe(true);
});

test('with an artist in the room, they wait and then draw on with the host back', async ({ page: host, context, browser }) => {
  const room = fakeRoom();
  await goLive(host, room);
  const artist = await artistPage(await otherBrowser(browser), host, room);   // their own browser
  await kept(host);
  await host.close();
  await expect.poll(() => store(artist, 'drawing', (d) => d.paused)).toBe(true);

  const again = await newTab(context, room);
  await expect(back(again)).toBeVisible({ timeout: OFFERED });
  await press(again, back(again));
  await live(again);
  await expect.poll(() => store(artist, 'drawing', (d) => d.paused), { timeout: 15_000 }).toBe(false);
  await settled(again);
  expect(await store(again, 'drawing', (d) => d.artists.length)).toBe(1);
  expect(await store(artist, 'room', (r) => r.role)).toBe('watch');
});

test.describe(() => {
  test.use({ consented: false });
  test('a closed tab\'s old copy goes from the disk when the app next starts, before anything from SOCIAL', async ({ page }) => {
    await page.goto('/');
    const rows = (fill) => page.evaluate((fill) => new Promise((resolve, reject) => {
      const open = indexedDB.open('phosphor-host-records', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('rooms', { keyPath: 'id' });
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const tx = open.result.transaction('rooms', 'readwrite'), rooms = tx.objectStore('rooms');
        if (fill) rooms.put({ id: 'old', sub: 'u_1', at: 0, record: '{}' });
        const all = rooms.getAllKeys();
        tx.oncomplete = () => { open.result.close(); resolve(all.result); };
      };
    }), fill);
    expect(await rows(true)).toEqual(['old']);
    await page.reload();
    await expect.poll(() => rows(false)).toEqual([]);
  });
});
