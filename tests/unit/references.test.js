// Reference files (tests/fixtures/reference/): what a test's output must equal. They're written only
// by an update run (UPDATE_REFERENCES=1, what npm run test:update sets); otherwise a missing or
// different file fails the test.
import { test, expect, beforeEach, afterEach } from 'vitest';
import { rm } from 'node:fs/promises';
import { matchReference, referencePath } from '../support/references.js';

const NAME = 'selftest/reference.txt';
// Each test sets the update switch itself (an update run sets it for everything).
let outer;
beforeEach(() => {
  outer = process.env.UPDATE_REFERENCES;
  delete process.env.UPDATE_REFERENCES;
});
afterEach(async () => {
  if (outer === undefined) delete process.env.UPDATE_REFERENCES;
  else process.env.UPDATE_REFERENCES = outer;
  await rm(referencePath('selftest'), { recursive: true, force: true });
});

test('a missing reference fails, and says how to make it', async () => {
  await expect(matchReference(NAME, 'x')).rejects.toThrow(/missing reference: selftest\/reference.txt \(run npm run test:update\)/);
});

test('an update run writes it; then the same output passes and a different one fails', async () => {
  process.env.UPDATE_REFERENCES = '1';
  await matchReference(NAME, 'first');
  delete process.env.UPDATE_REFERENCES;
  await expect(matchReference(NAME, 'first')).resolves.toBeUndefined();
  await expect(matchReference(NAME, 'second')).rejects.toThrow();
});

test('bytes compare byte for byte', async () => {
  process.env.UPDATE_REFERENCES = '1';
  await matchReference('selftest/bytes.bin', new Uint8Array([0, 255, 27, 91]));
  delete process.env.UPDATE_REFERENCES;
  await expect(matchReference('selftest/bytes.bin', new Uint8Array([0, 255, 27, 91]))).resolves.toBeUndefined();
  await expect(matchReference('selftest/bytes.bin', new Uint8Array([0, 255, 27, 92]))).rejects.toThrow();
});
