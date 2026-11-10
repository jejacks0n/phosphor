/**
 * Editing tools. A tool is a plain object:
 *   id, title, icon (SVG markup), views ('input' = PIXEL, 'output' = ANSI, 'vector' = VECTOR), kind ('paint' | 'pick' | 'navigate'),
 *   keys       the letters that choose it (useKeyboardShortcuts; shown on its button)
 *   altPicks?  holding Alt switches to the picker (Alt+Shift: picking the background)
 *   available? (project) => boolean: offered in the toolbar only when true (e.g. flip needs the ANSI art style)
 *   section?   toolbar group ('select', 'navigate', 'cell', 'vector'); a divider separates groups
 *   autoScroll? a drag near the view's edge scrolls it (useEditorInteractions)
 *   preview?   { shape: 'circle' | 'square' | 'cell', size?: (workspace) => grid pixels }
 *   cursor?    (ctx, pos) => CSS cursor | null: the pointer over the content, at grid pixel pos
 *   options?   toolbar settings: { key (workspace store field), label, title, min, max, step?, decimals?, unit?, type?: 'checkbox' }
 *   begin(ctx, pos, event) -> false when there's no stroke to continue; move(ctx, from, to); end(ctx).
 *              A paint tool's (not VECTOR's, nor Select's and the Wand's, which select what shows) is refused while the
 *              picked layer is hidden (refusesHidden).
 *   cancel?(ctx)  end without applying (a second finger landed: a pinch); without it, end(ctx)
 *   keydown?(ctx, event) -> true when the tool took the key (useKeyboardShortcuts asks it first)
 * ctx = { project, workspace, view, unit (CSS px per grid pixel, { x, y }) }; positions are fractional grid pixels.
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
import wand from './wand';
import shapes from './shapes';
import vselect from './vselect';
import vnode from './vnode';
import vshape from './vshape';
import pen from './pen';
import { toast } from '@/composables/useToast';
import { t } from '@/i18n/index.js';

export const TOOLS = [vselect, vnode, pen, vshape, pencil, brush, eraser, bucket, shapes, picker, wand, select, hand, zoom, text, flip];

// True when the picked layer is hidden, so drawing on it (a paint tool, typing) is refused: a toast says so. VECTOR
// isn't: its handles are the editor, not the art, and its shapes can be edited while they're hidden.
export function refusesHidden({ project, workspace, view }) {
  if (view === 'vector' || !project.layerHidden(workspace.shownPick)) return false;
  toast(t('layers.hiddenToast'));
  return true;
}

for (const tool of TOOLS) {
  if (tool.kind !== 'paint' || tool.views.includes('vector') || tool.section === 'select') continue;
  const begin = tool.begin;
  tool.begin = (ctx, ...rest) => !refusesHidden(ctx) && begin.call(tool, ctx, ...rest);
}

const BY_ID = new Map(TOOLS.map(tool => [tool.id, tool]));
const NONE = { id: 'none', kind: 'none', views: [] };

export function getTool(id) {
  return BY_ID.get(id) ?? NONE;
}

// The tools offered in a view ('input', 'output' or 'vector'), as the toolbar shows them: every one, whichever layer is picked.
export function offeredTools(view, project) {
  return TOOLS.filter(tool => tool.views.includes(view) && (!tool.available || tool.available(project)));
}

// A tool's name with its keys, for its button's tooltip: 'Pencil (1px) · P'.
export const toolTitle = (tool) => {
  if (!tool.keys?.length) return tool.title;
  const keys = tool.keys.reduce((acc, key) => t('tools.keysOr', { a: acc, b: key }));
  return t('tools.titleWithKeys', { title: tool.title, keys });
};
