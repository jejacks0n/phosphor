// Choose characters: it sits above Characters, and each choice shows only its own options.
import { test, expect, openApp, pickLayer, settled, store } from './support.js';

const panel = (page) => page.locator('aside.control-panel');
const cells = (page) => store(page, 'project', (p) => p.cells.map((c) => `${c.char}${c.fg.hex}${c.bg.hex}`).join());
const top = async (locator) => (await locator.boundingBox()).y;

test('Choose characters comes before Characters, and each choice shows its own options', async ({ page }) => {
  await openApp(page);
  await pickLayer(page, 'Base'); // the picture's characters are its layer's
  const choice = panel(page).locator('#charChoice');
  const seed = panel(page).locator('#seed');
  const solids = panel(page).getByRole('slider', { name: 'Solids' });
  const light = panel(page).getByRole('slider', { name: 'Pattern light' });

  await expect(choice).toHaveValue('random');
  await expect(choice.locator('option')).toHaveText(['Random', 'Best match', 'By shape']);
  expect(await top(choice)).toBeLessThan(await top(panel(page).locator('#chars')));
  await expect(seed).toBeVisible();
  await expect(solids).toHaveCount(0);
  await expect(light).toHaveCount(0);

  // Best match: no seed; the sliders come after Characters; the cells change
  const random = await cells(page);
  await choice.selectOption('best');
  await expect(seed).toHaveCount(0);
  await expect(solids).toHaveValue('25');
  await expect(light).toHaveValue('100');
  expect(await top(solids)).toBeGreaterThan(await top(panel(page).locator('#chars')));
  expect(await top(light)).toBeGreaterThan(await top(solids));
  await expect.poll(() => cells(page)).not.toBe(random);
  await settled(page);
  const best = await cells(page);

  await choice.selectOption('shape');
  await expect(seed).toHaveCount(0);
  await expect(solids).toBeVisible();
  await expect(light).toBeVisible();
  await expect.poll(() => cells(page)).not.toBe(best);

  // Color ASCII: By intensity or By shape; no Solids, and Pattern light only By shape
  await panel(page).locator('#renderStyle').selectOption('colorAscii');
  const ascii = panel(page).locator('#charChoiceAscii');
  await expect(choice).toHaveCount(0);
  await expect(ascii.locator('option')).toHaveText(['By intensity', 'By shape']);
  await expect(seed).toHaveCount(0);
  await expect(solids).toHaveCount(0);
  await expect(light).toHaveCount(0);
  await ascii.selectOption('shape');
  await expect(light).toBeVisible();
  await expect(solids).toHaveCount(0);

  // Monochrome ASCII
  await panel(page).locator('#renderStyle').selectOption('ascii');
  await expect(ascii.locator('option')).toHaveText(['By brightness', 'By shape']);
  await expect(ascii).toHaveValue('shape');
  await expect(light).toBeVisible();
  await expect(solids).toHaveCount(0);
  await ascii.selectOption('weight');
  await expect(light).toHaveCount(0);
});

test('an unknown choice (from an old file or a room) shows its options as Random, the way it converts', async ({ page }) => {
  await openApp(page);
  await store(page, 'project', (p) => p.setLayerChars('edit', { charChoice: 'bogus' })); // the layer picked, Layer 1
  await expect(panel(page).locator('#seed')).toBeVisible();
  await expect(panel(page).getByRole('slider', { name: 'Solids' })).toHaveCount(0);
  await expect(panel(page).getByRole('slider', { name: 'Pattern light' })).toHaveCount(0);
});

// The Blocks & shades preset (▄░▒▓█): tests/unit/settings.test.js; choosing a preset: charset-field.spec.js.
