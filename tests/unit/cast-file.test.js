import { test, expect } from 'vitest';
import { castText } from '../../src/lib/CastFile.js';
import { replay } from '../support/terminal.js';

const color = (hex) => ({ hex, r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) });
const cell = (char, wide) => ({ char, fg: color('#ffffff'), bg: color('#000000'), ...(wide && { wide }) });
const grid = (...chars) => chars.map((c) => (typeof c === 'string' ? cell(c) : c));
const COLS = 4, ROWS = 2;
const FRAMES = [
  grid('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'),
  grid('a', 'X', 'c', 'd', 'e', 'f', 'g', 'h'),
  grid(cell('漢', 'lead'), cell('漢', 'trail'), 'c', '"', 'e', 'f', 'g', '\\'),
];
const parsed = (text) => text.trimEnd().split('\n').map((line) => JSON.parse(line));

test('the header gives the grid and each frame is one event at its cumulative time', () => {
  const [header, ...events] = parsed(castText(COLS, ROWS, FRAMES, [0.125, 0.125, 0.125]));
  expect(header).toEqual({ version: 2, width: COLS, height: ROWS });
  expect(events.map(([t]) => t)).toEqual([0, 0.125, 0.25, 0.375]);
  expect(events.every(([, kind, data]) => kind === 'o' && typeof data === 'string')).toBe(true);
  expect(events[0][2].startsWith('\x1b[0m\x1b[2J')).toBe(true);
  expect(events[1][2]).toBe('\x1b[1;2HX');
});

test('a hold lengthens its frame', () => {
  const [, ...events] = parsed(castText(COLS, ROWS, FRAMES, [0.125, 2, 0.125]));
  expect(events.map(([t]) => t)).toEqual([0, 0.125, 2.125, 2.25]);
});

test('every line parses as JSON, with escapes and wide characters intact', () => {
  const text = castText(COLS, ROWS, FRAMES, [1, 1, 1]);
  expect(text.endsWith('\n')).toBe(true);
  const events = parsed(text);
  const last = events[3][2];
  expect(last).toContain('漢');
  expect(last).toContain('"');
  expect(last).toContain('\\');
});

test('an unchanged frame is an event with nothing in it', () => {
  const [, , second] = parsed(castText(COLS, ROWS, [FRAMES[0], FRAMES[0]], [1, 1]));
  expect(second[2]).toBe('');
});

test('replaying the events in a terminal model gives every frame’s cells', () => {
  const events = parsed(castText(COLS, ROWS, FRAMES, [1, 1, 1])).slice(1);
  const encoder = new TextEncoder();
  FRAMES.forEach((frame, i) => {
    const played = encoder.encode(events.slice(0, i + 1).map(([, , data]) => data).join(''));
    const { grid: shown } = replay(played, COLS, ROWS);
    expect(shown.map((c) => c.char)).toEqual(frame.map((c) => (c.wide === 'trail' ? '' : c.char)));
  });
});
