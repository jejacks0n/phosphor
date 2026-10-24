/**
 * How many columns a character takes in a terminal, which is how the grid lays it out: one, two
 * (CJK, fullwidth forms, emoji), or none (combining marks, joiners, controls). A character is a
 * grapheme cluster, so 👍🏽 or e + a combining accent is one.
 *
 * Widths are Unicode's East_Asian_Width (UAX #11) plus the emoji rules, as string-width implements
 * them. Ambiguous characters count as one column, the Western default: block elements are
 * ambiguous, and block art falls apart if they're wide.
 */
import stringWidth from 'string-width';

const segmenter = new Intl.Segmenter();
const widths = new Map(); // string-width costs ~1.5 µs a call; a grid asks about the same few characters

export function graphemes(text) {
  return Array.from(segmenter.segment(text), ({ segment }) => segment);
}

// Columns for one grapheme cluster: 0, 1 or 2.
export function cellWidth(cluster) {
  if (cluster.length === 1) {
    const code = cluster.charCodeAt(0);
    if (code >= 0x20 && code <= 0x7e) return 1; // printable ASCII
  }
  let width = widths.get(cluster);
  if (width === undefined) {
    width = Math.min(2, stringWidth(cluster));
    widths.set(cluster, width);
  }
  return width;
}

// What a cell can hold: exactly one character, one or two columns wide.
export function usableChar(text) {
  if (typeof text !== 'string' || !text) return false;
  const clusters = graphemes(text);
  return clusters.length === 1 && cellWidth(clusters[0]) > 0;
}
