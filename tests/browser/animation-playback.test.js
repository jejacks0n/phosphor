// Playing, and the ghost. Playing never touches editCells, so autosave stays quiet. Exports read project.cells.
import { test, expect } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { createTestApp, loadImage, settle } from '../support/app.js';
import { usePlayback } from '@/composables/usePlayback.js';
import { cellIndex } from '@/lib/Cells.js';
import InputEditor from '@/components/InputEditor.vue';

const INK = { fg: '#ffee00', bg: '#0044aa' };

async function animated() {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 20, rows: 20 });
  project.setAnimate(true);
  return { project, workspace };
}
const at = (col, row) => cellIndex(col, row, 20);
const type = (project, col, row, char) => { project.typeAt(col, row, char, INK); project.commitEdit(); };
const until = async (test_, what) => {
  for (let i = 0; i < 400; i++) {
    if (test_()) return;
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  throw new Error(`never: ${what}`);
};

test('a Blank frame ghosts inherited cells, not its own, and not the base', async () => {
  const { project } = await animated();
  type(project, 1, 1, 'A');
  project.addFrame('blank');
  type(project, 2, 2, 'B');
  const shown = project.shownCells;
  expect(shown[at(1, 1)].char).toBe('A');
  expect(shown[at(1, 1)]).not.toBe(project.cells[at(1, 1)]); // inherited: dimmed
  expect(shown[at(1, 1)].fg.hex).not.toBe(project.cells[at(1, 1)].fg.hex);
  expect(shown[at(2, 2)]).toBe(project.cells[at(2, 2)]);     // its own
  expect(shown[at(5, 5)]).toBe(project.cells[at(5, 5)]);     // the base
});

test('inherited paint is a ghost too, and sits on the picture', async () => {
  const { project } = await animated();
  project.paintStroke([{ x: 6, y: 6, alpha: 1 }, { x: 6, y: 7, alpha: 1 }], '#ff0000');
  project.commitEdit();
  project.addFrame('blank');
  const shown = project.shownCells[at(6, 3)], solid = project.cells[at(6, 3)];
  expect(shown.bg.r).toBeLessThan(solid.bg.r);
});

test('a Wipe and a Duplicate have no ghost; a Blank after a Wipe ghosts what the Wipe frame drew', async () => {
  const { project } = await animated();
  type(project, 1, 1, 'A');
  project.addFrame('duplicate');
  expect(project.shownCells).toBe(project.cells);
  project.addFrame('wipe');
  type(project, 2, 2, 'W');
  expect(project.shownCells).toBe(project.cells);
  project.addFrame('blank');
  expect(project.shownCells[at(2, 2)]).not.toBe(project.cells[at(2, 2)]);
  expect(project.shownCells[at(1, 1)]).toBe(project.cells[at(1, 1)]);
});

test('a cell stops being a ghost during the stroke that draws on it', async () => {
  const { project } = await animated();
  project.paintStroke([{ x: 6, y: 6, alpha: 1 }, { x: 7, y: 6, alpha: 1 }], '#ff0000');
  project.commitEdit();
  project.addFrame('blank');
  expect(project.shownCells[at(6, 3)]).not.toBe(project.cells[at(6, 3)]);
  project.paintStroke([{ x: 6, y: 6, alpha: 1 }], '#00ff00'); // left open
  expect(project.shownCells[at(6, 3)]).toBe(project.cells[at(6, 3)]);
  expect(project.shownCells[at(7, 3)]).not.toBe(project.cells[at(7, 3)]);
  project.commitEdit();
  expect(project.shownCells[at(6, 3)]).toBe(project.cells[at(6, 3)]);
});

test('undoing a stroke over a ghost makes it a ghost again', async () => {
  const { project } = await animated();
  type(project, 1, 1, 'A');
  project.addFrame('blank');
  type(project, 1, 1, 'B');
  expect(project.shownCells[at(1, 1)]).toBe(project.cells[at(1, 1)]);
  project.undo();
  await settle(project);
  expect(project.cells[at(1, 1)].char).toBe('A');
  expect(project.shownCells[at(1, 1)]).not.toBe(project.cells[at(1, 1)]);
});

test('with Ghost off, inherited cells show solid; and with Animate off', async () => {
  const { project, workspace } = await animated();
  type(project, 1, 1, 'A');
  project.addFrame('blank');
  workspace.ghost = false;
  expect(project.shownCells).toBe(project.cells);
  workspace.ghost = true;
  expect(project.shownCells).not.toBe(project.cells);
  project.setAnimate(false);
  expect(project.shownCells).toBe(project.cells);
});

test('frame 0 and a still have no ghost', async () => {
  const { project } = await animated();
  type(project, 1, 1, 'A');
  expect(project.shownCells).toBe(project.cells);
  project.addFrame('blank');
  project.showFrame(0);
  expect(project.shownCells).toBe(project.cells);
});

test('project.cells is never ghosted: an export during a Blank frame is solid', async () => {
  const { project } = await animated();
  type(project, 1, 1, 'A');
  const solid = project.cells[at(1, 1)].fg.hex;
  project.addFrame('blank');
  expect(project.cells[at(1, 1)].fg.hex).toBe(solid);
  expect(project.shownCells[at(1, 1)].fg.hex).not.toBe(solid);
});

test('playing loops, honors holds, and leaves editCells and editVersion alone', async () => {
  const { project, workspace } = await animated();
  const playback = usePlayback();
  type(project, 1, 1, 'A');
  project.addFrame('blank');
  type(project, 2, 2, 'B');
  project.addFrame('wipe');
  type(project, 3, 3, 'C');
  project.setFps(60);
  project.setHold(1, 0.2);
  project.commitPending();
  project.showFrame(0);
  const editCells = project.editCells, version = project.editVersion, history = project.history.version, frame = project.frame;
  const seen = [], at_ = [];
  const stop = setInterval(() => { seen.push(workspace.playFrame); at_.push(performance.now()); }, 4);
  await playback.play();
  expect(workspace.playing).toBe(true);
  await until(() => seen.join().includes('2') && seen.slice(seen.lastIndexOf(2)).includes(0) && seen.slice(seen.lastIndexOf(2)).includes(1), 'a whole loop');
  clearInterval(stop);
  // The hold: frame 1 is on screen about 200 ms against frame 2's 17.
  const longest = (n) => {
    let best = 0, start = null;
    seen.forEach((f, i) => {
      if (f === n && start === null) start = at_[i];
      if (f !== n && start !== null) { best = Math.max(best, at_[i] - start); start = null; }
    });
    return best;
  };
  expect(longest(1)).toBeGreaterThan(150);
  expect(project.shownCells[at(1, 1)].char === 'A' || project.shownCells[at(3, 3)].char === 'C').toBe(true);
  expect(project.editCells).toBe(editCells);
  expect(project.editVersion).toBe(version);
  expect(project.history.version).toBe(history);
  expect(project.frame).toBe(frame);
  playback.pause();
});

test('what plays is solid, and is the frame’s own built cells', async () => {
  const { project, workspace } = await animated();
  const playback = usePlayback();
  type(project, 1, 1, 'A');
  project.addFrame('blank');
  project.setFps(2);
  project.showFrame(1);
  await playback.play();
  expect(workspace.playFrame).toBe(1);
  expect(project.shownCells).toBe(project.frames[1].built.cells);
  expect(project.shownCells[at(1, 1)].fg.hex).toBe(project.cells[at(1, 1)].fg.hex);
  playback.pause();
});

test('pausing lands on the frame showing, ready to draw on, and keeps the edit', async () => {
  const { project, workspace } = await animated();
  const playback = usePlayback();
  project.addFrame('blank');
  project.addFrame('blank');
  project.setFps(60);
  await playback.play();
  workspace.playFrame = 1; // whichever it had reached
  workspace.played = await project.builtFrame(1);
  playback.pause();
  expect(workspace.playing).toBe(false);
  expect(project.frame).toBe(1);
  expect(project.shownCells).toBe(project.cells);
  type(project, 4, 4, 'K');
  project.showFrame(0);
  project.showFrame(1);
  expect(project.cells[at(4, 4)].char).toBe('K');
});

test('with one frame Play does nothing', async () => {
  const { project, workspace } = await animated();
  const playback = usePlayback();
  await playback.play();
  expect(workspace.playing).toBe(false);
  expect(project.shownCells).toBe(project.cells);
});

test('a document replaced while playing stops playing', async () => {
  const { project, workspace } = await animated();
  const playback = usePlayback();
  project.addFrame('blank');
  project.setFps(60);
  await playback.play();
  await project.setBlankCanvas();
  await settle(project);
  await until(() => !workspace.playing, 'playback to stop');
  expect(project.shownCells).toBe(project.cells);
});

test('another document with frames, opened while playing, stops playing too', async () => {
  const { project, workspace } = await animated();
  const playback = usePlayback();
  project.addFrame('blank');
  await playback.play();
  project._document += 1;
  await until(() => !workspace.playing, 'playback to stop');
});

test('toggle plays and pauses', async () => {
  const { project, workspace } = await animated();
  const playback = usePlayback();
  project.addFrame('blank');
  project.setFps(60);
  await playback.toggle();
  expect(workspace.playing).toBe(true);
  await playback.toggle();
  expect(workspace.playing).toBe(false);
});

test('the PIXEL view plays output and overlay in place, without changing tab', async () => {
  const { project, workspace } = await animated();
  const playback = usePlayback();
  workspace.editorTab = 'input';
  workspace.ansiOverlay = 100;
  type(project, 1, 1, 'A');
  project.paintStroke([{ x: 8, y: 8, alpha: 1 }], '#ff0000');
  project.commitEdit();
  project.addFrame('wipe');
  type(project, 5, 5, 'B');
  project.paintStroke([{ x: 10, y: 10, alpha: 1 }], '#00ff00');
  project.commitEdit();
  project.showFrame(0);

  const host = document.createElement('div');
  host.style.cssText = 'width:400px;height:400px;position:fixed;left:0;top:0';
  document.body.append(host);
  const app = createApp({ render: () => h(InputEditor) });
  app.use(getActivePinia());
  app.mount(host);
  await nextTick();
  await settle(project);
  const canvas = host.querySelector('canvas');
  const seen = () => {
    const c = canvas.getContext('2d'), { width, height } = canvas, k = width / 20;
    const px = (x, y) => [...c.getImageData(Math.floor((x + 0.5) * k), Math.floor((y + 0.5) * (height / 20)), 1, 1).data];
    return { red: px(8, 8), green: px(10, 10) };
  };
  expect(seen().red.slice(0, 3)).toEqual([255, 0, 0]);
  expect(seen().green.slice(0, 3)).not.toEqual([0, 255, 0]);

  project.setFps(1); // holds still for the look
  await playback.play();
  workspace.playFrame = 1;
  workspace.played = await project.builtFrame(1);
  await settle(project);
  expect(seen().green.slice(0, 3)).toEqual([0, 255, 0]);
  expect(seen().red.slice(0, 3)).not.toEqual([255, 0, 0]);
  expect(workspace.editorTab).toBe('input');
  expect(project.frame).toBe(0);
  expect(project.renderer.outputCanvas).toBeTruthy();
  playback.pause();
  app.unmount();
  host.remove();
});


test('the PIXEL view dims what’s inherited on a Blank frame, drawn or typed, and plays and exports it solid', async () => {
  const { project, workspace } = await animated();
  const playback = usePlayback();
  workspace.editorTab = 'input';
  workspace.ansiOverlay = 100;
  project.paintStroke([{ x: 8, y: 8, alpha: 1 }], '#ff0000');
  project.commitEdit();
  type(project, 1, 1, 'A');
  project.addFrame('blank');
  project.paintStroke([{ x: 10, y: 10, alpha: 1 }], '#00ff00');
  project.commitEdit();

  const host = document.createElement('div');
  host.style.cssText = 'width:400px;height:400px;position:fixed;left:0;top:0';
  document.body.append(host);
  const app = createApp({ render: () => h(InputEditor) });
  app.use(getActivePinia());
  app.mount(host);
  await nextTick();
  await settle(project);
  const canvas = host.querySelector('canvas');
  const px = (x, y) => {
    const c = canvas.getContext('2d'), { width, height } = canvas;
    return [...c.getImageData(Math.floor((x + 0.5) * (width / 20)), Math.floor((y + 0.5) * (height / 20)), 1, 1).data].slice(0, 3);
  };
  const solidRed = [255, 0, 0], solidGreen = [0, 255, 0];
  expect(px(10, 10)).toEqual(solidGreen); // this frame's own
  const dimmed = px(8, 8);
  expect(dimmed).not.toEqual(solidRed);
  const under = project.renderer.underCell(8, 4, project.processParams, project.renderedCells).fg;
  expect(Math.abs(dimmed[0] - Math.round(under.r + (255 - under.r) * 0.35))).toBeLessThanOrEqual(2);
  const typedBefore = px(1, 2);

  workspace.ghost = false;
  await settle(project);
  expect(px(8, 8)).toEqual(solidRed);
  expect(px(1, 2)).not.toEqual(typedBefore);

  workspace.ghost = true;
  await settle(project);
  expect(px(8, 8)).toEqual(dimmed);
  expect(project.renderer.outputCanvas.getContext('2d').getImageData(8, 8, 1, 1).data[0]).toBe(255); // the art itself is solid

  // Drawing over it: solid, at once.
  project.paintStroke([{ x: 8, y: 8, alpha: 1 }], '#0000ff');
  project.commitEdit();
  await settle(project);
  expect(px(8, 8)).toEqual([0, 0, 255]);
  project.undo();
  await settle(project);
  expect(px(8, 8)).toEqual(dimmed);

  project.setFps(1);
  await playback.play();
  await settle(project);
  expect(px(8, 8)).toEqual(solidRed);
  playback.pause();
  await settle(project);
  expect(px(8, 8)).toEqual(dimmed);

  project.setAnimate(false);
  await settle(project);
  expect(px(8, 8)).toEqual(solidRed);
  app.unmount();
  host.remove();
});
