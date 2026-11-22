// Changing the grid's size (docs/layers.md): with nothing on the edit layer it rescales (the image
// refits, the base's pins move with it); with edits it's a canvas resize (everything stays put, the
// grid gains or loses cells at the right and bottom, and what's past the edge comes back when it
// grows). Random characters belong to their cell's position, so they survive a width change. A step undo could
// bring back keeps its cells where they are too: a grid change never forgets the undo steps before it.
import { test, expect, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { createApp, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import { createTestApp, loadImage, settle } from '../support/app.js';
import { cellIndex, MAX_LINES, MAX_CELLS } from '@/lib/Cells';
import { readProject, writeProject } from '@/document/projectIO.js';
import ControlPanel from '@/components/ControlPanel.vue';
import EditWorkspace from '@/components/EditWorkspace.vue';
import { closeToast, toastAction, toastMessage } from '@/composables/useToast';

async function grid(cols = 40, rows = 40) {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols, rows });
  return { project, workspace };
}

async function resize(project, cols, rows = project.rows) {
  project.cols = cols;
  project.rows = rows;
  await settle(project);
}

const pinned = (project) => [...project.baseRecords.pins.keys()];

test('with base edits and nothing to undo, a grid change is a canvas resize: the pins stay where they are', async () => {
  const { project } = await grid();
  project.beginEdit();
  project.eraseBase([{ col: 10, row: 5 }]);
  project.commitEdit();
  project.clearHistory(); // as a project opened with base edits: nothing to undo
  expect(pinned(project)).toEqual(['10,5']);
  await resize(project, 80, 80);
  expect(pinned(project)).toEqual(['10,5']);
  expect(project.cells[cellIndex(10, 5, 80)].char).toBe(' ');
});

test('a canvas resize keeps what goes past the edge and brings it back', async () => {
  const { project } = await grid();
  project.typeAt(30, 5, 'X', { fg: '#ffffff', bg: '#000000' });
  project.commitEdit();
  project.paintStroke([{ x: 35, y: 30, alpha: 1 }, { x: 35, y: 31, alpha: 1 }], '#ff0000');
  project.commitEdit();
  const fit = JSON.stringify(project.fit);
  const kept = project.cells.slice(0, 20).map((c) => c.char + c.fg.hex + c.bg.hex);

  await resize(project, 20, 20);
  expect(project.cells).toHaveLength(20 * 10);
  expect(JSON.stringify(project.fit)).toBe(fit); // the picture stays where it is
  expect(project.cells.slice(0, 20).map((c) => c.char + c.fg.hex + c.bg.hex)).toEqual(kept);

  await resize(project, 40, 40);
  expect(project.cells[cellIndex(30, 5, 40)].char).toBe('X');
  const painted = project.cells[cellIndex(35, 15, 40)];
  expect([painted.fg.hex, painted.bg.hex]).toContain('#ff0000');
});

// A row of cells as text: each one's character and colors.
const row = (project, r, cols = project.cols) => Array.from({ length: 20 }, (_, c) => {
  const cell = project.cells[cellIndex(c, r, cols)];
  return cell.char + cell.fg.hex + cell.bg.hex;
}).join('|');

