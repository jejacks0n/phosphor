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

// A byte stream as a terminal plays it, for the animated exports: cursor moves, colors and characters on a
// cols x rows screen. A line feed, or running off the end of the screen, is an error: the art would scroll.
// Returns the cells as { char, fg, bg } (the SGR parameters that set each), a wide character's second column as ''.
export function replay(bytes, cols, rows, { utf8 = true } = {}) {
  const screen = () => Array.from({ length: cols * rows }, () => ({ char: ' ', fg: null, bg: null }));
  let grid = screen(), x = 0, y = 0, fg = null, bg = null, clears = 0;
  const end = bytes.indexOf(0x1a);
  const data = end < 0 ? bytes : bytes.subarray(0, end);
  const put = (char, width) => {
    if (y >= rows || x + width > cols) throw new Error(`writing "${char}" at ${x},${y} runs off a ${cols}x${rows} screen`);
    grid[y * cols + x] = { char, fg, bg };
    for (let k = 1; k < width; k++) grid[y * cols + x + k] = { char: '', fg, bg };
    x += width;
  };
  const sgr = (params) => {
    for (let i = 0; i < params.length; i++) {
      const p = params[i];
      if (p === 0) fg = bg = null;
      else if (p === 38 || p === 48) {
        const length = params[i + 1] === 2 ? 5 : 3, value = params.slice(i, i + length).join(';');
        if (p === 38) fg = value;
        else bg = value;
        i += length - 1;
      } else if (p >= 30 && p <= 37) fg = String(p);
      else if (p >= 40 && p <= 47) bg = String(p);
    }
  };
  let at = 0, text = '';
  const flush = () => {
    if (!text) return;
    if (utf8) for (const char of graphemes(new TextDecoder().decode(Uint8Array.from(text, (c) => c.charCodeAt(0))))) put(char, cellWidth(char));
    else for (const c of text) put(c.charCodeAt(0), 1);
    text = '';
  };
  while (at < data.length) {
    const byte = data[at];
    if (byte === 27) {
      flush();
      let stop = at + 2;
      while (data[stop] < 0x40) stop++;
      const params = String.fromCharCode(...data.subarray(at + 2, stop)).split(';').map(Number), kind = String.fromCharCode(data[stop]);
      if (kind === 'm') sgr(params);
      else if (kind === 'H') [y, x] = [params[0] - 1, params[1] - 1];
      else if (kind === 'J') { grid = screen(); clears++; }
      else throw new Error(`a terminal code this art shouldn't use: ${kind}`);
      at = stop + 1;
    } else if (byte === 10 || byte === 13) throw new Error('a line break in an animation scrolls');
    else {
      text += String.fromCharCode(byte);
      at++;
    }
  }
  flush();
  return { grid, clears };
}
