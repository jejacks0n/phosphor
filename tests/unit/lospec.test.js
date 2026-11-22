// Reading Lospec: what is typed as a slug, an answer as a palette, and the shipped set the script wrote.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { slugOf, readPalette } from '../../src/lib/lospec.js';
import { SLUGS } from '../../scripts/color-library.mjs';

const shipped = JSON.parse(readFileSync(new URL('../../src/lib/colorPalettes.json', import.meta.url), 'utf8'));

test('what is typed is a slug: a Lospec link in any of its forms, or a name', () => {
  for (const link of ['https://lospec.com/palette-list/sweetie-16', 'https://lospec.com/palette-list/sweetie-16.json',
    'https://www.lospec.com/palette-list/sweetie-16.hex', 'https://lospec.com/palette-list/sweetie-16/?page=2#top', 'lospec.com/palette-list/sweetie-16']) {
    assert.equal(slugOf(link), 'sweetie-16', link);
  }
  assert.equal(slugOf('  Sweetie 16 '), 'sweetie-16');
  assert.equal(slugOf('AAP-16'), 'aap-16');
  assert.equal(slugOf('Café — 16!'), 'caf-16');
});
test('a link anywhere else, punctuation alone, nothing, or a name past 100 characters is no slug', () => {
  for (const typed of ['https://example.com/palette-list/sweetie-16', 'https://lospec.com/gallery/x', '!!!', '', '   ', 'a'.repeat(101)]) assert.equal(slugOf(typed), '', typed);
});
test('a Lospec answer is read as a palette: its colors checked, its words cut, an empty author allowed', () => {
  assert.deepEqual(readPalette({ name: 'Sweetie 16', author: '', colors: ['1A1C2C', '5d275d'] }, 'sweetie-16'),
    { slug: 'sweetie-16', name: 'Sweetie 16', author: '', colors: ['#1a1c2c', '#5d275d'], of: null });
  assert.equal(readPalette({ name: 'x'.repeat(300), author: 7, colors: ['000000'] }, 'x').name.length, 100);
  assert.equal(readPalette({ colors: ['000000'] }, 'no-name').name, 'no-name');
  const many = readPalette({ name: 'Big', colors: Array(300).fill('abcdef') }, 'big');
  assert.deepEqual([many.colors.length, many.of], [256, 300]);
});
test('anything else is refused', () => {
  for (const bad of [null, 'text', [], {}, { colors: [] }, { colors: 'ffffff' }, { colors: ['ffffff', '#ffffff'] }, { colors: ['fff'] }, { colors: [0xffffff] }, { error: 'file not found' }]) {
    assert.throws(() => readPalette(bad, 'x'), /notPalette/, JSON.stringify(bad));
  }
});
test('the shipped set is the script\'s list, in its order: each one sixteen sound colors and a name', () => {
  assert.equal(SLUGS.length, 29);
  assert.deepEqual(shipped.map((p) => p.slug), SLUGS);
  for (const p of shipped) {
    assert.equal(p.colors.length, 16, p.slug);
    assert.ok(p.colors.every((c) => /^#[0-9a-f]{6}$/.test(c)), p.slug);
    assert.ok(p.name && typeof p.author === 'string', p.slug);
  }
});
