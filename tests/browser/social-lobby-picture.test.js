// The lobby picture (LobbyPicture.vue) on the host's page: unchecked, the frame follows the view and
// scrolling it only looks; "Use this exact position" pins the cells the frame shows, and from then on
// every scroll moves the pin. Wide art scrolls across too: the window is never wider than 80 columns.
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

// The picture over 300 lines of art `cols` wide, the room listed and the ANSI view at `row`, in a space
// `width` px wide.
async function mount(row, cols = 40, width = 400) {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/tall.png', { cols, rows: 600 });
  const room = useRoomStore();
  Object.assign(room, { role: 'host', status: 'live', room: { name: 'neon harbor', public: true } });
  Object.assign(workspace, { viewTab: 'output', ansiViewOrigin: { col: 0, row }, ansiViewSize: { cols: 40, rows: 30 }, ansiViewZoom: 1 });
  host = document.createElement('div');
  host.style.width = `${width}px`;
  document.body.append(host);
  app = createApp(LobbyPicture).use(getActivePinia());
  app.mount(host);
  const el = host.querySelector('.room-art');
  await expect.poll(() => el.scrollTop).toBeGreaterThan(0);
  await frames();
  const sizer = el.firstElementChild.getBoundingClientRect();
  const exact = host.querySelector('input[type=checkbox]');
  return { project, room, workspace, el, exact, cell: { width: sizer.width / cols, height: sizer.height / 300 } };
}

test('unchecked, the frame follows the view, and scrolling it only looks', async () => {
  const { room, workspace, el, exact } = await mount(200);
  expect(exact.checked).toBe(false);
  el.scrollTop -= 60;   // as a key or the wheel does
  await frames();
  expect(room.lobbyPin).toBe(null);
  const looked = el.scrollTop;
  workspace.ansiViewOrigin = { col: 0, row: 100 };
  await expect.poll(() => el.scrollTop).toBeLessThan(looked);
  await frames();
  expect(room.lobbyPin).toBe(null);
});

test('"Use this exact position" pins the cells the frame shows; scrolling moves the pin, and unchecking follows again', async () => {
  const { room, workspace, el, exact, cell } = await mount(200);
  el.scrollTop = 120 * cell.height;
  await frames();
  exact.click();
  expect(room.lobbyPin).toEqual({ col: 0, row: 120 });
  workspace.ansiViewOrigin = { col: 0, row: 20 };   // the view moves: the pin doesn't
  await frames();
  expect(room.lobbyPin).toEqual({ col: 0, row: 120 });
  el.scrollTop += 3 * cell.height;
  await expect.poll(() => room.lobbyPin).toEqual({ col: 0, row: 123 });
  exact.click();
  expect(room.lobbyPin).toBe(null);
  await expect.poll(() => Math.round(el.scrollTop / cell.height)).toBeLessThan(40);   // back around row 20
});

test('wide art: the window is 80 columns, the frame scrolls across, and the pin keeps the column', async () => {
  const { room, workspace, el, exact, cell } = await mount(200, 200);
  expect(Math.round(el.clientWidth / cell.width)).toBe(80);
  expect(el.scrollWidth).toBeGreaterThan(el.clientWidth);
  workspace.ansiViewOrigin = { col: 120, row: 200 };   // the view's middle is column 140
  await expect.poll(() => Math.round(el.scrollLeft / cell.width)).toBe(100);
  el.scrollLeft = 30 * cell.width;
  await frames();
  exact.click();
  expect(room.lobbyPin.col).toBe(30);
});

test('a pin is not rewritten when the art gets wider and the cells smaller under it', async () => {
  const { project, room, el, exact, cell } = await mount(200);
  el.scrollTop = 200 * cell.height;
  await frames();
  exact.click();
  expect(room.lobbyPin).toEqual({ col: 0, row: 200 });
  await loadImage(project, '/tests/fixtures/images/tall.png', { cols: 80, rows: 600 });   // twice the columns: half the cell
  await expect.poll(() => el.firstElementChild.getBoundingClientRect().height).toBeLessThan(300 * cell.height * 0.6);
  await frames();
  expect(room.lobbyPin).toEqual({ col: 0, row: 200 });
  const now = el.firstElementChild.getBoundingClientRect().height / 300;
  expect(Math.round(el.scrollTop / now)).toBe(200);
});

// The frame takes the art's size before the browser's resize observers run: changed from inside one, the
// elements around the art miss their notifications and the browser reports it as an error.
test('the frame follows the art without leaving a resize observer undelivered', async () => {
  const errors = [], note = (event) => errors.push(event.message);
  addEventListener('error', note);
  try {
    const { project, el, cell } = await mount(200, 40, 600);
    host.style.width = '260px';
    await expect.poll(() => el.firstElementChild.getBoundingClientRect().height).toBeLessThan(300 * cell.height);
    await loadImage(project, '/tests/fixtures/images/tall.png', { cols: 80, rows: 600 });
    await frames();
    expect(errors).toEqual([]);
  } finally {
    removeEventListener('error', note);
  }
});

// The frame's room: the picture's width inside its padding.
const room = () => {
  const section = host.querySelector('section.lobby-picture'), style = getComputedStyle(section);
  return section.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
};

// Cells are whole device pixels, so the frame can come up to a device pixel a column short of its room.
test('the frame fills the width it\'s given, never past it, and follows when that changes', async () => {
  await mount(200, 40, 600);
  const frame = host.querySelector('.frame');
  const fills = async () => {
    await frames();
    const { width } = frame.getBoundingClientRect();
    expect(width).toBeLessThanOrEqual(room() + 0.5);
    expect(width).toBeGreaterThan(room() - 40 / devicePixelRatio - 1);
  };
  await expect.poll(() => frame.getBoundingClientRect().width).toBeGreaterThan(500);
  await fills();
  host.style.width = '260px';
  await expect.poll(() => frame.getBoundingClientRect().width).toBeLessThan(240);
  await fills();
});
