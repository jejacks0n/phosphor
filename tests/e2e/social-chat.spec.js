// The chat panel at the right of the whole app while you're in a room: the host's page and members' pages
// in one fake Room, talking through the real peers. The welcome pinned, sending (Enter, Shift+Enter, 300
// characters, one a second), who can send, folding to the rail, earlier messages on scrolling up, someone
// you blocked folded, and the host's Delete.
import { test, expect, tab, store } from './support.js';
import { fakeRoom, goLive, watcherPage, joinFromCard, member } from './social-support.js';

const wren = member({ id: 'u_2', username: 'pixel_wren', name: 'pixel_wren' });
const reaper = member({ id: 'u_3', username: 'grim_reaper', name: 'grim_reaper' });

const panel = (page) => page.getByRole('complementary', { name: 'Chat' });
const log = (page) => panel(page).getByRole('log');
const messages = (page) => log(page).locator('.message');
const box = (page) => panel(page).getByRole('textbox', { name: 'Message' });

// Says `text` the way a person does: into the box, then Enter.
async function say(page, text) {
  await box(page).fill(text);
  await box(page).press('Enter');
}

// The host live (welcome pinned), and a watcher who has joined as `me` (a guest if none).
async function inRoom(host, context, { welcome = '', me = null, blocked = [] } = {}) {
  const room = fakeRoom();
  await goLive(host, room, { welcome });
  const watcher = await watcherPage(context, room, { me, blocked });
  await watcher.goto('/');
  await joinFromCard(watcher);
  return { room, watcher };
}

test('the panel is beside every tab for the host and the watcher, with the welcome pinned', async ({ page: host, context }) => {
  const { watcher } = await inRoom(host, context, { welcome: 'be kind, draw big', me: wren });
  // (the watcher has no art of its own, so its ANSI tab is off)
  for (const [page, tabs] of [[host, ['SOCIAL', 'ANSI', 'PIXEL']], [watcher, ['SOCIAL', 'PIXEL']]]) {
    for (const name of tabs) {
      await tab(page, name).click();
      await expect(panel(page).getByRole('heading', { name: 'Chat', level: 2 })).toBeVisible();
      await expect(panel(page).getByText('neon harbor')).toBeVisible();
      await expect(panel(page).getByText('Pinned, from the host')).toBeVisible();
      await expect(panel(page).getByText('be kind, draw big')).toBeVisible();
      expect((await panel(page).boundingBox()).width).toBe(280);
    }
  }
});

test('no panel outside a room', async ({ page: host, context }) => {
  const { watcher } = await inRoom(host, context, { me: wren });
  await watcher.getByRole('button', { name: 'Leave' }).click();
  await expect(panel(watcher)).toHaveCount(0);
});

test('a watcher\'s message reaches both with their name, a time and "(you)" only for the sender; the host\'s carries the host tag', async ({ page: host, context }) => {
  const { watcher } = await inRoom(host, context, { me: wren });
  await say(watcher, 'hello');
  await expect(box(watcher)).toHaveValue('');
  for (const page of [host, watcher]) {
    await expect(messages(page)).toHaveCount(1);
    await expect(messages(page).first()).toContainText('hello');
    await expect(messages(page).first()).toContainText('pixel_wren');
    await expect(messages(page).first()).toContainText(/\d{1,2}:\d{2}/);
  }
  await expect(messages(watcher).first()).toContainText('pixel_wren (you)');
  await expect(messages(host).first()).not.toContainText('(you)');
  await expect(messages(watcher).first().getByText('host', { exact: true })).toHaveCount(0);

  await say(host, 'welcome');
  await expect(messages(watcher)).toHaveCount(2);
  await expect(messages(watcher).nth(1)).toContainText('ansi-fan');
  await expect(messages(watcher).nth(1).getByText('host', { exact: true })).toBeVisible();
  await expect(messages(host).nth(1)).toContainText('ansi-fan (you)');
});

