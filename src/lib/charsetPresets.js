// Ready-made character sets for the Characters field (ANSI and the ASCII styles keep separate sets).
// ANSI picks a set's characters at random per cell; the ASCII styles map brightness along the set,
// darkest first. The default is all CP437, so an .ans export of it never has to ask; "Default with
// ▁▂▃▅" is the earlier default, whose low blocks .ans writes as lookalikes.
import { getSetting } from '../store/settings.js';

const ANSI_DEFAULT = getSetting('chars').default;

export const ANSI_CHARSETS = [
  { name: 'Default', chars: ANSI_DEFAULT },
  { name: 'Default with ▁▂▃▅', chars: '.*:%░░▒▒▓▓▁▂▃▄▅■■■■■■■▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄' },
  { name: 'Shades', chars: '░▒▓█' },
  { name: 'Rising blocks', chars: '▁▂▃▄▅▆▇█' },
  { name: 'Half blocks', chars: '▀▄█' },
  { name: 'Pixel', chars: '▄' }, // every cell two pixels: the top half the background, the bottom the foreground
  { name: 'Quadrants', chars: '▖▗▘▝▚▞▙▛▜▟' },
];

export const ASCII_CHARSETS = [
  { name: 'Default', chars: getSetting('charsAscii').default },
  { name: 'Classic ramp', chars: ' .:-=+*#%@' },
  { name: 'Long ramp', chars: ' .\'`^",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$' },
];
