// Which colors an eyedropper click picks: 'fg' | 'bg' | 'both'.
// The pixel view, and a picker held with Alt from a paint tool, pick the paint (foreground) color.
// In the ANSI view, target (the tool's [FG][BG] toggles, via pickTargetOf; default 'both') is what a plain click
// picks; Shift and Alt override it with the foreground and background.
export function pickMode({ view, shiftKey, altKey, swapped, target = 'both' }) {
  if (view === 'input' || swapped) return 'fg';
  if (shiftKey) return 'fg';
  if (altKey) return 'bg';
  return target;
}

// The Picker's [FG][BG] toggles ({ fg, bg }, never both off) as pickMode's target.
export function pickTargetOf({ fg, bg }) {
  if (fg && bg) return 'both';
  return fg ? 'fg' : 'bg';
}