// Edits on the base alone (an erased cell and a typed fix), with nothing on the edit layer, as on an opened .ans fixed
// with Base picked: the grid grows or shrinks, and undo and redo still take back and put back each edit, in place.
for (const [what, to] of [['grows', 50], ['shrinks', 30]]) {
  test(`a grid that ${what} keeps the undo steps before it: undo and redo put the cells back`, async () => {
    const { project, workspace } = await grid();
    const before = row(project, 5);
    workspace.pickLayer('base');
    project.beginEdit();
    project.eraseBase([{ col: 10, row: 5 }]);
    project.commitEdit();
    const erased = row(project, 5);
    project.typeAt(12, 5, 'X', { fg: '#ffffff', bg: '#000000' });
    project.commitEdit();
    const fixed = row(project, 5);
    expect(new Set([before, erased, fixed]).size).toBe(3);

    await resize(project, to, to);
    expect(row(project, 5)).toBe(fixed); // a canvas resize: everything stays where it is
    project.undo();
    await settle(project);
    expect(row(project, 5)).toBe(erased);
    project.undo();
    await settle(project);
    expect(row(project, 5)).toBe(before);
    expect(project.canUndo).toBe(false);
    project.redo();
    project.redo();
    await settle(project);
    expect(row(project, 5)).toBe(fixed);

    await resize(project, 40, 40);
    expect(row(project, 5)).toBe(fixed);
    project.undo();
    project.undo();
    await settle(project);
    expect(row(project, 5)).toBe(before);
  });
}

// The other settings that aren't undo steps (Art style, Color palette, Color count, frames per second, a frame's hold)
// leave the steps before them too: Cmd+Z after them takes back the edit before.
test('the settings that are not undo steps keep the undo steps before them', async () => {
  const { project } = await grid();
  project.setAnimate(true);
  const before = row(project, 5);
  project.typeAt(12, 5, 'X', { fg: '#ffffff', bg: '#000000' });
  project.commitEdit();
  project.renderStyle = 'colorAscii';
  project.quantize = 'count';
  project.colorCount = 8;
  project.setFps(12);
  project.setHold(0, 0.5);
  await settle(project);
  project.renderStyle = 'ansi';
  project.quantize = 'none';
  await settle(project);
  project.undo();
  await settle(project);
  expect(row(project, 5)).toBe(before);
  expect(project.canUndo).toBe(false);
});

test('random characters stay with their cells when the width changes', async () => {
  const { project } = await grid(40, 40);
  expect(project.processParams.charMode).toBe('random');
  const chars = (cols) => Array.from({ length: 10 }, (_, row) => Array.from({ length: 10 }, (_, col) => project.cells[cellIndex(col, row, cols)].char).join(''));
  const before = chars(40);
  await resize(project, 60, 40);
  expect(chars(60)).toEqual(before);
});

test('a narrow grid runs to the line limit; a wider one stops at the cell budget', async () => {
  const { project } = await grid(80, 40);
  project.aspectLock = false;
  project.updateRows(50_000);
  expect(project.rows).toBe(2 * MAX_LINES);
  expect(project.maxCols).toBe(MAX_CELLS / MAX_LINES);
  project.updateCols(300);
  expect([project.cols, project.rows]).toEqual([MAX_CELLS / MAX_LINES, 2 * MAX_LINES]);
});

test('a tall picture opens at the current width, and can grow as large as the limits allow', async () => {
  const { project } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/tall.png'); // 40x1200, at the default 80 columns
  expect([project.cols, project.rows]).toEqual([80, 2400]);
  expect([project.maxCols, project.maxRows]).toEqual([182, 5460]); // aspect locked: the cell budget binds
});

// The report: on a 300-column file with Lock aspect ratio on, more pixel rows snapped back with no word, as 0 did with it
// off. The lock holds the size, and a toast says so; a size under 1 isn't taken, and a toast gives the smallest.
test('a size the aspect lock holds back, or one under 1, says why in a toast', async () => {
  const { toastMessage } = await import('@/composables/useToast');
  const { project } = await grid(300, 600);
  project.setAspectLock(true);
  toastMessage.value = null;
  project.updateRows(700);
  expect([project.cols, project.rows]).toEqual([300, 600]);
  expect(toastMessage.value).toBe('Lock aspect ratio keeps this shape, and 300 × 600 is the largest it fits. Turn off the lock to change one number alone.');
  toastMessage.value = null;
  project.updateCols(400); // 300 columns is the limit with or without the lock
  expect(toastMessage.value).toBe(null);
  project.aspectLock = false;
  project.updateRows(0);
  expect(project.rows).toBe(600);
  expect(toastMessage.value).toBe('The smallest size is 1 column by 1 pixel row.');
  toastMessage.value = null;
  project.updateCols(-3);
  expect(project.cols).toBe(300);
  expect(toastMessage.value).toBe('The smallest size is 1 column by 1 pixel row.');
  toastMessage.value = null;
  project.updateRows(99_999); // stops at what 300 columns allow, which the field shows
  expect(project.rows).toBe(2 * Math.floor(MAX_CELLS / 300));
  expect(toastMessage.value).toBe(null);
});

