import { test, expect } from 'vitest';
import { cellCount, snapHalf, guideLabel, shownZero, rulerMarks } from '@/lib/rulers.js';

test('cellCount: zero on an edge has no 0 character; in a middle, that character is 0', () => {
  expect(cellCount(40, 40)).toBe(1);
  expect(cellCount(39, 40)).toBe(-1);
  expect(cellCount(40, 40.5)).toBe(0);
  expect(cellCount(41, 40.5)).toBe(1);
  expect(cellCount(39, 40.5)).toBe(-1);
  expect(cellCount(0, 0)).toBe(1); // at the top left the count is the 1-based column
  expect(cellCount(79, 0)).toBe(80);
});

test('snapHalf: to edges and middles, inside the drawing', () => {
  expect(snapHalf(12.24, 80)).toBe(12);
  expect(snapHalf(12.26, 80)).toBe(12.5);
  expect(snapHalf(-3, 80)).toBe(0);
  expect(snapHalf(99, 80)).toBe(80);
});

test('guideLabel: whole and half characters, with a real minus', () => {
  expect(guideLabel(0)).toBe('0');
  expect(guideLabel(12)).toBe('12');
  expect(guideLabel(12.5)).toBe('12½');
  expect(guideLabel(0.5)).toBe('½');
  expect(guideLabel(-0.5)).toBe('−½');
  expect(guideLabel(-3.5)).toBe('−3½');
  expect(guideLabel(-20)).toBe('−20');
});

test('shownZero: past the edge counts from the edge', () => {
  expect(shownZero(40.5, 80)).toBe(40.5);
  expect(shownZero(60, 40)).toBe(40);
});

test('rulerMarks: every 10th labeled, 5ths and 10ths ticked at the middle, edges ticked', () => {
  const m = rulerMarks({ cells: 81, zero: 40.5, size: 10, start: 0, length: 810 });
  expect(m.labels).toEqual([
    { at: 205, text: '−20' }, { at: 305, text: '−10' }, { at: 405, text: '0' },
    { at: 505, text: '10' }, { at: 605, text: '20' },
    { at: 5, text: '−40' }, { at: 105, text: '−30' }, { at: 705, text: '30' }, { at: 805, text: '40' },
  ].sort((a, b) => a.at - b.at));
  expect(m.tens).toContain(505);
  expect(m.fives).toContain(455);
  expect(m.tens).not.toContain(405); // 0 is labeled, not ticked long
  expect(m.edges).toHaveLength(82);
});

test('rulerMarks: zero on an edge labels no 0; narrow characters drop the edge ticks', () => {
  const m = rulerMarks({ cells: 80, zero: 40, size: 2, start: 0, length: 160 });
  expect(m.labels.map((l) => l.text)).not.toContain('0');
  expect(m.edges).toEqual([]);
});

test('rulerMarks: only what is on screen', () => {
  const m = rulerMarks({ cells: 300, zero: 0, size: 10, start: -1000, length: 200 });
  expect(Math.min(...m.edges)).toBeGreaterThanOrEqual(-10);
  expect(Math.max(...m.edges)).toBeLessThanOrEqual(210);
});