test('Shift+Enter makes a new line and the box grows to 5 lines, then scrolls; 301 characters can\'t be typed', async ({ page: host, context }) => {
  const { watcher } = await inRoom(host, context, { me: wren });
  const height = async () => (await box(watcher).boundingBox()).height;
  const one = await height();
  await box(watcher).click();
  await watcher.keyboard.type('a');
  await watcher.keyboard.press('Shift+Enter');
  await watcher.keyboard.type('b');
  await expect(box(watcher)).toHaveValue('a\nb');
  expect(await messages(watcher).count()).toBe(0);   // Shift+Enter sends nothing
  const two = await height();
  expect(two).toBeGreaterThan(one);

  for (let i = 0; i < 8; i++) {
    await watcher.keyboard.press('Shift+Enter');
    await watcher.keyboard.type('x');
  }
  const most = await height();
  expect(most).toBeGreaterThan(two);
  expect(most).toBeLessThan(one * 7);   // 5 lines, not 10
  expect(await box(watcher).evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);

  await box(watcher).fill('');
  await watcher.keyboard.insertText('y'.repeat(301));
  expect((await box(watcher).inputValue()).length).toBe(300);
});

test('four Enters within a second: "Slow down a little", and three messages arrive', async ({ page: host, context }) => {
  const { watcher } = await inRoom(host, context, { me: wren });
  await watcher.clock.setFixedTime(Date.now());   // no second passes between them
  await say(watcher, 'one');
  await say(watcher, 'two');
  await say(watcher, 'three');
  await expect(messages(watcher)).toHaveCount(3);
  await expect(panel(watcher).getByText('Slow down a little')).toHaveCount(0);
  await say(watcher, 'four');
  await expect(panel(watcher).getByText('Slow down a little')).toBeVisible();
  await expect(box(watcher)).toHaveValue('four');   // kept, to send again
  await expect(messages(host)).toHaveCount(3);
  await expect(messages(host)).not.toContainText(['four']);
});

test('a guest is asked to sign in, and the button opens the sign-in page', async ({ page: host, context }) => {
  const { watcher } = await inRoom(host, context);
  await expect(box(watcher)).toHaveCount(0);
  await panel(watcher).getByRole('button', { name: 'Sign in to chat' }).click();
  expect(await store(watcher, 'workspace', (w) => w.editorTab)).toBe('social');
  expect(await store(watcher, 'social', (s) => s.page)).toBe('sign-in');
});

test('a member who hasn\'t confirmed their email is asked to', async ({ page: host, context }) => {
  const { watcher } = await inRoom(host, context, { me: member({ id: 'u_2', username: 'pixel_wren', name: 'pixel_wren', emailVerified: false }) });
  await expect(panel(watcher).getByText('Confirm your email to chat')).toBeVisible();
  await expect(box(watcher)).toHaveCount(0);
});

test('» folds the panel to a rail that counts what came since, « opens it again', async ({ page: host, context }) => {
  const { watcher } = await inRoom(host, context, { me: wren });
  await say(watcher, 'before');
  await expect(messages(host)).toHaveCount(1);

  await panel(watcher).getByRole('button', { name: 'Fold the chat' }).click();
  await expect(panel(watcher).getByRole('button', { name: 'Open the chat' })).toBeFocused();
  await expect(panel(watcher).getByRole('heading', { name: 'Chat' })).toHaveCount(0);
  expect((await panel(watcher).boundingBox()).width).toBe(28);
  await expect(panel(watcher).getByText('1', { exact: true })).toHaveCount(0);

  await say(host, 'psst');
  await expect(panel(watcher).getByText('1', { exact: true })).toBeVisible();
  await panel(watcher).getByRole('button', { name: 'Open the chat' }).click();
  await expect(box(watcher)).toBeFocused();
  expect((await panel(watcher).boundingBox()).width).toBe(280);
  await expect(messages(watcher)).toHaveCount(2);
  await expect(messages(watcher).nth(1)).toContainText('psst');
  await panel(watcher).getByRole('button', { name: 'Fold the chat' }).click();
  await expect(panel(watcher).getByText('1', { exact: true })).toHaveCount(0);   // counted from this fold
});

