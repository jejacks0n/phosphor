// terminalGrid: an exported .utf8ans read back as a terminal lays it out (escape codes stripped,
// characters at their terminal width), the yardstick every .utf8ans test measures with.
import { test, expect } from 'vitest';
import { terminalGrid } from '../support/terminal.js';

const SGR = '\x1b[38;2;255;0;0m', RESET = '\x1b[0m';
const bytes = (text) => new TextEncoder().encode(text);

test('lays characters out at their terminal width, a wide one filling the next column', () => {
  const art = `${RESET}${SGR}a漢${RESET}b\r\n👍🏽é${SGR}x${RESET}\r\n`;
  expect(terminalGrid(bytes(art), 4)).toEqual([
    ['a', '漢', '', 'b'],
    ['👍🏽', '', 'é', 'x'],
  ]);
});

test('stops at the SAUCE record', () => {
  expect(terminalGrid(bytes('ab\r\n\x1aSAUCE00garbage'), 2)).toEqual([['a', 'b']]);
});

test('a row that is not exactly the grid wide is an error', () => {
  expect(() => terminalGrid(bytes('abcdefg\r\n'), 8)).toThrow(/row 0 is 7 columns wide, expected 8/);
  expect(() => terminalGrid(bytes('a漢漢漢漢\r\n'), 8)).toThrow(/row 0 is 9 columns wide/);
});
