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
  return new URL(`../../${ROOT}${name}`, import.meta.url).pathname;
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

async function write(name, value) {
  const binary = value instanceof Uint8Array;
  if (inBrowser) {
    const { commands } = await import('vitest/browser');
    const content = binary ? btoa(String.fromCharCode(...value)) : value;
    await commands.writeFile(`${ROOT}${name}`, content, binary ? 'base64' : 'utf8');
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
