// Locale-reactive Intl formatters: reading `locale.value` inside each call means Vue computed properties
// and templates re-run automatically whenever `setLocale()` switches the active language.
import { locale } from './index.js';

const formatters = new Map();

function cached(Kind, code, key, options) {
  const cacheKey = `${Kind.name}:${code}:${key}`;
  let fmt = formatters.get(cacheKey);
  if (!fmt) {
    fmt = new Kind(code, options);
    formatters.set(cacheKey, fmt);
  }
  return fmt;
}

export function formatNumber(value) {
  return cached(Intl.NumberFormat, locale.value, 'num').format(value);
}

export function formatClock(ms) {
  return cached(Intl.DateTimeFormat, locale.value, 'clock', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(ms);
}

export function formatDayAndTime(ms) {
  return cached(Intl.DateTimeFormat, locale.value, 'dayTime', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(ms);
}

export function formatMonthDay(ms) {
  return cached(Intl.DateTimeFormat, locale.value, 'monthDay', {
    month: 'long',
    day: 'numeric',
  }).format(ms);
}

export function formatMediumDateTime(ms) {
  return cached(Intl.DateTimeFormat, locale.value, 'mediumDateTime', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(ms);
}

export function formatFullDateTime(ms) {
  return cached(Intl.DateTimeFormat, locale.value, 'fullDateTime', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(ms);
}

// Breaks a conjunction list into [{ type: 'element' | 'literal', value, index? }] parts so components can
// render rich elements (such as styled usernames in chat presence lines) in locale-appropriate list order.
export function formatListParts(length, type = 'conjunction') {
  const placeholders = Array.from({ length }, (_, i) => `__ITEM_${i}__`);
  const parts = cached(Intl.ListFormat, locale.value, `list:${type}`, { type }).formatToParts(placeholders);
  return parts.map((part) => {
    if (part.type === 'element') {
      const idx = Number(part.value.slice(7, -2));
      return { type: 'element', index: idx };
    }
    return { type: 'literal', value: part.value };
  });
}
