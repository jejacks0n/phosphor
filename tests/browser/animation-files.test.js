// Animations in project files, and what autosave counts.
import { test, expect, vi } from 'vitest';
import { createTestApp, loadImage, settle, cellsKey } from '../support/app.js';
import { readProject, writeProject } from '@/document/projectIO.js';
import { cellIndex } from '@/lib/Cells.js';

const INK = { fg: '#ffee00', bg: '#0044aa' };

async function animated({ cols = 20, rows = 20 } = {}) {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols, rows });
  project.setAnimate(true);
  return { project, workspace };
}
const charAt = (project, col, row) => project.cells[cellIndex(col, row, project.cols)]?.char;
const type = (project, col, row, char) => { project.typeAt(col, row, char, INK); project.commitEdit(); };
const paint = (project, x, y, color = '#ff3300') => { project.paintStroke([{ x, y, alpha: 1 }], color); project.commitEdit(); };
const fileOf = async (project, name = 'movie.phosphor') => new File([await writeProject({ imageBuffer: project.imageBuffer, ...await project.projectParts() })], name);
const reopen = async (project) => {
  const file = await fileOf(project);
  await project.loadProject(file);
  await settle(project);
};
// A file with its JSON changed, as a person's editor or a bad copy might.
async function withJson(file, change) {
  const buffer = await file.arrayBuffer(), view = new DataView(buffer);
  const jsonLength = view.getUint32(8, true);
  const json = JSON.parse(new TextDecoder().decode(buffer.slice(20, 20 + jsonLength)));
  change(json);
  const next = new TextEncoder().encode(JSON.stringify(json));
  const lengths = new Uint32Array([next.byteLength, view.getUint32(12, true), view.getUint32(16, true)]);
  return new File([buffer.slice(0, 8), lengths, next, buffer.slice(20 + jsonLength)], file.name);
}
async function movie() {
  const { project, workspace } = await animated();
  type(project, 1, 1, 'A');
  project.addFrame('blank');
  type(project, 2, 1, 'B');
  paint(project, 6, 6);
  project.setHold(1, 0.5);
  project.addFrame('wipe');
  type(project, 3, 1, 'C');
  project.setFps(12);
  project.showFrame(1);
  await settle(project);
  return { project, workspace };
}

test('save and open: frames, holds, fps, current frame and every picture come back, Animate on', async () => {
  const { project } = await movie();
  const pictures = [];
  for (const i of [0, 1, 2]) {
    project.showFrame(i);
    await settle(project);
    pictures.push(cellsKey(project));
  }
  project.showFrame(1);
  await settle(project);
  project.setAnimate(false);
  await reopen(project);
  expect(project.frames.map((f) => [f.kind, f.hold])).toEqual([['blank', 0], ['blank', 0.5], ['wipe', 0]]);
  expect(project.fps).toBe(12);
  expect(project.frame).toBe(1);
  expect(project.animate).toBe(true);
  expect(project.isDirty).toBe(false);
  expect(cellsKey(project)).toEqual(pictures[1]);
  for (const i of [0, 2, 1]) {
    project.showFrame(i);
    await settle(project);
    expect(cellsKey(project)).toEqual(pictures[i]);
  }
});

test('a frame reopened, then left untouched, keeps only what it changed', async () => {
  const { project } = await movie();
  const held = project.frames.map((f) => [...f.changes.keys()].sort());
  await reopen(project);
  project.showFrame(0);
  project.showFrame(1);
  expect(project.frames.map((f) => [...f.changes.keys()].sort())).toEqual(held);
});

test('a fix on an earlier frame still carries after a reopen', async () => {
  const { project } = await movie();
  await reopen(project);
  project.showFrame(0);
  type(project, 5, 5, 'F');
  project.showFrame(1);
  await settle(project);
  expect(charAt(project, 5, 5)).toBe('F');
});

test('paint past the grid on a frame not showing survives a reopen', async () => {
  const { project } = await animated({ cols: 20, rows: 20 });
  project.addFrame('blank');
  paint(project, 18, 18);
  project.showFrame(0);
  project.cols = 10;
  project.rows = 10;
  project.render();
  await settle(project);
  await reopen(project);
  expect(project.paintLayer.cols).toBeGreaterThanOrEqual(19);
  project.showFrame(1);
  expect(project.frames[1].changes.has('18,9')).toBe(true);
  expect(project.paintLayer.pixelAt(18, 18)).toBeTruthy();
});

test('undoing after a reopen does nothing wrong: history starts empty', async () => {
  const { project } = await movie();
  await reopen(project);
  expect(project.canUndo).toBe(false);
  const before = cellsKey(project);
  project.undo();
  await settle(project);
  expect(cellsKey(project)).toEqual(before);
  type(project, 9, 9, 'Z');
  project.undo();
  await settle(project);
  expect(cellsKey(project)).toEqual(before);
});

