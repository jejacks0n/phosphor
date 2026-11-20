// A plugin's script (docs/plugins.md): hashed, imported from a blob: address, and its default export's solvers
// checked and frozen. A script imports nothing, so one blob is the whole module.
import { ManifestError } from './manifest.js';
import { isWideChar } from '@/lib/Cells';

export const MOST_REACH = 4;
const MOST_SOLVERS = 8, MOST_OPTIONS = 12, MOST_CHOICES = 20, MOST_NAME = 40, MOST_CHARS = 32, MOST_SHADER = 64 * 1024;
const STYLES = ['ansi', 'colorAscii', 'ascii'];
const ID = /^[a-z0-9-]{1,40}$/;

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

function readOption(raw, field) {
  if (!isObject(raw) || !ID.test(raw.id) || !text(raw.name)) throw shape(field);
  if (raw.kind === 'slider') {
    const { min, max, step, default: value } = raw;
    if (![min, max, step, value].every(num) || !(min < max) || !(step > 0) || value < min || value > max) throw shape(field);
    return Object.freeze({ id: raw.id, kind: 'slider', name: raw.name, min, max, step, default: value });
  }
  if (raw.kind === 'checkbox') {
    if (typeof raw.default !== 'boolean') throw shape(field);
    return Object.freeze({ id: raw.id, kind: 'checkbox', name: raw.name, default: raw.default });
  }
  if (raw.kind === 'choice') {
    const { choices, default: value } = raw;
    if (!Array.isArray(choices) || choices.length < 1 || choices.length > MOST_CHOICES || !choices.every(text)
      || !Number.isInteger(value) || value < 0 || value >= choices.length) throw shape(field);
    return Object.freeze({ id: raw.id, kind: 'choice', name: raw.name, choices: Object.freeze([...choices]), default: value });
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
  if (raw === undefined) return { solve: null, refine: null };
  if (!isObject(raw)) throw shape(field);
  const one = (value) => {
    if (value === undefined) return null;
    if (typeof value !== 'string' || value.length > MOST_SHADER) throw shape(field);
    return value;
  };
  return Object.freeze({ solve: one(raw.solve), refine: one(raw.refine) });
}

function readSolver(raw, index) {
  const at = `solvers[${index}]`;
  if (!isObject(raw)) throw shape(at);
  if (!ID.test(raw.id)) throw shape(`${at}.id`);
  if (!text(raw.name)) throw shape(`${at}.name`);
  if (!Array.isArray(raw.styles) || !raw.styles.length || !raw.styles.every((style) => STYLES.includes(style))) throw shape(`${at}.styles`);
  if (!Number.isInteger(raw.reach) || raw.reach < 0 || raw.reach > MOST_REACH) throw shape(`${at}.reach`);
  if (typeof raw.solve !== 'function') throw shape(`${at}.solve`);
  if (raw.refine != null && typeof raw.refine !== 'function') throw shape(`${at}.refine`);
  const chars = readChars(raw.chars, `${at}.chars`);
  const rawOptions = raw.options ?? [];
  if (!Array.isArray(rawOptions) || rawOptions.length > MOST_OPTIONS) throw shape(`${at}.options`);
  const options = rawOptions.map((option, i) => readOption(option, `${at}.options[${i}]`));
  if (new Set(options.map(({ id }) => id)).size < options.length) throw shape(`${at}.options`);
  return Object.freeze({
    id: raw.id, name: raw.name, styles: Object.freeze([...raw.styles]), reach: raw.reach, chars,
    options: Object.freeze(options), solve: raw.solve, refine: raw.refine ?? null,
    shader: readShader(raw.shader, `${at}.shader`),
  });
}

export function readSolvers(namespace) {
  const exported = namespace?.default;
  if (!isObject(exported)) throw shape('default');
  const { solvers } = exported;
  if (!Array.isArray(solvers) || !solvers.length || solvers.length > MOST_SOLVERS) throw shape('solvers');
  const defs = solvers.map(readSolver);
  const seen = new Set();
  for (const { id } of defs) {
    if (seen.has(id)) throw new ManifestError('twoSolvers', { id });
    seen.add(id);
  }
  return Object.freeze(defs);
}
