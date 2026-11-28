// The Apple Pencil: iPad Safari sends a pen's pointer events and, alongside them, touch events whose
// touches are styluses (touchType 'stylus'). The pen is the pointer; its touches must not start the
// stroke a second time. A tap that wobbles a little still places the Edit Mode cursor. Its pressure reaches the Brush,
// and once it has drawn, a finger pans and never draws.
import { test, expect } from './support.js';
import { openApp, store, cellPoint, tab, settled, pixelPoint } from './support.js';

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
  let force = 0.5; // the pen's pressure while it's down (Chromium's own pen reads 0.5 when it's given none)
  const pen = (type, x, y, buttons = type === 'mouseReleased' ? 0 : 1) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: 1, pointerType: 'pen', force: type === 'mouseReleased' ? 0 : force });
  return {
    // A move as the Pencil lifts, before its up: no pressure, or no button either.
    lifting: async ({ x, y }, buttons) => { const f = force; force = 0; await pen('mouseMoved', x, y, buttons); force = f; },
    press: (f) => { force = f; },
    down: async ({ x, y }) => { await pen('mousePressed', x, y); await touch('touchstart', x, y); },
    move: async ({ x, y }) => { await pen('mouseMoved', x, y); await touch('touchmove', x, y); },
    up: async ({ x, y }) => { await pen('mouseReleased', x, y); await touch('touchend', x, y); },
  };
}

async function penStroke(p, from, to, steps = 10) {
  await p.down(from);
  for (let i = 1; i <= steps; i++) await p.move({ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps });
  await p.up(to);
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

test('a Pencil\'s pressure reaches the Brush: a light stroke is thinner than a firm one', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('b');
  await store(page, 'workspace', (w) => { w.editBrushSize = 8; w.editBrushHardness = 100; });
  const p = await pencil(page);
  p.press(1);
  await penStroke(p, await cellPoint(page, 4, 4), await cellPoint(page, 30, 4));
  p.press(0.2);
  await penStroke(p, await cellPoint(page, 4, 14), await cellPoint(page, 30, 14));
  // The grid pixels down the column through each stroke's middle that it painted.
  const thickness = (row) => store(page, 'project', `(p) => Array.from({ length: 12 }, (_, i) => p.paintLayer.pixelAt(17, ${row} * 2 + 1 - 6 + i)).filter(Boolean).length`);
  const firm = await thickness(4), light = await thickness(14);
  expect(light).toBeGreaterThan(0);
  expect(light).toBeLessThan(firm);
});

test('once a Pencil has drawn, a finger pans the view and draws nothing', async ({ page }) => {
  await openApp(page);
  await tab(page, 'PIXEL').click();
  await settled(page);
  await page.keyboard.press('b');
  const p = await pencil(page);
  await penStroke(p, await pixelPoint(page, 4, 4), await pixelPoint(page, 10, 4), 3);
  const painted = () => store(page, 'project', (pr) => { let n = 0; for (let y = 0; y < pr.rows; y++) for (let x = 0; x < pr.cols; x++) if (pr.paintLayer.pixelAt(x, y)) n++; return n; });
  const before = await painted();
  expect(before).toBeGreaterThan(0);
  const view = () => page.evaluate(() => { const v = document.querySelector('article .display').closest('article'); return { x: v.scrollLeft, y: v.scrollTop }; });
  const at = await view();
  const cdp = await page.context().newCDPSession(page);
  const from = await pixelPoint(page, 20, 20);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
  for (let s = 1; s <= 10; s++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x - 3 * s, y: from.y - 3 * s }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect(await painted()).toBe(before);   // no mark
  expect(await view()).not.toEqual(at);   // the view moved
});

