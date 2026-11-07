// Following a path on VECTOR, with real pointer events: + Add key's Follow a path… and a click on a Pen curve link a
// rectangle to it, dragging the rectangle slides it along the curve (one undo step), and the curve's End handle drags
// along it.
import { test, expect, openApp, store, tab, settled } from './support.js';

// The page position of grid pixel (x, y) in the VECTOR view.
async function gridPoint(page, x, y) {
  const box = await page.locator('.ansi-editor .display').boundingBox();
  const { cols, rows } = await store(page, 'project', (p) => ({ cols: p.cols, rows: p.rows }));
  return { x: box.x + x * (box.width / cols), y: box.y + y * (box.height / rows) };
}

async function dragPoints(page, from, to) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(from.x + (to.x - from.x) * i / 6, from.y + (to.y - from.y) * i / 6);
  await page.mouse.up();
}

const click = async (page, x, y) => page.mouse.click(...Object.values(await gridPoint(page, x, y)));
const panel = (page) => page.getByRole('region', { name: 'Keys' });
const menuItem = (page, name) => page.locator('.dropdown-content').getByRole('button', { name, exact: true });
const shape = (page, key) => store(page, 'project', `(p) => p.shapes.get('${key}')`);

// The middle of the selection box on VECTOR, in grid pixels: where the selected shape shows.
const boxCenter = (page) => page.evaluate(() => {
  const overlay = document.querySelector('[data-vector-overlay]').closest('svg'), box = overlay.querySelector('[data-vector-overlay] polygon.box');
  const pinia = document.querySelector('#phosphor').__vue_app__.config.globalProperties.$pinia, project = pinia._s.get('project');
  const corners = box.getAttribute('points').split(' ').map((pair) => pair.split(',').map(Number));
  const unit = { x: overlay.getBoundingClientRect().width / project.cols, y: overlay.getBoundingClientRect().height / project.rows };
  return { x: corners.reduce((s, [x]) => s + x, 0) / 4 / unit.x, y: corners.reduce((s, [, y]) => s + y, 0) / 4 / unit.y };
});

