// Phosphor's i18n subsystem: locale switching, fallback to English, runtime message registration,
// HTML document attributes synchronization, and reactive Intl formatters.
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  setLocale,
  registerLocaleMessages,
  matchLocale,
  syncDocumentLocale,
  locale,
  t,
  SUPPORTED_LOCALES,
  LOCALE_STORAGE_KEY,
} from '@/i18n/index.js';
import {
  formatNumber,
  formatClock,
  formatListParts,
} from '@/i18n/format.js';

describe('i18n subsystem', () => {
  beforeEach(async () => {
    globalThis.localStorage?.clear?.();
    await setLocale('en', { persist: false });
  });

  afterEach(async () => {
    await setLocale('en', { persist: false });
    vi.restoreAllMocks();
  });

  test('defaults to en and translates common keys', () => {
    expect(locale.value).toBe('en');
    expect(t('common.cancel')).toBe('Cancel');
    expect(t('common.untitled')).toBe('untitled');
  });

  test('matchLocale matches exact and prefix codes', () => {
    expect(matchLocale('en')).toBe('en');
    expect(matchLocale('en-US')).toBe('en');
    expect(matchLocale('EN-GB')).toBe('en');
    expect(matchLocale('fr-FR')).toBe(null);
    expect(matchLocale(null)).toBe(null);
  });

  test('setLocale with unknown locale falls back to en', async () => {
    const result = await setLocale('nonexistent', { persist: false, loaders: {} });
    expect(result).toBe('en');
    expect(locale.value).toBe('en');
  });

  test('registerLocaleMessages adds a dynamic locale and setLocale activates it', async () => {
    registerLocaleMessages('es-test', {
      common: { cancel: 'Cancelar' },
      app: { meta: { title: 'Phosphor en Español' } },
    }, { label: 'Español (Test)', dir: 'ltr' });

    expect(SUPPORTED_LOCALES.some((item) => item.code === 'es-test')).toBe(true);

    const active = await setLocale('es-test', { persist: false });
    expect(active).toBe('es-test');
    expect(locale.value).toBe('es-test');
    expect(t('common.cancel')).toBe('Cancelar');
    // Fallback to en for missing keys
    expect(t('common.untitled')).toBe('untitled');
  });

  test('setLocale persists to localStorage when persist is true', async () => {
    const mockStorage = new Map();
    const storageObj = {
      getItem: (k) => mockStorage.get(k) ?? null,
      setItem: (k, v) => mockStorage.set(k, String(v)),
      removeItem: (k) => mockStorage.delete(k),
      clear: () => mockStorage.clear(),
    };
    const origStorage = globalThis.localStorage;
    globalThis.localStorage = storageObj;

    try {
      registerLocaleMessages('fr-test', { common: { cancel: 'Annuler' } });
      await setLocale('fr-test', { persist: true });
      expect(storageObj.getItem(LOCALE_STORAGE_KEY)).toBe('fr-test');
    } finally {
      globalThis.localStorage = origStorage;
    }
  });

  test('syncDocumentLocale updates document lang, dir, and title', () => {
    const origDoc = globalThis.document;
    const mockDoc = {
      documentElement: { lang: '', dir: '' },
      title: '',
    };
    globalThis.document = mockDoc;

    try {
      registerLocaleMessages('ar-test', {
        app: { meta: { title: 'عنوان تجريبي' } },
      }, { label: 'العربية (Test)', dir: 'rtl' });

      locale.value = 'ar-test';
      syncDocumentLocale('ar-test');

      expect(mockDoc.documentElement.lang).toBe('ar-test');
      expect(mockDoc.documentElement.dir).toBe('rtl');
      expect(mockDoc.title).toBe('عنوان تجريبي');
    } finally {
      globalThis.document = origDoc;
    }
  });

  test('reactive Intl formatters adapt to active locale', async () => {
    await setLocale('en', { persist: false });
    const enNum = formatNumber(1234567);
    expect(enNum).toBe('1,234,567');

    registerLocaleMessages('de-test', {});
    await setLocale('de-test', { persist: false });
    const deNum = formatNumber(1234567);
    // German uses '.' or non-breaking space as thousands separator
    expect(deNum).toMatch(/1[.\s]234[.\s]567/);

    await setLocale('en', { persist: false });
    const ts = new Date(2026, 10, 2, 14, 5).getTime();
    const clockStr = formatClock(ts);
    expect(clockStr).toMatch(/2:05\s*PM/i);
  });

  test('formatListParts handles 1, 2, and 3+ elements', () => {
    expect(formatListParts(1)).toEqual([{ type: 'element', index: 0 }]);
    const two = formatListParts(2);
    expect(two.filter((p) => p.type === 'element')).toHaveLength(2);
    const three = formatListParts(3);
    expect(three.filter((p) => p.type === 'element')).toHaveLength(3);
  });
});
