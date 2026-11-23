// The command list's search (src/lib/commandSearch.js): the query's letters in order in a command's words, best match
// first (whole words, then the starts of words, then the rest), ties in the table's order.
import { test, expect } from 'vitest';
import { searchCommands } from '../../src/lib/commandSearch.js';

const list = (...words) => words.map((w, i) => ({ id: `c${i}`, words: w }));
const found = (query, commands) => searchCommands(query, commands).map(({ id }) => commands.find((c) => c.id === id).words);

test('the letters in order, not necessarily together, case and the query\'s spaces aside', () => {
  const commands = list('Export .ans', 'Export .png', 'Save the project');
  expect(found('exa', commands)).toEqual(['Export .ans']);
  expect(found('EXP', commands)).toEqual(['Export .ans', 'Export .png']);
  expect(found('l d', list('Layer: Duplicate', 'Layer: Delete', 'Undo'))).toEqual(['Layer: Duplicate', 'Layer: Delete']);
  expect(found('xe', commands)).toEqual([]);
});

test('whole words rank above the starts of words, and those above letters scattered through', () => {
  // "bake" scattered through the first, the start of the second's word, the third's whole word.
  const commands = list('Bring back the base layer', 'Make art layer', 'Baked colors', 'Bake');
  expect(found('bake', commands)).toEqual(['Bake', 'Baked colors', 'Bring back the base layer']);
  expect(searchCommands('bake', commands).map(({ score }) => score)).toEqual([3, 2, 1]);
  expect(found('save as', list('Save the project', 'Save the project as a new file'))).toEqual(['Save the project as a new file']);
});

test('ties keep the table\'s order', () => {
  const commands = list('Export animated .ans', 'Export .ans', 'Export .utf8ans');
  expect(found('exp ans', commands)).toEqual(['Export animated .ans', 'Export .ans', 'Export .utf8ans']);
  expect(found('exp ans', list('Export .ans', 'Export animated .ans'))).toEqual(['Export .ans', 'Export animated .ans']);
});

test('an empty query finds nothing', () => {
  expect(searchCommands('', list('Bake'))).toEqual([]);
  expect(searchCommands('   ', list('Bake'))).toEqual([]);
});