test('before there is a picture, the aspect lock has no shape to keep: rows and columns set alone', async () => {
  const { project } = await createTestApp();
  expect(project.aspectLock).toBe(true);
  project.updateRows(2000);
  expect([project.cols, project.rows]).toEqual([80, 2000]);
  expect(project.maxRows).toBe(2 * MAX_LINES);
});

test('a new blank canvas opens at the full line limit', async () => {
  const { project } = await createTestApp();
  project.cols = 80;
  project.rows = 2 * MAX_LINES; // its picture at 10 pixels a cell would be past what a canvas can be
  await project.setBlankCanvas({ withLayer: true });
  await settle(project);
  expect(project.cells).toHaveLength(80 * MAX_LINES);
  expect(new Set(project.cells.map((c) => c.bg.hex))).toEqual(new Set(['#000000']));
});

test('a picture as long as the grid, longer than the GPU draws, keeps its colors to its last line', async () => {
  const { project } = await createTestApp();
  const picture = Object.assign(document.createElement('canvas'), { width: 80, height: 20_000 }); // past 16384 (8192 here, on software WebGL)
  const ctx = picture.getContext('2d');
  ctx.fillStyle = '#3366cc';
  ctx.fillRect(0, 0, 80, 20_000);
  const blob = await new Promise((resolve) => picture.toBlob(resolve, 'image/png'));
  await project.setImageFromFile(new File([blob], 'long.png', { type: 'image/png' }), { withLayer: true });
  project.render();
  await settle(project);
  const lines = project.rows / 2;
  expect(lines).toBe(MAX_LINES);
  for (const row of [0, Math.floor(lines / 2), lines - 1]) expect(project.cells[cellIndex(10, row, project.cols)].bg.hex).toBe('#3366cc');
});

// A blank canvas at the full line limit: more rows than software WebGL draws (8192), as on a weaker
// GPU.
async function longBlank() {
  const { project } = await createTestApp();
  project.cols = 80;
  project.rows = 2 * MAX_LINES;
  await project.setBlankCanvas({ withLayer: true });
  await settle(project);
  return project;
}

test('base edits under VGA keep their colors to the last line, longer than the GPU draws', async () => {
  const project = await longBlank();
  project.quantize = 'vga';
  await settle(project);
  project.beginEdit();
  project.writeBase([100, 101, 9000, 9001].map((y) => ({ x: 10, y, hex: '#ff0000' })));
  project.commitEdit();
  for (const row of [50, 4500]) expect(project.cells[cellIndex(10, row, 80)].bg.hex).toBe('#ff0000');
});

test('Into the image on a grid longer than the GPU processes keeps the drawing (it merges exactly)', async () => {
  const project = await longBlank();
  for (const y of [100, 101, 9000, 9001]) project.paintStroke([{ x: 10, y, alpha: 1 }], '#ff0000');
  project.commitEdit();
  await project.mergeIntoPicture();
  await settle(project);
  for (const row of [50, 4500]) expect(project.cells[cellIndex(10, row, 80)].bg.hex).toBe('#ff0000');
  expect(project.hasPaint).toBe(false);
});

