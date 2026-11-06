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

test("a selected shape's in-between frames are marked as a tween's", () => {
  const shape = Object.freeze({ points: [] });
  const frames = Array.from({ length: 9 }, () => newFrame('blank'));
  frames[0].changes.set('v:a', cellState(shape, 0, 0));
  frames[0].tweens = new Map([['v:a', new Map([['transform', 'easeIn']])]]);
  frames[6].changes.set('v:a', cellState(shape, 0, 0));
  const plain = ['drawn', 'empty', 'empty', 'empty', 'empty', 'empty', 'drawn', 'empty', 'empty'];
  expect(frameMarks(frames, 'v:a')).toEqual(['drawn', 'tween', 'tween', 'tween', 'tween', 'tween', 'drawn', 'empty', 'empty']);
  expect(frameMarks(frames)).toEqual(plain);
  expect(frameMarks(frames, 'v:b')).toEqual(plain);
});
