// A fill is under the busy note (useBusy, BusyNote.vue): "Filling…" from the click, the fill on the next frame with the
// note drawn, and gone after, also when the fill throws. While it's up a press starts nothing: not a second fill, and
// not a stroke, which would have joined the fill's edit. The other edits that take over half a second on a large drawing
// go under it too: Merge down, Delete and Paste of a selection, a new character set (issue #231).
import { test, expect, afterEach, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { createApp, h, nextTick, watch } from 'vue';
import { i18n } from '@/i18n';
import { createTestApp, settle } from '../support/app.js';
import { busyMessage, pressedWhileBusy } from '@/composables/useBusy';
import InputEditor from '@/components/InputEditor.vue';
import bucket, { fillSolid } from '@/tools/bucket';
import gradient from '@/tools/gradient';
import { useMergeDown } from '@/composables/useMergeDown';
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts';

let app = null, host = null;
afterEach(() => {
  app?.unmount();
  host?.remove();
  app = host = null;
  busyMessage.value = null;
  vi.restoreAllMocks();
});

async function blank() {
  const { project, workspace, pinia } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 30, rows: 30 });
  await settle(project);
  Object.assign(workspace, { editorTab: 'input', editFgColor: '#ff0000' });
  return { project, workspace, pinia, ctx: { project, workspace, view: 'input' } };
}
const ev = { stopPropagation() {} };
const frames = (n = 3) => new Promise((resolve) => {
  const step = () => (--n ? requestAnimationFrame(step) : resolve());
  requestAnimationFrame(step);
});

test('a fill sets the busy note as it\'s clicked, runs under it, and clears it; a click meanwhile fills nothing', async () => {
  const { project, ctx } = await blank();
  const during = [];
  const paint = project.paintStroke;
  vi.spyOn(project, 'paintStroke').mockImplementation(function (...args) {
    during.push(busyMessage.value);
    return paint.apply(this, args);
  });
  const version = project.history.version;
  expect(bucket.begin(ctx, { x: 3.5, y: 3.5 }, ev)).toBe(false); // a click, with no stroke to continue
  expect(busyMessage.value).toBe('Filling…');
  expect(during).toEqual([]); // on the next frame, with the note in it
  expect(bucket.begin(ctx, { x: 20.5, y: 20.5 }, ev)).toBe(false); // a second click while it waits
  await settle(project);
  expect(during).toEqual(['Filling…']); // one fill, under the note
  expect(busyMessage.value).toBe(null);
  expect(project.history.version).toBe(version + 1);
  expect(project.rawColorAt(20, 20)).toBe('#ff0000'); // the first filled it all; the second never ran
  project.undo();
  await settle(project);
  expect(project.rawColorAt(20, 20)).not.toBe('#ff0000'); // one step
});

test('a fill fills what its click saw: a selection dropped or a color changed before it runs changes nothing', async () => {
  const { project, workspace, ctx } = await blank();
  workspace.selection = { c0: 0, r0: 0, c1: 9, r1: 4 };
  bucket.begin(ctx, { x: 3.5, y: 3.5 }, ev);
  workspace.selection = null; // Escape, in the frame before the fill
  workspace.editFgColor = '#00ff00';
  await settle(project);
  expect(project.rawColorAt(3, 3)).toBe('#ff0000');
  expect(project.rawColorAt(20, 20)).not.toBe('#ff0000'); // outside the selection the click had
  project.undo();
  await settle(project);

  // The Gradient's, from the release.
  Object.assign(workspace, { editFgColor: '#ff0000', editBgColor: '#0000ff', editFgNone: false, editBgNone: false, selection: { c0: 0, r0: 0, c1: 9, r1: 4 } });
  gradient.begin(ctx, { x: 0.5, y: 0.5 }, ev);
  gradient.move(ctx, { x: 0.5, y: 0.5 }, { x: 9.5, y: 0.5 });
  gradient.end(ctx);
  workspace.selection = null;
  await settle(project);
  expect(project.cellHasPaint(3, 3)).toBe(true);
  expect(project.cellHasPaint(20, 10)).toBe(false);
});