test('60 messages before a second watcher joins: the last 50, "You joined", and the other 10 on scrolling to the top', async ({ page: host, context }) => {
  const { room } = await inRoom(host, context, { me: wren });
  const start = Date.now();
  for (let i = 1; i <= 60; i++) {
    await host.clock.setFixedTime(start + i * 1000);   // one a second, in no time
    await say(host, `m${i}`);
    await expect(box(host)).toHaveValue('');
  }
  expect(room.from('p_1').filter((m) => m.type === 'join')).toHaveLength(1);

  const late = await watcherPage(context, room, { me: member({ id: 'u_4', username: 'late_comer', name: 'late_comer' }) });
  await late.goto('/');
  await joinFromCard(late);
  await expect(messages(late)).toHaveCount(50);
  await expect(messages(late).first()).toContainText('m11');
  await expect(messages(late).last()).toContainText('m60');
  await expect(log(late).getByText('↑ Scroll up for earlier messages')).toBeVisible();
  await expect(log(late).getByText('You joined')).toBeVisible();
  expect(await log(late).evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThan(8);   // at the bottom

  await log(late).evaluate((el) => { el.scrollTop = 0; });
  await expect(messages(late)).toHaveCount(60);
  await expect(messages(late).first()).toContainText('m1');
  await expect(log(late).getByText('↑ Scroll up for earlier messages')).toHaveCount(0);
  // the place held: m11, which was at the top, is still where the eye was
  const top = (await log(late).boundingBox()).y;
  const at = (await messages(late).nth(10).boundingBox()).y;
  expect(at - top).toBeLessThan(60);
  await expect(messages(late).nth(10)).toContainText('m11');
});

test('a new message keeps the place when scrolled up, and follows when at the bottom', async ({ page: host, context }) => {
  const { watcher } = await inRoom(host, context, { me: wren });
  const gap = () => log(watcher).evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight);
  const start = Date.now();
  for (let i = 1; i <= 30; i++) {
    await host.clock.setFixedTime(start + i * 1000);
    await say(host, `line ${i}`);
  }
  await expect(messages(watcher)).toHaveCount(30);
  await expect.poll(gap).toBeLessThan(8);   // followed all the way

  await log(watcher).evaluate((el) => { el.scrollTop = 0; });
  await host.clock.setFixedTime(start + 40_000);
  await say(host, 'line 31');
  await expect(messages(watcher)).toHaveCount(31);
  expect(await log(watcher).evaluate((el) => el.scrollTop)).toBe(0);   // not dragged down
});

test('a message from someone you blocked is folded, and Show shows that one', async ({ page: host, context }) => {
  const { room, watcher } = await inRoom(host, context, { me: wren, blocked: [{ id: 'u_3', username: 'grim_reaper', since: 1 }] });
  const other = await watcherPage(context, room, { me: reaper });
  await other.goto('/');
  await joinFromCard(other);
  await say(other, 'secret sauce');
  await say(host, 'fine words');

  await expect(messages(host).first()).toContainText('secret sauce');
  await expect(messages(watcher)).toHaveCount(2);
  const folded = messages(watcher).first();
  await expect(folded).toContainText('Message from someone you blocked');
  await expect(folded).not.toContainText('secret sauce');
  await expect(messages(watcher).nth(1)).toContainText('fine words');
  await folded.getByRole('button', { name: 'Show' }).click();
  await expect(folded).toContainText('secret sauce');
  await expect(folded).toContainText('grim_reaper');
});

test('the host\'s Delete shows on hover and leaves "Message deleted by the host" for everyone; watchers have none', async ({ page: host, context }) => {
  const { watcher } = await inRoom(host, context, { me: wren });
  await say(watcher, 'oops');
  await expect(messages(host)).toHaveCount(1);
  await expect(messages(watcher).first().getByRole('button', { name: 'Delete' })).toHaveCount(0);

  await messages(host).first().hover();
  await messages(host).first().getByRole('button', { name: 'Delete' }).click();
  for (const page of [host, watcher]) {
    await expect(messages(page).first()).toContainText('Message deleted by the host');
    await expect(messages(page).first()).not.toContainText('oops');
  }
});
