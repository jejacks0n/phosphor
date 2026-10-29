// Reporting people: Report on a message (for a confirmed member, on other people's messages) and in the
// host's N here ⋯, through one dialog with a reason; and reporting a room, under Exit or on its lobby card's ⋯.
// The report goes to the server on the reporter's own socket, with the messages as they came, signed by
// their senders; nothing answers it. A 'silenced' from the server makes the host drop that person's chat.
import { test, expect, store, tab } from './support.js';
import { fakeRoom, goLive, watcherPage, joinFromCard, member, shown, ROOM_ID } from './social-support.js';

const wren = member({ id: 'u_2', username: 'pixel_wren', name: 'pixel_wren' });

const panel = (page) => page.getByRole('complementary', { name: 'Chat' });
const messages = (page) => panel(page).getByRole('log').locator('.message');
const box = (page) => panel(page).getByRole('textbox', { name: 'Message' });
const reportsIn = (page) => panel(page).getByRole('button', { name: /^Report/ });
const dialog = (page, name) => page.getByRole('dialog', { name: `Report ${name}?` });
const reported = (page) => page.getByRole('status').filter({ hasText: 'Reported. Thank you.' });
const SUB = 'Phosphor\'s moderators see this message and the few before it.';

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

test('a member reports the host\'s message: the reason is asked for, the report carries the message as it came, and "Reported" shows a while', async ({ page: host, context }) => {
  const { room, watcher } = await inRoom(host, context);
  await say(host, 'first');
  await say(watcher, 'between');
  await expect(messages(watcher)).toHaveCount(2);
  await say(host, 'you are all wrong');
  await expect(messages(watcher)).toHaveCount(3);

  const message = messages(watcher).nth(2);
  await message.hover();
  await message.getByRole('button', { name: 'Report message from ansi-fan' }).click();
  const asked = dialog(watcher, 'ansi-fan');
  await expect(asked).toBeVisible();
  await expect(asked.getByText(SUB, { exact: true })).toBeVisible();
  await expect(asked.getByRole('group', { name: 'What\'s wrong?' }).getByRole('radio')).toHaveCount(4);
  await expect(asked.getByRole('radio', { checked: true })).toHaveCount(0);   // no default
  await expect(asked.getByRole('button', { name: 'Report', exact: true })).toBeDisabled();
  await asked.getByRole('radio', { name: 'Harassment or hate' }).check();
  await asked.getByRole('button', { name: 'Report', exact: true }).click();

  await expect(asked).toHaveCount(0);
  await expect(reported(watcher)).toBeVisible();
  await expect.poll(() => sentReports(room, 'p_1')).toHaveLength(1);
  const [report] = sentReports(room, 'p_1');
  const row = (await store(watcher, 'room', (r) => r.chat)).at(-1);
  expect(report).toMatchObject({ type: 'report', sub: 'u_1', reason: 'harassment', message: row.id });
  expect(report.messages.map((m) => m.text)).toEqual(['first', 'between', 'you are all wrong']);
  expect(report.messages.at(-1)).toEqual({ pass: row.pass, id: row.id, ts: row.ts, text: 'you are all wrong', sig: row.sig });
  await expect(reported(watcher)).toHaveCount(0, { timeout: 6000 });   // gone after a few seconds
});

test('Cancel and Escape send nothing, and focus goes back to the message\'s Report', async ({ page: host, context }) => {
  const { room, watcher } = await inRoom(host, context);
  await say(host, 'hello');
  await expect(messages(watcher)).toHaveCount(1);
  const report = messages(watcher).first().getByRole('button', { name: 'Report message from ansi-fan' });
  for (const dismiss of [
    () => dialog(watcher, 'ansi-fan').getByRole('button', { name: 'Cancel' }).click(),
    () => watcher.keyboard.press('Escape'),
  ]) {
    await messages(watcher).first().hover();
    await report.click();
    await dialog(watcher, 'ansi-fan').getByRole('radio', { name: 'Spam or flooding' }).check();
    await dismiss();
    await expect(dialog(watcher, 'ansi-fan')).toHaveCount(0);
    await expect(report).toBeFocused();
  }
  await expect(reported(watcher)).toHaveCount(0);
  expect(sentReports(room, 'p_1')).toHaveLength(0);
});