// A palm resting on the screen while the Pencil draws, come down before the pen or after it: the stroke is laid whole,
// the palm marks nothing and pinches nothing.
for (const palmFirst of [false, true]) {
  test(`a palm on the screen ${palmFirst ? 'before' : 'after'} the Pencil comes down leaves the stroke whole`, async ({ page }) => {
    await openApp(page);
    await page.keyboard.press('b');
    await store(page, 'workspace', (w) => { w.editBrushSize = 6; w.editBrushHardness = 100; w.editBrushFlow = 100; });
    const p = await pencil(page);
    p.press(1);
    await penStroke(p, await cellPoint(page, 2, 2), await cellPoint(page, 3, 2), 2); // the pen has drawn
    const zoom = await store(page, 'workspace', (w) => w.ansiZoom);
    const cdp = await page.context().newCDPSession(page);
    const palm = await cellPoint(page, 40, 20);
    const finger = (type, d = 0) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: palm.x + d, y: palm.y + d }] });
    const from = await cellPoint(page, 4, 8), to = await cellPoint(page, 30, 8);
    if (palmFirst) { await finger('touchStart'); await finger('touchMove', 4); }
    await p.down(from);
    if (!palmFirst) { await finger('touchStart'); }
    for (let i = 1; i <= 10; i++) {
      await p.move({ x: from.x + ((to.x - from.x) * i) / 10, y: from.y });
      await finger('touchMove', i % 2 ? 3 : -3); // the palm shifts as the hand moves
    }
    await p.up(to);
    await finger('touchEnd');
    const row = await store(page, 'project', (pr) => Array.from({ length: 27 }, (_, i) => !!pr.paintLayer.pixelAt(4 + i, 17)));
    expect(row.every(Boolean)).toBe(true); // the whole stroke
    expect(await store(page, 'project', (pr) => { let n = 0; for (let y = 30; y < 50; y++) for (let x = 34; x < 46; x++) if (pr.paintLayer.pixelAt(x, y)) n++; return n; })).toBe(0); // nothing at the palm
    expect(await store(page, 'workspace', (w) => w.ansiZoom)).toBe(zoom);
  });
}

// A pen that senses no pressure (the Apple Pencil (USB-C) reads 0.240 in iPad Safari however hard it's pressed; others
// read the spec's 0.5) draws as the sliders say, as a mouse does.
for (const flat of [0.24, 0.5]) {
  test(`a pen whose pressure stays at ${flat} draws at the sliders' size, as the mouse does`, async ({ page }) => {
    await openApp(page);
    await page.keyboard.press('b');
    await store(page, 'workspace', (w) => { w.editBrushSize = 8; w.editBrushHardness = 100; });
    const p = await pencil(page);
    p.press(flat);
    await penStroke(p, await cellPoint(page, 4, 4), await cellPoint(page, 30, 4));
    await penStroke(p, await cellPoint(page, 4, 14), await cellPoint(page, 30, 14));
    await page.mouse.move((await cellPoint(page, 4, 24)).x, (await cellPoint(page, 4, 24)).y);
    await page.mouse.down();
    await page.mouse.move((await cellPoint(page, 30, 24)).x, (await cellPoint(page, 30, 24)).y, { steps: 10 });
    await page.mouse.up();
    const thickness = (row) => store(page, 'project', `(p) => Array.from({ length: 12 }, (_, i) => p.paintLayer.pixelAt(17, ${row} * 2 + 1 - 6 + i)).filter(Boolean).length`);
    expect([await thickness(4), await thickness(14)]).toEqual([await thickness(24), await thickness(24)]); // as the mouse's
  });
}

// As a Pencil lifts, iPad Safari may send moves with no pressure, or with no button held, before its up: they're not the
// pen on the screen, and paint nothing (each used to be a stamp at the full size, a heavy mark where the stroke ended).
for (const buttons of [1, 0]) {
  test(`moves as the Pencil lifts (pressure 0${buttons ? '' : ', no button'}) leave no heavy mark at the stroke's end`, async ({ page }) => {
    await openApp(page);
    await page.keyboard.press('b');
    await store(page, 'workspace', (w) => { w.editBrushSize = 8; w.editBrushHardness = 100; });
    const p = await pencil(page);
    p.press(1);
    await penStroke(p, await cellPoint(page, 2, 2), await cellPoint(page, 3, 2), 2); // a firm stroke, then a light one: the pen senses pressure
    p.press(0.2);
    const from = await cellPoint(page, 4, 14), to = await cellPoint(page, 30, 14);
    await p.down(from);
    for (let i = 1; i <= 10; i++) await p.move({ x: from.x + ((to.x - from.x) * i) / 10, y: from.y });
    await p.lifting({ x: to.x + 1, y: to.y }, buttons);
    await p.lifting({ x: to.x + 2, y: to.y }, buttons);
    await p.up({ x: to.x + 2, y: to.y });
    const thickness = (col) => store(page, 'project', `(p) => Array.from({ length: 12 }, (_, i) => p.paintLayer.pixelAt(${col}, 14 * 2 + 1 - 6 + i)).filter(Boolean).length`);
    const middle = await thickness(17);
    expect(middle).toBeGreaterThan(0);
    expect(Math.max(await thickness(30), await thickness(31))).toBeLessThanOrEqual(middle); // the end no heavier than the rest
  });
}