test('a fill that throws clears the note, and the next click fills', async () => {
  const { project, ctx } = await blank();
  vi.spyOn(project, 'paintStroke').mockImplementationOnce(() => { throw new Error('no'); });
  await expect(fillSolid(ctx, { x: 3.5, y: 3.5 })).rejects.toThrow('no');
  expect(busyMessage.value).toBe(null);
  // Through a click, it's said in the console, not left unhandled.
  const said = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(project, 'paintStroke').mockImplementationOnce(() => { throw new Error('again'); });
  bucket.begin(ctx, { x: 3.5, y: 3.5 }, ev);
  await settle(project);
  expect(busyMessage.value).toBe(null);
  expect(said).toHaveBeenCalledWith('The fill failed', expect.objectContaining({ message: 'again' }));
  vi.mocked(project.paintStroke).mockRestore();
  project.cancelEdit();
  bucket.begin(ctx, { x: 3.5, y: 3.5 }, ev);
  await settle(project);
  expect(project.rawColorAt(3, 3)).toBe('#ff0000');
});

test('the Gradient\'s fill goes under the note too', async () => {
  const { project, workspace, ctx } = await blank();
  Object.assign(workspace, { editBgColor: '#0000ff', editFgNone: false, editBgNone: false });
  gradient.begin(ctx, { x: 0.5, y: 0.5 }, ev);
  gradient.move(ctx, { x: 0.5, y: 0.5 }, { x: 29.5, y: 0.5 });
  gradient.end(ctx);
  expect(busyMessage.value).toBe('Filling…');
  await settle(project);
  expect(busyMessage.value).toBe(null);
  expect(project.rawColorAt(0, 10)).not.toBe(project.rawColorAt(29, 10)); // blended along the line
});

test('in the view, a press while the note is up starts nothing: no fill, no stroke', async () => {
  const { project, workspace, pinia } = await blank();
  host = Object.assign(document.createElement('div'), { style: 'position: fixed; left: 0; top: 0; width: 400px; height: 400px; display: flex' });
  document.body.append(host);
  app = createApp({ render: () => h(InputEditor) }).use(pinia).use(i18n);
  app.mount(host);
  await nextTick();
  await settle(project);
  const art = host.querySelector('.canvas-container');
  const version = project.history.version;

  busyMessage.value = 'Filling…'; // a fill waiting for its frame
  for (const tool of ['bucket', 'pencil']) {
    workspace.setActiveTool(tool);
    await userEvent.click(art);
    await frames(); // not settle, which waits for the note to go
    expect(project.history.version).toBe(version);
  }
  busyMessage.value = null;
  await userEvent.click(art); // the Pencil, now the note's gone
  await settle(project);
  expect(project.history.version).toBe(version + 1);
});

test('in the view, a click made while the fill runs, which the page only gets after, starts nothing', async () => {
  const { project, workspace, pinia } = await blank();
  host = Object.assign(document.createElement('div'), { style: 'position: fixed; left: 0; top: 0; width: 400px; height: 400px; display: flex' });
  document.body.append(host);
  app = createApp({ render: () => h(InputEditor) }).use(pinia).use(i18n);
  app.mount(host);
  await nextTick();
  await settle(project);
  const art = host.querySelector('.canvas-container');
  workspace.setActiveTool('bucket');
  const version = project.history.version, paint = project.paintStroke;
  let queued = null;
  vi.spyOn(project, 'paintStroke').mockImplementation(function (...args) {
    // A click as the page gets it once it's free: stamped now, dispatched after, in blue.
    const { left, top, width, height } = art.getBoundingClientRect(), at = { clientX: left + width / 2, clientY: top + height / 2, button: 0, pointerType: 'mouse', bubbles: true };
    const down = new PointerEvent('pointerdown', at), up = new PointerEvent('pointerup', at);
    queued = new Promise((resolve) => setTimeout(() => {
      workspace.editFgColor = '#0000ff';
      art.dispatchEvent(down);
      window.dispatchEvent(up);
      resolve(down);
    }));
    return paint.apply(this, args);
  });
  await userEvent.click(art);
  await settle(project);
  const down = await queued;
  await settle(project);
  expect(pressedWhileBusy(down)).toBe(true);
  expect(pressedWhileBusy(new PointerEvent('pointerdown'))).toBe(false); // one made now goes ahead
  expect(project.history.version).toBe(version + 1); // the one fill
  expect(project.rawColorAt(15, 15)).toBe('#ff0000');
});