test('the host reports a watcher from N here ⋯: no message, and their last messages', async ({ page: host, context }) => {
  const { room, watcher } = await inRoom(host, context);
  await say(watcher, 'buy now');
  await expect(messages(host)).toHaveCount(1);
  await say(host, 'please stop');
  await expect(messages(watcher)).toHaveCount(2);
  await say(watcher, 'buy now!!');
  await expect(messages(host)).toHaveCount(3);

  const here = panel(host).getByRole('button', { name: /^\d+ here$/ });
  await here.click();
  await panel(host).getByRole('list', { name: 'Who is here' }).getByRole('button', { name: 'More for pixel_wren' }).click();
  await host.getByRole('button', { name: 'Report', exact: true }).click();
  const asked = dialog(host, 'pixel_wren');
  await expect(asked.getByText(SUB, { exact: true })).toBeVisible();
  await asked.getByRole('radio', { name: 'Spam or flooding' }).check();
  await asked.getByRole('button', { name: 'Report', exact: true }).click();

  await expect(reported(host)).toBeVisible();
  await expect.poll(() => sentReports(room, 'host')).toHaveLength(1);
  const [report] = sentReports(room, 'host');
  expect(report).toMatchObject({ type: 'report', sub: 'u_2', reason: 'spam' });
  expect(report).not.toHaveProperty('message');
  expect(report.messages.map((m) => m.text)).toEqual(['buy now', 'buy now!!']);
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
  await dialog(watcher, 'ansi-fan').getByRole('button', { name: 'Report', exact: true }).click();
  await expect(reported(watcher)).toBeVisible();
  await expect(reportFrom(watcher, 'ansi-fan')).toHaveCount(0);
  await expect(reportFrom(watcher, 'tin_owl')).toHaveCount(1);
  await expect(panel(watcher).getByRole('log')).toBeFocused();

  // The host reports tin_owl from N here ⋯: gone from that ⋯ and tin_owl's message, still there for pixel_wren.
  await panel(host).getByRole('button', { name: /^\d+ here$/ }).click();
  const more = (name) => panel(host).getByRole('list', { name: 'Who is here' }).getByRole('button', { name: `More for ${name}` });
  await more('tin_owl').click();
  await host.getByRole('button', { name: 'Report', exact: true }).click();
  await dialog(host, 'tin_owl').getByRole('radio', { name: 'Spam or flooding' }).check();
  await dialog(host, 'tin_owl').getByRole('button', { name: 'Report', exact: true }).click();
  await expect(reported(host)).toBeVisible();
  await expect(reportFrom(host, 'tin_owl')).toHaveCount(0);
  await expect(reportFrom(host, 'pixel_wren')).toHaveCount(1);
  await more('tin_owl').click();
  await expect(host.getByRole('button', { name: 'Block – from all future rooms' })).toBeVisible();
  await expect(host.getByRole('button', { name: 'Report', exact: true })).toHaveCount(0);
  await host.keyboard.press('Escape');
  await more('pixel_wren').click();
  await expect(host.getByRole('button', { name: 'Report', exact: true })).toBeVisible();

  expect(sentReports(room, 'p_1')).toHaveLength(1);
  expect(sentReports(room, 'host')).toHaveLength(1);
});

test('a guest and a member who hasn\'t confirmed their email see no Report; nor does the host on their own messages', async ({ page: host, context }) => {
  const { room, watcher: guest } = await inRoom(host, context, { me: null });
  const unconfirmed = await watcherPage(context, room, { me: member({ id: 'u_3', username: 'tin_owl', name: 'tin_owl', emailVerified: false }) });
  await unconfirmed.goto('/');
  await joinFromCard(unconfirmed);
  await say(host, 'hello all');
  for (const page of [guest, unconfirmed, host]) {
    await expect(messages(page)).toHaveCount(1);
    await messages(page).first().hover();
    await expect(reportsIn(page)).toHaveCount(0);
  }
});