test('a rectangle follows a Pen curve picked with Follow a path…, drags along it, and the curve\'s End handle drags along it too', async ({ page }) => {
  await openApp(page);
  await tab(page, 'VECTOR').click();
  await page.getByRole('switch', { name: 'Animate' }).check();
  await page.evaluate(() => document.activeElement.blur()); // the tool keys are the canvas's again
  await settled(page);

  // A curve across at y = 30, from x 6 to 38, its middle point smooth (so it's straight, and its middle at x 22).
  await page.keyboard.press('p');
  await click(page, 6, 30);
  await dragPoints(page, await gridPoint(page, 22, 30), await gridPoint(page, 26, 30));
  await click(page, 38, 30);
  await page.keyboard.press('Enter');
  const curve = await store(page, 'project', (p) => [...p.shapes.keys()][0]);
  expect((await shape(page, curve)).points).toHaveLength(3);
  const rect = await store(page, 'project', (p) => p.addShape({ z: 0, closed: true, fill: '#ff0000', stroke: null, width: 1, m: [1, 0, 0, 1, 0, 0],
    points: [[20, 8, 0, 0, 0, 0, 0], [24, 8, 0, 0, 0, 0, 0], [24, 12, 0, 0, 0, 0, 0], [20, 12, 0, 0, 0, 0, 0]] }));
  await page.getByRole('toolbar', { name: 'Animation' }).getByRole('button', { name: 'Add frame' }).click();
  await page.getByRole('button', { name: /^Blank/ }).click();
  await page.keyboard.press('v');
  await settled(page);

  // Select the rectangle, + Add key → Follow a path…, and click the curve.
  await click(page, 22, 10);
  expect(await store(page, 'workspace', (w) => w.vectorSelected)).toEqual([rect]);
  await panel(page).locator('.add-key .dropdown-trigger').click();
  await menuItem(page, 'Follow a path…').click();
  await expect(page.getByText('Follow a path: click the line or shape to follow. Esc cancels')).toBeVisible();
  expect(await store(page, 'workspace', (w) => w.pickingPath)).toBe(rect);
  await click(page, 14, 30);
  await expect.poll(() => store(page, 'workspace', (w) => w.pickingPath)).toBe(null);
  expect((await shape(page, rect)).follow).toEqual({ key: curve });
  expect((await shape(page, rect)).along).toBeCloseTo(0.5, 2);
  await expect(panel(page).locator('[data-part="along"]')).toBeVisible();
  const placed = await boxCenter(page);
  expect(placed.x).toBeCloseTo(22, 0);
  expect(placed.y).toBeCloseTo(30, 0);

  // Dragged up and along, it slides along the curve, staying on it; one undo puts it back.
  await dragPoints(page, await gridPoint(page, 22, 30), await gridPoint(page, 30, 26));
  expect((await shape(page, rect)).along).toBeCloseTo(0.75, 2);
  const slid = await boxCenter(page);
  expect(slid.x).toBeCloseTo(30, 0);
  expect(slid.y).toBeCloseTo(30, 0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(async () => (await shape(page, rect)).along).toBeCloseTo(0.5, 2);
  expect((await boxCenter(page)).x).toBeCloseTo(22, 0);

  // The curve: + Add key → End, and its End handle dragged halfway back.
  await click(page, 10, 30);
  expect(await store(page, 'workspace', (w) => w.vectorSelected)).toEqual([curve]);
  await panel(page).locator('.add-key .dropdown-trigger').click();
  await menuItem(page, 'End').click();
  await expect(page.locator('[data-vector-overlay] circle.handle.trim[data-trim="end"]')).toHaveCount(1);
  await dragPoints(page, await gridPoint(page, 38, 30), await gridPoint(page, 22, 31));
  expect((await shape(page, curve)).end).toBeCloseTo(0.5, 1);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  // How tall a strip, down through the middle of what locator finds, a finger gets it in: the pixels from 30 above its
  // middle to 30 below where the element there is it, or inside it.
  const reach = (locator) => locator.evaluate((el) => {
    const box = el.getBoundingClientRect(), x = box.left + box.width / 2, y = box.top + box.height / 2;
    let n = 0;
    for (let dy = -30; dy <= 30; dy++) n += el.contains(document.elementFromPoint(x, y + dy)) ? 1 : 0;
    return n;
  });

  test('the Along menu\'s name and Guide take a finger 40px tall, and + Add key\'s items are each 40px', async ({ page }) => {
    await openApp(page);
    await tab(page, 'VECTOR').click();
    await page.getByRole('switch', { name: 'Animate' }).check();
    const [path, dot] = await store(page, 'project', (p) => [
      p.addShape({ z: 0, closed: false, fill: null, stroke: '#00ff00', width: 1, m: [1, 0, 0, 1, 0, 0], points: [[4, 20, 0, 0, 0, 0, 0], [30, 20, 0, 0, 0, 0, 0]] }),
      p.addShape({ z: 1, closed: true, fill: '#ff0000', stroke: null, width: 1, m: [1, 0, 0, 1, 0, 0], points: [[2, 2, 0, 0, 0, 0, 0], [6, 2, 0, 0, 0, 0, 0], [6, 6, 0, 0, 0, 0, 0], [2, 6, 0, 0, 0, 0, 0]] }),
    ]);
    await store(page, 'project', `(p) => { p.addFrame('blank'); p.followPath('${dot}', '${path}'); }`);
    await store(page, 'workspace', `(w) => { w.vectorSelected = ['${dot}']; }`);
    const along = panel(page).locator('.along .dropdown-trigger');
    await expect(along).toBeVisible();
    expect(await reach(along)).toBeGreaterThanOrEqual(40);

    await store(page, 'workspace', `(w) => { w.vectorSelected = ['${path}']; }`);
    const guide = panel(page).getByRole('button', { name: 'Guide', exact: true });
    await expect(guide).toBeVisible();
    expect(await reach(guide)).toBeGreaterThanOrEqual(40);

    await panel(page).locator('.add-key .dropdown-trigger').click();
    const heights = await page.locator('.dropdown-content button').evaluateAll((items) => items.map((b) => Math.round(b.getBoundingClientRect().height)));
    expect(heights.length).toBeGreaterThan(1);
    expect(new Set(heights)).toEqual(new Set([40]));
  });
});
