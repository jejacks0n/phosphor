// A plugin's manifest (phosphor-plugin.json) is a stranger's data: read into a clean object, every string within its
// limit, every color hex for one of the app's own color slots, and no field Phosphor doesn't know. docs/plugins.md
// describes the format.
import { parse } from '../lib/semver.js';

// The plugin API's level, which a manifest names as "phosphor": the lowest level that has everything the plugin uses.
// It goes up by one whenever something is added that a plugin can use (a manifest field, a color slot, a list or a
// field in a script, an option kind, a call on what a script is handed), so a plugin that uses the new thing names the
// new level and a copy of Phosphor from before it says the plugin is for a newer Phosphor (newer), rather than taking
// it with the new thing left out. A reader takes every level from 1 up to its own. That's why a field Phosphor doesn't
// know refuses a plugin at any level (unknownField, and the script's readers the same): at a level this copy knows,
// it's a slip, not something newer.
export const API_LEVEL = 1;
export const MOST_MANIFEST_BYTES = 65536;
export const MOST_SCRIPT_BYTES = 1048576;
export const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

// The color custom properties of :root in global.css, without their dashes, in its order. --logo and the fonts aren't
// slots. accent-glow is worked out from the accent unless a theme sets it. The list can grow, never shrink: a slot
// this copy doesn't know refuses a manifest, so a theme that sets a slot added later isn't read by a copy of Phosphor
// from before it.
export const COLOR_SLOTS = Object.freeze([
  'background', 'background-highlight',
  'accent', 'accent-hot', 'accent-hover', 'accent-glow', 'accent-faint', 'danger', 'danger-hover', 'warning', 'success',
  'surface-dark', 'surface-0', 'surface-1', 'surface-2', 'surface-3', 'surface-4', 'surface-light',
  'border', 'border-subtle', 'border-light',
  'text', 'text-dim', 'text-muted', 'text-faint', 'text-inverted', 'text-on-accent',
  'shadow', 'guide', 'tooltip', 'toast', 'toast-text', 'wand-fill',
]);
const SLOTS = new Set(COLOR_SLOTS);

// An id's part: lowercase letters, digits and hyphens, the first and the last a letter or a digit (never all hyphens).
const ID = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const MOST_ID = 64;
// A plugin's id as a manifest may have it (author.name, at most 64 characters): also what a ref's plugin part is held to.
export const goodPluginId = (value) => typeof value === 'string' && value.length <= MOST_ID && ID.test(value);
const THEME_ID = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const MOST_THEMES = 20;
// Relative to the manifest, inside its folder: no leading slash, no . or .. segment, no empty one (a//b.js), no
// backslash, JavaScript. Each segment is a name a folder can be opened by.
const SCRIPT_PATH = /^(?!.*(?:^|\/)\.{1,2}(?:\/|$))(?!.*\/\/)[A-Za-z0-9_-][A-Za-z0-9._/-]*\.m?js$/;