test('a silence heard from the room mid-room: the host drops that watcher\'s chat from then on', async ({ page: host, context }) => {
  const { room, watcher } = await inRoom(host, context);
  await say(watcher, 'before');
  await expect(messages(host)).toHaveCount(1);
  room.silence('u_2', Date.now() + 3_600_000);
  await expect.poll(() => store(host, 'room', (r) => r._host.silences.has('u_2'))).toBe(true);   // heard before the next message
  await say(watcher, 'after');
  await say(host, 'still here');
  await expect(messages(watcher)).toHaveCount(2);
  await expect(messages(host)).toHaveCount(2);
  await expect(messages(host).nth(1)).toContainText('still here');
  await expect(messages(watcher).nth(1)).toContainText('still here');
  await host.waitForTimeout(500);   // time for a message that wasn't dropped to arrive
  for (const page of [host, watcher]) await expect(panel(page).getByRole('log')).not.toContainText('after');
});

test('a silenced watcher is told until when in place of the box, without a reload; the host still chats', async ({ page: host, context }) => {
  const { room, watcher } = await inRoom(host, context);
  await say(watcher, 'before');
  await expect(messages(host)).toHaveCount(1);
  await expect(box(watcher)).toBeVisible();

  const until = Date.now() + 3_600_000;
  watcher.server.silencedUntil = until;
  room.silence('u_2', until);
  const foot = panel(watcher).getByRole('status').filter({ hasText: "You're silenced until" });
  await expect(foot).toHaveText(/^You're silenced until [^.]+\.$/);
  await expect(box(watcher)).toHaveCount(0);

  await expect(box(host)).toBeVisible();
  await say(host, 'still here');
  await expect(messages(watcher)).toHaveCount(2);
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
  await expect(asked.getByText('Phosphor\'s moderators see the room\'s last lobby pictures and a picture of what you see now.', { exact: true })).toBeVisible();
  await expect(asked.getByRole('button', { name: 'Report', exact: true })).toBeDisabled();
  await asked.getByRole('radio', { name: 'Sexual or violent' }).check();
  await asked.getByRole('button', { name: 'Report', exact: true }).click();

  await expect(reported(watcher)).toBeVisible();
  await expect.poll(() => room.from('p_1').filter((m) => m.type === 'report-room')).toHaveLength(1);
  const [report] = room.from('p_1').filter((m) => m.type === 'report-room');
  expect(report).toMatchObject({ type: 'report-room', reason: 'sexual', picture: expect.stringMatching(/^[A-Za-z0-9+/]+=*$/) });
  await expect(reportRoom).toHaveCount(0);
  await expect(panel(watcher).getByRole('button', { name: 'Exit' })).toBeVisible();
});

test('a member reports a room from its card\'s ⋯: the fake\'s lobby hears report-room; the card has no Report room after, and a guest\'s card has no ⋯', async ({ context }) => {
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
  await expect(asked.getByText('Phosphor\'s moderators see the room\'s last lobby pictures.', { exact: true })).toBeVisible();
  await asked.getByRole('radio', { name: 'Spam or flooding' }).check();
  await asked.getByRole('button', { name: 'Report', exact: true }).click();

  await expect(reported(watcher)).toBeVisible();
  await expect.poll(() => watcher.server.lobby.received.filter((m) => m.type === 'report-room')).toEqual([{ type: 'report-room', id: ROOM_ID, reason: 'spam' }]);
  await expect(more(watcher)).toHaveCount(0);   // its only item gone
  await expect(card(watcher).getByRole('button', { name: /^Join/ })).toBeFocused();   // the ⋯ gone, focus goes to Join

  // A guest, an unconfirmed member and the room's own host (by name) have no ⋯ on it.
  for (const me of [null, member({ id: 'u_3', username: 'tin_owl', name: 'tin_owl', emailVerified: false }), member()]) {
    const page = await watcherPage(context, room, { me });
    await page.goto('/');
    await tab(page, 'SOCIAL').click();
    await expect(card(page).getByRole('button', { name: /^Join/ })).toBeVisible();
    await expect(more(page)).toHaveCount(0);
  }
});
