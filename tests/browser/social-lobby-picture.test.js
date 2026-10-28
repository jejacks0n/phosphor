// The lobby picture (LobbyPicture.vue) on the host's page: a scroll the frame makes by itself while
// following the view never pins; one that lands somewhere else is the host's and pins the window to the
// line it landed on, and from then on every scroll moves the pin.
import { test, expect, afterEach } from 'vitest';
import { createApp } from 'vue';
import { getActivePinia } from 'pinia';
import { createTestApp, loadImage } from '../support/app.js';
import { useRoomStore } from '@/store/RoomStore';
import LobbyPicture from '@/components/social/LobbyPicture.vue';

let app = null, host = null;
afterEach(() => {
  app?.unmount();
  host?.remove();
});

const frames = async (n = 4) => {
  for (let i = 0; i < n; i++) await new Promise((resolve) => requestAnimationFrame(resolve));
};

// The picture over 300 lines of art, the room listed and the ANSI view at `row`.
async function mount(row) {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/tall.png', { cols: 40, rows: 600 });
  const room = useRoomStore();
  Object.assign(room, { role: 'host', status: 'live', room: { name: 'neon harbor', public: true } });
  Object.assign(workspace, { viewTab: 'output', ansiViewOrigin: { col: 0, row }, ansiViewSize: { cols: 40, rows: 30 }, ansiViewZoom: 1 });
  host = document.createElement('div');
  document.body.append(host);
  app = createApp(LobbyPicture).use(getActivePinia());
  app.mount(host);
  const el = host.querySelector('.room-art');
  await expect.poll(() => el.scrollTop).toBeGreaterThan(0);
  await frames();
  return { room, workspace, el };
}

test('scrolls made by code while following never pin: not the first centering, not the next view', async () => {
  const { room, workspace, el } = await mount(200);
  expect(room.lobbyPin).toBe(null);
  const first = el.scrollTop;
  workspace.ansiViewOrigin = { col: 0, row: 100 };
  await expect.poll(() => el.scrollTop).toBeLessThan(first);
  await frames();
  expect(room.lobbyPin).toBe(null);
});

test('a scroll of the host\'s pins the line it landed on, and then every scroll moves the pin', async () => {
  const { room, workspace, el } = await mount(200);
  const lineHeight = el.firstElementChild.getBoundingClientRect().height / 300;
  el.scrollTop += 40;   // as a key or the wheel does
  await expect.poll(() => room.lobbyPin).toBe(Math.round(el.scrollTop / lineHeight));
  const pinned = room.lobbyPin;
  workspace.ansiViewOrigin = { col: 0, row: 20 };   // the view moves: the pin doesn't
  await frames();
  expect(room.lobbyPin).toBe(pinned);
  el.scrollTop += 3 * lineHeight;   // a slow drag: a few lines
  await expect.poll(() => room.lobbyPin).toBe(pinned + 3);
  room.followLobby();
  await expect.poll(() => el.scrollTop).not.toBe((pinned + 3) * lineHeight);
  expect(room.lobbyPin).toBe(null);
});

test('a pin is not rewritten when the art shrinks and the browser clamps the frame\'s scroll', async () => {
  const { room, el } = await mount(200);
  const sizer = el.firstElementChild, lineHeight = sizer.getBoundingClientRect().height / 300;
  el.scrollTop = 200 * lineHeight;
  await expect.poll(() => room.lobbyPin).toBe(200);
  sizer.style.height = `${150 * lineHeight}px`;   // half the line height
  expect(el.scrollTop).toBeLessThan(200 * lineHeight);   // the layout just clamped it
  el.dispatchEvent(new Event('scroll'));   // the clamp's scroll event, before the frame has settled
  await frames();
  expect(room.lobbyPin).toBe(200);
});
