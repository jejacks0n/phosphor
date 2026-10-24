// An exported .utf8ans as a terminal lays it out: the art (up to SAUCE's end-of-file marker) with
// its escape codes stripped, one row per line, each character at its terminal width. A wide
// character fills its column and the next (''). A row that isn't exactly cols wide is an error:
// that's a file a terminal would show out of line.
import { graphemes, cellWidth } from '../../src/lib/CharWidth.js';

const ESCAPE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

export function terminalGrid(bytes, cols) {
  const end = bytes.indexOf(0x1a);
  const text = new TextDecoder().decode(end < 0 ? bytes : bytes.subarray(0, end)).replace(ESCAPE, '');
  const lines = text.split('\r\n');
  if (lines.at(-1) === '') lines.pop();
  return lines.map((line, row) => {
    const cells = [];
    for (const char of graphemes(line)) {
      const width = cellWidth(char);
      cells.push(char);
      for (let k = 1; k < width; k++) cells.push('');
    }
    if (cells.length !== cols) throw new Error(`row ${row} is ${cells.length} columns wide, expected ${cols}`);
    return cells;
  });
}
