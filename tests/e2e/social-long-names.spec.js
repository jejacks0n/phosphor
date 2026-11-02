// The longest username there is (24 characters, of the widest letter) as host, artist and watcher: every place a
// name shows keeps it inside its box, and nothing around it is pushed off.
import { test, expect, tab, store } from './support.js';
import { fakeRoom, member, ROOM_ID, goLive, watcherPage, joinFromCard, shown, chat, rowOf, artistPage } from './social-support.js';

const longName = (letter, id) => member({ id, username: letter.repeat(24), name: letter.repeat(24), email: `${letter}@example.com` });
const HOST = longName('w', 'u_1'), ARTIST = longName('m', 'u_2'), WATCHER = longName('o', 'u_3');

// Boxes that have been made wider than the view, or wider than what holds them, by what's in them.
const overflows = (page, selector) => page.locator(selector).evaluateAll((els) => els.flatMap((el) => {
  const box = el.getBoundingClientRect();
  const out = el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === 'visible';
  return box.right > innerWidth + 1 || out ? [`${el.className}: ${Math.round(box.right)} of ${innerWidth}, ${el.scrollWidth} in ${el.clientWidth}`] : [];
}));

test('a 24-character name stays in its place in the lobby, the chat, who\'s here, the cursors and Account', async ({ page: host, context }, info) => {
  const room = fakeRoom();
  const snap = async (page, name) => page.screenshot({ path: info.outputPath(`${name}.png`) });
  await goLive(host, room, { me: HOST });
  await chat(host).getByRole('textbox', { name: 'Message' }).fill('hello');
  await chat(host).getByRole('textbox', { name: 'Message' }).press('Enter');

  const rooms = [{ id: ROOM_ID, name: 'neon harbor', host: HOST.name, count: 0, max: 12, allowGuests: true, signal: null, liveSince: Date.now(), thumbnail: null, blockedInside: false }];
  const watcher = await watcherPage(context, room, { me: WATCHER, rooms });
  await watcher.goto('/');
  await tab(watcher, 'SOCIAL').click();
  await expect(shown(watcher, 'lobby').getByRole('article').filter({ hasText: 'neon harbor' })).toBeVisible();
  await snap(watcher, 'lobby');
  expect(await overflows(watcher, '.people-tab [data-page="lobby"] *')).toEqual([]);
  await watcher.getByRole('button', { name: 'Edit account' }).click();
  await expect(shown(watcher, 'account')).toBeVisible();
  await snap(watcher, 'account');
  expect(await overflows(watcher, '.people-tab *')).toEqual([]);
  await store(watcher, 'social', (s) => { s.page = 'lobby'; });
  await joinFromCard(watcher);
  await chat(watcher).getByRole('textbox', { name: 'Message' }).fill('here too');
  await chat(watcher).getByRole('textbox', { name: 'Message' }).press('Enter');
  await expect(chat(host).getByText('here too')).toBeVisible();
  await snap(watcher, 'watching');
  expect(await overflows(watcher, '.people-tab *, aside *')).toEqual([]);

  const artist = await artistPage(context, host, room, { me: ARTIST });
  await expect(rowOf(host, ARTIST.name)).toBeVisible();
  await tab(host, 'SOCIAL').click();
  await snap(host, 'hosting');
  expect(await overflows(host, '.people-tab *, aside *')).toEqual([]);

  await tab(artist, 'ANSI').click();
  await tab(host, 'ANSI').click();
  const canvas = await host.locator('.ansi-editor div.display').boundingBox();
  await host.mouse.move(canvas.x + canvas.width - 20, canvas.y + 40);
  await artist.mouse.move(canvas.x + 30, canvas.y + 40);
  await artist.mouse.move(canvas.x + 34, canvas.y + 44);
  await expect.poll(() => store(host, 'drawing', (d) => Object.keys(d.cursors).length)).toBeGreaterThan(0);
  await artist.waitForTimeout(400);
  await snap(artist, 'artist-canvas');
  await snap(host, 'host-canvas');
  // The name by a cursor near the art's right edge is all there, and the host's name and its cell share a line.
  const tag = await artist.locator('.artist-cursor .tag').boundingBox();
  const view = await artist.locator('.ansi-editor').boundingBox();
  expect(tag.x).toBeGreaterThanOrEqual(view.x);
  expect(tag.x + tag.width).toBeLessThanOrEqual(view.x + view.width);
  const hostLine = chat(artist).locator('p.host .person');
  expect((await hostLine.boundingBox()).height).toBeLessThan(24);

  await tab(artist, 'SOCIAL').click();
  await snap(artist, 'artist-social');
  expect(await overflows(artist, '.people-tab *, aside *')).toEqual([]);

});
