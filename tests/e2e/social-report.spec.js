// Reporting people: Report on a message (for a confirmed member, on other people's messages) and in the
// host's N here ⋯, through one dialog with a reason. The report goes to the Room on the reporter's own
// socket, with the messages as they came, signed by their senders; nothing answers it. A mute the Room
// tells of mid-room makes the host drop that person's chat.
import { test, expect, store } from './support.js';
import { fakeRoom, goLive, watcherPage, joinFromCard, member } from './social-support.js';

const wren = member({ id: 'u_2', username: 'pixel_wren', name: 'pixel_wren' });

const panel = (page) => page.getByRole('complementary', { name: 'Chat' });
const messages = (page) => panel(page).getByRole('log').locator('.message');
const box = (page) => panel(page).getByRole('textbox', { name: 'Message' });
const reportsIn = (page) => panel(page).getByRole('button', { name: /^Report/ });
const dialog = (page, name) => page.getByRole('dialog', { name: `Report ${name}?` });
const reported = (page) => page.getByRole('status').filter({ hasText: 'Reported. Thank you.' });
const SUB = 'Phosphor\'s admin sees this message and the few before it. Nobody is told who reported them.';

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
  await expect(asked.getByText(SUB)).toBeVisible();
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
  await expect(asked.getByText(SUB)).toBeVisible();
  await asked.getByRole('radio', { name: 'Spam or flooding' }).check();
  await asked.getByRole('button', { name: 'Report', exact: true }).click();

  await expect(reported(host)).toBeVisible();
  await expect.poll(() => sentReports(room, 'host')).toHaveLength(1);
  const [report] = sentReports(room, 'host');
  expect(report).toMatchObject({ type: 'report', sub: 'u_2', reason: 'spam' });
  expect(report).not.toHaveProperty('message');
  expect(report.messages.map((m) => m.text)).toEqual(['buy now', 'buy now!!']);
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

test('a mute heard from the room mid-room: the host drops that watcher\'s chat from then on', async ({ page: host, context }) => {
  const { room, watcher } = await inRoom(host, context);
  await say(watcher, 'before');
  await expect(messages(host)).toHaveCount(1);
  room.mute('u_2', Date.now() + 3_600_000);
  await expect.poll(() => store(host, 'room', (r) => r._host.mutes.has('u_2'))).toBe(true);   // heard before the next message
  await say(watcher, 'after');
  await say(host, 'still here');
  await expect(messages(watcher)).toHaveCount(2);
  await expect(messages(host)).toHaveCount(2);
  await expect(messages(host).nth(1)).toContainText('still here');
  await expect(messages(watcher).nth(1)).toContainText('still here');
});
