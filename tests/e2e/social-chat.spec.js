// The chat panel at the right of the whole app while you're in a room: the host's page and members' pages
// in one fake Room, talking through the real peers. The welcome pinned, sending (Enter, Shift+Enter, 300
// characters, one a second), who can send, folding to the rail, earlier messages on scrolling up, someone
// you blocked folded, and the host's Delete, Edit welcome and room menu, and who is here with Remove and Block.
import { test, expect, tab, store } from './support.js';
import { fakeRoom, goLive, watcherPage, joinFromCard, member, shown, ROOM_ID } from './social-support.js';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

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

// Who is here, in the host's panel: the "N here" button opens the list (it stays as it was while the room lasts).
const here = (host) => panel(host).getByRole('button', { name: /^\d+ here$/ });
const watching = (host) => panel(host).getByRole('list', { name: 'Who is here' }).getByRole('listitem');
async function openPeople(host) {
  if (await here(host).getAttribute('aria-expanded') === 'false') await here(host).click();
}

// The host live (welcome pinned), and a watcher who has joined as `me` (a guest if none).
async function inRoom(host, context, { welcome = '', me = null, blocked = [] } = {}) {
  const room = fakeRoom();
  const server = await goLive(host, room, { welcome });
  const watcher = await watcherPage(context, room, { me, blocked });
  await watcher.goto('/');
  await joinFromCard(watcher);
  return { room, watcher, server };
}

test('the panel is beside every tab for the host and the watcher, with the welcome pinned', async ({ page: host, context }) => {
  const { watcher } = await inRoom(host, context, { welcome: 'be kind, draw big', me: wren });
  // (the watcher has no art of its own, so its ANSI tab is off)
  for (const [page, tabs] of [[host, ['SOCIAL', 'ANSI', 'PIXEL']], [watcher, ['SOCIAL', 'PIXEL']]]) {
    for (const name of tabs) {
      await tab(page, name).click();
      await expect(panel(page).getByRole('heading', { name: 'neon harbor', level: 2 })).toBeVisible();
      await expect(panel(page).getByText('Pinned, from the host')).toBeVisible();
      await expect(panel(page).getByText('be kind, draw big')).toBeVisible();
      expect((await panel(page).boundingBox()).width).toBe(280);
    }
  }
  // Who hosts it, Track and Exit are the watcher's; the host has their own page. Exit is at the right of
  // the header, beside the fold button (where the host's ⋯ is).
  await expect(panel(watcher).getByText('hosted by ansi-fan')).toBeVisible();
  const exit = await panel(watcher).getByRole('button', { name: 'Exit' }).boundingBox();
  const fold = await panel(watcher).getByRole('button', { name: 'Fold the chat' }).boundingBox();
  const name = await panel(watcher).getByRole('heading', { name: 'neon harbor' }).boundingBox();
  expect(exit.x + exit.width).toBeLessThanOrEqual(fold.x);
  expect(fold.x - (exit.x + exit.width)).toBeLessThan(8);
  expect(fold.height).toBe(exit.height);   // whatever the fonts, so they share a middle
  expect(Math.abs((exit.y + exit.height / 2) - (fold.y + fold.height / 2))).toBeLessThan(1);
  expect(exit.y).toBeLessThan(name.y + name.height);   // on the name's line, not under it
  const menu = await panel(host).getByRole('button', { name: 'Room', exact: true }).boundingBox();
  expect(exit.height).toBe(menu.height);   // the size of the host's ⋯ in its place
  await expect(panel(host).getByText('hosted by ansi-fan')).toHaveCount(0);
  await expect(panel(host).getByRole('button', { name: 'Exit' })).toHaveCount(0);
});

test('no panel outside a room', async ({ page: host, context }) => {
  const { watcher } = await inRoom(host, context, { me: wren });
  await watcher.getByRole('button', { name: 'Exit' }).click();
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
  await expect.poll(height).toBeGreaterThan(one);
  const two = await height(), line = two - one;

  for (let i = 0; i < 8; i++) {
    await watcher.keyboard.press('Shift+Enter');
    await watcher.keyboard.type('x');
  }
  await expect.poll(height).toBe(one + 4 * line);   // exactly 5 lines, not 10
  expect(await box(watcher).evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);

  await box(watcher).fill('');
  await watcher.keyboard.insertText('y'.repeat(301));
  expect((await box(watcher).inputValue()).length).toBe(300);
});

