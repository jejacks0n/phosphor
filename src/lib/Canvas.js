/**
 * A wrapper for a canvas element providing high-quality downscaling.
 */

// 2D context with the settings every canvas in the app uses: CPU-backed for getImageData,
// explicit sRGB so Safari doesn't hand back Display P3 values.
export function ctx2d(canvas) {
  return canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
}

// Letterbox sw x sh into tw x th. Shared by the pipeline and the store so they agree exactly.
// Rounds (not floors) dw/dh so a grid-aspect image (e.g. a flattened one) fits as identity.
export function fitRect(sw, sh, tw, th) {
  const sa = sw / sh, ta = tw / th;
  let dw, dh;
  if (sa > ta) {
    dw = tw;
    dh = tw / sa;
  } else {
    dw = th * sa;
    dh = th;
  }
  dw = Math.max(1, Math.round(dw));
  dh = Math.max(1, Math.round(dh));
  return { dx: Math.floor((tw - dw) * 0.5), dy: Math.floor((th - dh) * 0.5), dw, dh };
}

export default class Canvas {
  constructor(sourceCanvas) {
    this.canvas = sourceCanvas || Object.assign(document.createElement('canvas'), { width: 1, height: 1 });
    this.ctx = ctx2d(this.canvas);
  }

  get width() { return this.canvas.width; }
  get height() { return this.canvas.height; }

  resize(dWidth, dHeight) {
    this.canvas.width = Math.max(1, Math.floor(dWidth) || 1);
    this.canvas.height = Math.max(1, Math.floor(dHeight) || 1);
    return this;
  }

  // Draws and downscales using a manual box filter into the current canvas size
  // dx, dy, dw, dh define the area to draw INTO. Black (opaque) around it. Written straight to the
  // canvas's bytes: this runs over the whole grid on every render.
  drawManual(source, dx, dy, dw, dh, quality) {
    const tw = this.canvas.width;
    const th = this.canvas.height;
    const sw = source.width;
    const sh = source.height;

    // For 'low', skip averaging and just do nearest-neighbor
    if (quality === 'low') {
      this.ctx.imageSmoothingEnabled = false;
      this.ctx.fillStyle = 'black';
      this.ctx.fillRect(0, 0, tw, th);
      this.ctx.drawImage(source, 0, 0, sw, sh, dx, dy, dw, dh);
      return this;
    }

    let srcData;
    const srcCtx = (typeof source.getContext === 'function') ? ctx2d(source) : null;

    if (srcCtx) {
      srcData = srcCtx.getImageData(0, 0, sw, sh).data;
    } else {
      // Source is likely a WebGL canvas. In Safari, drawImage(webglCanvas)
      // is often more reliable than readPixels for capturing the backbuffer.
      const temp = document.createElement('canvas');
      temp.width = sw;
      temp.height = sh;
      const tctx = ctx2d(temp);
      tctx.drawImage(source, 0, 0);
      srcData = tctx.getImageData(0, 0, sw, sh).data;
    }

    // For 'medium' and 'high', we do manual box averaging
    const image = this.ctx.createImageData(tw, th), out = image.data;
    for (let i = 3; i < out.length; i += 4) out[i] = 255; // black
    const xRatio = sw / dw;
    const yRatio = sh / dh;

    let step = (quality === 'medium') ? 2 : 1;

    for (let y = 0; y < dh; y++) {
      const targetY = y + dy;
      if (targetY < 0 || targetY >= th) continue;

      for (let x = 0; x < dw; x++) {
        const targetX = x + dx;
        if (targetX < 0 || targetX >= tw) continue;

        let r = 0, g = 0, b = 0, a = 0;
        let count = 0;

        const syStart = Math.floor(y * yRatio);
        const syEnd = Math.floor((y + 1) * yRatio);
        const sxStart = Math.floor(x * xRatio);
        const sxEnd = Math.floor((x + 1) * xRatio);

        for (let sy = syStart; sy < syEnd; sy += step) {
          for (let sx = sxStart; sx < sxEnd; sx += step) {
            const idx = (sy * sw + sx) * 4;
            r += srcData[idx];
            g += srcData[idx + 1];
            b += srcData[idx + 2];
            a += srcData[idx + 3];
            count++;
          }
        }

        if (count === 0) {
          const idx = (Math.floor(syStart) * sw + Math.floor(sxStart)) * 4;
          r = srcData[idx]; g = srcData[idx + 1]; b = srcData[idx + 2]; a = srcData[idx + 3];
          count = 1;
        }

        const o = (targetY * tw + targetX) * 4;
        out[o] = Math.round(r / count);
        out[o + 1] = Math.round(g / count);
        out[o + 2] = Math.round(b / count);
        out[o + 3] = (((a / count) / 255.0) || 1.0) * 255; // an empty block is written opaque
      }
    }

    this.ctx.putImageData(image, 0, 0);
    return this;
  }

  getImageData() {
    return this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height).data;
  }
}
