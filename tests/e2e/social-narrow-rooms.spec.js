// A narrow screen says rooms need a wider one, and a watcher can leave from it; widening brings the room back.
import { test, expect } from './support.js';
import { fakeRoom, ROOM_ID, watching, goLive, watcherPage, outOfRoom, live } from './social-support.js';

const words = (page) => page.getByText('Rooms need a wider screen.');

test('a watcher whose window narrows is told, can Exit, and widening brings the room back', async ({ page: host, context }) => {
  const room = fakeRoom();
  const watcher = await watching(host, context, room);
  await watcher.setViewportSize({ width: 760, height: 800 });
  await expect(words(watcher)).toBeVisible();
  await watcher.setViewportSize({ width: 1200, height: 800 });
  await expect(words(watcher)).toHaveCount(0);

  await watcher.setViewportSize({ width: 760, height: 800 });
  await words(watcher).locator('..').getByRole('button', { name: 'Exit' }).click();
  await outOfRoom(watcher);
  await expect(words(watcher)).toHaveCount(0);
});

test('a host whose window narrows is told, with no Exit, and the room goes on', async ({ page: host }) => {
  await goLive(host, fakeRoom());
  await host.setViewportSize({ width: 760, height: 800 });
  await expect(words(host)).toBeVisible();
  await expect(host.getByRole('button', { name: 'Exit' })).toHaveCount(0);
  await live(host);
});

test('a room link opened at phone width says so where it lands', async ({ context }) => {
  const watcher = await watcherPage(context, fakeRoom());
  await watcher.setViewportSize({ width: 390, height: 800 });
  await watcher.goto(`/#/social?room=${ROOM_ID}`);
  await expect(words(watcher)).toBeVisible();
});
