// A plugin's script (docs/plugins.md): hashed, imported from a blob: address, and its default export's solvers, brushes,
// shapes and filters checked and frozen. A script imports nothing, so one blob is the whole module.
import { ManifestError, plainText } from './manifest.js';
import { isWideChar } from '@/lib/Cells';
import { sha256 } from './hash.js';
import { cleanIcon } from './icon.js';

export { sha256 };

export const MOST_REACH = 4;
const MOST_EACH = 8, MOST_OUTLINES = 200, MOST_POINTS = 500, MOST_OPTIONS = 12, MOST_CHOICES = 20, MOST_NAME = 40, MOST_CHARS = 32, MOST_SHADER = 64 * 1024;
const STYLES = ['ansi', 'colorAscii', 'ascii'];
// A solver's, brush's, shape's or filter's id in its plugin: 1 to 40 lowercase letters, digits and hyphens, the first and
// the last a letter or a digit.
export const ID = /^(?=.{1,40}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const MOST_COPY = 1000; // a longer array is over every cap; not walked (undefined fills, which no check passes)
export const OPTION_ID = /^[a-z](?:[a-z0-9]|_(?!_)){0,31}$/; // a GLSL identifier suffix (the shader's uniform is opt_<id>): no __, which GLSL reserves

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
// A name or a choice's words: plain text (manifest.js's plainText), 1 to 40 characters.
const text = (value) => typeof value === 'string' && value.length > 0 && [...value].length <= MOST_NAME && plainText(value);
const num = (value) => typeof value === 'number' && Number.isFinite(value);

// A field of a stranger's object that Phosphor doesn't know refuses the plugin, named (cut short: it's a stranger's
// word, shown): a slip, or something of a newer Phosphor's that the manifest's level should have said (manifest.js
// API_LEVEL). keys: the object's own, read once.
const onlyKnown = (keys, known, at) => {
  const key = keys.find((each) => !known.includes(each));
  if (key !== undefined) throw shape(`${at ? `${at}.` : ''}${key.slice(0, 40)}`);
};
// A stranger's object can be a getter or a Proxy: its keys are read once, each field is read once, into a local, and
// only the locals are checked and kept. An array is copied once and only the copy is looked at.
const pick = (raw, keys, at) => {
  onlyKnown(Object.keys(raw), keys, at);
  return Object.fromEntries(keys.map((key) => [key, raw[key]]));
};
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

// The fields each kind of option has; every kind has an id, a kind, a name and a default.
const OPTION_FIELDS = { slider: ['min', 'max', 'step'], checkbox: [], color: [], choice: ['choices'] };

function readOption(raw, field) {
  if (!isObject(raw)) throw shape(field);
  const keys = Object.keys(raw);
  const option = Object.fromEntries(['id', 'kind', 'name', 'min', 'max', 'step', 'default', 'choices'].map((key) => [key, raw[key]]));
  if (typeof option.id !== 'string' || !OPTION_ID.test(option.id) || !text(option.name)) throw shape(field);
  const { id, kind, name, min, max, step, default: value } = option;
  if (typeof kind !== 'string' || !Object.hasOwn(OPTION_FIELDS, kind)) throw shape(field); // the text itself: an object that reads as a kind's name isn't one
  onlyKnown(keys, ['id', 'kind', 'name', 'default', ...OPTION_FIELDS[kind]], field);
  if (kind === 'slider') {
    if (![min, max, step, value].every(num) || !(min < max) || !(step > 0) || value < min || value > max) throw shape(field);
    return Object.freeze({ id, kind, name, min, max, step, default: value });
  }
  if (kind === 'checkbox') {
    if (typeof value !== 'boolean') throw shape(field);
    return Object.freeze({ id, kind, name, default: value });
  }
  if (kind === 'color') {
    if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) throw shape(field);
    return Object.freeze({ id, kind, name, default: value.toLowerCase() });
  }
  // a choice
  const choices = copy(option.choices);
  if (!choices || choices.length < 1 || choices.length > MOST_CHOICES || !choices.every(text)
    || !Number.isInteger(value) || value < 0 || value >= choices.length) throw shape(field);
  return Object.freeze({ id, kind, name, choices: Object.freeze(choices), default: value });
}