// code: tooBig, notJson, newer, nothing, badField { field }, unknownField { field }, unknownColor { theme, key },
// badColor { theme, key, value }. The words are the app's (plugins.errors in the locales).
export class ManifestError extends Error {
  constructor(code, detail = {}) {
    super(`${code} ${JSON.stringify(detail)}`);
    this.code = code;
    this.detail = detail;
  }
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// A stranger's words are shown as one line of text among the app's own, so they hold no control character, no line or
// paragraph break, and none of the marks that turn text's direction around (which can make a name read as another).
const NOT_PLAIN = /[\p{Cc}\p{Zl}\p{Zp}\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/u;
export const plainText = (value) => typeof value === 'string' && !NOT_PLAIN.test(value);

// lines: the field's own test says what it may hold (the preview, which has line breaks).
const text = (raw, field, most, { required = true, test = null, lines = false } = {}) => {
  const value = raw[field.split('.').pop()];
  if ((value === undefined || value === '') && !required) return ''; // left out, or as this file keeps it
  if (typeof value !== 'string' || value.length > most || (required && !value.trim()) || (!lines && !plainText(value)) || (test && !test(value))) {
    throw new ManifestError('badField', { field });
  }
  return value;
};

// At most 3 lines of at most 24 characters, each plain text; shown as text.
const isPreview = (value) => {
  const lines = value.split('\n');
  return lines.length <= 3 && lines.every((line) => line.length <= 24 && plainText(line));
};

// The fields a manifest and a theme may have. One that isn't among them refuses the manifest, named (cut short: it's
// a stranger's word, shown).
const FIELDS = ['phosphor', 'id', 'name', 'version', 'author', 'description', 'homepage', 'license', 'preview', 'themes', 'script'];
const THEME_FIELDS = ['id', 'name', 'base', 'colors'];
const onlyKnown = (raw, fields, at = '') => {
  const key = Object.keys(raw).find((each) => !fields.includes(each));
  if (key !== undefined) throw new ManifestError('unknownField', { field: `${at}${key.slice(0, 40)}` });
};

const readTheme = (raw, i, seen) => {
  const at = `themes[${i}]`;
  if (!isObject(raw)) throw new ManifestError('badField', { field: at });
  onlyKnown(raw, THEME_FIELDS, `${at}.`);
  const id = text(raw, `${at}.id`, 40, { test: (value) => THEME_ID.test(value) && !seen.has(value) });
  seen.add(id);
  const name = text(raw, `${at}.name`, 40);
  if (raw.base !== 'dark' && raw.base !== 'light') throw new ManifestError('badField', { field: `${at}.base` });
  if (!isObject(raw.colors)) throw new ManifestError('badField', { field: `${at}.colors` });
  const colors = {};
  for (const [key, value] of Object.entries(raw.colors)) {
    if (!SLOTS.has(key)) throw new ManifestError('unknownColor', { theme: name, key });
    if (typeof value !== 'string' || !HEX.test(value)) {
      throw new ManifestError('badColor', { theme: name, key, value: String(value) });
    }
    colors[key] = value;
  }
  return Object.freeze({ id, name, base: raw.base, colors: Object.freeze(colors) });
};

// A manifest's text into a frozen manifest, or a ManifestError.
export function readManifest(source) {
  if (new TextEncoder().encode(source).length > MOST_MANIFEST_BYTES) throw new ManifestError('tooBig');
  let raw;
  try { raw = JSON.parse(source); } catch { throw new ManifestError('notJson'); }
  if (!isObject(raw)) throw new ManifestError('notJson');
  // The level first: a plugin for a newer Phosphor says so, whatever else of it this copy doesn't know.
  const level = raw.phosphor;
  if (typeof level === 'number' && level > API_LEVEL) throw new ManifestError('newer');
  if (!Number.isInteger(level) || level < 1) throw new ManifestError('badField', { field: 'phosphor' });
  onlyKnown(raw, FIELDS);
  const manifest = {
    phosphor: level,
    id: text(raw, 'id', MOST_ID, { test: goodPluginId }),
    name: text(raw, 'name', 60),
    version: text(raw, 'version', 60, { test: (value) => parse(`v${value}`) !== null }),
    author: text(raw, 'author', 60),
    description: text(raw, 'description', 300, { required: false }),
    homepage: text(raw, 'homepage', 200, { required: false, test: (value) => /^https:\/\/[^\s]+$/.test(value) }),
    script: raw.script === undefined || raw.script === '' ? '' : text(raw, 'script', 200, { test: (value) => SCRIPT_PATH.test(value) }),
    license: text(raw, 'license', 40, { required: false }),
    preview: text(raw, 'preview', 74, { required: false, test: isPreview, lines: true }),
  };
  const themes = raw.themes === undefined ? [] : raw.themes;
  if (!Array.isArray(themes) || themes.length > MOST_THEMES) throw new ManifestError('badField', { field: 'themes' });
  if (!themes.length && !manifest.script) throw new ManifestError('nothing');
  const seen = new Set();
  manifest.themes = Object.freeze(themes.map((theme, i) => readTheme(theme, i, seen)));
  return Object.freeze(manifest);
}
