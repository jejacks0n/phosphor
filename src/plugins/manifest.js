// A plugin's manifest (phosphor-plugin.json) is a stranger's data: read into a clean object with only the fields
// Phosphor knows, every string within its limit, every color hex for one of the app's own color slots. docs/plugins.md
// describes the format.
import { parse } from '../lib/semver.js';

export const MANIFEST_FORMAT = 1;
export const MOST_MANIFEST_BYTES = 65536;
export const MOST_SCRIPT_BYTES = 1048576;
export const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

// The color custom properties of :root in global.css, without their dashes. --logo, the display font, --white,
// --black and --accent-glow (worked out from the accent) aren't slots. The list can grow, never shrink: an unknown
// key refuses a manifest.
export const COLOR_SLOTS = Object.freeze([
  'background', 'background-highlight',
  'accent', 'accent-hot', 'accent-hover', 'accent-faint', 'danger', 'danger-hover', 'warning', 'success',
  'surface-dark', 'surface-0', 'surface-1', 'surface-2', 'surface-3', 'surface-4', 'surface-light',
  'border', 'border-dark', 'border-subtle', 'border-light',
  'text', 'text-dim', 'text-muted', 'text-faint', 'text-inverted',
]);
const SLOTS = new Set(COLOR_SLOTS);

const ID = /^[a-z0-9-]+\.[a-z0-9-]+$/;
const THEME_ID = /^[a-z0-9-]+$/;
const MOST_THEMES = 20;
// Relative to the manifest, inside its folder: no leading slash, no .. segment, no backslash, JavaScript.
const SCRIPT_PATH = /^(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9_-][A-Za-z0-9._/-]*\.m?js$/;

// code: tooBig, notJson, newer, nothing, badField { field }, unknownColor { theme, key },
// badColor { theme, key, value }. The words are the app's (plugins.errors in the locales).
export class ManifestError extends Error {
  constructor(code, detail = {}) {
    super(`${code} ${JSON.stringify(detail)}`);
    this.code = code;
    this.detail = detail;
  }
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const text = (raw, field, most, { required = true, test = null } = {}) => {
  const value = raw[field.split('.').pop()];
  if ((value === undefined || value === '') && !required) return ''; // left out, or as this file keeps it
  if (typeof value !== 'string' || value.length > most || (required && !value.trim()) || (test && !test(value))) {
    throw new ManifestError('badField', { field });
  }
  return value;
};

const readTheme = (raw, i, seen) => {
  const at = `themes[${i}]`;
  if (!isObject(raw)) throw new ManifestError('badField', { field: at });
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
  if (typeof raw.phosphor === 'number' && raw.phosphor > MANIFEST_FORMAT) throw new ManifestError('newer');
  if (raw.phosphor !== MANIFEST_FORMAT) throw new ManifestError('badField', { field: 'phosphor' });
  const manifest = {
    phosphor: MANIFEST_FORMAT,
    id: text(raw, 'id', 64, { test: (value) => ID.test(value) }),
    name: text(raw, 'name', 60),
    version: text(raw, 'version', 60, { test: (value) => parse(`v${value}`) !== null }),
    author: text(raw, 'author', 60),
    description: text(raw, 'description', 300, { required: false }),
    homepage: text(raw, 'homepage', 200, { required: false, test: (value) => /^https:\/\/[^\s]+$/.test(value) }),
    script: raw.script === undefined ? '' : text(raw, 'script', 200, { test: (value) => SCRIPT_PATH.test(value) }),
    license: text(raw, 'license', 40, { required: false }),
  };
  const themes = raw.themes === undefined ? [] : raw.themes;
  if (!themes.length && !manifest.script) throw new ManifestError('nothing');
  if (!Array.isArray(themes) || themes.length > MOST_THEMES) throw new ManifestError('badField', { field: 'themes' });
  const seen = new Set();
  manifest.themes = Object.freeze(themes.map((theme, i) => readTheme(theme, i, seen)));
  return Object.freeze(manifest);
}