test('a still writes no frames key', async () => {
  const { project } = await animated();
  type(project, 1, 1, 'A');
  const { settings } = await readProject(await fileOf(project));
  const parts = await readProject(await fileOf(project));
  expect(parts.animation).toBeNull();
  expect('frames' in settings).toBe(false);
  const raw = await (await fileOf(project)).arrayBuffer();
  const json = JSON.parse(new TextDecoder().decode(raw.slice(20, 20 + new DataView(raw).getUint32(8, true))));
  expect(['frames', 'frame', 'fps'].filter((key) => key in json)).toEqual([]);
});

test('frames in a file don’t land in settings, and cellEdits hold the frame showing, for older copies', async () => {
  const { project } = await movie();
  const parts = await readProject(await fileOf(project));
  for (const key of ['frames', 'frame', 'fps']) expect(key in parts.settings).toBe(false);
  expect(new Set(parts.editCells.keys())).toEqual(new Set(['1,1', '2,1']));
  expect(parts.paintBuffer).not.toBeNull();
});

test('an older file opens as one frame', async () => {
  const { project } = await movie();
  await project.loadProject(new File([await (await fetch('/tests/fixtures/projects/no-haspaint.phosphor')).arrayBuffer()], 'old.phosphor'));
  await settle(project);
  expect(project.frames.length).toBe(1);
  expect(project.frame).toBe(0);
  expect(project.fps).toBe(8);
});

test('the animated fixture opens with its frames', async () => {
  const { project } = await animated();
  await project.loadProject(new File([await (await fetch('/tests/fixtures/projects/animated.phosphor')).arrayBuffer()], 'animated.phosphor'));
  await settle(project);
  expect(project.frames.map((f) => f.kind)).toEqual(['blank', 'blank', 'wipe']);
  expect(project.frame).toBe(1);
  expect(project.fps).toBe(10);
  expect(project.frames[1].hold).toBe(0.5);
  expect(charAt(project, 1, 0)).toBe('A');
  expect(charAt(project, 2, 0)).toBe('B');
  project.showFrame(2);
  await settle(project);
  expect(charAt(project, 1, 0)).not.toBe('A');
  expect(charAt(project, 3, 0)).toBe('C');
});

test('a damaged frames key opens as a still with the art intact', async () => {
  const { project } = await movie();
  const picture = cellsKey(project);
  const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
  await project.loadProject(await withJson(await fileOf(project), (json) => { json.frames[1].kind = 'fade'; }));
  await settle(project);
  expect(alert).not.toHaveBeenCalled();
  alert.mockRestore();
  expect(project.frames.length).toBe(1);
  expect(cellsKey(project)).toEqual(picture);
});

test('in a room a file with frames opens as a still', async () => {
  const { project } = await movie();
  const file = await fileOf(project);
  project.setAnimate(false);
  project._sharing = { role: 'host' };
  await project.loadProject(file);
  await settle(project);
  expect(project.frames.length).toBe(1);
  expect(project.animate).toBe(false);
  project._sharing = null;
});

const magicOf = async (file) => new TextDecoder().decode((await file.arrayBuffer()).slice(0, 8));
const frameKeys = (project) => project.frames.map((f) => [...f.changes.keys()].sort());

test('a movie on more layers than the old form has keeps every layer\'s frames', async () => {
  const { project } = await animated();
  type(project, 1, 1, 'A');
  const l1 = project.addLayer('cells', 'edit');
  project.addVectorLayer(); // base, vector, edit, L1: no old form for it
  project.useLayer(l1);
  type(project, 2, 2, 'B');
  project.addFrame('blank');
  type(project, 3, 3, 'C');
  project.showFrame(0);
  await settle(project);
  const keys = frameKeys(project);
  expect(keys.flat()).toContain(`${l1}:3,3`);
  const file = await fileOf(project);
  expect(await magicOf(file)).toBe('PHOSPHR2');

  await project.loadProject(file);
  await settle(project);
  expect(project.frames.length).toBe(2);
  expect(frameKeys(project)).toEqual(keys);
});

test('a movie whose only cells layer is L3 saves its frame keys bare, in the old form', async () => {
  const { project } = await animated();
  project.layers = [project.layers[0], Object.freeze({ id: 'L3', kind: 'cells', n: 3, name: null, hidden: false })];
  project._layerData.set('L3', { editCells: new Map(), paintLayer: null, hasPaint: false });
  project.useLayer('L3');
  type(project, 1, 1, 'A');
  project.addFrame('blank');
  type(project, 2, 2, 'B');
  project.showFrame(0);
  await settle(project);
  expect(frameKeys(project).flat()).toContain('L3:2,2');
  const file = await fileOf(project);
  expect(await magicOf(file)).toBe('PHOSPHOR');

  await project.loadProject(file);
  await settle(project);
  expect(project.layers.map((l) => l.id)).toEqual(['base', 'edit']);
  expect(frameKeys(project).flat()).toContain('2,2');
  project.showFrame(1);
  await settle(project);
  expect(charAt(project, 2, 2)).toBe('B');
});
