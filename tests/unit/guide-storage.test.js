import { test, expect } from 'vitest';
import { GUIDES_KEY, loadGuides, saveGuides } from '@/lib/guideStorage.js';

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

const sample = { guides: [{ axis: 'v', pos: 40 }], zero: { x: 40.5, y: 0 } };

test('saved guides come back for their file id, and only for it', () => {
  const s = fakeStorage();
  saveGuides('a', sample, { storage: s });
  expect(loadGuides('a', s)).toEqual(sample);
  expect(loadGuides('b', s)).toBeNull();
});

test('nothing to keep removes the entry', () => {
  const s = fakeStorage();
  saveGuides('a', sample, { storage: s });
  saveGuides('a', { guides: [], zero: { x: 0, y: 0 } }, { storage: s });
  expect(JSON.parse(s.getItem(GUIDES_KEY))).not.toHaveProperty('a');
});

test('the 50 used most recently are kept', () => {
  const s = fakeStorage();
  for (let i = 1; i <= 51; i++) saveGuides(`id${i}`, sample, { storage: s, now: i });
  expect(loadGuides('id1', s)).toBeNull();
  expect(loadGuides('id51', s)).not.toBeNull();
  expect(loadGuides('id2', s)).not.toBeNull();
});

test('storage that throws loses the guides, not the app', () => {
  const boom = () => {
    throw new Error('no storage');
  };
  const s = { getItem: boom, setItem: boom, removeItem: boom };
  expect(() => saveGuides('a', sample, { storage: s })).not.toThrow();
  expect(loadGuides('a', s)).toBeNull();
});

test('junk is ignored', () => {
  const s = fakeStorage();
  s.setItem(GUIDES_KEY, '{not json');
  expect(loadGuides('a', s)).toBeNull();
  s.setItem(
    GUIDES_KEY,
    JSON.stringify({
      a: {
        guides: [
          { axis: 'x', pos: 1 },
          { axis: 'v', pos: -1 },
          { axis: 'h', pos: 2.25 },
          { axis: 'h', pos: 3 },
        ],
        zero: { x: 'a' },
        usedAt: 1,
      },
    }),
  );
  expect(loadGuides('a', s)).toEqual({ guides: [{ axis: 'h', pos: 3 }], zero: { x: 0, y: 0 } });

  // An entry that isn't one is dropped, and saving goes on working.
  s.setItem(GUIDES_KEY, JSON.stringify({ x: null, y: 7, a: { ...sample, usedAt: 1 } }));
  saveGuides('b', sample, { storage: s, now: 2 });
  expect(loadGuides('b', s)).toEqual(sample);
  expect(loadGuides('a', s)).toEqual(sample);
  expect(Object.keys(JSON.parse(s.getItem(GUIDES_KEY))).sort()).toEqual(['a', 'b']);
});

test('a file id that is a name every object has finds nothing it wasn\'t given', () => {
  const s = fakeStorage();
  expect(loadGuides('__proto__', s)).toBeNull();
  expect(loadGuides('constructor', s)).toBeNull();
  saveGuides('a', sample, { storage: s });
  expect(loadGuides('constructor', s)).toBeNull();
  expect(loadGuides('toString', s)).toBeNull();
  saveGuides('__proto__', sample, { storage: s, now: 2 });
  expect(loadGuides('__proto__', s)).toEqual(sample);
  expect(loadGuides('a', s)).toEqual(sample);
});
