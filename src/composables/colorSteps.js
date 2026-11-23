import { effectiveColor, paletteChoices, stepChoice } from '@/lib/PixelTransforms';
import { sharedIndex } from '@/lib/ColorUtils';

// The color steps (the command table's colors.fgPrev and the rest): the slot's color steps through the active palette
// (nothing to step in 24-bit), from the palette color it displays as (by its index, so 16 isn't read as 0's black), to
// the next one's swatch color (as the color picker offers it), past the ones the adjustments can't make.
export function stepColor(project, workspace, slot, delta) {
  const palette = project.activePalette;
  if (!palette || !palette.length) return;
  const fg = slot === 'fg';
  const { c } = effectiveColor(fg ? workspace.editFgColor : workspace.editBgColor, project, palette, fg ? workspace.editFgIndex : workspace.editBgIndex);
  const choices = paletteChoices(project, palette), next = stepChoice(choices, c, delta);
  if (next !== null) workspace.setColor(slot, choices[next].toLowerCase(), { index: sharedIndex(next, palette), kept: palette[next].hex.toLowerCase() });
}
