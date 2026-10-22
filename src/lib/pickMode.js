// What an eyedropper click picks: 'fg' | 'bg' | 'cell' (char + fg + bg) | 'char'.
// The pixel view, and a picker held with Alt from a paint tool, pick the paint (foreground) colour.
export function pickMode({ view, renderStyle, shiftKey, altKey, swapped }) {
  if (view === 'input' || swapped) return 'fg';
  if (renderStyle === 'ascii') return 'char';
  if (shiftKey) return 'fg';
  if (altKey) return 'bg';
  return 'cell';
}
