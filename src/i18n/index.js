// Phosphor's translations: vue-i18n in Composition API mode, with English built in as the fallback and
// every other locale loaded on demand as its own chunk (import.meta.glob over ./locales/*.json, compiled at
// build time by @intlify/unplugin-vue-i18n so the page's strict CSP needs no runtime compiler).
import { reactive } from 'vue';
import { createI18n } from 'vue-i18n';
import en from './locales/en.json' with { type: 'json' };

export const LOCALE_STORAGE_KEY = 'phosphor.locale';

// Every locale Phosphor offers in the footer's picker. Adding a translation: drop its JSON under
// ./locales/<code>.json (and optional legal copy under ./legal/<code>.vue) and add an entry here.
export const SUPPORTED_LOCALES = reactive([
  { code: 'en', label: 'English', dir: 'ltr' },
]);

const localeLoaders = typeof import.meta.glob === 'function' ? import.meta.glob('./locales/*.json') : {};

export const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages: { en },
  missingWarn: false,
  fallbackWarn: false,
});

export const { t, te, locale } = i18n.global;

// Match a stored or browser language tag ('en-US', 'fr-CA') to a supported locale code, or null.
export function matchLocale(tag, supported = SUPPORTED_LOCALES) {
  if (!tag || typeof tag !== 'string') return null;
  const lower = tag.trim().toLowerCase();
  const exact = supported.find((entry) => entry.code.toLowerCase() === lower);
  if (exact) return exact.code;
  const base = lower.split('-')[0];
  return supported.find((entry) => entry.code.toLowerCase() === base)?.code ?? null;
}

// Keep <html lang>, <html dir>, and document.title in step with the active locale.
export function syncDocumentLocale(code = locale.value) {
  const doc = globalThis.document;
  if (!doc) return;
  const meta = SUPPORTED_LOCALES.find((entry) => entry.code === code);
  doc.documentElement.lang = code;
  doc.documentElement.dir = meta?.dir ?? 'ltr';
  if (te('app.meta.title')) doc.title = t('app.meta.title');
}

// Load a locale dynamically (if not yet registered) and make it active. Unknown or unloading locales
// fall back cleanly to 'en'. Pass { persist: false } in tests or initial boot when storage shouldn't change.
export async function setLocale(requested, { persist = true, loaders = localeLoaders } = {}) {
  const code = requested && (
    SUPPORTED_LOCALES.find((entry) => entry.code === requested)?.code
    ?? (loaders[`./locales/${requested}.json`] ? requested : null)
    ?? matchLocale(requested)
  ) || 'en';

  if (!i18n.global.availableLocales.includes(code)) {
    const load = loaders[`./locales/${code}.json`];
    if (!load) {
      locale.value = 'en';
      syncDocumentLocale('en');
      return 'en';
    }
    const mod = await load();
    i18n.global.setLocaleMessage(code, mod.default ?? mod);
  }

  locale.value = code;
  if (persist) {
    try {
      globalThis.localStorage?.setItem(LOCALE_STORAGE_KEY, code);
    } catch { /* storage blocked */ }
  }
  syncDocumentLocale(code);
  return code;
}

// Register an in-memory locale bundle at runtime (handy for plugins, user packs, and dynamic-switching tests).
export function registerLocaleMessages(code, messages, { label = code, dir = 'ltr' } = {}) {
  i18n.global.setLocaleMessage(code, messages);
  if (!SUPPORTED_LOCALES.some((entry) => entry.code === code)) {
    SUPPORTED_LOCALES.push({ code, label, dir });
  }
}

// Pick the starting locale from localStorage, then the browser's preferred languages, then 'en'.
export async function initLocale() {
  let saved = null;
  try {
    saved = globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY);
  } catch { /* storage blocked */ }
  const browser = globalThis.navigator?.languages ?? (globalThis.navigator?.language ? [globalThis.navigator.language] : []);
  const chosen = matchLocale(saved) ?? browser.map((tag) => matchLocale(tag)).find(Boolean) ?? 'en';
  return setLocale(chosen, { persist: false });
}
