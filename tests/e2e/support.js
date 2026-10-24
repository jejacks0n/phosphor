// The e2e flows' helpers: open the app with an image loaded through its file input, and read the
// stores (for assertions only; actions go through the UI).
import { fileURLToPath } from 'node:url';

export const fixture = (path) => fileURLToPath(new URL(`../fixtures/${path}`, import.meta.url));

// The app with an image loaded, on the ANSI tab.
export async function openApp(page, image = 'images/gradient.png') {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(fixture(image));
  await tab(page, 'ANSI').click();
  await settled(page);
}

// Save or export through the save dialog: the button, then the dialog's Save/Export; the download.
export async function saveAs(page, button, { name } = {}) {
  await page.getByRole('button', { name: button }).click();
  const dialog = page.getByRole('dialog');
  if (name !== undefined) await dialog.getByRole('textbox', { name: 'File name' }).fill(name);
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: /^(Save|Export)$/ }).click()]);
  return download;
}

// An editor tab: PIXEL, ANSI or SAUCE.
export const tab = (page, label) => page.getByRole('tab', { name: label, exact: true });

// A store's state, or an expression over it: store(page, 'project', (p) => p.cells.length).
export function store(page, name, read = (s) => s.$state) {
  return page.evaluate(([name, source]) => {
    const pinia = document.querySelector('#phosphor').__vue_app__.config.globalProperties.$pinia;
    return new Function('s', `return (${source})(s)`)(pinia._s.get(name));
  }, [name, typeof read === 'string' ? read : read.toString()]);
}

// No render queued or running.
export async function settled(page) {
  await page.waitForFunction(() => {
    const p = document.querySelector('#phosphor').__vue_app__.config.globalProperties.$pinia._s.get('project');
    return p.image && p.cells.length && !p._renderQueued && !p._rendering;
  });
}

// The page position of a cell's centre in the ANSI view (half: 0 top, 1 bottom, or the middle).
export async function cellPoint(page, col, row, half) {
  const box = await page.locator('.ansi-editor .display').boundingBox();
  const { cols, rows } = await store(page, 'project', (p) => ({ cols: p.cols, rows: Math.ceil(p.rows / 2) }));
  const w = box.width / cols, h = box.height / rows;
  return { x: box.x + (col + 0.5) * w, y: box.y + (row + (half === undefined ? 0.5 : half * 0.5 + 0.25)) * h };
}

export async function drag(page, from, to) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
}

// A row's characters, cols c0..c1 (a wide character's trail adds nothing).
export const chars = (page, row, c0, c1) => store(page, 'project', `(p) => p.cells.slice(${row} * p.cols + ${c0}, ${row} * p.cols + ${c1} + 1).filter((c) => c.wide !== 'trail').map((c) => c.char).join('')`);

// Edit Mode with the cursor at a cell, its text input focused (it takes focus a moment after the click).
export async function editAt(page, col, row) {
  await page.getByRole('button', { name: 'Edit Mode' }).click();
  const at = await cellPoint(page, col, row);
  await page.mouse.click(at.x, at.y);
  await page.getByRole('textbox', { name: 'Type into the canvas' }).waitFor();
  await page.waitForFunction(() => document.activeElement?.dataset?.textInput !== undefined);
}
