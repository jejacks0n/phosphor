// The installed web app opening files (the manifest's file_handlers; projectIO's onLaunchedFiles): each file it's
// launched with goes to open, a project with its handle, so Save writes over it, as one opened from the picker does.
import { afterEach, expect, test, vi } from 'vitest';
import { onLaunchedFiles } from '@/document/projectIO';

afterEach(() => vi.unstubAllGlobals());

// A real handle, from the origin private file system.
async function handle(name, text) {
  const dir = await navigator.storage.getDirectory();
  const file = await dir.getFileHandle(name, { create: true });
  const writable = await file.createWritable();
  await writable.write(text);
  await writable.close();
  return file;
}

test('a project the app is launched with opens with its handle; an art file opens without one', async () => {
  let consumer;
  vi.stubGlobal('launchQueue', { setConsumer: (take) => { consumer = take; } });
  const opened = [];
  onLaunchedFiles((file) => opened.push(file));
  const project = await handle('launched.phosphor', 'PHOSPHOR');
  await consumer({ files: [project] });
  await consumer({ files: [await handle('launched.ans', 'hi')] });
  expect(opened.map((file) => [file.name, file.fileHandle ?? null])).toEqual([['launched.phosphor', project], ['launched.ans', null]]);
  expect(await opened[1].text()).toBe('hi');
  await consumer({ files: [] }); // launched with no file: nothing to open
  expect(opened).toHaveLength(2);
});

test('without a launch queue (not installed, or a browser without File Handling) nothing happens', () => {
  vi.stubGlobal('launchQueue', undefined);
  expect(() => onLaunchedFiles(() => {})).not.toThrow();
});
