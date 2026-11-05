import { tweenBands } from '@/document/tweens.js';

// The scrubber's mark for each frame: its kind if that's what it is for, else whether anything was drawn on it; and
// with a shape's key, the frames its tweens work out, between its key frames.
export function frameMarks(frames, key = null) {
  const marks = frames.map(({ kind, changes }) => (kind !== 'blank' ? kind : changes.size ? 'drawn' : 'empty'));
  if (key) for (const { from, to } of tweenBands(frames, key)) marks.fill('tween', from + 1, to);
  return marks;
}
