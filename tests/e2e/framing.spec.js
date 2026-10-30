// Another site can't frame the app to lay its own page over it (a click on Join or Report it didn't mean): framed,
// the app hides itself. Pages served from GitHub can't send a header for this, and a meta tag can't say it.
import { test, expect, openApp } from './support.js';

// The framing page has the app's own address: a browser won't let a public site frame localhost, and the check is
// only whether the app is framed, not by whom.
test('framed, the app shows nothing; on its own it shows', async ({ page, baseURL }) => {
  await page.route(`${baseURL}/framing`, (route) => route.fulfill({ contentType: 'text/html', body: `<iframe src="${baseURL}/" width="1200" height="800"></iframe>` }));
  await page.goto(`${baseURL}/framing`);
  const app = page.frameLocator('iframe').locator('html');
  await expect(page.frameLocator('iframe').locator('#phosphor')).toBeAttached();
  await expect.poll(() => app.evaluate((el) => getComputedStyle(el).display)).toBe('none');

  await openApp(page);
  expect(await page.locator('html').evaluate((el) => getComputedStyle(el).display)).not.toBe('none');
});
