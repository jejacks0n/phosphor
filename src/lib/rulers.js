// The rulers' arithmetic: what a character's count is from the zero, where guides snap, how a guide's
// distance reads, and which ticks and labels a ruler shows. Zero is in cells and may sit on an edge
// (a whole number: no character is 0, the counts go -1, 1) or in a middle (a half: that character is 0).

// A 0-based cell's count from zero: the cells after it count 1, 2, ... and the cells before it -1, -2, ...
export function cellCount(cell, zero) {
  const m = cell + 0.5 - zero;
  return m > 0 ? Math.ceil(m) : m < 0 ? Math.floor(m) : 0;
}

// A position in cells moved to the nearest whole or half, kept inside the drawing.
export function snapHalf(value, max) {
  return Math.min(max, Math.max(0, Math.round(value * 2) / 2));
}

// A guide's distance from zero as shown: whole and half characters, with a real minus sign.
export function guideLabel(distance) {
  const abs = Math.abs(distance);
  const whole = Math.floor(abs);
  const text = abs % 1 ? (whole ? `${whole}½` : '½') : String(whole);
  return distance < 0 ? `−${text}` : text;
}

// Zero past the drawing's edge counts from the edge.
export function shownZero(zero, cells) {
  return Math.min(zero, cells);
}

// The marks of a ruler `length` px long whose cell 0 starts at `start` and whose cells are `size` px:
// labels on every 10th (and on the 0 character), ticks on 5ths and 10ths at the cell's middle, and
// ticks on cell edges unless the cells are too narrow to tell apart. Only what is near the ruler.
export function rulerMarks({ cells, zero, size, start, length }) {
  const near = (px) => px >= -size && px <= length + size;
  const marks = { edges: [], fives: [], tens: [], labels: [] };
  if (size >= 3) {
    for (let e = 0; e <= cells; e++) {
      const px = start + e * size;
      if (near(px)) marks.edges.push(px);
    }
  }
  for (let i = 0; i < cells; i++) {
    const at = start + (i + 0.5) * size;
    if (!near(at)) continue;
    const count = cellCount(i, zero);
    if (count === 0) marks.labels.push({ at, text: '0' });
    else if (count % 10 === 0) {
      marks.tens.push(at);
      marks.labels.push({ at, text: guideLabel(count) });
    } else if (count % 5 === 0) marks.fives.push(at);
  }
  return marks;
}
