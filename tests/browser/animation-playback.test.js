// Playing, and the ghost (pictures of other frames; what a frame inherits shows solid). Playing never touches editCells, so autosave stays quiet. Exports read project.cells.
import { test, expect } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { userEvent } from 'vitest/browser';
import { i18n } from '@/i18n';
import { createTestApp, loadImage, settle } from '../support/app.js';
import { usePlayback } from '@/composables/usePlayback.js';
import { cellIndex } from '@/lib/Cells.js';
import InputEditor from '@/components/InputEditor.vue';
import AnimationBar from '@/components/AnimationBar.vue';

const INK = { fg: '#ffee00', bg: '#0044aa' };

async function animated() {
  const { project, workspace, pinia } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 20, rows: 20 });
  project.setAnimate(true);
  return { project, workspace, pinia };
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

// What a Blank frame inherits is its own: it plays and exports, so it shows solid. The ghost is pictures of other frames
// (cells that stay, Frames before and after: animation-cells-stay.test.js and below).
test('a Blank frame shows what it inherits solid, typed or painted, with the ghost on: the same cells it plays and exports', async () => {
  const { project, workspace } = await animated();
  type(project, 1, 1, 'A');
  project.paintStroke([{ x: 6, y: 6, alpha: 1 }, { x: 6, y: 7, alpha: 1 }], '#ff0000');
  project.commitEdit();
  project.addFrame('blank');
  expect(workspace.ghost).toBe(true);
  expect(project.cells[at(1, 1)].char).toBe('A');
  expect(project.cells[at(6, 3)].bg.r).toBe(255);
  expect(project.shownCells).toBe(project.cells);
  type(project, 2, 2, 'B'); // its own, beside what it inherits
  expect(project.shownCells).toBe(project.cells);
  project.undo();
  await settle(project);
  expect(project.shownCells).toBe(project.cells);
});

test('a Wipe, a Duplicate and a Blank after a Wipe show their cells solid too', async () => {
  const { project } = await animated();
  type(project, 1, 1, 'A');
  project.addFrame('duplicate');
  expect(project.shownCells).toBe(project.cells);
  project.addFrame('wipe');
  type(project, 2, 2, 'W');
  expect(project.shownCells).toBe(project.cells);
  project.addFrame('blank');
  expect(project.shownCells).toBe(project.cells);
  expect(project.cells[at(2, 2)].char).toBe('W');
});

