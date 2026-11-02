import { test, expect } from 'vitest';
import { frameMarks } from '../../src/lib/frameMarks.js';
import { newFrame, cellState } from '../../src/document/frames.js';

const drawn = () => new Map([['0,0', cellState({ char: 'A' }, 0, 0)]]);

test('marks: empty blank is short, drawn blank is tall, kinds win', () => {
  expect(frameMarks([
    newFrame('blank'),
    newFrame('blank', drawn()),
    newFrame('duplicate'),
    newFrame('duplicate', drawn()),
    newFrame('wipe'),
    newFrame('wipe', drawn()),
  ])).toEqual(['empty', 'drawn', 'duplicate', 'duplicate', 'wipe', 'wipe']);
});
