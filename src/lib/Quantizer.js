/**
 * Modified Median Cut Quantization (MMCQ)
 * A clean, modern JS implementation to find the most representative colors in an image.
 */

const SIGBITS = 5;
const RSHIFT = 8 - SIGBITS;

function getColorIndex(r, g, b) {
  return (r << (2 * SIGBITS)) + (g << SIGBITS) + b;
}

class VBox {
  constructor(r1, r2, g1, g2, b1, b2, hist) {
    this.r1 = r1; this.r2 = r2;
    this.g1 = g1; this.g2 = g2;
    this.b1 = b1; this.b2 = b2;
    this.hist = hist;
  }

  get volume() {
    return (this.r2 - this.r1 + 1) * (this.g2 - this.g1 + 1) * (this.b2 - this.b1 + 1);
  }

  get count() {
    if (!this._count) {
      let npix = 0;
      for (let r = this.r1; r <= this.r2; r++) {
        for (let g = this.g1; g <= this.g2; g++) {
          for (let b = this.b1; b <= this.b2; b++) {
            npix += this.hist[getColorIndex(r, g, b)] || 0;
          }
        }
      }
      this._count = npix;
    }
    return this._count;
  }

  copy() {
    return new VBox(this.r1, this.r2, this.g1, this.g2, this.b1, this.b2, this.hist);
  }

  avg() {
    if (!this._avg) {
      let ntot = 0, rsum = 0, gsum = 0, bsum = 0;
      for (let r = this.r1; r <= this.r2; r++) {
        for (let g = this.g1; g <= this.g2; g++) {
          for (let b = this.b1; b <= this.b2; b++) {
            let h = this.hist[getColorIndex(r, g, b)] || 0;
            ntot += h;
            rsum += h * (r + 0.5) * (1 << RSHIFT);
            gsum += h * (g + 0.5) * (1 << RSHIFT);
            bsum += h * (b + 0.5) * (1 << RSHIFT);
          }
        }
      }
      if (ntot > 0) {
        this._avg = [Math.round(rsum / ntot), Math.round(gsum / ntot), Math.round(bsum / ntot)];
      } else {
        this._avg = [
          Math.round(((this.r1 + this.r2 + 1) << RSHIFT) / 2),
          Math.round(((this.g1 + this.g2 + 1) << RSHIFT) / 2),
          Math.round(((this.b1 + this.b2 + 1) << RSHIFT) / 2)
        ];
      }
    }
    return this._avg;
  }
}

export default function quantize(pixels, maxColors) {
  if (!pixels.length || maxColors < 2 || maxColors > 256) return [];

  // 1. Build Histogram
  const hist = new Uint32Array(1 << (3 * SIGBITS));
  let rmin = 255, rmax = 0, gmin = 255, gmax = 0, bmin = 255, bmax = 0;

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i] >> RSHIFT;
    const g = pixels[i + 1] >> RSHIFT;
    const b = pixels[i + 2] >> RSHIFT;
    const a = pixels[i + 3];
    if (a < 128) continue; // Skip transparent

    hist[getColorIndex(r, g, b)]++;
    if (r < rmin) rmin = r; if (r > rmax) rmax = r;
    if (g < gmin) gmin = g; if (g > gmax) gmax = g;
    if (b < bmin) bmin = b; if (b > bmax) bmax = b;
  }

  const initialVBox = new VBox(rmin, rmax, gmin, gmax, bmin, bmax, hist);
  const pq = [initialVBox];

  function splitVBox(vbox) {
    if (!vbox.count) return [];
    const rw = vbox.r2 - vbox.r1, gw = vbox.g2 - vbox.g1, bw = vbox.b2 - vbox.b1;

    // Split on the longest dimension at the median of pixel count
    let axisToSplit;
    if (rw >= gw && rw >= bw) axisToSplit = 'r';
    else if (gw >= rw && gw >= bw) axisToSplit = 'g';
    else axisToSplit = 'b';

    const count = vbox.count;
    let sum = 0;
    for (let i = vbox[axisToSplit + '1']; i <= vbox[axisToSplit + '2']; i++) {
      let sliceCount = 0;
      for (let j = vbox[(axisToSplit === 'r' ? 'g' : 'r') + '1']; j <= vbox[(axisToSplit === 'r' ? 'g' : 'r') + '2']; j++) {
        for (let k = vbox[(axisToSplit === 'b' ? 'g' : 'b') + '1']; k <= vbox[(axisToSplit === 'b' ? 'g' : 'b') + '2']; k++) {
          let r, g, b;
          if (axisToSplit === 'r') { r = i; g = j; b = k; }
          else if (axisToSplit === 'g') { r = j; g = i; b = k; }
          else { r = j; g = k; b = i; }
          sliceCount += hist[getColorIndex(r, g, b)] || 0;
        }
      }
      sum += sliceCount;
      if (sum >= count / 2) {
        const v1 = vbox.copy();
        const v2 = vbox.copy();
        v1[axisToSplit + '2'] = i;
        v2[axisToSplit + '1'] = i + 1;
        return [v1, v2];
      }
    }
    return [];
  }

  // Recursive split
  while (pq.length < maxColors) {
    pq.sort((a, b) => (b.count * b.volume) - (a.count * a.volume));
    const target = pq.shift();
    if (target.count === 0) {
       pq.push(target);
       break;
    }
    const res = splitVBox(target);
    if (res.length) {
      pq.push(res[0]);
      if (res[1]) pq.push(res[1]);
    } else {
      break;
    }
  }

  return pq.map(vbox => {
    const [r, g, b] = vbox.avg();
    return { r, g, b };
  });
}
