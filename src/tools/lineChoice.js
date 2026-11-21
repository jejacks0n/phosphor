// The line styles a tool's Draw with offers: Single and Double when the font has them, then its own.
import { lineStylesOf, offeredStyles, styleById } from '@/lib/FontLines';

export const lineValue = (style) => (style.stock ? style.id : `line:${style.id}`);

// The offered style a Draw with value names; one that isn't offered gives the first offered. Null when the
// value isn't a line style, or none is offered.
export function drawnStyle(value, font) {
  const offered = offeredStyles(font);
  if (value !== 'single' && value !== 'double' && !String(value).startsWith('line:')) return null;
  return offered.find((s) => lineValue(s) === value) ?? offered[0] ?? null;
}

// The font's own offered styles as choices, to follow Double; their glyphs draw in the display font.
export const lineChoices = (font) => offeredStyles(font).filter((s) => !s.stock).map((s) => ({
  value: lineValue(s), label: s.name, glyph: s.chars[2] + s.chars[0], glyphFont: true,
}));

// A stock choice that goes when the font doesn't offer it, and what shows in its place.
export const stockChoice = (font, id, choice, fallback) => ({
  ...choice,
  when: () => !!styleById(font, id)?.offered,
  get instead() { const first = offeredStyles(font)[0]; return first ? lineValue(first) : fallback; },
});

// A function of the font whose result is kept per font, so the toolbar sees the same choices each time.
export const perFont = (make) => {
  const cache = new WeakMap();
  return (font) => {
    const key = lineStylesOf(font);
    if (!cache.has(key)) cache.set(key, make(font));
    return cache.get(key);
  };
};
