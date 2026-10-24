// Ready-made character sets for the Characters field (ANSI and the ASCII styles keep separate sets).
// ANSI picks a set's characters at random per cell; the ASCII styles map brightness along the set,
// darkest first. "CP437 only" is the default without ▁▂▃▅, so an .ans export never has to ask.
import { getSetting } from '../store/settings.js';

const ANSI_DEFAULT = getSetting('chars').default;

export const ANSI_CHARSETS = [
  { name: 'Default', chars: ANSI_DEFAULT },
  { name: 'Shades', chars: '░▒▓█' },
  { name: 'Rising blocks', chars: '▁▂▃▄▅▆▇█' },
  { name: 'Half blocks', chars: '▀▄█' },
  { name: 'Pixel', chars: '▄' }, // every cell two pixels: the top half the background, the bottom the foreground
  { name: 'Quadrants', chars: '▖▗▘▝▚▞▙▛▜▟' },
  { name: 'CP437 only', chars: ANSI_DEFAULT.replace(/[▁▂▃▅]/g, '') },
];

export const ASCII_CHARSETS = [
  { name: 'Default', chars: getSetting('charsAscii').default },
  { name: 'Classic ramp', chars: ' .:-=+*#%@' },
  { name: 'Long ramp', chars: ' .\'`^",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$' },
];
