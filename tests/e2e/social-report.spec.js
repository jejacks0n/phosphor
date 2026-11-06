// Reporting people: Report on a message (for a confirmed member, on other people's messages) and in the
// host's N here ⋯, through one dialog with a reason; and reporting a room, under Exit or on its lobby card's ⋯.
// The report goes to the server on the reporter's own socket, with the messages as they came, signed by
// their senders; nothing answers it.
import { test, expect, store, tab } from './support.js';
import { fakeRoom, goLive, watcherPage, joinFromCard, member, shown, ROOM_ID } from './social-support.js';

const wren = member({ id: 'u_2', username: 'pixel_wren', name: 'pixel_wren' });

const panel = (page) => page.getByRole('complementary', { name: 'Chat' });
const messages = (page) => panel(page).getByRole('log').locator('.message');
const box = (page) => panel(page).getByRole('textbox', { name: 'Message' });
const dialog = (page, name) => page.getByRole('dialog', { name: `Report ${name}?` });
const reported = (page) => page.getByRole('status').filter({ hasText: 'Reported. Thank you.' });
const SUB = 'Moderators receive this message and a few preceding messages for context.';
// "Reported. Thank you." stays a few seconds, and on CI a click can take longer than that: the page's
// clock is held from just before Report until the checks are done (then page.clock.resume()). It pauses
// further ahead than a test can run: the time to pause at has to be still to come when the pause arrives.
async function holdTime(page) {
  const now = Date.now();
  await page.clock.install({ time: now });
  await page.clock.pauseAt(now + 5 * 60_000);
}

async function say(page, text) {
  await box(page).fill(text);
  await box(page).press('Enter');
}

// The host live, and a watcher who has joined as `me` (a guest if none); the watcher is the room's p_1.
async function inRoom(host, context, { me = wren } = {}) {
  const room = fakeRoom();
  await goLive(host, room);
  const watcher = await watcherPage(context, room, { me });
  await watcher.goto('/');
  await joinFromCard(watcher);
  return { room, watcher };
}

const sentReports = (room, who) => room.from(who).filter((m) => m.type === 'report');

test('a member reports the host\'s message: Cancel and Escape send nothing, with focus back on its Report; the reason is asked for, the report carries the message as it came, and "Reported" shows a while', async ({ page: host, context }) => {
  const { room, watcher } = await inRoom(host, context);
  await say(host, 'first');
  await say(watcher, 'between');
  await expect(messages(watcher)).toHaveCount(2);
  await say(host, 'you are all wrong');
  await expect(messages(watcher)).toHaveCount(3);

  const message = messages(watcher).nth(2);
  const report = message.getByRole('button', { name: 'Report message from ansi-fan' });
  for (const dismiss of [
    () => dialog(watcher, 'ansi-fan').getByRole('button', { name: 'Cancel' }).click(),
    () => watcher.keyboard.press('Escape'),
  ]) {
    await message.hover();
    await report.click();
    await dialog(watcher, 'ansi-fan').getByRole('radio', { name: 'Spam or flooding' }).check();
    await dismiss();
    await expect(dialog(watcher, 'ansi-fan')).toHaveCount(0);
    await expect(report).toBeFocused();
  }
  await expect(reported(watcher)).toHaveCount(0);
  expect(sentReports(room, 'p_1')).toHaveLength(0);

  await message.hover();
  await report.click();
  const asked = dialog(watcher, 'ansi-fan');
  await expect(asked).toBeVisible();
  await expect(asked.getByText(SUB, { exact: true })).toBeVisible();
  await expect(asked.getByRole('group', { name: 'What\'s wrong?' }).getByRole('radio')).toHaveCount(4);
  await expect(asked.getByRole('radio', { checked: true })).toHaveCount(0);   // no default
  await expect(asked.getByRole('button', { name: 'Report', exact: true })).toBeDisabled();
  await asked.getByRole('radio', { name: 'Harassment or hate' }).check();
  await holdTime(watcher);
  await asked.getByRole('button', { name: 'Report', exact: true }).click();

  await expect(asked).toHaveCount(0);
  await expect(reported(watcher)).toBeVisible();
  await expect.poll(() => sentReports(room, 'p_1')).toHaveLength(1);
  const [sent] = sentReports(room, 'p_1');
  const row = (await store(watcher, 'room', (r) => r.chat)).at(-1);
  expect(sent).toMatchObject({ type: 'report', sub: 'u_1', reason: 'harassment', message: row.id });
  expect(sent.messages.map((m) => m.text)).toEqual(['first', 'between', 'you are all wrong']);
  expect(sent.messages.at(-1)).toEqual({ pass: row.pass, id: row.id, ts: row.ts, text: 'you are all wrong', sig: row.sig });
  await watcher.clock.runFor(4000);
  await expect(reported(watcher)).toHaveCount(0);   // gone after a few seconds
  await watcher.clock.resume();
});

