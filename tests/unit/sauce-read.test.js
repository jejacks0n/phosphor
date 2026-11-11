// Reading a SAUCE record back from an art file: the fields Sauce.js writes, and where the art stops.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { AnsiFile } from '../../src/lib/AnsiFile.js';
import { artEndOf, keptFields, keptRecord, readSauce } from '../../src/lib/Sauce.js';

const W = { r: 255, g: 255, b: 255, hex: '#ffffff', c: [255, 255, 255] };
const K = { r: 0, g: 0, b: 0, hex: '#000000', c: [0, 0, 0] };
const cells = Array.from({ length: 8 }, () => ({ char: 'A', fg: W, bg: K }));
const sauce = { title: 'Boat', author: 'Ann', group: 'G', date: '20261102', fontName: 'IBM VGA', use9pxFont: true, comments: ['one', 'two'] };
const bytesOf = async (opts) => new Uint8Array(await new AnsiFile(4, 2, cells).toBlob(opts).arrayBuffer());

test('readSauce returns what the writer put in the record, and artEnd is the EOF byte', async () => {
  const bytes = await bytesOf({ sauce });
  const read = readSauce(bytes);
  assert.deepEqual(
    { ...read, artEnd: undefined },
    { title: 'Boat', author: 'Ann', group: 'G', date: '20261102', comments: ['one', 'two'], dataType: 1, fileType: 1, width: 4, height: 2, flags: 5, iceColors: true, use9pxFont: true, fontName: 'IBM VGA', artEnd: undefined },
  );
  assert.equal(read.artEnd, bytes.indexOf(0x1a));
  assert.equal(artEndOf(bytes), read.artEnd);
});

test('the 8 pixel font reads as not 9 pixel', async () => {
  assert.equal(readSauce(await bytesOf({ sauce: { ...sauce, use9pxFont: false } })).use9pxFont, false);
});

test('bytes with no SAUCE give null, and the art ends at the EOF byte or the end', () => {
  const plain = new Uint8Array([65, 66, 67]);
  assert.equal(readSauce(plain), null);
  assert.equal(artEndOf(plain), 3);
  const withEof = new Uint8Array([65, 66, 0x1a, 67]);
  assert.equal(readSauce(withEof), null);
  assert.equal(artEndOf(withEof), 2);
  assert.equal(readSauce(new Uint8Array(0)), null);
});

const withoutEof = (bytes) => { const eof = bytes.indexOf(0x1a); return new Uint8Array([...bytes.slice(0, eof), ...bytes.slice(eof + 1)]); };

test('with no EOF byte, the art ends where the comment block, or the record, starts', async () => {
  const bytes = await bytesOf({ sauce });
  const noEof = withoutEof(bytes);
  assert.equal(artEndOf(noEof), bytes.indexOf(0x1a));
  assert.equal(readSauce(noEof).artEnd, bytes.indexOf(0x1a));
  assert.deepEqual(readSauce(noEof).comments, ['one', 'two']);
  const bare = await bytesOf({ sauce: { ...sauce, comments: [] } });
  assert.equal(artEndOf(withoutEof(bare)), bare.indexOf(0x1a));
});

test('a 0x1A inside a record with no EOF byte is not taken for the end of the art', async () => {
  const bytes = await new AnsiFile(26, 2, [...cells, ...cells, ...cells, ...cells]).toBlob({ sauce }).arrayBuffer().then((b) => new Uint8Array(b));
  const eof = bytes.indexOf(0x1a);
  const noEof = withoutEof(bytes); // the width byte, 26, is now the first 0x1A
  assert.equal(noEof.indexOf(0x1a) > eof, true);
  assert.equal(artEndOf(noEof), eof);
  assert.equal(readSauce(noEof).artEnd, eof);
  const bare = new Uint8Array(await new AnsiFile(26, 2, cells).toBlob({ sauce: { ...sauce, comments: [] } }).arrayBuffer());
  const bareNoEof = withoutEof(bare);
  assert.equal(artEndOf(bareNoEof), bare.indexOf(0x1a));
});

test('garbled input does not throw: a comment count that runs off the start is ignored', async () => {
  const bytes = await bytesOf({ sauce: { ...sauce, comments: [] } });
  bytes[bytes.length - 128 + 104] = 200; // 200 comment lines, and no room for them
  const read = readSauce(bytes);
  assert.deepEqual(read.comments, []);
  assert.equal(read.title, 'Boat');
  assert.equal(readSauce(new Uint8Array(100)), null);
});

test('a record written with its own flags, size, empty date and empty font keeps them', async () => {
  const record = { ...sauce, date: '', fontName: '', flags: 0x10, width: 80, height: 99, comments: ['Created with Phosphor', '', 'theirs'] };
  const read = readSauce(await bytesOf({ sauce: record }));
  assert.deepEqual(
    [read.date, read.fontName, read.flags, read.width, read.height, read.comments],
    ['', '', 0x10, 80, 99, ['Created with Phosphor', '', 'theirs']],
  );
});

test('with nothing given, the record is Phosphor\'s own: no comments, iCE colors, today, IBM VGA and the grid\'s size', async () => {
  const read = readSauce(await bytesOf({ sauce: {} }));
  assert.deepEqual([read.comments, read.flags, read.fontName, read.width, read.height], [[], 3, 'IBM VGA', 4, 2]);
  assert.match(read.date, /^\d{8}$/);
});

test('keptFields gives the record\'s flags, and its size only while the grid is the size it was opened at', () => {
  const kept = keptRecord({ flags: 0x10, width: 80, height: 99 }, 80, 25);
  assert.deepEqual(keptFields(kept, 80, 25), { flags: 0x10, width: 80, height: 99 });
  assert.deepEqual(keptFields(kept, 80, 30), { flags: 0x10 });
  assert.deepEqual(keptFields(kept, 60, 25), { flags: 0x10 });
  assert.equal(keptFields('', 80, 25), null);
  assert.equal(keptFields('1 2 x 4 5', 80, 25), null); // a stranger's setting that isn't one
});
