/**
 * Editing tools. A tool is a plain object:
 *   id, title, icon (SVG markup), views ('input' = PIXEL, 'output' = ANSI), kind ('paint' | 'pick' | 'navigate'),
 *   instant?   start on touch without the paint delay
 *   altPicks?  holding Alt switches to the picker
 *   available? (project) => boolean: offered in the toolbar only when true (e.g. flip needs the ANSI art style)
 *   section?   toolbar group ('navigate', 'cell'); a divider separates groups
 *   preview?   { shape: 'circle' | 'square' | 'cell', size?: (workspace) => grid pixels }
 *   options?   toolbar settings: { key (workspace store field), label, title, min, max, step?, decimals?, unit?, type?: 'checkbox' }
 *   begin(ctx, pos, event) -> false when there's no stroke to continue; move(ctx, from, to); end(ctx)
 * ctx = { project, workspace, view }; positions are fractional grid pixels.
 */
import pencil from './pencil';
import brush from './brush';
import eraser from './eraser';
import bucket from './bucket';
import picker from './picker';
import hand from './hand';
import zoom from './zoom';
import flip from './flip';
import text from './text';
import select from './select';
import shapes from './shapes';

export const TOOLS = [pencil, brush, eraser, bucket, picker, hand, zoom, flip, text, select, shapes];

const BY_ID = new Map(TOOLS.map(tool => [tool.id, tool]));
const NONE = { id: 'none', kind: 'none', views: [] };

export function getTool(id) {
  return BY_ID.get(id) ?? NONE;
}
