import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';

// Arrows are drawn (ArrowIcon), never typed: a typed one is too small to make out. Key names (Alt+←) and the box-line
// options' → are the exceptions.
const ARROWS = /[◂▸◀▶▴▾▲▼‹›«»←→↑↓↗↖↘↙]/;
const LOCALE_ARROWS = /[◂▸◀▶▴▾▲▼‹›←→↑↓↗↖↘↙]/; // « » are French quotes
// macFnNote spells a menu path in System Settings (Keyboard → Keyboard Shortcuts), whose arrows are the system's.
const SKIPPED_KEYS = new Set(['single-double', 'double-single', 'macFnNote']);

function vueFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? vueFiles(path) : path.endsWith('.vue') ? [path] : [];
  });
}

test('no template draws an arrow as a character', () => {
  const found = [];
  for (const file of vueFiles('src')) {
    const source = readFileSync(file, 'utf8');
    const start = source.indexOf('<template');
    const end = source.lastIndexOf('</template>');
    if (start < 0 || file.includes('/i18n/legal/')) continue; // the legal text is French prose, with its quotes
    // Blank the comments and the key names but keep the line breaks, so a line number stays true.
    const blank = (text) => text.replace(/[^\n]/g, ' ');
    const template = source
      .slice(0, start)
      .replace(/[^\n]/g, ' ')
      .concat(source.slice(start, end))
      .replace(/<!--[\s\S]*?-->/g, blank)
      .replace(/Alt\+[←→]/g, blank);
    template.split('\n').forEach((line, i) => {
      if (ARROWS.test(line)) found.push(`${file}:${i + 1}: ${line.trim()}`);
    });
  }
  expect(found).toEqual([]);
});

test('no string in either locale carries an arrow, but key names and the box-line options', () => {
  const found = [];
  const walk = (value, path) => {
    if (typeof value === 'string') {
      if (LOCALE_ARROWS.test(value)) found.push(`${path}: ${value}`);
    } else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) if (!SKIPPED_KEYS.has(key)) walk(child, `${path}.${key}`);
    }
  };
  for (const locale of ['en', 'fr']) {
    walk(JSON.parse(readFileSync(`src/i18n/locales/${locale}.json`, 'utf8')), locale);
  }
  expect(found).toEqual([]);
});
