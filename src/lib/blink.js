// Blink, as a 16-color drawing without iCE colors has it (DOS's text mode): a background of 8 to 15 is the color 8 below
// it with the blink bit, its cell drawn on that dark color, the letter on and off. Only a character of someone's own
// blinks (typed, opened from a file, pinned); paint and what the converter drew are written so they don't (paintCell).
// Only the ANSI view draws the blink; the cells keep the bright background (what a file's blink is read as), so the
// PIXEL view, Merge into the image and every export picture show the steady state.

// sixteen: the drawing's 16 colors in their order, 8 to 15 the bright ones. Each bright one's lowercase hex to the
// dark color under it. A bright color also among 0 to 7 is that one (an export writes the first index with a color),
// so it doesn't blink.
export function blinkingBackgrounds(sixteen) {
  const dark = new Set(sixteen.slice(0, 8).map((color) => color.hex.toLowerCase()));
  const under = new Map();
  sixteen.slice(8, 16).forEach((color, i) => {
    const hex = color.hex.toLowerCase();
    if (!dark.has(hex) && !under.has(hex)) under.set(hex, sixteen[i]);
  });
  return under;
}

// A cell as the ANSI view draws it: on a blinking background, that background's dark color, the letter showing while
// lit and gone (its color the background's) while not. Any other cell as it is.
export function blinkCell(cell, under, lit) {
  const dark = cell && under.get(cell.bg.hex.toLowerCase());
  return dark ? { ...cell, bg: dark, ...(!lit && { fg: dark }) } : cell;
}

// A cell that's paint or the converter's (not a character of someone's own: docs/model.md R14) as a DOS editor writes it
// without iCE colors, so it never blinks: the bright color goes to the foreground, the one place DOS has 16 colors. A
// half block whose other half isn't bright turns over (▄ to ▀, ▀ to ▄: the same picture), a cell all in one bright
// color (whatever its character) or a space on one is a █ in it, and what's left (two different bright halves, or a character the converter chose on a
// bright background) keeps its shape on the background's dark color.
// blocks: false where the drawing's font holds no ▀ or █ to write them with, so every such cell is that last case.
// ponytail: that last case shows a darker color than was painted; picking the cell's colors from DOS's 16 over 8 in the
// converter is the way up.
const TURNED = { '▄': '▀', '▀': '▄' };
export function paintCell(cell, under, blocks = true) {
  const dark = cell && under.get(cell.bg.hex.toLowerCase());
  if (!dark) return cell;
  if (!blocks) return { ...cell, bg: dark };
  const same = cell.fg.hex.toLowerCase() === cell.bg.hex.toLowerCase();
  if (cell.char === ' ' || same) return { ...cell, char: '█', fg: cell.bg, bg: dark };
  if (TURNED[cell.char] && !under.has(cell.fg.hex.toLowerCase())) return { ...cell, char: TURNED[cell.char], fg: cell.bg, bg: cell.fg };
  return { ...cell, bg: dark };
}

// Whether the system asks for reduced motion: then nothing blinks, the letters staying lit (asked each time, as it can
// change while the page is open).
export const lessMotion = () => !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// How long each half of a blink lasts: DOS's text mode turned it over every 16 frames at 70 Hz, about 229 ms.
export const BLINK_MS = 229;
