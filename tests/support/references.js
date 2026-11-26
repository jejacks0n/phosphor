// Reference files: what a test's output must equal, under tests/fixtures/reference/. They're written
// only by an update run (UPDATE_REFERENCES=1: npm run test:update); otherwise a missing or different
// file fails the test. A reference is a claim that today's output is right: read the diff before
// committing one. Works in both layers: Node's fs in unit tests, Vitest's file commands in the browser.

const ROOT = 'tests/fixtures/reference/';
const inBrowser = typeof window !== 'undefined';

// Whether this is an update run. The browser can't read the environment, so the config passes it in.
const updating = () => (inBrowser ? __UPDATE_REFERENCES__ : process.env.UPDATE_REFERENCES === '1');

// A reference's path (Node: absolute, from the repo root).
export function referencePath(name) {
  return decodeURIComponent(new URL(`../../${ROOT}${name}`, import.meta.url).pathname); // a checkout path may have spaces
}

async function read(name, binary) {
  if (inBrowser) {
    const { commands } = await import('vitest/browser');
    // Browser commands resolve paths from the project root.
    const text = await commands.readFile(`${ROOT}${name}`, binary ? 'base64' : 'utf8');
    return binary ? Uint8Array.from(atob(text), (c) => c.charCodeAt(0)) : text;
  }
  const { readFile } = await import('node:fs/promises');
  const data = await readFile(referencePath(name));
  return binary ? new Uint8Array(data) : data.toString('utf8');
}

// Bytes as base64, a piece at a time: spread whole, a picture's bytes are more arguments than a call can take.
function base64(bytes) {
  let text = '';
  for (let at = 0; at < bytes.length; at += 0x8000) text += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  return btoa(text);
}

async function write(name, value, root = ROOT) {
  const binary = value instanceof Uint8Array;
  if (inBrowser) {
    const { commands } = await import('vitest/browser');
    const content = binary ? base64(value) : value;
    await commands.writeFile(`${root}${name}`, content, binary ? 'base64' : 'utf8');
    return;
  }
  const { mkdir, writeFile } = await import('node:fs/promises');
  const path = referencePath(name);
  await mkdir(path.slice(0, path.lastIndexOf('/')), { recursive: true });
  await writeFile(path, binary ? Buffer.from(value) : value);
}

// actual: a string, or bytes (Uint8Array) compared byte for byte.
export async function matchReference(name, actual) {
  if (updating()) return write(name, actual);
  const binary = actual instanceof Uint8Array;
  let expected;
  try {
    expected = await read(name, binary);
  } catch {
    throw new Error(`missing reference: ${name} (run npm run test:update)`);
  }
  if (binary) {
    if (expected.length !== actual.length || expected.some((b, i) => b !== actual[i])) {
      const at = expected.findIndex((b, i) => b !== actual[i]);
      throw new Error(`${name}: bytes differ from the reference (${actual.length} vs ${expected.length} bytes; first difference at ${at < 0 ? Math.min(actual.length, expected.length) : at})`);
    }
  } else if (expected !== actual) {
    const a = actual.split('\n'), e = expected.split('\n');
    const line = a.findIndex((l, i) => l !== e[i]);
    throw new Error(`${name}: differs from the reference at line ${line + 1}:\n  expected ${JSON.stringify(e[line])}\n  got      ${JSON.stringify(a[line])}`);
  }
}

// A PNG's pixels, as the browser reads it (browser only).
export async function decodePng(bytes) {
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  return { width: bitmap.width, height: bitmap.height, data: ctx.getImageData(0, 0, bitmap.width, bitmap.height).data };
}

// Where a failed picture's actual and diff images go: gitignored, beside Vitest's failure screenshots.
const FAILED = '.vitest/attachments/references/';

// png: a picture's bytes (a PNG), compared by its pixels with the reference PNG, so a change in how a PNG is written
// isn't a change. grid: { cols, lines }, the cells the picture shows, so a failure names the cells that differ.
// On a failure the picture made and a diff (what differs in red over the reference, dimmed) are written under FAILED.
export async function matchImage(name, png, { cols, lines }) {
  if (updating()) return write(name, png);
  let expected;
  try {
    expected = await decodePng(await read(name, true));
  } catch {
    throw new Error(`missing reference: ${name} (run npm run test:update)`);
  }
  const actual = await decodePng(png);
  const fail = async (why) => {
    await write(name.replace(/\.png$/, '.actual.png'), png, FAILED);
    throw new Error(`${name}: ${why}. The picture made: ${FAILED}${name.replace(/\.png$/, '.actual.png')}`);
  };
  if (actual.width !== expected.width || actual.height !== expected.height) return fail(`${actual.width}x${actual.height}, the reference is ${expected.width}x${expected.height}`);
  const { width, height } = actual, cell = { width: width / cols, height: height / lines }, cells = new Set(), diff = new Uint8ClampedArray(expected.data);
  for (let i = 0; i < diff.length; i += 4) {
    const same = actual.data[i] === expected.data[i] && actual.data[i + 1] === expected.data[i + 1] && actual.data[i + 2] === expected.data[i + 2];
    if (same) { diff[i] >>= 2; diff[i + 1] >>= 2; diff[i + 2] >>= 2; continue; }
    diff.set([255, 0, 0, 255], i);
    const x = (i / 4) % width, y = Math.floor(i / 4 / width);
    cells.add(`${Math.floor(x / cell.width)},${Math.floor(y / cell.height)}`);
  }
  if (!cells.size) return;
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext('2d').putImageData(new ImageData(diff, width, height), 0, 0);
  await write(name.replace(/\.png$/, '.diff.png'), new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer()), FAILED);
  const list = [...cells];
  return fail(`${list.length} cells differ (col,row): ${list.slice(0, 20).join(' ')}${list.length > 20 ? ' …' : ''}. The diff: ${FAILED}${name.replace(/\.png$/, '.diff.png')}`);
}
