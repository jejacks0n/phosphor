// JS port of the GLSL applyCSSFilters shader in WebGLProcessor.js.
// Applies the same brightness/contrast/saturation/hue/invert transforms to a
// raw Uint8ClampedArray (from ImageData) so the edit layer can be transformed
// to match the pipeline output without relying on ctx.filter (no Safari < 18 support).

function rgb2hsv(r, g, b) {
  let px, py, pz, pw;
  if (g >= b) { px = g; py = b; pz = 0;  pw = -1 / 3; }
  else         { px = b; py = g; pz = -1; pw =  2 / 3; }
  let qx, qy, qz, qw;
  if (r >= px) { qx = r;  qy = py; qz = pz; qw = px; }
  else          { qx = px; qy = py; qz = pw; qw = r;  }
  const d = qx - Math.min(qw, qy);
  const e = 1e-10;
  const h = qz + (qw - qy) / (6 * d + e);
  return [((h % 1) + 1) % 1, d / (qx + e), qx];
}

function hsv2rgb(h, s, v) {
  const fract = x => x - Math.floor(x);
  const pr = Math.abs(fract(h + 1)     * 6 - 3);
  const pg = Math.abs(fract(h + 2 / 3) * 6 - 3);
  const pb = Math.abs(fract(h + 1 / 3) * 6 - 3);
  const clamp01 = x => Math.max(0, Math.min(1, x));
  return [
    v * (1 - s + clamp01(pr - 1) * s),
    v * (1 - s + clamp01(pg - 1) * s),
    v * (1 - s + clamp01(pb - 1) * s),
  ];
}

// Applies brightness/contrast/saturation/hue/invert to `data` (Uint8ClampedArray) in place.
// Transparent pixels (alpha === 0) are skipped. Matches the GLSL applyCSSFilters order.
export function applyTransforms(data, brightness, contrast, saturation, hue, invert) {
  const br = parseFloat(brightness) / 100;
  const ct = parseFloat(contrast) / 100;
  const sa = parseFloat(saturation) / 100;
  const hu = parseFloat(hue) / 360;
  const inv = parseFloat(invert) / 100;

  if (br === 1 && ct === 1 && sa === 1 && hu === 0 && inv === 0) return;
  const needHSV = sa !== 1 || hu !== 0;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;

    let r = data[i] / 255;
    let g = data[i + 1] / 255;
    let b = data[i + 2] / 255;

    // Brightness
    r *= br; g *= br; b *= br;

    // Contrast
    r = (r - 0.5) * ct + 0.5;
    g = (g - 0.5) * ct + 0.5;
    b = (b - 0.5) * ct + 0.5;

    if (needHSV) {
      const [h, s, v] = rgb2hsv(Math.max(0, r), Math.max(0, g), Math.max(0, b));
      const ns = Math.max(0, Math.min(1, s * sa));
      const nh = ((h + hu) % 1 + 1) % 1;
      [r, g, b] = hsv2rgb(nh, ns, v);
    }

    // Invert
    r = r * (1 - inv) + (1 - r) * inv;
    g = g * (1 - inv) + (1 - g) * inv;
    b = b * (1 - inv) + (1 - b) * inv;

    data[i]     = Math.round(Math.max(0, Math.min(1, r)) * 255);
    data[i + 1] = Math.round(Math.max(0, Math.min(1, g)) * 255);
    data[i + 2] = Math.round(Math.max(0, Math.min(1, b)) * 255);
  }
}

// Inverts the brightness/contrast/saturation/hue/invert transforms.
// Best effort for destructive transforms (saturation 0, brightness 0, etc).
export function applyInverseTransforms(data, brightness, contrast, saturation, hue, invert) {
  const br = parseFloat(brightness) / 100;
  const ct = parseFloat(contrast) / 100;
  const sa = parseFloat(saturation) / 100;
  const hu = parseFloat(hue) / 360;
  const inv = parseFloat(invert) / 100;

  if (br === 1 && ct === 1 && sa === 1 && hu === 0 && inv === 0) return;
  const needHSV = sa !== 1 || hu !== 0;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i] / 255;
    let g = data[i + 1] / 255;
    let b = data[i + 2] / 255;

    // 1. Un-invert
    if (inv !== 0.5) {
      r = (r - inv) / (1 - 2 * inv);
      g = (g - inv) / (1 - 2 * inv);
      b = (b - inv) / (1 - 2 * inv);
    }

    // 2. Un-hue/saturation
    if (needHSV) {
      const [h, s, v] = rgb2hsv(Math.max(0, r), Math.max(0, g), Math.max(0, b));
      const ns = sa <= 0.01 ? s : Math.max(0, Math.min(1, s / sa));
      const nh = ((h - hu) % 1 + 1) % 1;
      [r, g, b] = hsv2rgb(nh, ns, v);
    }

    // 3. Un-contrast
    if (ct > 0.01) {
      r = (r - 0.5) / ct + 0.5;
      g = (g - 0.5) / ct + 0.5;
      b = (b - 0.5) / ct + 0.5;
    }

    // 4. Un-brightness
    if (br > 0.01) {
      r /= br;
      g /= br;
      b /= br;
    }

    data[i]     = Math.round(Math.max(0, Math.min(1, r)) * 255);
    data[i + 1] = Math.round(Math.max(0, Math.min(1, g)) * 255);
    data[i + 2] = Math.round(Math.max(0, Math.min(1, b)) * 255);
  }
}
