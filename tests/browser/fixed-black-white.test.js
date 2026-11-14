// xterm's 16 and 231 are fixed black and white, 0 and 15 a terminal's own (its theme's): the same colors in Phosphor. A
// 256-color file opened keeps which is which through what's done to it, so its export writes them back as they were
// (docs/characters.md, Saving).
import { test, expect, vi, afterEach } from 'vitest';
import { createApp } from 'vue';
import { createTestApp, settle } from '../support/app.js';
import { useTextTool } from '@/composables/useTextTool';
import { PALETTES } from '@/lib/ColorUtils';

let mounted = null;
afterEach(() => {
  mounted?.unmount();
  mounted = null;
});

const FIXTURE = '/tests/fixtures/ansi/fixed-black-white.ans';
const artOf = (bytes) => new TextDecoder('latin1').decode(bytes.subarray(0, bytes.indexOf(0x1a)));

// The fixture opened (Edit it, or Draw on top of it), and its art as the file has it.
async function opened(layer) {
  const app = await createTestApp();
  const blob = await (await fetch(FIXTURE)).blob();
  await app.project.openArtFile(new File([blob], 'fixed-black-white.ans'), { layer });
  await settle(app.project);
  return { ...app, original: artOf(new Uint8Array(await blob.arrayBuffer())) };
}

// The art of the .ans exportFile downloads.
async function exported(project) {
  const spy = vi.spyOn(URL, 'createObjectURL');
  await project.exportFile('ans');
  const blob = spy.mock.calls.at(-1)[0];
  spy.mockRestore();
  return artOf(new Uint8Array(await blob.arrayBuffer()));
}

test('Flatten onto the edit layer keeps 16 and 231, and so do its undo and redo', async () => {
  const { project, original } = await opened('edit');
  expect(await project.flattenDrawing({ layer: 'edit' })).toBe(true);
  await settle(project);
  expect(await exported(project)).toBe(original);
  project.undo();
  await settle(project);
  expect(await exported(project)).toBe(original);
  project.redo();
  await settle(project);
  expect(await exported(project)).toBe(original);
});

// Alt+Down and Alt+Up step the FG (Shift: BG) color through the palette by index: 15, 16, 17 and 230, 231, 232, not back
// to 1 from 16 (it's 0's black) or on to 16 from 231 (it's 15's white).
test('Alt+Up/Down walks the 256 colors straight through 16 and 231', async () => {
  const { project, workspace } = await opened('edit');
  mounted = createApp({ setup: () => { useTextTool(project, workspace, null); return () => null; } });
  mounted.mount(document.createElement('div'));
  Object.assign(workspace, { editorTab: 'output', outputActiveTool: 'text', textCursor: { col: 0, row: 0 } });
  const step = (key, shiftKey = false) => window.dispatchEvent(new KeyboardEvent('keydown', { key, altKey: true, shiftKey, bubbles: true, cancelable: true }));
  const shows = (slot) => PALETTES.vga.findIndex((p, i) => p.hex.toLowerCase() === workspace[slot === 'fg' ? 'editFgColor' : 'editBgColor'] && (workspace[slot === 'fg' ? 'editFgIndex' : 'editBgIndex'] ?? i) === i);
  for (const [slot, shiftKey] of [['fg', false], ['bg', true]]) {
    workspace.setColor(slot, PALETTES.vga[15].hex.toLowerCase());
    const walked = [];
    for (let n = 0; n < 2; n++) { step('ArrowDown', shiftKey); walked.push(shows(slot)); }
    step('ArrowUp', shiftKey); walked.push(shows(slot));
    step('ArrowUp', shiftKey); walked.push(shows(slot));
    workspace.setColor(slot, PALETTES.vga[230].hex.toLowerCase());
    for (let n = 0; n < 2; n++) { step('ArrowDown', shiftKey); walked.push(shows(slot)); }
    step('ArrowUp', shiftKey); walked.push(shows(slot));
    expect(walked, slot).toEqual([16, 17, 16, 15, 231, 232, 231]);
  }
});

// A lower cell's index doesn't come through what's merged over it: 0's black over 16's is 0, and an index of the entry's
// own stays.
test('Merge down keeps the upper cell\'s own index, never the lower one\'s', async () => {
  const { project, workspace } = await opened('edit');
  const cols = project.cols, id = project.addLayer('cells');
  workspace.pickLayer(id);
  project.writeEditCells([{ col: 0, row: 1, attrs: { fg: '#000000' } }, { col: 1, row: 1, attrs: { fg: '#ffffff', bg: '#000000', bgIndex: 16 } }]);
  project.commitEdit();
  await settle(project);
  expect(project.mergeDown(id)).not.toBe(false);
  await settle(project);
  expect([project.cells[cols].fg.c, project.cells[cols].bg.c, project.cells[cols + 1].fg.c, project.cells[cols + 1].bg.c]).toEqual([0, 231, 15, 16]);
});
