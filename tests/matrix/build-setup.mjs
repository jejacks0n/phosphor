// Builds a foundation with the two-layer setup and saves it as setup-{from}-{style}-{mode}-{palette}-{adjust}.pho in
// tests/matrix/out/ (ignored by git), or with --fixture in tests/fixtures/matrix/, where tests/browser/matrix.test.js
// opens it (its pictures then change: read tests/matrix/README.md first).
//   node tests/matrix/build-setup.mjs [from style mode palette adjust] [--fixture] [--headed]
// from: image (fixtures/matrix/landscape.png), blank, or scene.ans opened with edit (Edit artwork), base (Draw on top) or
// picture (Open as an image). style: ansi, colorAscii, ascii. mode: the base's Choose characters (random, best, shape,
// intensity, brightness). palette: none, vga, cga, count. adjust: none, or a slider moved, key=value (brightness=20).
// With none given: image ansi best vga none.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { openApp } from './app.mjs';

const here = (p) => new URL(p, import.meta.url);
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const [from, style, mode, palette, adjust] = args.length ? args : ['image', 'ansi', 'best', 'vga', 'none'];
const input = from === 'image' ? ['landscape.png', 'image/png'] : from === 'blank' ? null : ['scene.ans', 'application/octet-stream'];
const [key, value] = adjust === 'none' ? [] : adjust.split('=');
const FOUNDATION = {
  from, style, mode, palette, adjust: key ? { key, value: Number(value) } : null,
  file: input && { name: input[0], type: input[1], base64: readFileSync(here(`../fixtures/matrix/${input[0]}`)).toString('base64') },
};
const slug = [from, style, mode, palette, adjust.replace('=', '')].join('-');

const app = await openApp({ headless: !process.argv.includes('--headed') });
try {
  const size = await app.inPage(async (f) => (await import('/tests/matrix/page-setup.js')).foundation(f), FOUNDATION);
  console.log('foundation', slug, size);
  const { log } = await app.inPage(async () => (await import('/tests/matrix/page-setup.js')).setup());
  for (const { name, changed } of log) console.log(changed ? '  ok   ' : '  NONE ', name);
  const b64 = await app.inPage(async () => (await import('/tests/matrix/page-setup.js')).pho());
  const dir = process.argv.includes('--fixture') ? '../fixtures/matrix/' : 'out/';
  mkdirSync(here(dir), { recursive: true });
  const path = here(`${dir}setup-${slug}.pho`).pathname;
  writeFileSync(path, Buffer.from(b64, 'base64'));
  console.log('saved', path);
} finally {
  await app.close();
}
