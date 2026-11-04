// SVG path data (a <path>'s d) read into outlines: [{ closed, points }], each point as shapes have them,
// [x, y, inX, inY, outX, outY, smooth], in the path's own units, its handles offsets from it. Every command is
// read, absolute and relative; a quadratic becomes the cubic that draws it exactly, an arc cubics of 90° or less.
// A subpath of one point is no outline. Bad data ends the reading there, and what came before stays, as browsers
// draw it.

const ARGS = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };
const NUMBER = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
const SEPARATORS = /[\s,]*/y;

// The arc from (x0, y0) to (x, y) as cubics, [[c1x, c1y, c2x, c2y, x, y], ...], by the SVG spec's notes (F.6.5,
// F.6.6): radii too small to reach are scaled up; zero radii are a straight line; the same two ends, nothing.
export function arcToCubics(x0, y0, rx, ry, phi, largeArc, sweep, x, y) {
  if (x0 === x && y0 === y) return [];
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (!rx || !ry) return [[x0, y0, x, y, x, y]];
  const a = (phi * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const hx = (x0 - x) / 2, hy = (y0 - y) / 2;
  const x1 = cos * hx + sin * hy, y1 = -sin * hx + cos * hy;
  const reach = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (reach > 1) {
    rx *= Math.sqrt(reach);
    ry *= Math.sqrt(reach);
  }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1, den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const coef = (!largeArc !== !sweep ? 1 : -1) * Math.sqrt(Math.max(0, num / den));
  const cx1 = (coef * rx * y1) / ry, cy1 = (-coef * ry * x1) / rx;
  const cx = cos * cx1 - sin * cy1 + (x0 + x) / 2, cy = sin * cx1 + cos * cy1 + (y0 + y) / 2;
  const angle = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const start = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let delta = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2) - 1e-9)), step = delta / n;
  const k = (4 / 3) * Math.tan(step / 4);
  // A point of the unit circle, onto the ellipse.
  const map = (u, v) => [cx + rx * cos * u - ry * sin * v, cy + rx * sin * u + ry * cos * v];
  const pieces = [];
  for (let i = 0; i < n; i++) {
    const t0 = start + i * step, t1 = t0 + step;
    const [c0, s0, c1, s1] = [Math.cos(t0), Math.sin(t0), Math.cos(t1), Math.sin(t1)];
    const end = i === n - 1 ? [x, y] : map(c1, s1);
    pieces.push([...map(c0 - k * s0, s0 + k * c0), ...map(c1 + k * s1, s1 - k * c1), ...end]);
  }
  return pieces;
}

// Handles in line, pointing apart: a smooth point.
function smooth(p) {
  const a = Math.hypot(p[2], p[3]), b = Math.hypot(p[4], p[5]);
  if (!a || !b) return 0;
  const cross = (p[2] * p[5] - p[3] * p[4]) / (a * b), dot = p[2] * p[4] + p[3] * p[5];
  return Math.abs(cross) < 0.01 && dot < 0 ? 1 : 0;
}

