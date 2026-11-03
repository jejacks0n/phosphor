// Choosing a cell's character: the mode the settings come to, and what it asks of the pipeline.
// No DOM and no translations here: the unit tests run it in Node.

// How a cell's character is picked (Cells.js): ANSI picks at random, or Best match / By shape;
// Color ASCII by intensity or By shape; ASCII by brightness or By shape. Anything unknown (an old
// file, another browser) falls back to today's way.
export function charModeOf(renderStyle, charChoice, charChoiceAscii) {
  if (renderStyle === 'ansi') return charChoice === 'best' || charChoice === 'shape' ? charChoice : 'random';
  const byShape = charChoiceAscii === 'shape';
  return renderStyle === 'colorAscii' ? (byShape ? 'shape' : 'intensity') : (byShape ? 'shape' : 'brightness');
}

// Whether the character comes from comparing the picture with glyphs, not from its weight or the seed.
export const resolves = (params) => params.charMode === 'best' || params.charMode === 'shape';

// Whether the resolver needs the error Floyd–Steinberg passes on.
export const carriesError = (params) => resolves(params) && params.dither > 0 && params.ditherStyle !== 'bayer';

// CGA and VGA aren't snapped in the shader when the grid is snapped later: dithered or resolved.
export const snapsLate = (params) => params.dither > 0 || resolves(params);
