// Brush pixel generation shared by both editors (grid pixels, clipped to the grid).
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { interpolate, pencilPixels, squarePixels, brushPixels, linePixels, lineCoverage, halfBlockCells, halfStepLine, halfStepEllipse, rectPixels, ellipsePixels, ellipseCoverage, boxCells } from '../../src/lib/Brushes.js';

test('Brush pixel generation shared by both editors (grid pixels, clipped to the grid)', async () => {
  assert.deepEqual(interpolate({ x: 0, y: 0 }, { x: 1, y: 0 }), [{ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 1, y: 0 }]);
  assert.deepEqual(interpolate({ x: 3, y: 3 }, { x: 3, y: 3 }), [{ x: 3, y: 3 }]);

  assert.deepEqual(pencilPixels({ x: 0.5, y: 0.5 }, { x: 3.5, y: 0.5 }, 10, 10).map(p => p.x), [0, 1, 2, 3]);
  assert.deepEqual(pencilPixels({ x: -2, y: 0 }, { x: 1.5, y: 0 }, 10, 10).map(p => p.x), [0, 1]);
  assert.ok(pencilPixels({ x: 0, y: 0 }, { x: 3, y: 0 }, 10, 10).every(p => p.alpha === 1));

  assert.equal(squarePixels({ x: 5, y: 5 }, { x: 5, y: 5 }, 2, 10, 10).length, 4);
  assert.equal(squarePixels({ x: 5, y: 5 }, { x: 6, y: 5 }, 2, 10, 10).length, 6); // deduped across the stroke
  assert.equal(squarePixels({ x: 0, y: 0 }, { x: 0, y: 0 }, 4, 10, 10).length, 4); // clipped at the edge
  // A square covers the pixels whose centers are inside it: size 1 is the pixel under the pointer.
  const sq = (x, y, size) => squarePixels({ x, y }, { x, y }, size, 20, 20).map(p => [p.x, p.y]);
  assert.deepEqual(sq(3.7, 6.7, 1), [[3, 6]]);
  assert.deepEqual(sq(3.2, 6.1, 1), [[3, 6]]);
  assert.deepEqual(sq(3.999, 6.001, 1), [[3, 6]]);
  assert.deepEqual(sq(3, 6, 1), [[3, 6]]);                              // exactly on a pixel corner: the pixel it's in
  assert.deepEqual(sq(4, 6, 2).sort(), [[3, 5], [3, 6], [4, 5], [4, 6]]);
  assert.equal(sq(4.5, 6.5, 3).length, 9);

  const soft = brushPixels({ x: 5.5, y: 5.5 }, { x: 5.5, y: 5.5 }, { size: 1, flow: 1, hardness: 0.5 }, 10, 10);
  assert.deepEqual(soft, [{ x: 5, y: 5, alpha: 1 }]);
  // brushes of size <= 1 fall off linearly (the old PIXEL-view curve would give 0.354 here)
  assert.deepEqual(brushPixels({ x: 5.75, y: 5.5 }, { x: 5.75, y: 5.5 }, { size: 1, flow: 1, hardness: 0 }, 10, 10), [{ x: 5, y: 5, alpha: 0.5 }]);
  const hard = brushPixels({ x: 5, y: 5 }, { x: 5, y: 5 }, { size: 4, flow: 0.5, hardness: 1 }, 10, 10);
  assert.ok(hard.length > 0 && hard.every(p => p.alpha === 0.5));
  const feathered = brushPixels({ x: 5, y: 5 }, { x: 5, y: 5 }, { size: 6, flow: 1, hardness: 0 }, 10, 10);
  assert.ok(feathered.some(p => p.alpha < 1) && feathered.every(p => p.alpha > 0 && p.alpha <= 1));
  // Shapes: inputs are floored and normalized (drag any direction); results clip to the grid.
  assert.equal(rectPixels({ x: 3, y: 3 }, { x: 0, y: 0 }, false, 10, 10).length, 12);   // 4x4 outline
  assert.equal(rectPixels({ x: 0, y: 0 }, { x: 3, y: 3 }, true, 10, 10).length, 16);
  assert.equal(rectPixels({ x: 8, y: 8 }, { x: 12, y: 12 }, true, 10, 10).length, 4);   // clipped
  assert.equal(rectPixels({ x: 2, y: 2 }, { x: 2, y: 2 }, false, 10, 10).length, 1);
  assert.ok(ellipsePixels({ x: 2, y: 2 }, { x: 2, y: 2 }, false, 10, 10).length >= 1);  // tiny: still a pixel
  assert.ok(ellipsePixels({ x: 0, y: 0 }, { x: 1, y: 1 }, true, 10, 10).length >= 1);
  const ring = ellipsePixels({ x: 0, y: 0 }, { x: 8, y: 6 }, false, 20, 20);
  const disc = ellipsePixels({ x: 0, y: 0 }, { x: 8, y: 6 }, true, 20, 20);
  assert.ok(ring.length < disc.length && ring.every(p => disc.some(q => q.x === p.x && q.y === p.y)));
  assert.ok(disc.every(p => p.x >= 0 && p.x <= 8 && p.y >= 0 && p.y <= 6));               // inscribed
  assert.equal(new Set(ring.map(p => `${p.x},${p.y}`)).size, ring.length);               // no duplicates
  assert.ok([[4, 0], [0, 3], [8, 3], [4, 6]].every(([x, y]) => ring.some(p => p.x === x && p.y === y))); // touches each side
  assert.deepEqual(boxCells({ c0: 0, r0: 0, c1: 2, r1: 1 }, 'double', 80, 25).map(c => c.char).join(''), '╔═╗╚═╝');
  assert.deepEqual(boxCells({ c0: 0, r0: 0, c1: 2, r1: 0 }, 'single', 80, 25).map(c => c.char).join(''), '───');
  assert.deepEqual(boxCells({ c0: 0, r0: 0, c1: 0, r1: 1 }, 'single', 80, 25).map(c => c.char).join(''), '││');
  assert.deepEqual(boxCells({ c0: 3, r0: 3, c1: 3, r1: 3 }, 'double', 80, 25).map(c => c.char).join(''), '═');
  assert.deepEqual(boxCells({ c0: 0, r0: 0, c1: 2, r1: 2 }, 'single', 80, 25).map(c => `${c.col},${c.row}`), ['0,0', '1,0', '2,0', '0,1', '2,1', '0,2', '1,2', '2,2']); // outline only
  assert.deepEqual(boxCells({ c0: 2, r0: 1, c1: 0, r1: 0 }, 'double', 80, 25).map(c => c.char).join(''), '╔═╗╚═╝'); // dragged backwards
  const clipped = boxCells({ c0: 78, r0: 23, c1: 81, r1: 26 }, 'single', 80, 25);
  assert.ok(clipped.every(c => c.col < 80 && c.row < 25));                                  // nothing off the grid
  assert.deepEqual(clipped.map(c => c.char).join(''), '┌─│');                               // cols 78-79, rows 23-24: the real corner stays a corner
  // Anti-aliased: full coverage inside, partial at the edge, nothing outside; the ring stays inside the disc.
  const cover = ellipseCoverage(0, 0, 9, 9, true);
  assert.equal(cover(4, 4), 1);
  assert.equal(cover(0, 0), 0);
  assert.ok(cover(1, 1) > 0 && cover(1, 1) < 1);
  const aaRing = ellipsePixels({ x: 0, y: 0 }, { x: 9, y: 9 }, false, 20, 20, true);
  assert.ok(aaRing.every(p => p.alpha > 0 && p.alpha <= cover(p.x, p.y)));
  assert.ok(!aaRing.some(p => p.x === 4 && p.y === 4));                                     // hollow
  assert.ok(ellipsePixels({ x: 2, y: 2 }, { x: 2, y: 2 }, false, 10, 10, true).length === 1);  // tiny: still a pixel
  // Off-grid area is skipped: walking this ellipse's ~10^12 off-grid pixels would never finish (the
  // run hangs; CI's job timeout fails it), so it passes only if the work is bounded by the grid. No
  // stopwatch: a timing threshold fails on a busy machine.
  const huge = (aa) => ellipsePixels({ x: -1e6, y: -1e6 }, { x: 1e6, y: 1e6 }, false, 300, 300, aa);
  for (const aa of [false, true]) assert.ok(huge(aa).every(p => p.x >= 0 && p.y >= 0 && p.x < 300 && p.y < 300));
});