test('Dimensions reads the height in character rows above the inputs, which count pixel rows', async () => {
  const { project } = await grid(40, 168);
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(ControlPanel).use(getActivePinia()).use(i18n);
  app.mount(host);
  await nextTick();
  const readout = () => host.querySelector('#cols').closest('.field').querySelector('.label-row .value').textContent;
  expect(host.querySelector('#rows').value).toBe('168');
  expect(readout()).toBe('84 rows');
  await resize(project, 40, 3);
  expect(readout()).toBe('1 row');
  app.unmount();
  host.remove();
});

// The report (dex-6): each digit typed into Dimensions was a resize (1, then 12, then 123 pixel rows), and Escape kept
// the half-typed size. A typed size now waits for Enter, Tab or a click elsewhere; Escape puts the field back to the
// grid's size. The stepper arrows and the up and down keys stay live: each is a whole size.
test('Dimensions: typed digits wait for Enter or a blur, Escape puts the field back, and the arrow keys stay live', async () => {
  const { project } = await grid(40, 40);
  project.aspectLock = false;
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(ControlPanel).use(getActivePinia()).use(i18n);
  app.mount(host);
  await nextTick();
  const rows = host.querySelector('#rows');
  try {
    await userEvent.tripleClick(rows);
    await userEvent.keyboard('123');
    expect(rows.value).toBe('123');
    expect(project.rows).toBe(40); // nothing applied yet
    await userEvent.keyboard('{Escape}');
    expect(rows.value).toBe('40');
    expect(project.rows).toBe(40);
    expect(document.activeElement).toBe(rows); // where focus goes after is dex-16's, left as it is

    await userEvent.tripleClick(rows);
    await userEvent.keyboard('12{Enter}');
    expect(project.rows).toBe(12); // one resize, on the commit

    await userEvent.tripleClick(rows);
    await userEvent.keyboard('30');
    rows.blur(); // Tab or a click elsewhere
    expect(project.rows).toBe(30);

    rows.focus();
    await userEvent.keyboard('{ArrowUp}');
    expect(project.rows).toBe(31); // a step is a whole size
  } finally {
    app.unmount();
    host.remove();
  }
});

// The settings column on its own, for the drawing open.
function mountPanel() {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(ControlPanel).use(getActivePinia()).use(i18n);
  app.mount(host);
  return { host, gone: () => { app.unmount(); host.remove(); } };
}

// The report (maya-5): Escape in Palette colors kept the typed list, and a click elsewhere then applied it. Escape now
// puts the field back to the color in use, as it does in Dimensions.
test('Palette colors: Escape puts the field back to the color in use, and a blur after it changes nothing', async () => {
  const { project } = await grid(40, 40);
  project.quantize = 'palette';
  project.palette = '#FFFFFF #000000';
  const { host, gone } = mountPanel();
  await nextTick();
  const field = host.querySelector('#palette');
  try {
    expect(field.value).toBe('#ffffff');
    await userEvent.tripleClick(field);
    await userEvent.keyboard('#00FF00');
    await userEvent.keyboard('{Escape}');
    expect(field.value).toBe('#ffffff');
    field.blur(); // a click elsewhere
    expect(project.palette).toBe('#FFFFFF #000000'); // nothing rewritten
  } finally {
    gone();
  }
});

test('the Custom color list is swatches in the settings column, and a color changed there is the palette setting', async () => {
  const { project } = await grid(40, 40);
  project.quantize = 'palette';
  project.palette = '#FFFFFF #000000';
  const { host, gone } = mountPanel();
  await nextTick();
  try {
    expect(host.querySelectorAll('.color-list .swatch')).toHaveLength(2);
    const field = host.querySelector('#palette');
    await userEvent.tripleClick(field);
    await userEvent.keyboard('#00ff00{Enter}');
    expect(project.palette).toBe('#00ff00 #000000');
  } finally {
    gone();
  }
});

