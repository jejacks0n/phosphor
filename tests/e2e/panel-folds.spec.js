import { test, expect, openApp, store } from './support.js';

const group = (page, name) => page.getByRole('group', { name: new RegExp(name) });
const fold = (page, name) => group(page, name).getByRole('button', { name: new RegExp(`^${name}`) });

// The slider groups fold on their titles, say how many sliders are on while folded, reset folded, and stay as they
// were left after a reload.
test('a slider group folds on its title, counts what\'s on, resets folded, and stays folded after a reload', async ({ page }) => {
  await openApp(page);
  const adjustments = () => group(page, 'Adjustments');
  await expect(fold(page, 'Adjustments')).toHaveAttribute('aria-expanded', 'true');
  await adjustments().getByRole('slider', { name: 'Threshold', exact: true }).fill('128');
  await adjustments().getByRole('slider', { name: 'Contrast' }).fill('150');

  await fold(page, 'Adjustments').click();
  await expect(fold(page, 'Adjustments')).toHaveAttribute('aria-expanded', 'false');
  await expect(adjustments().getByRole('slider', { name: 'Contrast' })).toBeHidden();
  await expect(fold(page, 'Adjustments')).toHaveText(/Adjustments\s*2 on/);
  await expect(group(page, 'Transforms').getByRole('slider', { name: 'Hue shift' })).toBeVisible(); // the others stay open

  await page.reload();
  await expect(fold(page, 'Adjustments')).toHaveAttribute('aria-expanded', 'false');
  await expect(adjustments().getByRole('slider', { name: 'Contrast' })).toBeHidden();

  await adjustments().getByRole('button', { name: 'Reset' }).click();
  await expect.poll(() => store(page, 'project', (p) => [p.contrast, p.threshold])).toEqual([100, 0]);
  await expect(fold(page, 'Adjustments')).toHaveText(/^\s*Adjustments\s*$/); // nothing on, nothing said

  await fold(page, 'Adjustments').click();
  await expect(adjustments().getByRole('slider', { name: 'Contrast' })).toBeVisible();
});