test('A straight line is one pixel per step along its longer side, from end to end, with no corners doubled', () => {
  const xy = (pixels) => pixels.map((p) => [p.x, p.y]);
  assert.deepEqual(xy(linePixels({ x: 1.5, y: 2.5 }, { x: 5.5, y: 2.5 }, 10, 10)), [[1, 2], [2, 2], [3, 2], [4, 2], [5, 2]]);
  assert.deepEqual(xy(linePixels({ x: 3, y: 7 }, { x: 3, y: 4 }, 10, 10)), [[3, 7], [3, 6], [3, 5], [3, 4]]); // any direction
  assert.deepEqual(xy(linePixels({ x: 0, y: 0 }, { x: 3, y: 3 }, 10, 10)), [[0, 0], [1, 1], [2, 2], [3, 3]]);
  const shallow = linePixels({ x: 0, y: 0 }, { x: 8, y: 3 }, 20, 20);
  assert.equal(shallow.length, 9);                                         // one per column
  assert.deepEqual(new Set(shallow.map((p) => p.x)).size, 9);
  assert.ok(shallow.every((p, i) => i === 0 || p.y - shallow[i - 1].y <= 1)); // no gaps
  assert.ok(shallow.every((p) => p.alpha === 1));
  assert.deepEqual(xy(linePixels({ x: 3, y: 3 }, { x: 3, y: 3 }, 10, 10)), [[3, 3]]);   // a click: one pixel
  assert.deepEqual(xy(linePixels({ x: -2, y: 1 }, { x: 2, y: 1 }, 10, 10)), [[0, 1], [1, 1], [2, 1]]); // clipped
});

