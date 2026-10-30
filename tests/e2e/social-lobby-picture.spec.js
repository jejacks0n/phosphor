// The lobby picture on the host's page: a listed room's small frame of the art, up to 80 columns of
// it. It follows the host's view (the ANSI or PIXEL view last shown); scrolling it only looks, until
// "Use this exact position" pins the cells it shows. A link-only room has no lobby card, so no picture.
import { test, expect, tab, store, openApp } from './support.js';
import { fakeServer, fakeRoom, member, shown, goLive } from './social-support.js';

const picture = (page) => page.getByRole('region', { name: 'Lobby picture' });
const frame = (page) => picture(page).getByLabel('The room\'s art');
const place = (page) => store(page, 'room', (r) => r.lobbyPlace);
const pin = (page) => store(page, 'room', (r) => r.lobbyPin);

// The ANSI view scrolled to `at` (0 to 1 of the way down), and back on the SOCIAL tab.
async function scrollAnsi(page, at) {
  await tab(page, 'ANSI').click();
  const article = page.locator('.ansi-editor > article');
  await article.evaluate((el, at) => { el.scrollTop = (el.scrollHeight - el.clientHeight) * at; }, at);
  await expect.poll(() => store(page, 'workspace', (w) => w.ansiViewOrigin.row)).toBeGreaterThan(at ? 0 : -1);
  await tab(page, 'SOCIAL').click();
}

const exact = (page) => picture(page).getByRole('checkbox', { name: 'Use this exact position' });
// The frame's top line, in the art's lines.
const topLine = (page, lines) => frame(page).evaluate((el, lines) => el.scrollTop / (el.firstElementChild.getBoundingClientRect().height / lines), lines);

test('a listed room\'s lobby picture follows the host\'s view; scrolling it only looks, and the checkbox pins what it shows', async ({ page }) => {
  await goLive(page, fakeRoom(), { image: 'images/tall.png' });   // 1,200 lines: the frame scrolls
  await expect(picture(page).getByRole('heading', { name: 'Lobby picture' })).toBeVisible();
  await expect(exact(page)).not.toBeChecked();
  // About 300 px of the art, about twice as wide as tall.
  const { width, height } = await frame(page).boundingBox();
  expect(width).toBeGreaterThan(280);
  expect(width).toBeLessThan(330);
  expect(width / height).toBeGreaterThan(1.8);
  expect(width / height).toBeLessThan(2.2);
  expect(await pin(page)).toBe(null);

  const before = await place(page);
  await scrollAnsi(page, 0.2);
  await expect.poll(async () => (await place(page)).middleRow).not.toBe(before.middleRow);
  // The frame went there by itself: its top line is the window's.
  await expect.poll(async () => {
    const { middleRow } = await place(page), rows = await frame(page).evaluate((el) => el.clientHeight / (el.firstElementChild.getBoundingClientRect().height / 1200));
    const row = Math.max(0, Math.min(Math.round(middleRow - rows / 2), 1200 - rows));
    return Math.abs(await topLine(page, 1200) - row) < 0.5;
  }).toBe(true);

  // Scrolling it looks, and pins nothing.
  const followed = await topLine(page, 1200);
  const box = await frame(page).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 300);
  await expect.poll(() => topLine(page, 1200)).toBeGreaterThan(followed + 1);
  expect(await pin(page)).toBe(null);

  // Checked: the card shows what the frame does, whatever the view does.
  const shown = Math.round(await topLine(page, 1200));
  await exact(page).check();
  expect(await pin(page)).toEqual({ col: 0, row: shown });
  expect(await place(page)).toEqual({ col: 0, row: shown });
  await scrollAnsi(page, 0.8);
  await expect.poll(() => store(page, 'workspace', (w) => w.sharedView.row)).toBeGreaterThan(900);   // the view has moved
  await expect(exact(page)).toBeChecked();
  expect(await pin(page)).toEqual({ col: 0, row: shown });

  // Scrolling it now moves the pin; unchecked, it follows the view again.
  await frame(page).focus();
  await page.keyboard.press('PageDown');
  await expect.poll(async () => (await pin(page)).row).toBeGreaterThan(shown);
  await exact(page).uncheck();
  expect(await pin(page)).toBe(null);
  await expect.poll(() => topLine(page, 1200)).toBeGreaterThan(900);
});

test('a pinned lobby picture is still at its line when you come back to the tab', async ({ page }) => {
  await goLive(page, fakeRoom(), { image: 'images/tall.png' });
  await frame(page).evaluate((el) => { el.scrollTop = el.scrollHeight / 2; });
  await exact(page).check();
  const pinned = await pin(page);
  expect(pinned.row).toBeGreaterThan(0);

  await tab(page, 'ANSI').click();
  await tab(page, 'SOCIAL').click();
  await expect(exact(page)).toBeChecked();
  await expect.poll(async () => Math.round(await topLine(page, 1200))).toBe(pinned.row);
  expect(await pin(page)).toEqual(pinned);
});

test('the lobby picture is picked in Setup room too, for a listed room only, and going live keeps the pin', async ({ page }) => {
  const server = await fakeServer(page, { me: member(), room: fakeRoom() });
  await openApp(page, 'images/tall.png');
  await tab(page, 'SOCIAL').click();
  await page.getByRole('button', { name: 'Start a room' }).click();
  const setup = shown(page, 'start-room');
  await expect(picture(page)).toBeVisible();
  await setup.getByRole('radio', { name: 'Only with the link' }).check();
  await expect(picture(page)).toHaveCount(0);   // no lobby card, so no picture
  await setup.getByRole('radio', { name: 'Anyone, in the lobby' }).check();

  await frame(page).evaluate((el) => { el.scrollTop = el.scrollHeight / 3; });
  await exact(page).check();
  await expect.poll(() => pin(page)).not.toBe(null);
  const pinned = await pin(page);
  await setup.getByRole('textbox', { name: 'Room name' }).fill('neon harbor');
  await setup.getByRole('button', { name: 'Go live' }).click();
  await expect.poll(() => store(page, 'room', (r) => r.status)).toBe('live');
  expect(server.sent('POST', '/api/rooms')).toHaveLength(1);
  await expect(exact(page)).toBeChecked();
  expect(await pin(page)).toEqual(pinned);
});