// Every note put up while run runs, and what run gave.
async function notesWhile(run) {
  const seen = [], stop = watch(busyMessage, (now) => { if (now) seen.push(now); }, { flush: 'sync' });
  try {
    await run();
  } finally {
    stop();
  }
  return seen;
}
const mountWith = (pinia, setup) => {
  let out = null;
  app = createApp({ setup() { out = setup(); return () => null; } }).use(pinia).use(i18n);
  app.mount(document.createElement('div'));
  return out;
};

test('Merge down goes under the note, and merges when it\'s drawn', async () => {
  const { project, workspace, pinia } = await blank();
  const top = project.addLayer('cells');
  workspace.pickLayer(top);
  project.typeAt(3, 3, 'M', { fg: '#ffffff', bg: '#000000' });
  project.commitEdit();
  await settle(project);
  const { mergeDown } = mountWith(pinia, useMergeDown);
  const notes = await notesWhile(async () => {
    const merged = mergeDown(top);
    expect(busyMessage.value).toBe('Merging…');
    expect(project.layerById(top)).toBeTruthy(); // not yet: on the next frame
    expect(await merged).toBe(true);
  });
  expect(notes).toEqual(['Merging…']);
  expect(project.layerById(top)).toBeFalsy();
  expect(project.editCellAt(3, 3)?.char).toBe('M');
});

test('Delete and Cut of a selection by key, and a paste of the block, go under the note', async () => {
  const { project, workspace, pinia } = await blank();
  project.typeAt(3, 3, 'D', { fg: '#ffffff', bg: '#000000' });
  project.commitEdit();
  await settle(project);
  mountWith(pinia, () => useKeyboardShortcuts(project, workspace));
  Object.assign(workspace, { editorTab: 'output' });
  workspace.setActiveTool('select');
  const press = (key, extra = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true, ...extra }));
  const rect = { c0: 2, r0: 2, c1: 4, r1: 4 };

  workspace.selection = rect;
  expect(await notesWhile(async () => { press('Delete'); await settle(project); })).toEqual(['Deleting…']);
  expect(project.editCellAt(3, 3)).toBeFalsy();
  project.undo();
  workspace.selection = rect;
  expect(await notesWhile(async () => { press('x', { ctrlKey: true }); await settle(project); })).toEqual(['Deleting…']);
  expect(project.editCellAt(3, 3)).toBeFalsy();
  workspace.selection = { c0: 10, r0: 5, c1: 10, r1: 5 };
  expect(await notesWhile(async () => { // Cmd+V with no paste event pastes the block
    press('v', { ctrlKey: true });
    await vi.waitFor(() => expect(project.editCellAt(11, 6)?.char).toBe('D'));
  })).toEqual(['Pasting…']);
});

test('a new character set renders under the note; another setting doesn\'t put it up', async () => {
  const { project } = await blank();
  expect(await notesWhile(async () => { project.brightness = 120; await settle(project); })).toEqual([]);
  expect(await notesWhile(async () => { project.chars = ' .:-=+*#%@'; await settle(project); })).toEqual(['Working out the characters…']);
});
