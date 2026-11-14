// xterm's 16 and 231 are fixed black and white, 0 and 15 a terminal's own (its theme's): the same colors in Phosphor. A
// 256-color file opened keeps which is which through what's done to it, so its export writes them back as they were
// (docs/characters.md, Saving).
import { test, expect, vi } from 'vitest';
import { createTestApp, settle } from '../support/app.js';

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
