// Export › ASCII: the drawing's characters as plain text (UTF-8), a line per row, with no colors, SAUCE or escape codes.
import { test, expect } from 'vitest';
import { createTestApp, settle } from '../support/app.js';
import { charRowsOf, selectionText } from '@/lib/Cells.js';

const INK = { fg: '#ffee00', bg: '#0044aa' };

async function drawing(renderStyle = 'ansi') {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 6, rows: 6, renderStyle });
  [...'Hi!'].forEach((char, i) => project.typeAt(1 + i, 0, char, INK));
  project.typeAt(0, 2, '░', INK);
  project.typeAt(5, 2, '#', INK);
  project.commitEdit();
  await settle(project);
  return { project, workspace };
}
// The characters showing, a string a row (a cell that shows none, its two colors the same, is a space).
const charsOf = (project) => selectionText(project.cells, project.cols, { c0: 0, r0: 0, c1: project.cols - 1, r1: charRowsOf(project.rows) - 1 }).split('\n');

async function exported(project, opts = {}) {
  let file = null;
  await project.exportFile('txt', { filename: 'art', deliver: (blob, name) => { file = { blob, name }; }, ...opts });
  return { name: file.name, type: file.blob.type, bytes: new Uint8Array(await file.blob.arrayBuffer()) };
}

test('a .txt is the characters as they show, a line per row the grid\'s width, in UTF-8, with nothing else', async () => {
  const { project } = await drawing();
  const { name, type, bytes } = await exported(project);
  expect(name).toBe('art.txt');
  expect(type).toBe('text/plain;charset=utf-8');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  expect(text).toBe(' Hi!  \n      \n░    #\n');
  for (const mark of ['\x1b', '\x1a', 'SAUCE']) expect(text).not.toContain(mark); // no colors, no end-of-file mark, no record, asked for or not
  expect(bytes.length).toBe(text.length + 2); // ░ is three bytes
});

for (const renderStyle of ['ansi', 'ascii']) {
  test(`a .txt opens again as the same characters at the same size (${renderStyle})`, async () => {
    const { project } = await drawing(renderStyle);
    const [cols, rows, chars] = [project.cols, project.rows, charsOf(project)];
    const { bytes } = await exported(project);
    await project.openArtFile(new File([bytes], 'art.txt'));
    await settle(project);
    expect([project.cols, project.rows]).toEqual([cols, rows]);
    expect(charsOf(project)).toEqual(chars);
  });
}
