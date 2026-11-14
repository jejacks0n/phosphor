// The SAUCE tab's fields as the record counts them: one place a character (a code point, so an emoji is one), and
// what an edit that runs past a field's width leaves out, named rather than dropped.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { AnsiFile } from '../../src/lib/AnsiFile.js';
import { charCount, fitField, readSauce, sauceText, sauceUnmappable } from '../../src/lib/Sauce.js';

test('a character is one place, an emoji included', () => {
  assert.equal(charCount('Café € 🎨'), 8);
  assert.equal(charCount(''), 0);
});

test('a paste past the width keeps the first characters and names what it left out', () => {
  const pasted = 'Café € 🎨 Restaurée par Walt, été 1996 xyz';
  assert.deepEqual(fitField('', pasted, pasted.length, 35), { text: 'Café € 🎨 Restaurée par Walt, été 19', caret: 'Café € 🎨 Restaurée par Walt, été 19'.length, left: '96 xyz', stripped: false });
});

test('a paste into the middle loses its own end, not the text after it', () => {
  const before = 'abcdefgh';
  const after = 'abcd123456efgh'; // 123456 pasted after the d
  assert.deepEqual(fitField(before, after, 10, 10), { text: 'abcd12efgh', caret: 6, left: '3456', stripped: false });
});

test('a key pressed in a full field doesn\'t go in, and is named', () => {
  const full = 'x'.repeat(20);
  assert.deepEqual(fitField(full, `${full}Q`, 21, 20), { text: full, caret: 20, left: 'Q', stripped: false });
  assert.deepEqual(fitField(full, `xxQ${full.slice(2)}`, 3, 20), { text: full, caret: 2, left: 'Q', stripped: false });
});

test('what fits, and a deletion, go through as they are', () => {
  assert.deepEqual(fitField('abc', 'abXc', 3, 35), { text: 'abXc', caret: 3, left: '', stripped: false });
  assert.deepEqual(fitField('abc', 'ac', 1, 35), { text: 'ac', caret: 1, left: '', stripped: false });
});

test('an emoji next to one that shares its first half isn\'t split', () => {
  // 🎨 and 🎭 share a high surrogate: the edit starts at the emoji, not inside it.
  assert.deepEqual(fitField('ab🎨', 'ab🎭🎨', 4, 3), { text: 'ab🎨', caret: 2, left: '🎭', stripped: false });
});

const WALT = { title: 'Restored by Walt', author: 'Wélt Kowałski €96 re', group: 'Ïmpure Łodz Crew €XY', comments: [] };

test('the characters SAUCE can\'t hold in CP437 are listed in field order, each with what it becomes and its fields', () => {
  assert.deepEqual(sauceUnmappable(WALT), [
    { char: 'ł', as: '?', fields: ['author'] },
    { char: '€', as: '?', fields: ['author', 'group'] },
    { char: 'Ï', as: '?', fields: ['group'] },
    { char: 'Ł', as: '?', fields: ['group'] },
  ]);
  assert.deepEqual(sauceUnmappable({ title: 'a → b', comments: ['🎨 here'] }), [
    { char: '→', as: '>', fields: ['title'] }, // a lookalike, as the art's list gives
    { char: '🎨', as: '?', fields: ['comments'] },
  ]);
  assert.deepEqual(sauceUnmappable({ title: 'Plain é', author: '', group: '', comments: ['fine'] }), []);
});

test('only what reaches the record is listed: past a field\'s width, or past the 255th comment line, nothing is', () => {
  assert.deepEqual(sauceUnmappable({ title: `${'x'.repeat(35)}€`, comments: [...Array(255).fill('ok'), 'ł'] }), []);
  assert.deepEqual(sauceUnmappable({ title: `${'x'.repeat(34)}€` }).map(({ char }) => char), ['€']);
});

test('what the list says a character becomes is what the file holds', async () => {
  const W = { r: 255, g: 255, b: 255, hex: '#ffffff', c: [255, 255, 255] };
  const bytes = new Uint8Array(await new AnsiFile(1, 1, [{ char: 'A', fg: W, bg: W }]).toBlob({ sauce: WALT }).arrayBuffer());
  const read = readSauce(bytes);
  let { author, group } = WALT;
  for (const { char, as } of sauceUnmappable(WALT)) [author, group] = [author, group].map((text) => text.replaceAll(char, as));
  assert.deepEqual([read.author, read.group], [author, group]);
});

// Control characters: C0 (tab, BEL, ESC and the rest), DEL and C1. A terminal printing the file would act on them.
const CONTROLS = 'A\tB\u0007C\u001b[31mD\u007fE\u0085F\u0000G\u009bH';

test('SAUCE text holds no control characters; a comment keeps its line breaks, CR LF and CR as LF', () => {
  assert.equal(sauceText(CONTROLS), 'ABC[31mDEFGH');
  assert.equal(sauceText('one\ntwo'), 'onetwo');
  assert.equal(sauceText('one\r\ntwo\rthree\nfour\u001b', true), 'one\ntwo\nthree\nfour');
  assert.equal(sauceText('Café 🎨 é\u00a0'), 'Café 🎨 é\u00a0'); // a no-break space is CP437's 255, not a control
});

test('a field\'s edit loses its control characters before it\'s fitted, and says so', () => {
  assert.deepEqual(fitField('', CONTROLS, CONTROLS.length, 20, sauceText), { text: 'ABC[31mDEFGH', caret: 12, left: '', stripped: true });
  assert.deepEqual(fitField('', 'x\u001by', 3, 1, sauceText), { text: 'x', caret: 1, left: 'y', stripped: true });
  assert.deepEqual(fitField('', 'a\r\nb', 4, 9, (text) => sauceText(text, true)), { text: 'a\nb', caret: 3, left: '', stripped: true });
});

test('the record never holds a field\'s control characters, whatever the field held (a project, an opened file)', async () => {
  const W = { r: 255, g: 255, b: 255, hex: '#ffffff', c: [255, 255, 255] };
  const sauce = { title: CONTROLS, author: CONTROLS, group: CONTROLS, fontName: 'IBM\u001bVGA', date: '2026\t1113', comments: [CONTROLS, `${'w '.repeat(31)}\u001b\u001bxy`] };
  const bytes = new Uint8Array(await new AnsiFile(1, 1, [{ char: 'A', fg: W, bg: W }]).toBlob({ sauce }).arrayBuffer());
  const record = bytes.subarray(bytes.indexOf(0x1a) + 1);
  const text = [...record.subarray(0, record.length - 128 + 90), ...record.subarray(record.length - 128 + 106)]; // the comments, title to date, font name
  assert.equal(text.some((byte) => (byte > 0 && byte < 32) || byte === 127), false);
  const read = readSauce(bytes);
  assert.deepEqual([read.title, read.author, read.group, read.fontName, read.date], ['ABC[31mDEFGH', 'ABC[31mDEFGH', 'ABC[31mDEFGH', 'IBMVGA', '20261113']);
  assert.deepEqual(read.comments, ['ABC[31mDEFGH', `${'w '.repeat(31)}xy`]); // stripped before it's wrapped: 64 fit one line
  assert.deepEqual(sauceUnmappable(sauce), []); // nothing written as ?, so nothing listed
});
