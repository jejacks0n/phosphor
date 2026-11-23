// Why a button is off, and the command list's row for it with it: an i18n key, or [key, values] for words that take
// values, or null when it's on. The button shows reasonWords(reason) in its title; the row, grayed, says the same.
import { t } from '@/i18n/index.js';
import { MOST_LAYERS } from '@/document/layerInfo.js';
import { layerName } from '@/store/project/shared.js';

export const reasonWords = (reason) => (reason ? t(...[reason].flat()) : null);

// While a room's drawing is paused nothing changes the layers' stack (the project refuses it too).
export const pausedOff = (drawing) => (drawing.paused ? 'social.people.notWhilePaused' : null);
// A layer added, or one copied: not while paused, nor at the most layers.
export const addOff = (project, drawing) => pausedOff(drawing) ?? (project.layers.length >= MOST_LAYERS ? ['layers.full', { n: MOST_LAYERS }] : null);

// Inside an art layer what changes the whole drawing is off: it would step out and change the drawing kept aside, not
// the layer. In a room it's the host's alone.
const wholeOff = (project, drawing) => (project.artInside ? 'art.wholeLayerOff' : drawing.mayDraw ? 'social.drawing.onlyHost' : null);
export const bakeOff = (project, drawing) => wholeOff(project, drawing) ?? (project.canBake ? null : 'toolbar.bakeNothing');
export const flattenOff = (project, drawing) => wholeOff(project, drawing) ?? (project.hasFrames ? 'toolbar.flattenOneFrame' : null);

// Make art layer, in a room: it goes on the vector layer above the one in use, and with none it's off, as adding one is
// a stack change.
export function artLayerOff(project) {
  const at = project.layers.findIndex((layer) => layer.id === project.editId), above = project.layers[at + 1];
  return project._sharing && above?.kind !== 'vector' ? ['vector.artLayerNeedsVectorAbove', { name: layerName(project.layers[at]) }] : null;
}