// Put back would write the old drawing's list onto the one opened since.
test('the import toast goes when another drawing opens, so its Put back can\'t reach it', async () => {
  const { project } = await grid(40, 40);
  project.quantize = 'palette';
  project.palette = '#FFFFFF #000000';
  const { host, gone } = mountPanel();
  await nextTick();
  try {
    const input = host.querySelector('input.hex-file'), files = new DataTransfer();
    files.items.add(new File(['1a1c2c\n5d275d\n'], 'sweetie.hex'));
    input.files = files.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(toastAction.value?.label).toBe('Put back'));
    project.documentId = 'another';
    await nextTick();
    expect(toastMessage.value).toBe(null);
  } finally {
    closeToast();
    gone();
  }
});

// The toast's Put back sits outside the settings' fieldset, so it isn't off with them.
test('while the settings are locked the Custom color list writes nothing, and a pick open when the lock came is over', async () => {
  const { project } = await grid(40, 40);
  project.quantize = 'palette';
  project.palette = '#FFFFFF #000000';
  const { host, gone } = mountPanel();
  await nextTick();
  try {
    const input = host.querySelector('input.hex-file'), files = new DataTransfer();
    files.items.add(new File(['1a1c2c\n5d275d\n'], 'sweetie.hex'));
    input.files = files.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(project.palette).toBe('#1a1c2c #5d275d'));
    const chip = host.querySelector('input.chip');
    chip.value = '#ff0000';
    chip.dispatchEvent(new Event('input', { bubbles: true }));
    expect(project._colorPick).toBe(true);
    project.startSharing({ send: () => {}, role: 'artist', me: 'ann' }); // only the host's now
    await nextTick();
    expect(project._colorPick).toBe(false);
    const before = project.palette;
    toastAction.value.run(); // Put back
    chip.value = '#00ff00';
    chip.dispatchEvent(new Event('input', { bubbles: true }));
    expect(project.palette).toBe(before);
  } finally {
    project.stopSharing();
    closeToast();
    gone();
  }
});

test('Palettes beside Color palette opens the color layer on Palettes, whatever the choice, off when settings are locked', async () => {
  const { project, workspace } = await grid(40, 40);
  const { host, gone } = mountPanel();
  const link = () => host.querySelector('#quantize').closest('.field').querySelector('button.text.palettes');
  try {
    for (const quantize of ['none', 'palette']) {
      project.quantize = quantize;
      workspace.colorBox = null;
      workspace.settingsOpen = true; // a phone's settings drawer, where the link is
      await nextTick();
      expect(link().textContent).toBe('Palettes');
      expect(link().title).toBe('Browse color palettes');
      expect(link().hasAttribute('data-colors-toggle')).toBe(true); // a press while the layer is open doesn't close it first
      link().click();
      expect([workspace.colorBox, workspace.colorLayerPage, workspace.settingsOpen]).toEqual(['fg', 'palettes', false]);
    }
    workspace.openColors('bg'); // the slot open stays
    link().click();
    expect([workspace.colorBox, workspace.colorLayerPage]).toEqual(['bg', 'palettes']);
    project.startSharing({ send: () => {}, role: 'artist', me: 'ann' }); // only the host's now
    await nextTick();
    expect(link().matches(':disabled')).toBe(true); // inside the settings' fieldset
  } finally {
    project.stopSharing();
    gone();
  }
});

