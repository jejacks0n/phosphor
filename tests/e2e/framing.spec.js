// Another site can't frame the app to lay its own page over it (a click on Join or Report it didn't mean): the host's
// Content-Security-Policy header says frame-ancestors 'none' (the preview sends the built _headers the same way), and
// a meta tag can't say it.
import { test, expect, openApp } from './support.js';

test.use({ expectedRefusal: /frame-ancestors/ });

// The framing page has the app's own address: a browser won't let a public site frame localhost, and the check is
// only whether the app is framed, not by whom.
test('framed, the browser refuses the app; on its own it shows', async ({ page, baseURL }) => {
  await page.route(`${baseURL}/framing`, (route) => route.fulfill({ contentType: 'text/html', body: `<iframe src="${baseURL}/" width="1200" height="800"></iframe>` }));
  const refusal = page.waitForEvent('console', (m) => m.text().includes('frame-ancestors'));
  await page.goto(`${baseURL}/framing`);
  await refusal;
  await expect(page.frameLocator('iframe').locator('#phosphor')).toHaveCount(0);

  await openApp(page);
  expect(await page.locator('html').evaluate((el) => getComputedStyle(el).display)).not.toBe('none');
});