test('once you\'ve reported someone, Report is gone for them for the rest of the room, on their messages and in N here ⋯; other people keep theirs', async ({ page: host, context }) => {
  const { room, watcher } = await inRoom(host, context);
  const owl = await watcherPage(context, room, { me: member({ id: 'u_3', username: 'tin_owl', name: 'tin_owl' }) });
  await owl.goto('/');
  await joinFromCard(owl);
  await say(host, 'one');
  await expect(messages(owl)).toHaveCount(1);
  await say(owl, 'two');
  await expect(messages(watcher)).toHaveCount(2);
  await say(host, 'three');
  await say(watcher, 'four');
  for (const page of [host, watcher]) await expect(messages(page)).toHaveCount(4);
  const reportFrom = (page, name) => panel(page).getByRole('button', { name: `Report message from ${name}` });

  // The watcher reports the host's message: no Report on any of the host's, still one on tin_owl's.
  await expect(reportFrom(watcher, 'ansi-fan')).toHaveCount(2);
  await messages(watcher).first().hover();
  await reportFrom(watcher, 'ansi-fan').first().click();
  await dialog(watcher, 'ansi-fan').getByRole('radio', { name: 'Spam or flooding' }).check();
  await holdTime(watcher);
  await dialog(watcher, 'ansi-fan').getByRole('button', { name: 'Report', exact: true }).click();
  await expect(reported(watcher)).toBeVisible();
  await watcher.clock.resume();
  await expect(reportFrom(watcher, 'ansi-fan')).toHaveCount(0);
  await expect(reportFrom(watcher, 'tin_owl')).toHaveCount(1);
  await expect(panel(watcher).getByRole('log')).toBeFocused();

  // The host reports tin_owl from N here ⋯: gone from that ⋯ and tin_owl's message, still there for pixel_wren.
  await panel(host).getByRole('button', { name: /^\d+ here$/ }).click();
  const more = (name) => panel(host).getByRole('list', { name: 'Who is here' }).getByRole('button', { name: `More for ${name}` });
  await more('tin_owl').click();
  await host.getByRole('button', { name: 'Report', exact: true }).click();
  await expect(dialog(host, 'tin_owl').getByText(SUB, { exact: true })).toBeVisible();
  await dialog(host, 'tin_owl').getByRole('radio', { name: 'Spam or flooding' }).check();
  await holdTime(host);
  await dialog(host, 'tin_owl').getByRole('button', { name: 'Report', exact: true }).click();
  await expect(reported(host)).toBeVisible();
  await host.clock.resume();
  await expect.poll(() => sentReports(room, 'host')).toHaveLength(1);
  const [report] = sentReports(room, 'host');   // no message, and only their last messages
  expect(report).toMatchObject({ type: 'report', sub: 'u_3', reason: 'spam' });
  expect(report).not.toHaveProperty('message');
  expect(report.messages.map((m) => m.text)).toEqual(['two']);
  await expect(reportFrom(host, 'tin_owl')).toHaveCount(0);
  await expect(reportFrom(host, 'pixel_wren')).toHaveCount(1);
  await more('tin_owl').click();
  await expect(host.getByRole('button', { name: 'Block from your rooms' })).toBeVisible();
  await expect(host.getByRole('button', { name: 'Report', exact: true })).toHaveCount(0);
  await host.keyboard.press('Escape');
  await more('pixel_wren').click();
  await expect(host.getByRole('button', { name: 'Report', exact: true })).toBeVisible();

  expect(sentReports(room, 'p_1')).toHaveLength(1);
  expect(sentReports(room, 'host')).toHaveLength(1);
});

// Reporting the room itself.
const roomDialog = (page) => page.getByRole('dialog', { name: 'Report this room?' });

