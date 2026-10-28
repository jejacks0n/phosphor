// The lobby picture on the host's page: a listed room's small frame of the art at its full width. It
// follows the host's view (the ANSI or PIXEL view last shown) until the host scrolls it, which pins it;
// Follow my view lets go. A link-only room has no lobby card, so no picture.
import { test, expect, tab, store } from './support.js';
import { fakeRoom, shown, goLive } from './social-support.js';

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

test('a listed room\'s lobby picture follows the host\'s view; scrolling it pins it, and Follow my view lets go', async ({ page }) => {
  await goLive(page, fakeRoom(), { image: 'images/tall.png' });   // 1,200 lines: the frame scrolls
  await expect(picture(page).getByRole('heading', { name: 'Lobby picture' })).toBeVisible();
  await expect(picture(page).getByText('Follows your view')).toBeVisible();
  await expect(picture(page).getByRole('button', { name: 'Follow my view' })).toHaveCount(0);
  // About 300 px of the art's full width (no scrolling across), about twice as wide as tall.
  const { width, height } = await frame(page).boundingBox();
  expect(width).toBeGreaterThan(280);
  expect(width).toBeLessThan(330);
  expect(width / height).toBeGreaterThan(1.8);
  expect(width / height).toBeLessThan(2.2);
  expect(await frame(page).evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0);
  expect(await pin(page)).toBe(null);

  const before = await place(page);
  await scrollAnsi(page, 0.2);
  await expect.poll(async () => (await place(page)).middle).not.toBe(before.middle);
  await expect.poll(() => frame(page).evaluate((el) => el.scrollTop)).toBeGreaterThan(0);   // the frame went there by itself
  expect(await pin(page)).toBe(null);   // a scroll made by code isn't the host's
  // The frame's middle line is the view's middle line.
  await expect.poll(async () => {
    const { top, middle } = await frame(page).evaluate((el) => {
      const lh = el.firstElementChild.getBoundingClientRect().height / 1200;
      return { top: el.scrollTop / lh, middle: (el.scrollTop + el.clientHeight / 2) / lh };
    });
    return Math.abs(middle - (await place(page)).middle) <= 1 && top > 0;
  }).toBe(true);

  const box = await frame(page).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 300);
  await expect(picture(page).getByText('Pinned')).toBeVisible();
  const pinned = await pin(page);
  expect(pinned).toEqual(expect.any(Number));
  await expect(picture(page).getByRole('button', { name: 'Follow my view' })).toBeVisible();

  await scrollAnsi(page, 0.8);
  await page.waitForTimeout(500);
  expect(await pin(page)).toBe(pinned);
  await expect(picture(page).getByText('Pinned')).toBeVisible();

  await picture(page).getByRole('button', { name: 'Follow my view' }).click();
  await expect(picture(page).getByText('Follows your view')).toBeVisible();
  await expect(picture(page).getByRole('button', { name: 'Follow my view' })).toHaveCount(0);
  expect(await pin(page)).toBe(null);
});

test('a pinned lobby picture is still at its line when you come back to the tab', async ({ page }) => {
  await goLive(page, fakeRoom(), { image: 'images/tall.png' });
  const box = await frame(page).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 600);
  await expect(picture(page).getByText('Pinned')).toBeVisible();
  const pinned = await pin(page);
  const lines = await store(page, 'project', (p) => Math.floor(p.rows / 2));
  const lineHeight = () => frame(page).evaluate((el) => el.firstElementChild.getBoundingClientRect().height).then((h) => h / lines);

  await tab(page, 'ANSI').click();
  await tab(page, 'SOCIAL').click();
  await expect(picture(page).getByText('Pinned')).toBeVisible();
  await expect.poll(async () => Math.round(await frame(page).evaluate((el) => el.scrollTop) / await lineHeight())).toBe(pinned);
  expect(await pin(page)).toBe(pinned);
});

test('a link-only room has no lobby picture', async ({ page }) => {
  await goLive(page, fakeRoom({ password: 'hunter22' }), { password: 'hunter22' });
  await expect(shown(page, 'host-room').getByRole('heading', { name: 'Room settings' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Lobby picture' })).toHaveCount(0);
  await expect(page.getByText('Follows your view')).toHaveCount(0);
});
