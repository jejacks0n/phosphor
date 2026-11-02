// The scrubber's mark for each frame: its kind if that's what it is for, else whether anything was drawn on it.
export const frameMarks = (frames) => frames.map(({ kind, changes }) => (kind !== 'blank' ? kind : changes.size ? 'drawn' : 'empty'));