function readChars(chars, field) {
  if (chars === undefined) return '';
  if (typeof chars !== 'string' || [...chars].length > MOST_CHARS) throw shape(field);
  for (const char of chars) {
    if (/\p{Cc}/u.test(char) || /\p{M}/u.test(char) || isWideChar(char)) throw new ManifestError('badChar', { char });
  }
  return chars;
}

// A solver's shader: each pass's body, and helpers, GLSL put before the pass's function in both (functions and constants
// a body can't declare, being one function's).
function readShader(raw, field) {
  if (raw === undefined) return Object.freeze({ helpers: null, solve: null, refine: null });
  if (!isObject(raw)) throw shape(field);
  const { helpers, solve, refine } = pick(raw, ['helpers', 'solve', 'refine'], field);
  const one = (value) => {
    if (value === undefined) return null;
    if (typeof value !== 'string' || value.length > MOST_SHADER) throw shape(field);
    return value;
  };
  return Object.freeze({ helpers: one(helpers), solve: one(solve), refine: one(refine) });
}

function readSolver(raw, index) {
  const at = `solvers[${index}]`;
  return guarded(at, () => {
    if (!isObject(raw)) throw shape(at);
    const { id, name, reach, solve, refine, chars: rawChars, shader, ...rest } = pick(raw, ['id', 'name', 'styles', 'reach', 'chars', 'options', 'solve', 'refine', 'shader'], at);
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

// A list of options, checked (at most MOST_OPTIONS, unique ids) and frozen.
function readOptions(raw, at) {
  const list = raw === undefined ? [] : copy(raw);
  if (!list || list.length > MOST_OPTIONS) throw shape(`${at}.options`);
  const options = list.map((option, i) => readOption(option, `${at}.options[${i}]`));
  if (new Set(options.map((option) => option.id)).size < options.length) throw shape(`${at}.options`);
  return Object.freeze(options);
}

// A brush's or shape's id, name and icon (an SVG string, rebuilt by cleanIcon or refused).
function readHead(raw, at) {
  const { id, name, icon } = raw;
  if (typeof id !== 'string' || !ID.test(id)) throw shape(`${at}.id`);
  if (!text(name)) throw shape(`${at}.name`);
  if (typeof icon !== 'string') throw shape(`${at}.icon`);
  try {
    return { id, name, icon: cleanIcon(icon) };
  } catch {
    throw shape(`${at}.icon`);
  }
}

// A function a script keeps (move, outline, begin, end): read once here, never called while reading.
const fn = (value, at, optional) => {
  if (optional && value == null) return null;
  if (typeof value !== 'function') throw shape(at);
  return value;
};

function readBrush(raw, index) {
  const at = `brushes[${index}]`;
  return guarded(at, () => {
    if (!isObject(raw)) throw shape(at);
    const fields = pick(raw, ['id', 'name', 'icon', 'key', 'size', 'options', 'begin', 'move', 'end'], at);
    const head = readHead(fields, at);
    const options = readOptions(fields.options, at);
    let key = null;
    if (fields.key != null) {
      if (typeof fields.key !== 'string' || !/^(shift\+)?[a-z]$/i.test(fields.key)) throw shape(`${at}.key`);
      const letter = fields.key.slice(-1).toUpperCase();
      key = fields.key.length > 1 ? `Shift+${letter}` : letter;
    }
    let size = null;
    if (fields.size != null) {
      if (typeof fields.size !== 'string' || !options.some((o) => o.id === fields.size && o.kind === 'slider')) throw shape(`${at}.size`);
      size = fields.size;
    }
    return Object.freeze({
      ...head, key, size, options,
      begin: fn(fields.begin, `${at}.begin`, true), move: fn(fields.move, `${at}.move`), end: fn(fields.end, `${at}.end`, true),
    });
  });
}

function readShape(raw, index) {
  const at = `shapes[${index}]`;
  return guarded(at, () => {
    if (!isObject(raw)) throw shape(at);
    const fields = pick(raw, ['id', 'name', 'icon', 'options', 'outline'], at);
    const head = readHead(fields, at);
    return Object.freeze({ ...head, options: readOptions(fields.options, at), outline: fn(fields.outline, `${at}.outline`) });
  });
}

function readFilter(raw, index) {
  const at = `filters[${index}]`;
  return guarded(at, () => {
    if (!isObject(raw)) throw shape(at);
    const { id, name, options, helpers = null, passes: rawPasses } = pick(raw, ['id', 'name', 'options', 'helpers', 'passes'], at);
    if (typeof id !== 'string' || !ID.test(id)) throw shape(`${at}.id`);
    if (!text(name)) throw shape(`${at}.name`);
    const passes = copy(rawPasses);
    if (!passes || passes.length < 1 || passes.length > 4) throw shape(`${at}.passes`);
    passes.forEach((pass, i) => {
      if (typeof pass !== 'string' || !pass.length || pass.length > MOST_SHADER) throw shape(`${at}.passes[${i}]`);
    });
    if (helpers !== null && (typeof helpers !== 'string' || helpers.length > MOST_SHADER)) throw shape(`${at}.helpers`); // before every pass's function
    // A filter runs only while one of its options is off its default (plugins/filters.js), so one with none never would.
    const read = readOptions(options, at);
    if (!read.length) throw shape(`${at}.options`);
    return Object.freeze({ id, name, options: read, helpers, passes: Object.freeze(passes) });
  });
}

// One kind's list: at most MOST_EACH, ids unique. (Solvers say twoSolvers; the others are a shape refusal at the id.)
function readKind(exported, kind, read) {
  const list = guarded(kind, () => (exported[kind] === undefined ? [] : copy(exported[kind])));
  if (!list || list.length > MOST_EACH) throw shape(kind);
  const defs = list.map(read);
  const seen = new Set();
  defs.forEach(({ id }, i) => {
    if (seen.has(id)) {
      if (kind === 'solvers') throw new ManifestError('twoSolvers', { id });
      throw shape(`${kind}[${i}].id`);
    }
    seen.add(id);
  });
  return Object.freeze(defs);
}

// A script's default export read into frozen parts: { solvers, brushes, shapes, filters }, each possibly empty, never all.
export function readScript(namespace) {
  const exported = guarded('default', () => {
    const value = namespace?.default;
    if (!isObject(value)) throw shape('default');
    onlyKnown(Object.keys(value), ['solvers', 'brushes', 'shapes', 'filters'], '');
    return value;
  });
  const parts = Object.freeze({
    solvers: readKind(exported, 'solvers', readSolver),
    brushes: readKind(exported, 'brushes', readBrush),
    shapes: readKind(exported, 'shapes', readShape),
    filters: readKind(exported, 'filters', readFilter),
  });
  if (!Object.values(parts).some((list) => list.length)) throw shape('default');
  return parts;
}

// A shape's outline function's answer, read into frozen outlines: each { closed, points }, a point being
// [x, y, inX, inY, outX, outY] (a 2-number point has no handles). 1-200 outlines, 500 points in all, every number finite.
export function readOutlines(raw) {
  try {
    const list = copy(raw);
    if (!list || list.length < 1 || list.length > MOST_OUTLINES) throw shape('outline');
    let total = 0;
    const outlines = list.map((item) => {
      if (!isObject(item)) throw shape('outline');
      const { closed, points: rawPoints } = pick(item, ['closed', 'points'], 'outline');
      const points = copy(rawPoints);
      if (typeof closed !== 'boolean' || !points || points.length < 2) throw shape('outline');
      total += points.length;
      if (total > MOST_POINTS) throw shape('outline');
      return Object.freeze({
        closed,
        points: Object.freeze(points.map((point) => {
          const numbers = copy(point);
          if (!numbers || (numbers.length !== 2 && numbers.length !== 6) || !numbers.every(num)) throw shape('outline');
          return Object.freeze(numbers.length === 2 ? [...numbers, 0, 0, 0, 0] : numbers);
        })),
      });
    });
    return Object.freeze(outlines);
  } catch (error) {
    throw error instanceof ManifestError ? error : shape('outline');
  }
}