// The layer closes on a switch away, as the character palette layer does, so the one that opens on ANSI after SAUCE is
// a new one, and nothing closing may take its color box from it.
test('from SAUCE it shows ANSI first; with no drawing it opens over the start screen, the group reading New drawings', async () => {
  const { workspace } = await grid(40, 40);
  const art = document.body.appendChild(document.createElement('div'));
  const drawing = createApp(EditWorkspace).use(getActivePinia()).use(i18n);
  drawing.mount(art);
  let { host, gone } = mountPanel();
  try {
    workspace.editorTab = 'output';
    workspace.openColors('fg');
    await nextTick();
    expect(art.querySelector('article.edit-toolbar .color-layer')).not.toBe(null);
    workspace.editorTab = 'sauce'; // a switch away closes it
    await nextTick();
    expect(art.querySelector('.color-layer')).toBe(null);
    expect(workspace.colorBox).toBe(null);
    host.querySelector('button.text.palettes').click();
    expect(workspace.editorTab).toBe('output');
    await nextTick();
    await nextTick();
    expect(art.querySelector('article.edit-toolbar .color-layer')).not.toBe(null);
    expect([workspace.colorBox, workspace.colorLayerPage]).toEqual(['fg', 'palettes']);
  } finally {
    gone();
    drawing.unmount();
    art.remove();
  }

  const fresh = await createTestApp(); // no drawing: the start screen
  const was = fresh.workspace.editorTab;
  const screen = document.body.appendChild(document.createElement('div'));
  const editor = createApp(EditWorkspace).use(fresh.pinia).use(i18n);
  editor.mount(screen);
  ({ host, gone } = mountPanel());
  try {
    await nextTick();
    host.querySelector('button.text.palettes').click();
    await nextTick();
    await nextTick();
    const layer = screen.querySelector('div.layer-anchor > .color-layer');
    expect(layer).not.toBe(null);
    expect(fresh.workspace.editorTab).toBe(was); // no art to show
    expect(layer.querySelector('div.group span.label').textContent).toBe('New drawings');
  } finally {
    gone();
    editor.unmount();
    screen.remove();
  }
});

// The report (bug bash 2): Escape in the font's size kept the typed number, and a click elsewhere then applied it. Escape
// now puts the field back to the size in use, as it does in Dimensions and Palette colors. A typed field that waits for
// Enter or a blur takes Escape this way: a new one needs it too.
test('Font size: Escape puts the field back to the size in use, and a blur after it changes nothing', async () => {
  const { workspace } = await grid(40, 40);
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(ControlPanel).use(getActivePinia()).use(i18n);
  app.mount(host);
  await nextTick();
  const field = host.querySelector('input.size'), size = workspace.displayFontSpec.size;
  try {
    await userEvent.tripleClick(field);
    await userEvent.keyboard('31');
    expect(field.value).toBe('31');
    await userEvent.keyboard('{Escape}');
    expect(field.value).toBe(String(size));
    field.blur(); // a click elsewhere
    expect(workspace.displayFontSpec.size).toBe(size);
  } finally {
    app.unmount();
    host.remove();
  }
});

async function reopened(project) {
  const blob = await writeProject({ imageBuffer: project.imageBuffer, ...await project.projectParts() });
  await project.openParts(await readProject(blob), { filename: 'reopened' });
  await settle(project);
}

// The report: resizing a blank canvas with Invert at 20% showed black bars at its sides, or its top and bottom. A blank
// canvas is one color all over, so it has no shape to keep: it fills the grid at any size. Letterboxed as a picture is,
// the black around it never saw Invert.
test('a blank canvas resized shows its own color edge to edge under Invert, grown after drawing too, and reopened', async () => {
  const { project } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 40, rows: 50 });
  project.setSlider('invert', 20);
  project.commitSliders();
  project.aspectLock = false;
  await settle(project);
  const shown = project.cells[0].bg.hex, colors = () => [...new Set(project.cells.map((cell) => cell.bg.hex))];
  expect(shown).not.toBe('#000000');
  for (const rows of [30, 70]) {
    project.updateRows(rows);
    await settle(project);
    expect(colors()).toEqual([shown]);
  }
  await reopened(project);
  project.aspectLock = false;
  project.updateCols(60);
  await settle(project);
  expect(colors()).toEqual([shown]);
  project.writeEditCells([{ col: 0, row: 0, attrs: { char: 'A', fg: '#ffffff', bg: '#ff0000' } }]);
  project.commitEdit();
  project.updateCols(80); // a canvas resize now: the grid gains columns at the right
  await settle(project);
  expect(new Set(project.cells.slice(1).map((cell) => cell.bg.hex))).toEqual(new Set([shown]));
});

