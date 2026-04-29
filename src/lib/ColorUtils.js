/**
 * Some common palettes and simple color helpers
 */

import { applyTransforms } from './PixelTransforms';

const HEX_TABLE = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

// Convert {r,g,b} values to '#RRGGBB' or '#RRGGBBAA'
export function rgb2hex(rgb) {
  const r = HEX_TABLE[Math.max(0, Math.min(255, Math.round(rgb.r)))];
  const g = HEX_TABLE[Math.max(0, Math.min(255, Math.round(rgb.g)))];
  const b = HEX_TABLE[Math.max(0, Math.min(255, Math.round(rgb.b)))];

  if (rgb.a === undefined || rgb.a === 1.0) {
    return '#' + r + g + b;
  }

  const a = HEX_TABLE[Math.max(0, Math.min(255, Math.round(rgb.a * 255)))];
  return '#' + r + g + b + a;
}

// Convert '#RRGGBB' to {r,g,b}
export function hex2rgb(hex) {
  if (!hex) return { r: 0, g: 0, b: 0 };
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return { r: 0, g: 0, b: 0 };
  const p = (s) => parseInt(s, 16);
  return { r: p(m[1]), g: p(m[2]), b: p(m[3]) };
}

// Convert {r,g,b} values to gray value [0-1]
export function rgb2gray(rgb) {
  return Math.round(rgb.r * 0.2126 + rgb.g * 0.7152 + rgb.b * 0.0722) / 255.0;
}

export const CGA_COLORS_STR = '#000000 #aa0000 #00aa00 #aa5500 #0000aa #aa00aa #00aaaa #aaaaaa #555555 #ff5555 #55ff55 #ffff55 #5555ff #ff55ff #55ffff #ffffff';

export const VGA_COLORS_STR = CGA_COLORS_STR + ' ' +
  '#000000 #00005f #000087 #0000af #0000d7 #0000ff #005f00 #005f5f #005f87 #005faf #005fd7 #005fff #008700 #00875f #008787 #0087af #0087d7 #0087ff ' +
  '#00af00 #00af5f #00af87 #00afaf #00afd7 #00afff #00d700 #00d75f #00d787 #00d7af #00d7d7 #00d7ff #00ff00 #00ff5f #00ff87 #00ffaf #00ffd7 #00ffff ' +
  '#5f0000 #5f005f #5f0087 #5f00af #5f00d7 #5f00ff #5f5f00 #5f5f5f #5f5f87 #5f5faf #5f5fd7 #5f5FFF #5F8700 #5F875F #5F8787 #5F87AF #5F87D7 #5F87FF ' +
  '#5FAF00 #5FAF5F #5FAF87 #5FAFAF #5FAFD7 #5FAFFF #5FD700 #5FD75F #5FD787 #5FD7AF #5FD7D7 #5FD7FF #5FFF00 #5FFF5F #5FFF87 #5FFFAF #5FFFD7 #5FFFFF ' +
  '#870000 #87005F #870087 #8700AF #8700D7 #8700FF #875F00 #875F5F #875f87 #875faf #875fd7 #875fff #878700 #87875f #878787 #8787af #8787d7 #8787ff ' +
  '#87af00 #87af5f #87af87 #87afaf #87afd7 #87afff #87d700 #87d75f #87d787 #87d7af #87d7d7 #87d7ff #87ff00 #87ff5f #87ff87 #87ffaf #87ffd7 #87ffff ' +
  '#af0000 #af005f #af0087 #af00af #af00d7 #af00ff #af5f00 #af5f5f #af5f87 #af5faf #af5fd7 #af5fff #af8700 #af875f #af8787 #af87af #af87d7 #af87ff ' +
  '#afaf00 #afaf5f #afaf87 #afafaf #afafd7 #afafff #afd700 #afd75f #afd787 #afd7af #afd7d7 #afd7ff #afff00 #afff5f #afff87 #afffaf #afffd7 #afffff ' +
  '#d70000 #d7005f #d70087 #d700af #d700d7 #d700ff #d75f00 #d75f5f #d75f87 #d75faf #d75fd7 #d75fff #d78700 #d7875f #d78787 #d787af #d787d7 #d787ff ' +
  '#d7af00 #d7af5f #d7af87 #d7afaf #d7afd7 #d7afff #d7d700 #d7d75f #d7d787 #d7d7af #d7d7d7 #d7d7ff #d7ff00 #d7ff5f #d7ff87 #d7ffaf #d7ffd7 #d7ffff ' +
  '#ff0000 #ff005f #ff0087 #ff00af #ff00d7 #ff00ff #ff5f00 #ff5f5f #ff5f87 #ff5faf #ff5fd7 #ff5fff #ff8700 #ff875f #ff8787 #ff87af #ff87d7 #ff87ff ' +
  '#ffaf00 #ffaf5f #ffaf87 #ffafaf #ffafd7 #ffafff #ffd700 #ffd75f #ffd787 #ffd7af #ffd7d7 #ffd7ff #ffff00 #ffff5f #ffff87 #ffffaf #ffffd7 #ffffff ' +
  '#080808 #121212 #1c1c1c #262626 #303030 #3a3a3a #444444 #4e4e4e #585858 #626262 #6c6c6c #767676 #808080 #8a8a8a #949494 #9e9e9e #a8a8a8 #b2b2b2 ' +
  '#bcbcbc #c6c6c6 #d0d0d0 #dadada #e4e4e4 #eeeeee';

// ANSI Color Order (Standard SGR)
// 0:Black, 1:Red, 2:Green, 3:Yellow(Brown), 4:Blue, 5:Magenta, 6:Cyan, 7:White(Gray)
export const CGA = CGA_COLORS_STR.split(' ').map((hex, i) => {
  const rgb = hex2rgb(hex);
  return { ...rgb, hex, v: rgb2gray(rgb), c: i };
});

export const VGA = VGA_COLORS_STR.split(' ').map((hex, i) => {
  const rgb = hex2rgb(hex);
  return { ...rgb, hex, v: rgb2gray(rgb), c: i };
});

export const PALETTES = {
  cga: CGA,
  vga: VGA
};

/**
 * Calculates what a base color looks like after project-wide transforms
 * and quantization are applied.
 */
export function getEffectiveColor(hex, params, palette = null) {
  const rgb = hex2rgb(hex);
  const data = new Uint8ClampedArray([rgb.r, rgb.g, rgb.b, 255]);

  applyTransforms(
    data,
    params.brightness,
    params.contrast,
    params.saturation,
    params.hue,
    params.invert,
    params.colorize,
    params.colorizeStrength
  );

  let r = data[0], g = data[1], b = data[2];

  if (palette && palette.length > 0) {
    let minDist = Infinity;
    let nearest = palette[0];
    for (const p of palette) {
      const dr = r - p.r, dg = g - p.g, db = b - p.b;
      const dist = dr * dr + dg * dg + db * db;
      if (dist < minDist) {
        minDist = dist;
        nearest = p;
      }
    }
    r = nearest.r; g = nearest.g; b = nearest.b;
  }

  return rgb2hex({ r, g, b });
}
