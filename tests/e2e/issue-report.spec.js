// An issue report, from the beta banner to the server and back, in the built app: the page is a pre-release because it's
// on next.phosphor.work (the preview build, served there for this spec), its HISTORY tab is hidden, and the report it
// sends carries the drawing and the steps the built app kept.
import { readFileSync } from 'node:fs';
import { test, expect, fixture, imageInput, settled, tab } from './support.js';
import { fakeIssueReports } from './social-support.js';

const NEXT = 'https://next.phosphor.work';
const SERVER = 'https://api.phosphor.work'; // where a page that isn't on localhost posts
// What the screen says on next: Beta, or Alpha while package.json's version is an alpha's (src/lib/buildStage.js).
const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const STAGE = /-alpha(\.|$)/.test(version) ? 'Alpha' : 'Beta';

// next.phosphor.work answered by the preview build, and the hosted server by no one but the spec's fake.
test.beforeEach(async ({ context, baseURL }) => {
  await context.route(`${SERVER}/**`, (route) => route.abort());
  await context.route(`${NEXT}/**`, async (route) => {
    const { pathname, search } = new URL(route.request().url());
    await route.fulfill({ response: await route.fetch({ url: `${baseURL}${pathname}${search}` }) });
  });
});

test('on next, Report an issue under the logo sends what was written, the drawing and the steps, and says which issue it became', async ({ page }) => {
  const reports = await fakeIssueReports(page, { origin: SERVER });
  await page.goto(`${NEXT}/`);
  await imageInput(page).setInputFiles(fixture('images/gradient.png'));
  await tab(page, 'ANSI').click();
  await settled(page);

  // A built app: the screen under the logo says Beta (or Alpha), in the art's font, and the steps are kept with no HISTORY
  // tab showing.
  const banner = page.locator('aside.control-panel p.stage');
  await expect(banner).toHaveText(new RegExp(`^\\s*▓▒░ ${STAGE} ░▒▓\\s*Report an issue\\s*$`));
  await expect(banner).toHaveCSS('font-family', /IBM VGA 8x16/);
  await expect(page.locator('.side-panel').getByRole('tab', { name: 'History' })).toHaveCount(0);

  await banner.getByRole('button', { name: 'Report an issue' }).click();
  const dialog = page.getByRole('dialog', { name: 'Report an issue' });
  await expect(dialog.getByLabel('What were you doing?')).toBeFocused();
  await expect(dialog.getByText('What you write will create a public issue on GitHub.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Send' })).toBeDisabled();
  await dialog.getByLabel('What were you doing?').fill('Opening a picture');
  await dialog.getByLabel('What went wrong?').fill('The sky came out too dark');
  await expect(dialog.getByRole('checkbox', { name: 'Send my drawing and this session\'s steps' })).toBeChecked();
  await expect(dialog.locator('p.what')).toHaveText(/^gradient\.pho, \d+(\.\d)? (KB|MB) · \d+ steps$/);
  expect(reports).toEqual([]); // nothing before Send

  await dialog.getByRole('button', { name: 'Send' }).click();
  await expect(dialog.getByRole('status')).toHaveText('Sent. Thank you. It\'s issue #312 on GitHub.');
  await expect(dialog.getByRole('link', { name: 'issue #312' })).toHaveAttribute('href', 'https://github.com/jejacks0n/phosphor/issues/312');

  expect(reports).toHaveLength(1);
  const [{ origin, fields, files }] = reports;
  expect(origin).toBe(NEXT);
  expect(fields).toEqual({
    doing: 'Opening a picture', wrong: 'The sky came out too dark', platform: 'web', agent: expect.stringMatching(/^Chrome \d+ on \w+$/),
    packageVersion: expect.stringMatching(/^\d+\.\d+\.\d+/), build: expect.stringMatching(/^\d+\.\d+\.\d{8}\S* \([0-9a-f]{7}(-dirty)?\)$/),
  });
  expect([files.drawing.name, files.drawing.type]).toEqual(['gradient.pho', 'image/png']);
  expect(files.drawing.bytes.subarray(1, 4).toString('latin1')).toBe('PNG');
  expect(['phPc', 'phPr'].some((type) => files.drawing.bytes.includes(Buffer.from(type)))).toBe(true); // the project inside it, in either form (docs/pho.md)
  expect([files.steps.name, files.steps.type]).toEqual(['steps.txt', 'text/plain']);
  const steps = files.steps.bytes.toString('utf8');
  expect(steps).toMatch(/^Phosphor \S+ \(\S+\)\n/);
  expect(steps).toMatch(/^\+\d+\.\ds {2}project\.replaceImage \(HTMLImageElement, /m); // the built app kept the session's steps
  expect(steps).not.toMatch(/projectFile|artDrawingCells|sliderValues/); // and none of the report's own making, or of what only reads

  await dialog.getByRole('button', { name: 'Close' }).last().click();
  await expect(dialog).toHaveCount(0);
  await expect(banner.getByRole('button', { name: 'Report an issue' })).toBeFocused();
});

test('phosphor.history(true) in the console shows the HISTORY tab in a built app, a reload keeps it, and false hides it', async ({ page }) => {
  await page.goto(`${NEXT}/`);
  const history = page.locator('.side-panel').getByRole('tab', { name: 'History' });
  await expect(history).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys(window.phosphor))).toEqual(['history']);
  await page.evaluate(() => window.phosphor.history(true));
  await history.click();
  await expect(page.locator('aside.history')).toBeVisible();
  await page.reload();
  await expect(history).toBeVisible();
  await page.evaluate(() => window.phosphor.history(false));
  await expect(history).toHaveCount(0);
});
