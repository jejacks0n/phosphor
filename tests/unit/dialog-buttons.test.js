// Back, then forward: wherever a dialog or form offers a way out beside a way on, the way out comes first.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';

const vueFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const path = join(dir, entry.name);
  if (entry.isDirectory()) return vueFiles(path);
  return entry.name.endsWith('.vue') ? [path] : [];
});
const WAY_OUT_AFTER_ANOTHER = /<\/button>\s*<button\b[^>]*>\s*(Cancel|Not now)\s*<\/button>/g;

test('no Cancel or Not now comes after the button beside it', () => {
  const wrong = vueFiles('src').flatMap((file) => [...readFileSync(file, 'utf8').matchAll(WAY_OUT_AFTER_ANOTHER)].map(([, words]) => `${file}: ${words}`));
  expect(wrong).toEqual([]);
});
