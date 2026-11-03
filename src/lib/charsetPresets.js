// Ready-made character sets for the Characters field (ANSI and the ASCII styles keep separate sets).
// ANSI picks a set's characters at random per cell; the ASCII styles map brightness along the set,
// darkest first. The default is all CP437, so an .ans export of it never has to ask; "Default + ▁▂▃▅"
// is the earlier default, whose low blocks .ans writes as lookalikes. A name has to fit beside the
// Characters label (about 15 characters).
import { t } from '@/i18n';
import { getSetting } from '../store/settings.js';

const ANSI_DEFAULT = getSetting('chars').default;

function preset(key, chars) {
  const entry = { id: key, chars };
  Object.defineProperty(entry, 'name', { get: () => t(`charsets.${key}`), enumerable: true });
  return entry;
}

export const ANSI_CHARSETS = [
  preset('default', ANSI_DEFAULT),
  preset('defaultBlocks', '.*:%░▒▓'.replace('░▒▓', '░░▒▒▓▓▁▂▃▄▅■■■■■■■▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄')),
  preset('shades', '░▒▓█'),
  preset('risingBlocks', '▁▂▃▄▅▆▇█'),
  preset('halfBlocks', '▀▄█'),
  preset('pixel', '▄'), // every cell two pixels: the top half the background, the bottom the foreground
  preset('quadrants', '▖▗▘▝▚▞▙▛▜▟'),
];

export const ASCII_CHARSETS = [
  preset('default', getSetting('charsAscii').default),
  preset('classicRamp', ' .:-=+*#%@'),
  preset('longRamp', ' .\'`^",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$'),
];