test('the box sits close to the panel\'s edges: the foot\'s spacing is a few pixels, not a dozen, no rule above it or around the panel, and Send a button only with something to send', async ({ page: host, context }) => {
  const { watcher } = await inRoom(host, context, { me: wren });
  const foot = await panel(watcher).locator('footer').boundingBox();
  const frame = await panel(watcher).locator('footer .box').boundingBox();
  for (const gap of [frame.x - foot.x, foot.x + foot.width - frame.x - frame.width, foot.y + foot.height - frame.y - frame.height]) {
    expect(gap).toBeLessThanOrEqual(6);
  }
  await expect(panel(watcher).locator('footer')).toHaveCSS('border-top-style', 'none');
  await expect(panel(watcher)).toHaveCSS('border-top-style', 'none');   // nor around the panel
  await expect(panel(watcher)).toHaveCSS('margin-left', '2px');
  // Send has no background until there's something to send.
  const send = panel(watcher).getByRole('button', { name: 'Send' });
  await expect(send).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await box(watcher).fill('hi');
  await expect(send).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(send).toHaveCSS('border-radius', '4px');
});

test('four Enters within a second: "Slow down a little", and three messages arrive', async ({ page: host, context }) => {
  const { watcher } = await inRoom(host, context, { me: wren });
  await watcher.clock.setFixedTime(Date.now());   // no second passes between them
  for (const word of ['one', 'two', 'three']) {
    await say(watcher, word);
    await expect(box(watcher)).toHaveValue('');   // taken, before the next
  }
  await expect(messages(watcher)).toHaveCount(3);
  await expect(panel(watcher).getByText('Slow down a little')).toHaveCount(0);
  await say(watcher, 'four');
  await expect(panel(watcher).getByText('Slow down a little')).toBeVisible();
  await expect(box(watcher)).toHaveValue('four');   // kept, to send again
  await expect(messages(host)).toHaveCount(3);
  await expect(messages(host)).not.toContainText(['four']);
});

// A guest in the room who chose "Sign in to chat"; signing in makes them `wren`.
async function guestToSignIn(host, context, serverOptions = {}) {
  const room = fakeRoom();
  await goLive(host, room);
  const watcher = await watcherPage(context, room, { signsInAs: wren, ...serverOptions });
  await watcher.goto('/');
  await joinFromCard(watcher);
  await expect(box(watcher)).toHaveCount(0);
  await panel(watcher).getByRole('button', { name: 'Sign in to chat' }).click();
  await expect(shown(watcher, 'sign-in')).toBeVisible();
  return watcher;
}

async function signInWithPassword(watcher) {
  const form = shown(watcher, 'sign-in');
  await form.getByLabel('Email or username').fill('pixel_wren');
  await form.getByLabel('Password').fill('correct horse battery');
  await form.getByRole('button', { name: 'Sign in', exact: true }).click();
}

// Back in the room as wren: its page, the host's list with the name and no guest tag, the composer.
async function backAsWren(host, watcher) {
  await expect(shown(watcher, 'watch-room')).toBeVisible();
  await expect(box(watcher)).toBeVisible();
  await openPeople(host);
  const row = watching(host);
  await expect(row).toHaveText([/pixel_wren\s*tracking/]);
  await expect(row.getByText('guest')).toHaveCount(0);
  await say(watcher, 'it is me');
  await expect(messages(host).first()).toContainText('pixel_wren');
}

test('a guest is asked to sign in: the sign-in page shows over the room, "Back to the room" returns to it', async ({ page: host, context }) => {
  const watcher = await guestToSignIn(host, context);
  expect(await store(watcher, 'workspace', (w) => w.editorTab)).toBe('social');
  await expect(shown(watcher, 'sign-in').getByRole('button', { name: '‹ Back to the room' })).toBeVisible();
  await shown(watcher, 'sign-in').getByRole('button', { name: '‹ Back to the room' }).click();
  await expect(shown(watcher, 'watch-room')).toBeVisible();
  expect(await store(watcher, 'room', (r) => r.role)).toBe('watch');
});