export function parsePathData(d) {
  const text = typeof d === 'string' ? d : '';
  const outlines = [];
  let i = 0, path = null, x = 0, y = 0, sx = 0, sy = 0, c2 = null, q = null;

  const skip = () => {
    SEPARATORS.lastIndex = i;
    SEPARATORS.exec(text);
    i = SEPARATORS.lastIndex;
  };
  const number = () => {
    skip();
    NUMBER.lastIndex = i;
    const m = NUMBER.exec(text);
    if (!m) return null;
    const v = Number(m[0]);
    if (!Number.isFinite(v)) return null;
    i = NUMBER.lastIndex;
    return v;
  };
  const flag = () => {
    skip();
    if (text[i] !== '0' && text[i] !== '1') return null;
    return text[i++] === '1' ? 1 : 0;
  };
  const finish = () => {
    if (!path) return;
    const { points } = path;
    const first = points[0], last = points.at(-1);
    if (path.closed && points.length > 1 && Math.abs(first[0] - last[0]) < 1e-9 && Math.abs(first[1] - last[1]) < 1e-9) {
      first[2] = last[2];
      first[3] = last[3];
      points.pop();
    }
    for (const p of points) p[6] = smooth(p);
    if (points.length > 1) outlines.push(path);
    path = null;
  };
  const begin = () => {
    if (!path) path = { closed: false, points: [[x, y, 0, 0, 0, 0, 0]] };
  };
  const line = (nx, ny) => {
    begin();
    path.points.push([nx, ny, 0, 0, 0, 0, 0]);
    [x, y] = [nx, ny];
  };
  const cubic = (ax, ay, bx, by, nx, ny) => {
    begin();
    const last = path.points.at(-1);
    last[4] = ax - last[0];
    last[5] = ay - last[1];
    path.points.push([nx, ny, bx - nx, by - ny, 0, 0, 0]);
    [x, y] = [nx, ny];
  };

  let command = null, moved = false;
  for (;;) {
    skip();
    if (i >= text.length) break;
    const letter = text[i];
    if (/[a-z]/i.test(letter)) {
      if (!(letter.toLowerCase() in ARGS)) break;
      command = letter;
      i++;
    } else if (!command || command === 'z' || command === 'Z') break; // numbers with no command to repeat
    else if (command === 'M') command = 'L'; // a move's later pairs are lines
    else if (command === 'm') command = 'l';
    if (!moved && command !== 'M' && command !== 'm') break; // path data starts with a move
    moved = true;

    const kind = command.toLowerCase(), rel = command !== command.toUpperCase();
    const args = [];
    for (let n = 0; n < ARGS[kind]; n++) {
      const v = kind === 'a' && (n === 3 || n === 4) ? flag() : number();
      if (v === null) return finish(), outlines;
      args.push(v);
    }
    const ox = rel ? x : 0, oy = rel ? y : 0;
    let nextC2 = null, nextQ = null;
    if (kind === 'm') {
      finish();
      [x, y] = [args[0] + ox, args[1] + oy];
      [sx, sy] = [x, y];
      begin();
    } else if (kind === 'z') {
      if (path) path.closed = true;
      finish();
      [x, y] = [sx, sy];
    } else if (kind === 'l') line(args[0] + ox, args[1] + oy);
    else if (kind === 'h') line(args[0] + ox, y);
    else if (kind === 'v') line(x, args[0] + oy);
    else if (kind === 'c' || kind === 's') {
      const [ax, ay] = kind === 'c' ? [args[0] + ox, args[1] + oy] : c2 ? [2 * x - c2[0], 2 * y - c2[1]] : [x, y];
      const r = kind === 'c' ? 2 : 0;
      const [bx, by, nx, ny] = [args[r] + ox, args[r + 1] + oy, args[r + 2] + ox, args[r + 3] + oy];
      cubic(ax, ay, bx, by, nx, ny);
      nextC2 = [bx, by];
    } else if (kind === 'q' || kind === 't') {
      const [qx, qy] = kind === 'q' ? [args[0] + ox, args[1] + oy] : q ? [2 * x - q[0], 2 * y - q[1]] : [x, y];
      const r = kind === 'q' ? 2 : 0;
      const [nx, ny] = [args[r] + ox, args[r + 1] + oy];
      cubic(x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), nx + (2 / 3) * (qx - nx), ny + (2 / 3) * (qy - ny), nx, ny);
      nextQ = [qx, qy];
    } else if (kind === 'a') {
      const [rx, ry, phi, large, sweep] = args, nx = args[5] + ox, ny = args[6] + oy;
      if (!rx || !ry) line(nx, ny);
      else for (const piece of arcToCubics(x, y, rx, ry, phi, large, sweep, nx, ny)) cubic(...piece);
    }
    c2 = nextC2;
    q = nextQ;
  }
  finish();
  return outlines;
}
