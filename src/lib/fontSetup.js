import { t, locale } from '@/i18n';
import { BLOCKS, blocksOf } from '@/lib/BitmapFont';

// The keys of the blocks a bitmap font has no slot for (all eight when it's set up: none).
export const missingBlocks = (font) => blocksOf(font).flatMap((s, i) => (s === null ? [BLOCKS[i].key] : []));

// Their names as a sentence part: "Lower or Dark".
export const blockNames = (keys) => new Intl.ListFormat(locale.value, { type: 'disjunction' }).format(keys.map((key) => t(`palette.fonts.blockName.${key}`)));

// Why a drawing can't take this font into a room, or null when it's set up (a TrueType or built-in one, with no
// bitmap font, always is). A room can't edit the drawing's blocks, so they're set before it.
export function notSetUp(font) {
  const keys = font ? missingBlocks(font) : [];
  return keys.length ? t('palette.fonts.notSetUp', { name: font.name, names: blockNames(keys) }, keys.length) : null;
}
