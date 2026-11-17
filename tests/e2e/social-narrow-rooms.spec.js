// Rooms on a narrow screen: a link joins and the art shows on ROOM, the side panel shut over it; « opens CHAT over the
// art with what was said counted, a message goes from there, and a tap on the art beside the panel shuts it.
import { test, expect, tab } from './support.js';
import { fakeRoom, goLive, watcherPage, followLink, member, live, selected, chat, shown } from './social-support.js';

const wren = member({ id: 'u_2', username: 'pixel_wren', name: 'pixel_wren' });
const messages = (page) => chat(page).getByRole('log').locator('.message');

async function say(page, text) {
  const box = chat(page).getByRole('textbox', { name: 'Message' });
  await box.fill(text);
  await box.press('Enter');
}

test('a phone joins from a link and watches on ROOM; « opens CHAT over the art, counting what was said, and a tap beside it shuts it', async ({ page: host, context }) => {
  const room = fakeRoom();
  await goLive(host, room);
  const watcher = await watcherPage(context, room, { me: wren });
  await watcher.setViewportSize({ width: 390, height: 844 });
  await followLink(watcher);
  await live(watcher);
  await selected(watcher, 'ROOM');
  const panel = watcher.locator('.side-panel'), open = watcher.getByRole('button', { name: 'Expand panel' });
  await expect(panel).toBeHidden();   // the art you came for

  await say(host, 'welcome');
  await expect(watcher.locator('nav.workspace-tabs span.unread')).toHaveText('1');
  await open.click();
  await expect(messages(watcher)).toHaveCount(1);
  await expect(watcher.locator('span.unread')).toHaveCount(0);
  await say(watcher, 'hi from a phone');
  await expect(messages(host)).toHaveCount(2);
  await expect(messages(host).nth(1)).toContainText('hi from a phone');
  // The … by the name opens the account's actions: Edit account opens the Account page over the room, here too.
  await chat(watcher).locator('footer .who-am-i').getByRole('button', { name: '…' }).click();
  await watcher.getByRole('button', { name: 'Edit account' }).click();
  await expect(shown(watcher, 'account').getByRole('heading', { name: 'Account', exact: true })).toBeVisible();
  await watcher.keyboard.press('Escape');
  await expect(shown(watcher, 'account')).toHaveCount(0);
  await expect(messages(watcher)).toHaveCount(2);

  await expect.poll(async () => (await panel.boundingBox()).x).toBe(390 - 280);   // slid in
  await watcher.mouse.click(55, 400);   // the strip of art beside it
  await expect(panel).toBeHidden();
  await expect(tab(watcher, 'ROOM')).toHaveAttribute('aria-selected', 'true');
});

test('a host whose window narrows keeps the room, and « shows its chat', async ({ page: host }) => {
  await goLive(host, fakeRoom());
  await host.setViewportSize({ width: 760, height: 800 });
  await expect(host.locator('.side-panel')).toBeHidden();
  await host.getByRole('button', { name: 'Expand panel' }).click();
  await expect(chat(host).getByRole('button', { name: 'End room' })).toBeVisible();
  await live(host);
});
