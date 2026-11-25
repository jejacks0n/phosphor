// Our own deflate (src/lib/Deflate.js): a zlib stream any inflater reads back, whose bytes before a mark stay as they are
// whatever is written after a rewind to it.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { FixedDeflater } from '../../src/lib/Deflate.js';

const seeded = (length, seed, alphabet) => Uint8Array.from({ length }, () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) % alphabet);

test('what it writes inflates to the data: noise, runs, and more than a window', () => {
  const runs = Uint8Array.from({ length: 100_000 }, (_, i) => (i >> 9) & 3);
  for (const data of [new Uint8Array(0), seeded(5000, 1, 256), seeded(80_000, 2, 4), runs]) {
    const deflater = new FixedDeflater(data);
    for (let at = 0; at < data.length; at += 777) deflater.encode(at, Math.min(data.length, at + 777));
    assert.deepEqual(new Uint8Array(inflateSync(deflater.finish())), data);
  }
});

test('a rewind to a mark keeps the bytes before it, and what follows is the data as changed', () => {
  const data = seeded(60_000, 5, 8), deflater = new FixedDeflater(data);
  deflater.encode(0, 30_000);
  const mark = deflater.mark(), before = deflater.written.slice();
  deflater.encode(30_000, 60_000);
  for (let i = 30_000; i < 60_000; i += 3) data[i] ^= 1;
  deflater.rewind(mark);
  deflater.encode(30_000, 60_000);
  const out = deflater.finish();
  assert.deepEqual(out.subarray(0, before.length), before);
  assert.deepEqual(new Uint8Array(inflateSync(out)), data);
});