test('a member reports the room from under Exit: the fake hears report-room with a reason and a picture, and "Reported. Thank you." shows', async ({ page: host, context }) => {
  const { room, watcher } = await inRoom(host, context);
  const reportRoom = panel(watcher).getByRole('button', { name: 'Report room' });
  // Under Exit, its right edge with Exit's, in smaller words.
  const exit = await panel(watcher).getByRole('button', { name: 'Exit' }).boundingBox(), under = await reportRoom.boundingBox();
  expect(under.y).toBeGreaterThanOrEqual(exit.y + exit.height);
  expect(Math.abs(under.x + under.width - exit.x - exit.width)).toBeLessThan(2);
  expect(parseFloat(await reportRoom.evaluate((el) => getComputedStyle(el).fontSize))).toBeLessThan(11);
  await reportRoom.click();
  const asked = roomDialog(watcher);
  await asked.getByRole('button', { name: 'Cancel' }).click();   // nothing sent; focus back on Report room
  await expect(reportRoom).toBeFocused();
  await reportRoom.click();
  await expect(asked.getByText('Moderators receive recent lobby previews plus a snapshot of the canvas right now.', { exact: true })).toBeVisible();
  await expect(asked.getByRole('button', { name: 'Report', exact: true })).toBeDisabled();
  await asked.getByRole('radio', { name: 'Sexual or violent' }).check();
  await holdTime(watcher);
  await asked.getByRole('button', { name: 'Report', exact: true }).click();

  await expect(reported(watcher)).toBeVisible();
  await watcher.clock.resume();
  await expect.poll(() => room.from('p_1').filter((m) => m.type === 'report-room')).toHaveLength(1);
  const [report] = room.from('p_1').filter((m) => m.type === 'report-room');
  expect(report).toMatchObject({ type: 'report-room', reason: 'sexual', picture: expect.stringMatching(/^[A-Za-z0-9+/]+=*$/) });
  await expect(reportRoom).toHaveCount(0);
  await expect(panel(watcher).getByRole('button', { name: 'Exit' })).toBeVisible();
});

test('a member reports a room from its card\'s ⋯: the fake\'s lobby hears report-room; the card has no Report room after, a card that leaves the lobby right after its report doesn\'t take "Reported. Thank you." with it, and a guest\'s card has no ⋯', async ({ context }) => {
  const room = fakeRoom();
  const card = (page) => shown(page, 'lobby').getByRole('article').filter({ hasText: 'neon harbor' });
  const more = (page) => card(page).getByRole('button', { name: 'More for neon harbor' });

  const watcher = await watcherPage(context, room, { me: wren });
  await watcher.goto('/');
  await tab(watcher, 'SOCIAL').click();
  // The ⋯ sits in the picture's top right corner, see-through.
  const thumb = await card(watcher).locator('.thumb').boundingBox(), dots = await more(watcher).boundingBox();
  expect(dots.x + dots.width).toBeGreaterThan(thumb.x + thumb.width - 12);
  expect(dots.y).toBeLessThan(thumb.y + 12);
  expect(dots.y + dots.height).toBeLessThan(thumb.y + thumb.height);
  expect(await more(watcher).evaluate((el) => getComputedStyle(el).backgroundColor)).toMatch(/^rgba\(.*, 0\.\d+\)$/);
  await more(watcher).click();
  await watcher.getByRole('button', { name: 'Report room' }).click();
  const asked = roomDialog(watcher);
  await expect(asked.getByText("Moderators receive the room's recent lobby previews.", { exact: true })).toBeVisible();
  await asked.getByRole('radio', { name: 'Spam or flooding' }).check();
  await holdTime(watcher);
  await asked.getByRole('button', { name: 'Report', exact: true }).click();

  await expect(reported(watcher)).toBeVisible();
  await expect.poll(() => watcher.server.lobby.received.filter((m) => m.type === 'report-room')).toEqual([{ type: 'report-room', id: ROOM_ID, reason: 'spam' }]);
  await expect(more(watcher)).toHaveCount(0);   // its only item gone
  await expect(card(watcher).getByRole('button', { name: /^Join/ })).toBeFocused();   // the ⋯ gone, focus goes to Join

  // The card leaving the lobby right after doesn't take "Reported. Thank you." with it, and it goes in its own time.
  watcher.server.lobby.send({ type: 'room-gone', id: ROOM_ID });
  await expect(card(watcher)).toHaveCount(0);
  await expect(reported(watcher)).toBeVisible();
  await watcher.clock.runFor(4000);
  await expect(reported(watcher)).toHaveCount(0);
  await watcher.clock.resume();

  // A guest, an unconfirmed member and the room's own host (by name) have no ⋯ on it.
  for (const me of [null, member({ id: 'u_3', username: 'tin_owl', name: 'tin_owl', emailVerified: false }), member()]) {
    const page = await watcherPage(context, room, { me });
    await page.goto('/');
    await tab(page, 'SOCIAL').click();
    await expect(card(page).getByRole('button', { name: /^Join/ })).toBeVisible();
    await expect(more(page)).toHaveCount(0);
  }
});
