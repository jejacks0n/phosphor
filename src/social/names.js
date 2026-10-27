// A name's swatch: a stable hash of the name to one of the CGA colors (black left out: it wouldn't show
// on the dark UI), so someone keeps their color in the lobby and in rooms.
import { CGA_COLORS_STR } from '@/lib/ColorUtils';

export const NAME_COLORS = CGA_COLORS_STR.split(' ').filter((c) => c !== '#000000');

// FNV-1a over the name's UTF-16 code units.
export function nameColor(name) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) hash = Math.imul(hash ^ name.charCodeAt(i), 0x01000193);
  return NAME_COLORS[(hash >>> 0) % NAME_COLORS.length];
}
