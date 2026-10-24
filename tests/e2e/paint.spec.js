import { test, expect } from '@playwright/test';
import { openApp, store, cellPoint, drag } from './support.js';

const row = (page, r) => store(page, 'project', `(p) => p.cells.slice(${r} * p.cols, ${r} * p.cols + 20).map((c) => c.fg.hex + c.bg.hex)`);

for (const tool of ['Pencil (1px)', 'Brush (soft)']) {
  test(`${tool} strokes change the cells under them`, async ({ page }) => {
    await openApp(page);
    const before = await row(page, 5);
    await page.getByRole('button', { name: tool }).click();
    await drag(page, await cellPoint(page, 4, 5, 0), await cellPoint(page, 14, 5, 0));
    const after = await row(page, 5);
    const changed = after.map((v, i) => v !== before[i]);
    expect(changed.slice(5, 14).every(Boolean)).toBe(true);
    expect(changed.slice(17).some(Boolean)).toBe(false);
    expect(await store(page, 'project', (p) => p.hasEdits)).toBe(true);
  });
}