test('a guest who signs in with a password is back in the same room as themselves', async ({ page: host, context }) => {
  const watcher = await guestToSignIn(host, context);
  await signInWithPassword(watcher);
  await backAsWren(host, watcher);
});

test('a guest who signs in through two-factor is back in the same room as themselves', async ({ page: host, context }) => {
  const watcher = await guestToSignIn(host, context, { twoFactor: true });
  await signInWithPassword(watcher);
  const form = shown(watcher, 'two-factor');
  await form.getByLabel('Code from your authenticator app').fill('123456');
  await form.getByRole('button', { name: 'Verify' }).click();
  await backAsWren(host, watcher);
});

test('coming back from Discord (?social=signed-in) with the room kept, a guest-turned-member is in the room as themselves', async ({ page: host, context }) => {
  const room = fakeRoom();
  await goLive(host, room);
  const watcher = await watcherPage(context, room, { me: wren });
  await watcher.addInitScript((id) => sessionStorage.setItem('phosphor-rejoin', id), ROOM_ID);
  await watcher.goto('/?social=signed-in');
  await backAsWren(host, watcher);
  expect(await watcher.evaluate(() => sessionStorage.getItem('phosphor-rejoin'))).toBe(null);
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
  await expect(panel(watcher).getByRole('heading', { name: 'neon harbor' })).toHaveCount(0);
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

test('who joins and leaves is in the chat, one line while nothing is said between; your own isn\'t', async ({ page: host, context }) => {
  const { room, watcher } = await inRoom(host, context, { me: wren });
  const presence = (page) => log(page).locator('.presence');
  await expect(presence(host)).toHaveText(['pixel_wren joined']);
  await expect(presence(watcher)).toHaveCount(0);   // "You joined" says it

  const late = await watcherPage(context, room, { me: reaper });
  await late.goto('/');
  await joinFromCard(late);
  await expect(presence(late)).toHaveText(['pixel_wren joined']);   // from before, in its history
  await expect(presence(watcher)).toHaveText(['grim_reaper joined']);
  await late.getByRole('button', { name: 'Exit' }).click();
  await expect(presence(watcher)).toHaveText(['grim_reaper came and went']);
  await expect(presence(host)).toHaveText(['pixel_wren joined, grim_reaper came and went']);

  await say(host, 'still here?');
  await expect(messages(watcher)).toHaveCount(1);
  await watcher.getByRole('button', { name: 'Exit' }).click();
  await expect(presence(host)).toHaveText(['pixel_wren joined, grim_reaper came and went', 'pixel_wren left']);
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
  await expect.poll(() => log(late).evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThan(8);   // at the bottom

  await log(late).evaluate((el) => { el.scrollTop = 0; });
  await expect(messages(late)).toHaveCount(60);
  await expect(messages(late).first()).toContainText('m1');
  await expect(log(late).getByText('↑ Scroll up for earlier messages')).toHaveCount(0);
  // the place held: m11, which was at the top, is still where the eye was
  const fromTop = async () => (await messages(late).nth(10).boundingBox()).y - (await log(late).boundingBox()).y;
  await expect.poll(async () => Math.abs(await fromTop())).toBeLessThan(60);
  await expect(messages(late).nth(10)).toContainText('m11');
});

test('joining a room with no messages: "You joined" is there once live, with nothing above it', async ({ page: host, context }) => {
  const { watcher } = await inRoom(host, context, { me: wren });
  expect(await store(watcher, 'room', (r) => r.status)).toBe('live');
  await expect(log(watcher).getByText('You joined')).toBeVisible();
  await expect(messages(watcher)).toHaveCount(0);
  await expect(log(watcher).getByText('↑ Scroll up for earlier messages')).toHaveCount(0);
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
  await expect(messages(host)).toHaveCount(1);   // the host has it before the next goes
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

test('Report and Delete show on hover in the time\'s place: its size, its line and its right edge, with the time hidden', async ({ page: host, context }) => {
  const { watcher } = await inRoom(host, context, { me: wren });
  await say(watcher, 'look at this');
  const message = messages(host).first();
  const time = message.locator('time');
  const actions = message.locator('.actions');
  const look = (el) => el.evaluate((e) => {
    const box = e.getBoundingClientRect(), style = getComputedStyle(e);
    return { right: box.right, bottom: box.bottom, size: style.fontSize, shown: style.visibility === 'visible' && style.opacity === '1' };
  });
  await host.mouse.move(0, 0);
  expect((await look(time)).shown).toBe(true);
  expect((await look(actions)).shown).toBe(false);

  await message.hover();
  await expect.poll(async () => (await look(actions)).shown).toBe(true);
  const [t, a] = [await look(time), await look(actions)];
  expect(t.shown).toBe(false);   // covered: not under the words
  expect(a.right).toBeCloseTo(t.right, 0);
  expect(a.bottom).toBeCloseTo(t.bottom, 0);
  for (const button of await actions.getByRole('button').all()) expect((await look(button)).size).toBe(t.size);
});

test('a watcher who joins after the host\'s Delete sees "Message deleted by the host" too', async ({ page: host, context }) => {
  const { room, watcher } = await inRoom(host, context, { me: wren });
  await say(watcher, 'oops');
  await expect(messages(host)).toHaveCount(1);
  await messages(host).first().hover();
  await messages(host).first().getByRole('button', { name: 'Delete' }).click();
  await expect(messages(watcher).first()).toContainText('Message deleted by the host');

  const late = await watcherPage(context, room, { me: member({ id: 'u_4', username: 'late_comer', name: 'late_comer' }) });
  await late.goto('/');
  await joinFromCard(late);
  await expect(messages(late)).toHaveCount(1);
  await expect(messages(late).first()).toContainText('Message deleted by the host');
  await expect(messages(late).first()).not.toContainText('oops');
});

const more = (host, name = 'pixel_wren') => watching(host).getByRole('button', { name: `More for ${name}` });
const blockDialog = (host) => host.getByRole('dialog', { name: 'Block pixel_wren?' });

test('Kick – for this session: the watcher is in the lobby with "The host removed you" and the host\'s list is empty', async ({ page: host, context }) => {
  const { watcher, server } = await inRoom(host, context, { me: wren });
  await openPeople(host);
  await expect(watching(host)).toHaveCount(1);
  await more(host).click();
  await host.getByRole('button', { name: 'Kick – for this session' }).click();
  await expect(watching(host)).toHaveCount(0);
  await expect(shown(watcher, 'lobby')).toBeVisible();
  await expect(watcher.getByText('The host removed you')).toBeVisible();
  expect(await store(watcher, 'room', (r) => r.role)).toBe(null);
  expect(server.sent('POST', '/api/blocks')).toHaveLength(0);   // removing is not blocking
});

test('Block – from all future rooms asks first, then blocks and removes', async ({ page: host, context }) => {
  const { watcher, server } = await inRoom(host, context, { me: wren });
  await openPeople(host);
  await more(host).click();
  await expect(host.getByRole('button', { name: 'Block – from all future rooms' })).toBeVisible();
  await host.getByRole('button', { name: 'Block – from all future rooms' }).click();

  const dialog = blockDialog(host);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('They can\'t join any room you host, and they leave this one now. Unblock them from Account.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  expect(server.sent('POST', '/api/blocks')).toHaveLength(0);   // nothing yet

  await dialog.getByRole('button', { name: 'Block', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => server.sent('POST', '/api/blocks')).toHaveLength(1);
  expect(server.sent('POST', '/api/blocks')[0].body).toEqual({ username: 'pixel_wren' });
  await expect(watching(host)).toHaveCount(0);
  await expect(watcher.getByText('The host removed you')).toBeVisible();
});

test('Cancel and Escape on the Block box leave everything as it was, with focus back on the \u22ef button', async ({ page: host, context }) => {
  const { watcher, server } = await inRoom(host, context, { me: wren });
  await openPeople(host);
  for (const dismiss of [
    () => blockDialog(host).getByRole('button', { name: 'Cancel' }).click(),
    () => host.keyboard.press('Escape'),
  ]) {
    await more(host).click();
    await host.getByRole('button', { name: 'Block – from all future rooms' }).click();
    await expect(blockDialog(host)).toBeVisible();
    await dismiss();
    await expect(blockDialog(host)).toHaveCount(0);
    await expect(more(host)).toBeFocused();
    await expect(watching(host)).toHaveCount(1);
    await expect(shown(watcher, 'watch-room')).toBeVisible();
  }
  expect(server.sent('POST', '/api/blocks')).toHaveLength(0);
});

test('a guest\'s row has no \u22ef; a member\'s has one', async ({ page: host, context }) => {
  const { room } = await inRoom(host, context, { me: wren });
  const guest = await watcherPage(context, room);
  await guest.goto('/');
  await joinFromCard(guest);
  await openPeople(host);
  await expect(watching(host)).toHaveCount(2);
  await expect(more(host)).toHaveCount(1);
  await expect(watching(host).filter({ has: host.locator('span.tag') }).getByRole('button')).toHaveCount(0);
});

test('a failed block leaves the watcher in the list and shows the notice', async ({ page: host, context }) => {
  const { watcher, server } = await inRoom(host, context, { me: wren });
  server.route('POST /api/blocks', () => [500, { code: 'SERVER_ERROR' }]);
  await openPeople(host);
  await more(host).click();
  await host.getByRole('button', { name: 'Block – from all future rooms' }).click();
  await blockDialog(host).getByRole('button', { name: 'Block', exact: true }).click();
  await expect.poll(() => server.sent('POST', '/api/blocks')).toHaveLength(1);
  await expect(host.getByRole('status').filter({ hasText: 'Something went wrong. Try again.' })).toBeVisible();
  await expect(watching(host)).toHaveCount(1);
  await expect(shown(watcher, 'watch-room')).toBeVisible();
});

// The watcher is in the room and the host's Block box is open on them; then they leave.
async function leaveWhileAsked(host, watcher) {
  await openPeople(host);
  await more(host).click();
  await host.getByRole('button', { name: 'Block – from all future rooms' }).click();
  await expect(blockDialog(host)).toBeVisible();
  await watcher.getByRole('button', { name: 'Exit' }).click();
  await expect(watching(host)).toHaveCount(0);
  await expect(blockDialog(host)).toBeVisible();   // still asking
}

test('the watcher leaves while the Block box is open: Cancel and Escape put focus on the "N here" button', async ({ page: host, context }) => {
  const { watcher, server } = await inRoom(host, context, { me: wren });
  for (const dismiss of [
    () => blockDialog(host).getByRole('button', { name: 'Cancel' }).click(),
    () => host.keyboard.press('Escape'),
  ]) {
    await openPeople(host);
    if (await watching(host).count() === 0) {   // second time round: back in the room
      await joinFromCard(watcher);
    }
    await leaveWhileAsked(host, watcher);
    await dismiss();
    await expect(blockDialog(host)).toHaveCount(0);
    await expect(here(host)).toBeFocused();
  }
  expect(server.sent('POST', '/api/blocks')).toHaveLength(0);
});

test('the watcher leaves while the Block box is open: Block still blocks the account', async ({ page: host, context }) => {
  const { watcher, server } = await inRoom(host, context, { me: wren });
  await leaveWhileAsked(host, watcher);
  await blockDialog(host).getByRole('button', { name: 'Block', exact: true }).click();
  await expect.poll(() => server.sent('POST', '/api/blocks')).toHaveLength(1);
  expect(server.sent('POST', '/api/blocks')[0].body).toEqual({ username: 'pixel_wren' });
  await expect(blockDialog(host)).toHaveCount(0);
});

test('the host\'s panel says who is here, folded; opened it lists each with guest, tracking or looking around, and a member\'s ⋯', async ({ page: host, context }) => {
  const { room, watcher } = await inRoom(host, context, { me: wren });
  await expect(here(host)).toHaveText('1 here');
  await expect(here(host)).toHaveAttribute('aria-expanded', 'false');
  await expect(panel(host).getByRole('list', { name: 'Who is here' })).toHaveCount(0);

  const guest = await watcherPage(context, room);
  await guest.goto('/');
  await joinFromCard(guest);
  await expect(here(host)).toHaveText('2 here');
  await here(host).click();
  await expect(here(host)).toHaveAttribute('aria-expanded', 'true');
  await expect(watching(host)).toHaveText([/pixel_wren\s*tracking/, /quiet-amber-fox\s*guest\s*tracking/]);
  await expect(more(host)).toHaveCount(1);
  await expect(watching(host).locator('.cell')).toHaveCount(2);   // each name in the text color, after its cell

  // Folded or open is kept as it was while the room lasts, across tabs.
  await tab(host, 'ANSI').click();
  await expect(here(host)).toHaveAttribute('aria-expanded', 'true');
  await here(host).click();
  await expect(here(host)).toHaveAttribute('aria-expanded', 'false');
  await expect(watching(host)).toHaveCount(0);
  await watcher.getByRole('button', { name: 'Exit' }).click();
  await expect(here(host)).toHaveText('1 here');
});

test('the room menu: Copy link, Edit welcome saves the pinned welcome for everyone, Settings and stats opens the SOCIAL tab; no End room (that\'s on the SOCIAL tab)', async ({ page: host, context }) => {
  const { watcher } = await inRoom(host, context, { me: wren });
  const menu = panel(host).getByRole('button', { name: 'Room', exact: true });
  const item = (name) => host.locator('.dropdown-content').getByRole('button', { name, exact: true });
  await tab(host, 'ANSI').click();
  await menu.click();
  await expect(host.locator('.dropdown-content button')).toHaveText(['Copy link', 'Edit welcome', 'Settings and stats']);

  await item('Copy link').click();
  await expect.poll(() => host.evaluate(() => navigator.clipboard.readText())).toContain(`?room=${ROOM_ID}`);

  await menu.click();
  await item('Edit welcome').click();
  const edit = host.getByRole('dialog', { name: 'Edit welcome' });
  await expect(edit.getByLabel('Welcome message')).toBeFocused();
  await edit.getByLabel('Welcome message').fill('draw something loud');
  await edit.getByRole('button', { name: 'Cancel' }).click();
  await expect(edit).toHaveCount(0);
  await expect(menu).toBeFocused();
  await expect(panel(watcher).getByText('draw something loud')).toHaveCount(0);   // Cancel changed nothing

  await menu.click();
  await item('Edit welcome').click();
  await edit.getByLabel('Welcome message').fill('draw something loud');
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(edit).toHaveCount(0);
  await expect(panel(host).getByText('draw something loud')).toBeVisible();
  await expect(panel(watcher).getByText('draw something loud')).toBeVisible();

  await menu.click();
  await item('Settings and stats').click();
  expect(await store(host, 'workspace', (w) => w.editorTab)).toBe('social');
  await expect(shown(host, 'host-room')).toBeVisible();
});

test('the pinned welcome\'s Edit opens the same dialog', async ({ page: host, context }) => {
  await inRoom(host, context, { welcome: 'be kind, draw big', me: wren });
  const edit = host.getByRole('dialog', { name: 'Edit welcome' });
  await panel(host).getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(edit.getByLabel('Welcome message')).toHaveValue('be kind, draw big');
  await edit.getByLabel('Welcome message').fill('');
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(edit).toHaveCount(0);
  await expect(panel(host).getByText('Pinned, from the host')).toHaveCount(0);   // an empty welcome isn't pinned
  await expect(panel(host).getByRole('button', { name: 'Room', exact: true })).toBeFocused();   // the link went, so the menu has focus
});

test('a watcher\'s panel has no room menu, no people list and no Edit', async ({ page: host, context }) => {
  const { watcher } = await inRoom(host, context, { welcome: 'be kind, draw big', me: wren });
  await expect(panel(watcher).getByText('be kind, draw big')).toBeVisible();
  await expect(panel(watcher).getByRole('button', { name: 'Room', exact: true })).toHaveCount(0);
  await expect(panel(watcher).getByRole('button', { name: /here$/ })).toHaveCount(0);
  await expect(panel(watcher).getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
  await expect(panel(host).getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
});
