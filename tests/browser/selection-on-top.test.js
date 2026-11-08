// A pasted or moved block lands on top of everything drawn where it lands: its picture part (Base) as cells looking
// as it did where it was copied, over (in place of) the edit cells and paint there, which come back when a floating
// block moves on. With Edit alone, a cell with nothing drawn in it stays see-through (docs/layers.md, The Select tool).
import { test, expect } from 'vitest';
import { createTestApp, loadImage, settle, cellsKey } from '../support/app.js';
import { encodeBlock, decodeBlock } from '@/composables/clipboard';
import { turnChar } from '@/lib/TurnChars.js';

const COLS = 30;
const look = (project, col, row) => cellsKey(project)[row * project.cols + col].toLowerCase();
const looks = (project, { c0, r0, c1, r1 }) => {
  const out = [];
  for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) out.push(look(project, col, row));
  return out;
};
const SOURCE = { c0: 0, r0: 0, c1: 4, r1: 4 }, AT = { c0: 14, r0: 9, c1: 18, r1: 13 };

// The photo converted so a cell's look is more than its two pixels (CGA, Best match, contrast moved), an S typed in
// the block to copy, and a D and a line of paint where it lands.
async function scene(patch = {}) {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/photo.jpg', { cols: COLS, rows: 30 });
  Object.assign(project, { quantize: 'cga', charChoice: 'best', ...patch });
  project.setSlider('contrast', 130);
  project.commitSliders();
  project.typeAt(2, 2, 'S', { fg: '#ffee00', bg: '#0044aa' });
  project.commitEdit();
  project.typeAt(15, 10, 'D', { fg: '#00ff00', bg: '#ff0000' });
  project.commitEdit();
  project.paintStroke(Array.from({ length: 4 }, (_, k) => ({ x: 15 + k, y: 24, alpha: 1 })), '#ff3300'); // row 12
  project.commitEdit();
  project.render();
  await settle(project);
  return { project, workspace };
}

for (const layers of [{ base: true, edit: false }, { base: true, edit: true }]) {
  test(`a paste with the picture (${JSON.stringify(layers)}) covers what it lands on, looking as it was copied`, async () => {
    const { project } = await scene();
    const before = looks(project, SOURCE), under = looks(project, AT);
    const block = project.copySelection(SOURCE, layers);
    const landed = project.pasteSelection(block, AT.c0, AT.r0);
    await settle(project);
    const want = layers.edit ? before : before.map((key, i) => (i === 2 * 5 + 2 ? looks(project, AT)[i] : key)); // Base alone: the S stays behind
    if (!layers.edit) expect(looks(project, AT)[2 * 5 + 2]).not.toContain('s#');
    expect(looks(project, AT).filter((key, i) => i !== 2 * 5 + 2)).toEqual(want.filter((key, i) => i !== 2 * 5 + 2));
    if (layers.edit) expect(looks(project, AT)).toEqual(before);
    project.floatSelection(landed, layers, 5, 0); // moved on: what it covered comes back
    await settle(project);
    expect(looks(project, AT)).toEqual(under);
  });
}

test('a move with the picture covers what it lands on; where it came from is erased', async () => {
  const { project } = await scene();
  const before = looks(project, SOURCE), d = look(project, 15, 10);
  const landed = project.floatSelection(SOURCE, { base: true, edit: true }, AT.c0, AT.r0);
  await settle(project);
  expect(landed).toEqual(AT);
  expect(looks(project, AT)).toEqual(before);
  expect(look(project, 0, 0)).toBe(' #000000#000000');
  project.undo();
  await settle(project);
  expect(looks(project, SOURCE)).toEqual(before);
  expect(look(project, 15, 10)).toBe(d);
});

test('with Edit alone, a cell with nothing drawn in it stays see-through', async () => {
  const { project } = await scene();
  const d = look(project, 15, 10), s = look(project, 2, 2);
  const block = project.copySelection(SOURCE, { base: false, edit: true });
  project.pasteSelection(block, AT.c0, AT.r0);
  await settle(project);
  expect(look(project, 15, 10)).toBe(d); // the block's (1, 1) has nothing drawn
  expect(look(project, 16, 11)).toBe(s);
});

test('a flipped picture block lands as it shows flipped', async () => {
  const { project } = await scene({ charChoice: 'random' });
  const top = looks(project, { ...SOURCE, r1: 0 });
  const landed = project.turnSelection(SOURCE, { base: true, edit: false }, 'v');
  await settle(project);
  expect(landed).toEqual(SOURCE);
  // The top row lands at the bottom, as edit cells: their characters turned (▄ becomes ▀), colors kept.
  const bottom = looks(project, { ...SOURCE, r0: 4 });
  expect(bottom.map((key) => key.slice(1))).toEqual(top.map((key) => key.slice(1)));
  expect(bottom.map((key) => key[0])).toEqual(top.map((key) => turnChar(key[0], 'v')));
  expect(project.editCells.has('0,4')).toBe(true);
});

test('a floating picture block can be rotated again: its own pixels have no characters', async () => {
  const { project } = await scene({ charChoice: 'random' });
  const rect = { c0: 6, r0: 6, c1: 8, r1: 7 }; // no edits, no pins: 3 x 4 grid pixels
  const once = project.turnSelection(rect, { base: true, edit: false }, 'cw');
  expect(once).toEqual({ c0: 6, r0: 6, c1: 9, r1: 7 }); // 4 x 3
  expect(project.hasCharacters(once, { base: true, edit: false })).toBe(false);
  const twice = project.turnSelection(once, { base: true, edit: false }, 'cw');
  expect(twice).toEqual({ c0: 6, r0: 6, c1: 8, r1: 7 }); // 3 x 4 again: turned, not refused
});

test('a copy carries how the picture looked to another tab', async () => {
  const { project } = await scene();
  const block = project.copySelection(SOURCE, { base: true, edit: false });
  const back = await decodeBlock(JSON.parse(JSON.stringify(encodeBlock(block, 'x'))));
  expect(back.looks).toEqual(block.looks);
});
