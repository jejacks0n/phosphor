// A theme value (WorkspaceStore.theme) is 'dark', 'light', 'system' or a plugin's theme, 'plugin:<plugin id>/<theme
// id>'. It resolves to a base, the app's own look under it, and the colors set over that base. A copy of the last
// plugin theme shown is kept in localStorage so index.html can paint it before the app starts; index.html's inline
// script reads that copy by the same rules, since it can't import this file.
import { COLOR_SLOTS, HEX, keptColors } from './manifest.js';

export const THEME_CACHE_KEY = 'phosphor.themeColors';
const PREFIX = 'plugin:';
const SLOTS = new Set(COLOR_SLOTS);

export const themeRef = (pluginId, themeId) => `${PREFIX}${pluginId}/${themeId}`;
export const isPluginTheme = (value) => typeof value === 'string' && value.startsWith(PREFIX);
export const pluginOfTheme = (value) => (isPluginTheme(value) ? value.slice(PREFIX.length).split('/')[0] : null);

// ?plugins=off: the app starts without any plugin's colors, a way out of a theme that can't be read.
export const pluginsOff = (search) => new URLSearchParams(search).get('plugins') === 'off';

const isBase = (base) => base === 'dark' || base === 'light';

// The kept copy, { theme, base, colors }, or null when it's missing or damaged.
export function readThemeCache(text) {
  let copy;
  try { copy = JSON.parse(text); } catch { return null; }
  if (!copy || typeof copy !== 'object' || typeof copy.theme !== 'string' || !isBase(copy.base)) return null;
  if (!copy.colors || typeof copy.colors !== 'object') return null;
  const colors = keptColors(copy.colors); // a copy from before three slots' names changed
  const good = Object.entries(colors).every(([key, value]) => SLOTS.has(key) && typeof value === 'string' && HEX.test(value));
  return good ? { theme: copy.theme, base: copy.base, colors } : null;
}

// themes: [{ ref, base, colors }], the plugin themes on offer. known is false when the value names nothing on offer.
export function resolveTheme(value, { themes, prefersLight, cached = null, off = false }) {
  const shown = (base, colors, known) => ({ base, colors: off ? {} : colors, known });
  if (value === 'dark' || value === 'light') return shown(value, {}, true);
  if (value === 'system') return shown(prefersLight ? 'light' : 'dark', {}, true);
  const theme = themes.find(({ ref }) => ref === value);
  if (theme) return shown(theme.base, theme.colors, true);
  if (isPluginTheme(value) && cached?.theme === value) return shown(cached.base, cached.colors, false);
  return shown('dark', {}, false);
}

// The base as data-theme, each color as its custom property, and every other slot's property taken off.
export function applyTheme(el, { base, colors }) {
  el.dataset.theme = base;
  for (const slot of COLOR_SLOTS) {
    if (colors[slot]) el.style.setProperty(`--${slot}`, colors[slot]);
    else el.style.removeProperty(`--${slot}`);
  }
}
