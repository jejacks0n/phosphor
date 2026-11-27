// The Pencil's Single and Double (ANSI view): drag from cell to cell and each cell gets the box piece
// its path needs, turning corners and joining the lines it crosses or lands on (Connect).
import { test, expect, afterEach } from 'vitest';
import { createApp } from 'vue';
import { createTestApp, loadImage } from '../support/app.js';
import EditToolbar from '@/components/EditToolbar.vue';
import { i18n } from '@/i18n';
import { cellIndex } from '@/lib/Cells';
import pencil from '@/tools/pencil';
import { setLocale } from '@/i18n';
import { CP437_BLOCKS, slotChars } from '@/lib/BitmapFont.js';

async function scene(settings = {}) {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 40, rows: 40 });
  Object.assign(workspace, { pencilDrawWith: 'single', pencilConnect: true, editFgColor: '#ffffff', editBgNone: true }, settings);
  // A drag through cells (col, row): positions at their centers, in grid pixels.
  const at = ([col, row]) => ({ x: col + 0.5, y: 2 * row + 1 });
  const ctx = { project, workspace, view: 'output' };
  const drag = (...cells) => {
    pencil.begin(ctx, at(cells[0]), {});
    for (let i = 1; i < cells.length; i++) pencil.move(ctx, at(cells[i - 1]), at(cells[i]));
    pencil.end(ctx);
  };
  const shiftClick = (cell) => {
    pencil.begin(ctx, at(cell), { shiftKey: true });
    pencil.end(ctx);
  };
  const row = (r, c0, c1) => Array.from({ length: c1 - c0 + 1 }, (_, i) => project.cells[cellIndex(c0 + i, r, project.cols)].char).join('');
  const col = (c, r0, r1) => Array.from({ length: r1 - r0 + 1 }, (_, i) => project.cells[cellIndex(c, r0 + i, project.cols)].char).join('');
  return { project, workspace, drag, shiftClick, row, col };
}

test('a drag right, then down, draws a line that turns the corner', async () => {
  const { drag, row, col } = await scene();
  drag([2, 2], [8, 2], [8, 6]);
  expect(row(2, 2, 8)).toBe('──────┐');
  expect(col(8, 3, 6)).toBe('││││');
});

test('a drag that comes back across itself joins where it crosses', async () => {
  const { drag, row, col } = await scene();
  drag([5, 2], [5, 8], [8, 8], [8, 5], [2, 5]); // down, right, up, then left across the first leg
  expect(row(5, 2, 8)).toBe('───┼──┐'); // the last corner comes up from below and turns left
  expect(col(5, 2, 8)).toBe('│││┼││└');
});

test('with Connect it joins the lines it crosses or lands on; without, it draws over them', async () => {
  const { drag, row } = await scene();
  drag([10, 1], [10, 9]);           // │ down column 10
  drag([4, 5], [16, 5]);            // ─ across it
  expect(row(5, 9, 11)).toBe('─┼─');
  drag([20, 2], [30, 2]);           // ─ along row 2
  drag([25, 8], [25, 2]);           // up onto it, from below
  expect(row(2, 24, 26)).toBe('─┬─');

  const off = await scene({ pencilConnect: false });
  off.drag([10, 1], [10, 9]);
  off.drag([4, 5], [16, 5]);
  expect(off.row(5, 9, 11)).toBe('───');
});

test('Double draws double lines, and joins single ones with mixed pieces', async () => {
  const { drag, workspace, row, col } = await scene({ pencilDrawWith: 'double' });
  drag([2, 2], [8, 2], [8, 6]);
  expect(row(2, 2, 8)).toBe('══════╗');
  workspace.pencilDrawWith = 'single';
  drag([4, 0], [4, 4]); // a single line down across the double one
  expect(col(4, 1, 3)).toBe('│╪│');
});

test('a stroke is one undo step; a click without a drag draws nothing', async () => {
  const { project, drag, row } = await scene();
  const before = row(3, 2, 10);
  drag([2, 3], [10, 3]);
  expect(row(3, 2, 10)).toBe('─────────');
  project.undo();
  expect(row(3, 2, 10)).toBe(before);
  drag([5, 3]);
  expect(row(3, 2, 10)).toBe(before);
});

test('Shift-click draws a line from where the last stroke ended, turning the corner', async () => {
  const { drag, shiftClick, row, col } = await scene();
  drag([2, 2], [8, 2]);
  shiftClick([8, 6]);
  expect(row(2, 2, 8)).toBe('──────┐');
  expect(col(8, 3, 6)).toBe('││││');
});

test('Normal and Half-block paint as before, and the pixel view always paints', async () => {
  const { project, workspace, drag, row } = await scene({ pencilDrawWith: 'half' });
  drag([2, 3], [6, 3]);
  expect(row(3, 2, 6)).toBe('▄▄▄▄▄');
  workspace.pencilDrawWith = 'normal';
  const before = row(5, 2, 6);
  drag([2, 5], [6, 5]);
  expect(row(5, 2, 6)).toBe(before); // the paint shows through each cell's own character
  workspace.pencilDrawWith = 'single';
  pencil.begin({ project, workspace, view: 'input' }, { x: 2.5, y: 15 }, {});
  pencil.move({ project, workspace, view: 'input' }, { x: 2.5, y: 15 }, { x: 6.5, y: 15 });
  pencil.end({ project, workspace, view: 'input' });
  expect(row(7, 2, 6)).not.toMatch(/─/);
});