test('frame 0 and a still have no ghost', async () => {
  const { project } = await animated();
  type(project, 1, 1, 'A');
  expect(project.shownCells).toBe(project.cells);
  project.addFrame('blank');
  project.showFrame(0);
  expect(project.shownCells).toBe(project.cells);
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

test('a setting changed while playing shows at once, and playing goes on', async () => {
  const { project, workspace } = await animated();
  const playback = usePlayback();
  type(project, 1, 1, 'A');
  project.addFrame('blank');
  project.setFps(30);
  await playback.play();
  const before = workspace.played.cells[at(10, 5)].bg.hex;
  project.setSlider('brightness', 160);
  await until(() => workspace.playing && workspace.played?.cells[at(10, 5)].bg.hex !== before, 'the brighter frames playing');
  const seen = new Set();
  await until(() => seen.add(workspace.playFrame).size === 2, 'both frames, still playing');
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
  await project.setBlankCanvas({ withLayer: true });
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
  const { project, workspace, pinia } = await animated();
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
  app.use(pinia);
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


test('the PIXEL view shows what a Blank frame inherits solid, drawn or typed, with the ghost on or off, as it plays', async () => {
  const { project, workspace, pinia } = await animated();
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
  app.use(pinia);
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
  expect(px(8, 8)).toEqual(solidRed); // inherited: this frame's too
  const typed = px(1, 2);

  workspace.ghost = false;
  await settle(project);
  expect(px(8, 8)).toEqual(solidRed);
  expect(px(1, 2)).toEqual(typed);
  workspace.ghost = true;

  project.setFps(1);
  await playback.play();
  await settle(project);
  expect(px(8, 8)).toEqual(solidRed);
  playback.pause();
  await settle(project);
  expect(px(8, 8)).toEqual(solidRed);
  app.unmount();
  host.remove();
});

test('cells drawn to stay on their frame show on PIXEL on the frame after as the ghost, at its strength, and not with Ghost off', async () => {
  const { project, workspace, pinia } = await animated();
  workspace.editorTab = 'input';
  workspace.cellsStay = true;
  project.addFrame('blank');
  project.paintStroke([{ x: 8, y: 8, alpha: 1 }], '#ff0000');
  project.commitEdit();
  type(project, 1, 1, 'A');
  project.addFrame('blank');
  const host = document.createElement('div');
  host.style.cssText = 'width:400px;height:400px;position:fixed;left:0;top:0';
  document.body.append(host);
  const app = createApp({ render: () => h(InputEditor) });
  app.use(pinia);
  app.mount(host);
  await nextTick();
  await project.buildGhost();
  await settle(project);
  const canvas = host.querySelector('canvas');
  const px = (x, y) => {
    const c = canvas.getContext('2d'), { width, height } = canvas;
    return [...c.getImageData(Math.floor((x + 0.5) * (width / 20)), Math.floor((y + 0.5) * (height / 20)), 1, 1).data].slice(0, 3);
  };
  const set = async (percent) => { workspace.ghostStrength = percent; await settle(project); };
  const { data, width } = project.renderer.basePixels, o = 4 * (8 * width + 8), base = [data[o], data[o + 1], data[o + 2]];
  const near = (got, want) => got.forEach((value, i) => expect(Math.abs(value - want[i])).toBeLessThanOrEqual(2));

  expect(project.renderer.outputCanvas.getContext('2d').getImageData(8, 8, 1, 1).data[0]).not.toBe(255); // not this frame's
  await set(100);
  expect(px(8, 8)).toEqual([255, 0, 0]);
  const typed = px(1, 2); // the frame before's A, drawn as edit cells are
  await set(50);
  near(px(8, 8), [(base[0] + 255) / 2, base[1] / 2, base[2] / 2]);
  workspace.ghost = false;
  await settle(project);
  near(px(8, 8), base);
  expect(px(1, 2)).not.toEqual(typed);
  app.unmount();
  host.remove();
});

test('with Frames after, what a frame after painted shows on PIXEL in the cool tint, at the ghost\'s strength', async () => {
  const { project, workspace, pinia } = await animated();
  workspace.editorTab = 'input';
  project.addFrame('blank');
  project.addFrame('blank');
  project.paintStroke([{ x: 8, y: 8, alpha: 1 }], '#ff0000');
  project.commitEdit();
  project.showFrame(1);
  workspace.ghostFramesAfter = 1;
  const host = document.createElement('div');
  host.style.cssText = 'width:400px;height:400px;position:fixed;left:0;top:0';
  document.body.append(host);
  const app = createApp({ render: () => h(InputEditor) });
  app.use(pinia);
  app.mount(host);
  await nextTick();
  await project.buildGhost();
  workspace.ghostStrength = 100;
  await settle(project);
  const canvas = host.querySelector('canvas');
  const c = canvas.getContext('2d'), { width, height } = canvas;
  const px = [...c.getImageData(Math.floor(8.5 * (width / 20)), Math.floor(8.5 * (height / 20)), 1, 1).data].slice(0, 3);
  [99, 160, 204].forEach((value, i) => expect(Math.abs(px[i] - value)).toBeLessThanOrEqual(2)); // red, most of the way to the tint
  app.unmount();
  host.remove();
});

test('Escape in FPS or Hold puts the field back, and a blur after it changes nothing', async () => {
  const { project, pinia } = await animated();
  project.addFrame('blank');
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(AnimationBar) }).use(pinia).use(i18n);
  app.mount(host);
  await nextTick();
  const fps = project.fps, hold = project.currentFrame.hold;
  try {
    for (const [label, typed, now] of [['Frames per second', '20', () => project.fps], ['Hold', '3', () => project.currentFrame.hold]]) {
      const field = host.querySelector(`input[aria-label="${label}"]`);
      const was = field.value;
      await userEvent.tripleClick(field);
      await userEvent.keyboard(typed);
      expect(field.value).toBe(typed);
      await userEvent.keyboard('{Escape}');
      expect(field.value).toBe(was);
      field.blur(); // a tap away
      await nextTick();
      expect(field.value).toBe(was);
      expect(now()).toBe(label === 'Hold' ? hold : fps);
    }
  } finally {
    app.unmount();
    host.remove();
  }
});
