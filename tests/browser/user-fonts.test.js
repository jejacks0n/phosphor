// Fonts you load from your computer (userFonts.js): read, checked to be monospaced, kept in this
// browser's IndexedDB, and removed.
import { test, expect } from 'vitest';
import { addFont, loadFonts, removeFont, familyOf } from '@/lib/userFonts';

const file = async (fixture, name = fixture) => new File([await (await fetch(`/tests/fixtures/fonts/${fixture}`)).arrayBuffer()], name);

test('a monospaced font is kept, with its own line height, and can be removed', async () => {
  const font = await addFont(await file('tall.ttf', 'Tall Mono.ttf'));
  expect(font.name).toBe('Tall Mono');
  expect(font.lineHeight).toBeCloseTo(1.2, 2); // ascent 1.1em + descent 0.1em
  expect(document.fonts.check(`16px ${familyOf(font.id)}`, 'M')).toBe(true);
  expect((await loadFonts()).map((f) => f.id)).toContain(font.id);
  await removeFont(font.id);
  expect((await loadFonts()).map((f) => f.id)).not.toContain(font.id);
});

test('a proportional font, or a file that isn\'t a font, is refused and not kept', async () => {
  const before = (await loadFonts()).length;
  await expect(addFont(await file('proportional.ttf', 'Wobbly.ttf'))).rejects.toThrow(/^“Wobbly” isn't monospaced: “i” is 4\.0px wide and “W” is 14\.4px\./);
  await expect(addFont(new File(['not a font'], 'notes.ttf'))).rejects.toThrow('“notes.ttf” couldn\'t be read as a font.');
  expect((await loadFonts()).length).toBe(before);
});