// A bitmap font's own line styles.
const fontWith = (lines) => ({ name: 'T', height: 16, bytes: new Uint8Array(4096), blocks: [...CP437_BLOCKS], lines });
const HEAVY = { hide: [], styles: [{ id: 'l1', name: 'Heavy', slots: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] }] };

test("a font's own style draws its pieces and turns its corners", async () => {
  const { project, drag, row, col } = await scene({ pencilDrawWith: 'line:l1' });
  const font = fontWith(HEAVY);
  await project.setDrawingFont(font);
  const H = slotChars(font).slice(1, 12);
  drag([2, 2], [8, 2], [8, 6]);
  expect(row(2, 2, 8)).toBe(H[0].repeat(6) + H[3]);
  expect(col(8, 3, 6)).toBe(H[1].repeat(4));
});

test('crossing a Single line, the new style wins', async () => {
  const { project, workspace, drag, row } = await scene();
  const font = fontWith(HEAVY);
  await project.setDrawingFont(font);
  const H = slotChars(font).slice(1, 12);
  drag([5, 1], [5, 8]);
  workspace.pencilDrawWith = 'line:l1';
  drag([2, 4], [9, 4]);
  expect(row(4, 5, 5)).toBe(H[0]);
});

test('a style no longer offered falls back to the first offered; none offered paints', async () => {
  const { project, drag, row } = await scene({ pencilDrawWith: 'single' });
  await project.setDrawingFont(fontWith({ hide: ['single'], styles: [] }));
  drag([2, 2], [6, 2]);
  expect(row(2, 3, 5)).toBe('═══');
  const none = await scene({ pencilDrawWith: 'single' });
  await none.project.setDrawingFont(fontWith({ hide: ['single', 'double'], styles: [] }));
  none.drag([2, 2], [6, 2]);
  expect(none.row(2, 3, 5)).not.toMatch(/[─═]/);
});

test("Draw with lists the font's styles after Double, and Shade after Half-block", async () => {
  const { project, workspace } = await scene();
  await project.setDrawingFont(fontWith(HEAVY));
  expect(pencil.options[0].choices.filter((c) => !c.when || c.when(workspace)).map((c) => c.value))
    .toEqual(['normal', 'single', 'double', 'line:l1', 'half', 'shade']);
  expect(pencil.options[0].choices).toBe(pencil.options[0].choices);
});

// A style the font no longer has (deleted, its making undone, another font): Draw with shows the style drawn instead.
let mounted = null;
afterEach(() => { mounted?.unmount(); mounted = null; });
test('Draw with set to a style the font no longer has shows the first offered style, which it draws', async () => {
  const { project, workspace, drag, row } = await scene({ pencilDrawWith: 'line:l1' });
  await project.setDrawingFont(fontWith({ hide: [], styles: [] }));
  workspace.editorTab = 'output';
  workspace.setActiveTool('pencil');
  const host = document.createElement('div');
  mounted = createApp(EditToolbar).use(i18n);
  mounted.mount(host);
  await new Promise((resolve) => requestAnimationFrame(resolve));
  expect(host.querySelector('.option-menu .dropdown-trigger').title).toBe('Single line');
  drag([2, 2], [6, 2]);
  expect(row(2, 2, 6)).toBe('─────');
});

test('the Single and Double labels follow a language change', async () => {
  await scene();
  const label = () => pencil.options[0].choices.find((c) => c.value === 'single').label;
  await setLocale('en', { persist: false });
  const en = label();
  try {
    await setLocale('fr', { persist: false });
    expect(label()).not.toBe(en);
  } finally {
    await setLocale('en', { persist: false });
  }
});

test("Draw with sets the font's styles apart from Double by a rule that the arrow keys pass over", async () => {
  const { project, workspace } = await scene();
  workspace.editorTab = 'output';
  workspace.setActiveTool('pencil');
  const host = document.createElement('div');
  document.body.append(host);
  mounted = createApp(EditToolbar).use(i18n);
  mounted.mount(host);
  const menu = async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    host.querySelector('.option-menu .dropdown-trigger').click();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    return [...host.querySelector('.option-menu .dropdown-content').children];
  };
  expect((await menu()).some((el) => el.getAttribute('role') === 'separator')).toBe(false); // no styles of the font's own: no rule
  host.querySelector('.option-menu .dropdown-trigger').click();
  await project.setDrawingFont(fontWith(HEAVY));
  const items = await menu();
  const rule = items.findIndex((el) => el.getAttribute('role') === 'separator');
  expect(rule).toBeGreaterThan(0);
  expect(items[rule - 1].textContent).toContain('Double');
  expect(items[rule + 1].textContent).toContain('Heavy');
  items[rule - 1].focus();
  items[rule - 1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  expect(document.activeElement).toBe(items[rule + 1]);
  host.remove();
});
