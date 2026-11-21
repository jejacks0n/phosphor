// The line styles a tool's Draw with offers: Single and Double when the font has them, then its own.
import { lineStylesOf, offeredStyles, styleById } from '@/lib/FontLines';

export const lineValue = (style) => (style.stock ? style.id : `line:${style.id}`);

// Whether a Draw with value is Single, Double or a font's own line style.
export const isLineValue = (v) => v === 'single' || v === 'double' || String(v).startsWith('line:');

// The offered style a Draw with value names; one that isn't offered gives the first offered. Null when the
// value isn't a line style, or none is offered.
export function drawnStyle(value, font) {
  if (!isLineValue(value)) return null;
  const offered = offeredStyles(font);
  return offered.find((s) => lineValue(s) === value) ?? offered[0] ?? null;
}

// The Draw with value a tool draws: a line style's is the style drawnStyle gives, or the tool's `fallback` when the
// font offers none; anything else is itself. The toolbar shows the choice for it.
export function drawnValue(value, font, fallback) {
  if (!isLineValue(value)) return value;
  const style = drawnStyle(value, font);
  return style ? lineValue(style) : fallback;
}

// The font's own offered styles as choices, to follow Double; their glyphs draw in the display font. The first has a
// rule above it (divider), setting them apart from Single and Double.
export const lineChoices = (font) => offeredStyles(font).filter((s) => !s.stock).map((s, i) => ({
  value: lineValue(s), label: s.name, glyph: s.chars[2] + s.chars[0], glyphFont: true, divider: i === 0,
}));

// A stock choice that goes when the font doesn't offer it (the toolbar then shows what's drawn instead).
export const stockChoice = (font, id, choice) => Object.defineProperties({}, {
  ...Object.getOwnPropertyDescriptors(choice), // copied as descriptors, so the label getter stays live
  when: { value: (ws) => !!styleById(font, id)?.offered && (choice.when?.(ws) ?? true), enumerable: true }, // and the choice's own `when`
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