test('An anti-aliased line shares each step between the two pixels it passes between; its ends are whole', () => {
  const line = lineCoverage({ x: 0, y: 0 }, { x: 8, y: 3 }, 20, 20);
  const at = (x, y) => line.find((p) => p.x === x && p.y === y)?.alpha ?? 0;
  assert.equal(at(0, 0), 1);
  assert.equal(at(8, 3), 1);
  for (let x = 0; x <= 8; x++) {
    const column = line.filter((p) => p.x === x).reduce((sum, p) => sum + p.alpha, 0);
    assert.ok(Math.abs(column - 1) < 1e-9, `column ${x}: ${column}`);
  }
  assert.ok(line.some((p) => p.alpha > 0 && p.alpha < 1));
  assert.ok(lineCoverage({ x: 0, y: 0 }, { x: 4, y: 4 }, 10, 10).every((p) => p.alpha === 1)); // 45°: whole pixels
  const steep = lineCoverage({ x: 2, y: 0 }, { x: 4, y: 9 }, 10, 10);                          // steep: shared across
  for (let y = 0; y <= 9; y++) assert.ok(Math.abs(steep.filter((p) => p.y === y).reduce((sum, p) => sum + p.alpha, 0) - 1) < 1e-9);
});

test('Half-cell pixels make block characters: across, ▌ ▐ █; across and down, the quadrants', () => {
  const chars = (pixels, halfRows) => Object.fromEntries(halfBlockCells(pixels, halfRows).map(({ col, row, char }) => [`${col},${row}`, char]));
  // Two half-columns per cell; rows are cells.
  assert.deepEqual(chars([{ x: 4, y: 1 }, { x: 7, y: 1 }, { x: 8, y: 2 }, { x: 9, y: 2 }], false), { '2,1': '▌', '3,1': '▐', '4,2': '█' });
  // Two half-columns and two half-rows per cell.
  const q = (...xy) => xy.map(([x, y]) => ({ x, y }));
  assert.deepEqual(chars(q([0, 0]), true), { '0,0': '▘' });
  assert.deepEqual(chars(q([1, 0], [0, 1]), true), { '0,0': '▞' });
  assert.deepEqual(chars(q([0, 0], [0, 1]), true), { '0,0': '▌' });
  assert.deepEqual(chars(q([0, 0], [1, 0], [0, 1]), true), { '0,0': '▛' });
  assert.deepEqual(chars(q([2, 2], [3, 2], [2, 3], [3, 3]), true), { '1,1': '█' });
});

test('Half steps: whole blocks placed to the nearest half cell, so one between two columns is ▐▌', () => {
  const grid = (pixels, halfRows = false) => {
    const cells = Object.fromEntries(halfBlockCells(pixels, halfRows).map(({ col, row, char }) => [`${col},${row}`, char]));
    const rows = [];
    for (let row = 0; row <= Math.max(...Object.keys(cells).map((k) => +k.split(',')[1])); row++) {
      let line = '';
      for (let col = 0; col <= Math.max(...Object.keys(cells).map((k) => +k.split(',')[0])); col++) line += cells[`${col},${row}`] ?? ' ';
      rows.push(line.trimEnd());
    }
    return rows;
  };
  // A steep line: a block a row, each to the nearest half cell (x in cells, y in rows).
  assert.deepEqual(grid(halfStepLine({ x: 0.5, y: 0.5 }, { x: 1.5, y: 2.5 }, 10, 10)), ['█', '▐▌', ' █']);
  // A shallow one: it runs across, stepping down a row at half a cell.
  assert.deepEqual(grid(halfStepLine({ x: 0.5, y: 0.5 }, { x: 4.5, y: 1.5 }, 10, 10)), ['██▌', '  ▐██']);
  // Upright or across: whole cells.
  assert.deepEqual(grid(halfStepLine({ x: 2.5, y: 0.5 }, { x: 2.5, y: 2.5 }, 10, 10)), ['  █', '  █', '  █']);
  // Half-height blocks (Half-block's rows are half a cell): the quadrants.
  assert.deepEqual(grid(halfStepLine({ x: 0.5, y: 0.5 }, { x: 1.5, y: 3.5 }, 10, 10), true), ['▜▖', '▝▙']);

  // An ellipse: its sides step by half a cell, its top and bottom run across; it's mirror-symmetric.
  const circle = grid(halfStepEllipse({ x: 0.5, y: 0.5 }, { x: 16.5, y: 13.5 }, false, 30, 30));
  const mirror = { '▌': '▐', '▐': '▌' };
  for (const line of circle) {
    const row = line.padEnd(17, ' ');
    assert.equal([...row].reverse().map((c) => mirror[c] ?? c).join(''), row, `not symmetric:\n${circle.join('\n')}`);
  }
  assert.ok(circle.some((line) => line.includes('▐▌')), circle.join('\n'));
  assert.ok(circle.every((line) => !line.includes('██████████████████')));
  // Filled: the inside too.
  const disc = halfStepEllipse({ x: 0.5, y: 0.5 }, { x: 16.5, y: 13.5 }, true, 30, 30);
  assert.ok(disc.length > halfStepEllipse({ x: 0.5, y: 0.5 }, { x: 16.5, y: 13.5 }, false, 30, 30).length * 3);
});
