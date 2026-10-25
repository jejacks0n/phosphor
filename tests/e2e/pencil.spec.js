// The Apple Pencil: iPad Safari sends a pen's pointer events and, alongside them, touch events whose
// touches are styluses (touchType 'stylus'). The pen is the pointer; its touches must not start the
// stroke a second time. A tap that wobbles a little still places the Edit Mode cursor.
import { test, expect } from '@playwright/test';
import { openApp, store, cellPoint } from './support.js';

test.use({ hasTouch: true });

// A pencil: real pen pointer events through the DevTools protocol, each followed by the stylus touch
// event iPad Safari sends with it (Chromium has no touchType, so it's set on the touch).
async function pencil(page) {
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, x, y) => page.evaluate(([type, x, y]) => {
    const target = document.elementFromPoint(x, y);
    const point = new Touch({ identifier: 7, target, clientX: x, clientY: y });
    Object.defineProperty(point, 'touchType', { value: 'stylus' });
    const touches = type === 'touchend' ? [] : [point];
    target.dispatchEvent(new TouchEvent(type, { touches, targetTouches: touches, changedTouches: [point], bubbles: true, cancelable: true }));
  }, [type, x, y]);
  const pen = (type, x, y) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'pen' });
  return {
    down: async ({ x, y }) => { await pen('mousePressed', x, y); await touch('touchstart', x, y); },
    move: async ({ x, y }) => { await pen('mouseMoved', x, y); await touch('touchmove', x, y); },
    up: async ({ x, y }) => { await pen('mouseReleased', x, y); await touch('touchend', x, y); },
  };
}

test('a Pencil drag with Select selects all it crosses', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  const from = await cellPoint(page, 2, 3), to = await cellPoint(page, 12, 8);
  const p = await pencil(page);
  await p.down(from);
  for (let i = 1; i <= 10; i++) await p.move({ x: from.x + ((to.x - from.x) * i) / 10, y: from.y + ((to.y - from.y) * i) / 10 });
  await p.up(to);
  expect(await store(page, 'workspace', (w) => w.selection)).toEqual({ c0: 2, r0: 3, c1: 12, r1: 8 });
  expect(await store(page, 'project', (pr) => pr.hasEdits)).toBe(false); // nothing was moved
});

test('a Pencil tap that wobbles across a cell edge places the Edit Mode cursor', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Edit Mode' }).click();
  const center = await cellPoint(page, 5, 5), next = await cellPoint(page, 6, 5);
  const edge = (center.x + next.x) / 2;
  const p = await pencil(page);
  await p.down({ x: edge - 1, y: center.y });
  await p.move({ x: edge + 2, y: center.y + 1 }); // a few pixels: into the next cell
  await p.up({ x: edge + 2, y: center.y + 1 });
  expect(await store(page, 'workspace', (w) => [w.activeTool, w.selection, w.textCursor])).toEqual(['text', null, { col: 5, row: 5 }]);
});
