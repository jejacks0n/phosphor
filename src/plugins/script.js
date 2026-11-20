// A plugin's script (docs/plugins.md): hashed, imported from a blob: address, and its default export's solvers
// checked and frozen. A script imports nothing, so one blob is the whole module.
import { ManifestError } from './manifest.js';
import { isWideChar } from '@/lib/Cells';

export const MOST_REACH = 4;
const MOST_SOLVERS = 8, MOST_OPTIONS = 12, MOST_CHOICES = 20, MOST_NAME = 40, MOST_CHARS = 32, MOST_SHADER = 64 * 1024;
const STYLES = ['ansi', 'colorAscii', 'ascii'];
const ID = /^[a-z0-9-]{1,40}$/;
const MOST_COPY = 1000; // a longer array is over every cap; not walked (undefined fills, which no check passes)
const OPTION_ID = /^[a-z](?:[a-z0-9]|_(?!_)){0,31}$/; // a GLSL identifier suffix (the shader's uniform is opt_<id>): no __, which GLSL reserves

export async function sha256(text) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function importScript(text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
  try {
    return await import(/* @vite-ignore */ url);
  } catch (error) {
    throw new ManifestError('scriptLoad', { message: String(error?.message ?? error) });
  } finally {
    URL.revokeObjectURL(url);
  }
}

const shape = (field) => new ManifestError('scriptShape', { field });
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value) => typeof value === 'string' && value.length > 0 && [...value].length <= MOST_NAME;
const num = (value) => typeof value === 'number' && Number.isFinite(value);

// A stranger's object can be a getter or a Proxy: each field is read once, into a local, and only the locals are
// checked and kept. An array is copied once and only the copy is looked at.
const pick = (raw, keys) => Object.fromEntries(keys.map((key) => [key, raw[key]]));
// (An array's iterator re-reads its length each step, so the length is read here, once.)
const copy = (value) => {
  if (!Array.isArray(value)) return null;
  const length = value.length;
  return length > MOST_COPY ? Array.from({ length: MOST_COPY + 1 }) : Array.from({ length }, (_, i) => value[i]);
};
// Any error a stranger's code raises while being read is a refusal, not a crash.
const guarded = (field, read) => {
  try {
    return read();
  } catch (error) {
    throw error instanceof ManifestError ? error : shape(field);
  }
};

function readOption(raw, field) {
  if (!isObject(raw)) throw shape(field);
  const option = pick(raw, ['id', 'kind', 'name', 'min', 'max', 'step', 'default', 'choices']);
  if (typeof option.id !== 'string' || !OPTION_ID.test(option.id) || !text(option.name)) throw shape(field);
  const { id, kind, name, min, max, step, default: value } = option;
  if (kind === 'slider') {
    if (![min, max, step, value].every(num) || !(min < max) || !(step > 0) || value < min || value > max) throw shape(field);
    return Object.freeze({ id, kind, name, min, max, step, default: value });
  }
  if (kind === 'checkbox') {
    if (typeof value !== 'boolean') throw shape(field);
    return Object.freeze({ id, kind, name, default: value });
  }
  if (kind === 'choice') {
    const choices = copy(option.choices);
    if (!choices || choices.length < 1 || choices.length > MOST_CHOICES || !choices.every(text)
      || !Number.isInteger(value) || value < 0 || value >= choices.length) throw shape(field);
    return Object.freeze({ id, kind, name, choices: Object.freeze(choices), default: value });
  }
  throw shape(field);
}

function readChars(chars, field) {
  if (chars === undefined) return '';
  if (typeof chars !== 'string' || [...chars].length > MOST_CHARS) throw shape(field);
  for (const char of chars) {
    if (/\p{Cc}/u.test(char) || /\p{M}/u.test(char) || isWideChar(char)) throw new ManifestError('badChar', { char });
  }
  return chars;
}

function readShader(raw, field) {
  if (raw === undefined) return Object.freeze({ solve: null, refine: null });
  if (!isObject(raw)) throw shape(field);
  const { solve, refine } = pick(raw, ['solve', 'refine']);
  const one = (value) => {
    if (value === undefined) return null;
    if (typeof value !== 'string' || value.length > MOST_SHADER) throw shape(field);
    return value;
  };
  return Object.freeze({ solve: one(solve), refine: one(refine) });
}

function readSolver(raw, index) {
  const at = `solvers[${index}]`;
  return guarded(at, () => {
    if (!isObject(raw)) throw shape(at);
    const { id, name, reach, solve, refine, chars: rawChars, shader, ...rest } = pick(raw, ['id', 'name', 'styles', 'reach', 'chars', 'options', 'solve', 'refine', 'shader']);
    if (typeof id !== 'string' || !ID.test(id)) throw shape(`${at}.id`);
    if (!text(name)) throw shape(`${at}.name`);
    const styles = copy(rest.styles);
    if (!styles || !styles.length || !styles.every((style) => STYLES.includes(style))) throw shape(`${at}.styles`);
    if (!Number.isInteger(reach) || reach < 0 || reach > MOST_REACH) throw shape(`${at}.reach`);
    if (typeof solve !== 'function') throw shape(`${at}.solve`);
    if (refine != null && typeof refine !== 'function') throw shape(`${at}.refine`);
    const chars = readChars(rawChars, `${at}.chars`);
    const rawOptions = rest.options === undefined ? [] : copy(rest.options);
    if (!rawOptions || rawOptions.length > MOST_OPTIONS) throw shape(`${at}.options`);
    const options = rawOptions.map((option, i) => readOption(option, `${at}.options[${i}]`));
    if (new Set(options.map((option) => option.id)).size < options.length) throw shape(`${at}.options`);
    return Object.freeze({
      id, name, styles: Object.freeze(styles), reach, chars, options: Object.freeze(options),
      solve, refine: refine ?? null, shader: readShader(shader, `${at}.shader`),
    });
  });
}

export function readSolvers(namespace) {
  const solvers = guarded('default', () => {
    const exported = namespace?.default;
    if (!isObject(exported)) throw shape('default');
    return guarded('solvers', () => copy(exported.solvers));
  });
  if (!solvers || !solvers.length || solvers.length > MOST_SOLVERS) throw shape('solvers');
  const defs = solvers.map(readSolver);
  const seen = new Set();
  for (const { id } of defs) {
    if (seen.has(id)) throw new ManifestError('twoSolvers', { id });
    seen.add(id);
  }
  return Object.freeze(defs);
}