// The report: unlocked, the height changed, and locked again, the next change went back to the picture's shape instead of
// keeping the one locked in.
test('the lock keeps the shape the grid had when it was locked, through a save and reopen; a new picture has its own', async () => {
  const { project } = await grid(40, 40); // unlocked, at 40 x 40
  const picture = project.imageRatio;
  project.updateRows(20);
  await settle(project);
  const locked = project.cols / project.rows;
  expect(Math.abs(locked - picture)).toBeGreaterThan(0.5); // not the picture's shape
  project.setAspectLock(true);
  project.updateRows(40);
  await settle(project);
  expect(project.cols / project.rows).toBeCloseTo(locked, 1);
  project.updateCols(30);
  await settle(project);
  expect(project.cols / project.rows).toBeCloseTo(locked, 1);
  await reopened(project);
  expect(project.aspectLock).toBe(true);
  project.updateCols(60);
  await settle(project);
  expect(project.cols / project.rows).toBeCloseTo(locked, 1);
  await loadImage(project, '/tests/fixtures/images/gradient.png'); // the lock stays on
  project.updateCols(60);
  await settle(project);
  expect(project.cols / project.rows).toBeCloseTo(picture, 1);
});

test('locking a grid still at the picture\'s shape keeps the picture\'s own ratio, not a rounded one', async () => {
  const { project } = await grid(40, 40);
  project.setAspectLock(false);
  project.setAspectLock(true);
  expect(project.aspectRatio).toBe(0);
});

// Adding a layer (it's picked) or reordering them is an undo step about the stack, not about where anything is: the
// grid still rescales and the lock still holds. Drawing on the new layer makes it a canvas resize, as on any other.
test('a layer added or moved leaves the grid rescaling and the lock on; drawing on it makes it a canvas resize', async () => {
  const { project } = await grid(40, 40);
  project.setAspectLock(true);
  const id = project.addLayer('cells', project.editId);
  project.useLayer(id);
  project.moveLayer(id, 1);
  expect(project.canUndo).toBe(true);
  expect(project.resizesCanvas).toBe(false);
  project.updateCols(60);
  await settle(project);
  expect(project.cols / project.rows).toBeCloseTo(project.imageRatio, 1); // rescaled, the lock followed
  expect(project.layers.some((layer) => layer.id === id)).toBe(true);
  project.beginEdit();
  project.writeEditCells([{ col: 2, row: 2, attrs: { char: 'A', fg: '#ffffff', bg: null } }]);
  project.commitEdit();
  expect(project.editId).toBe(id);
  expect(project.resizesCanvas).toBe(true);
});

// The lock works after drawing too: it keeps the grid's shape while the resize adds or trims cells, and what's drawn
// stays where it is. A grid that's left the lock's shape meanwhile (animation on, an older file) is kept as it is.
test('after drawing, the lock keeps the grid\'s shape while the canvas grows, and what\'s drawn stays put', async () => {
  const { project } = await grid(40, 20); // unlocked, off the picture's shape
  project.setAspectLock(true);
  project.beginEdit();
  project.writeEditCells([{ col: 3, row: 2, attrs: { char: 'A', fg: '#ffffff', bg: null } }]);
  project.commitEdit();
  expect(project.resizesCanvas).toBe(true);
  project.updateCols(80);
  await settle(project);
  expect([project.cols, project.rows]).toEqual([80, 40]);
  expect(project.cells[cellIndex(3, 2, project.cols)].char).toBe('A');
  project.aspectLock = false;
  project.updateRows(30);
  await settle(project);
  project.aspectLock = true; // as an older file has it: on, but the grid isn't at its shape
  project.updateCols(160);
  await settle(project);
  expect([project.cols, project.rows]).toEqual([160, 60]);
});
