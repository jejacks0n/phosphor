import { test, expect, store, cellPoint } from './support.js';
import { fakeRoom, goLive, chat } from './social-support.js';

// Alt+T on the page, in a room on the fake server: a real Option+T (its code KeyT, carrying the Mac's †) from the art puts
// the cursor in the chat box and types nothing there; Escape puts focus back on the art, whose next key is a tool's.
test('in a room Option+T from the art focuses the chat box typing no †, and after Escape P chooses the Pencil', async ({ page }) => {
  await goLive(page, fakeRoom());
  const box = chat(page).getByRole('textbox', { name: 'Message' });
  await store(page, 'workspace', (w) => w.setActiveTool('hand')); // a click on the art that draws nothing
  const at = await cellPoint(page, 4, 4);
  await page.mouse.click(at.x, at.y);
  await expect(page.locator('[data-art]').first()).toBeFocused();

  const cdp = await page.context().newCDPSession(page);
  const key = { modifiers: 1, key: '†', code: 'KeyT', windowsVirtualKeyCode: 84 };
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', text: '†', ...key });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key });
  await expect(box).toBeFocused();
  await expect(box).toHaveValue('');

  await page.keyboard.press('Escape');
  await expect(page.locator('[data-art]').first()).toBeFocused();
  await page.keyboard.press('p');
  expect(await store(page, 'workspace', (w) => w.activeTool)).toBe('pencil');
});
