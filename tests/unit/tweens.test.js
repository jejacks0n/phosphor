// Tweens: a shape worked out part way between two of its versions, and the timing that eases it.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { makeShape, rectShape, rotation, transformed, translation, withShape } from '../../src/document/shapes.js';
import { EASINGS, ease, lifeAt, setPartsAt, shapeAt, strayEasings, tweenBands, tweenPart, tweenReach, tweenShape, tweenedAt, workedOutAt } from '../../src/document/tweens.js';
import { PARTS } from '../../src/document/parts.js';
import { partKeys } from '../../src/document/keys.js';
import { EMPTY_STATE, cellState, newFrame } from '../../src/document/frames.js';

const close = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
const A = rectShape(0, 0, 4, 4, { fill: '#ff0000' });
// A key frame's easings: every part's (or those named) easing so.
const eased = (easing, parts = PARTS) => new Map(parts.map((part) => [part, easing]));
// The Transform's keys in shape A's life around frame i: [{ at, easing, motion }].
const transformKeys = (frames, i) => partKeys(frames, 'v:a', i).rows.get('transform').map(({ at, easing, motion }) => ({ at, easing, motion }));

test('the easings start at 0 and end at 1, cubic between', () => {
  for (const e of EASINGS) {
    assert.equal(ease(e, 0), 0, e);
    assert.equal(ease(e, 1), 1, e);
  }
  assert.equal(ease('linear', 0.25), 0.25);
  assert.equal(ease('easeIn', 0.5), 0.125);
  assert.equal(ease('easeOut', 0.5), 0.875);
  assert.equal(ease('easeInOut', 0.25), 0.0625);
  assert.equal(ease('easeInOut', 0.75), 0.9375);
});

test('a move, a scale and a turn go part way', () => {
  assert.deepEqual([...tweenShape(A, transformed(A, translation(10, 20)), 0.5).m], [1, 0, 0, 1, 5, 10]);
  const squash = tweenShape(A, withShape(A, { m: [2, 0, 0, 0.5, 0, 0] }), 0.5).m;
  close(squash[0], 1.5);
  close(squash[3], 0.75);
  const turn = tweenShape(A, withShape(A, { m: rotation(Math.PI / 2, 0, 0) }), 0.5).m;
  close(turn[0], Math.SQRT1_2);
  close(turn[1], Math.SQRT1_2);
});

test("a turn goes the short way round, and a mirror doesn't break it", () => {
  const deg = Math.PI / 180;
  const m = tweenShape(withShape(A, { m: rotation(170 * deg) }), withShape(A, { m: rotation(-170 * deg) }), 0.5).m;
  close(m[0], -1);
  const mirrored = tweenShape(withShape(A, { m: [1, 0, 0, 1, 0, 0] }), withShape(A, { m: [-1, 0, 0, 1, 0, 0] }), 0.5).m;
  assert.ok(mirrored.every(Number.isFinite), String(mirrored));
});

test("points go part way when the outlines match, and switch half way when they don't", () => {
  const wide = rectShape(0, 0, 8, 6, { fill: '#ff0000' });
  const mid = tweenShape(A, wide, 0.5);
  mid.points.forEach((p, i) => p.slice(0, 6).forEach((v, j) => close(v, (A.points[i][j] + wide.points[i][j]) / 2)));
  const tri = makeShape({ points: [[0, 0, 0, 0, 0, 0, 0], [4, 0, 0, 0, 0, 0, 0], [2, 4, 0, 0, 0, 0, 0]], closed: true, fill: '#ff0000' });
  assert.deepEqual(tweenShape(A, tri, 0.4).points, A.points);
  assert.deepEqual(tweenShape(A, tri, 0.6).points, tri.points);
  const open = withShape(A, { closed: false });
  assert.equal(tweenShape(open, A, 0.4).closed, false);
  assert.equal(tweenShape(open, A, 0.6).closed, true);
});

test("colors mix in RGB, a width goes part way, and what can't mix switches half way", () => {
  assert.equal(tweenShape(withShape(A, { fill: '#000000' }), withShape(A, { fill: '#ffffff' }), 0.5).fill, '#808080');
  const none = withShape(A, { fill: null }), red = withShape(A, { fill: '#ff0000' });
  assert.equal(tweenShape(none, red, 0.4).fill, null);
  assert.equal(tweenShape(none, red, 0.6).fill, '#ff0000');
  assert.equal(tweenShape(withShape(A, { width: 1 }), withShape(A, { width: 3 }), 0.5).width, 2);
  const butt = withShape(A, { stroke: '#000000', cap: 'butt' }), square = withShape(A, { stroke: '#000000', cap: 'square' });
  assert.equal(tweenShape(butt, square, 0.4).cap, 'butt');
  assert.equal(tweenShape(butt, square, 0.5).cap, 'square');
});

test('a gradient mixes with one of its kind and stop count, else switches', () => {
  const grad = (type, c0, c1, m) => ({ type, stops: [[0, c0], [1, c1]], m });
  const a = withShape(A, { fill: grad('linear', '#000000', '#ffffff', [4, 0, 0, 4, 0, 0]) });
  const b = withShape(A, { fill: grad('linear', '#ffffff', '#000000', [8, 0, 0, 8, 2, 2]) });
  const mid = tweenShape(a, b, 0.5).fill;
  assert.equal(mid.type, 'linear');
  assert.deepEqual(mid.stops.map(([, c]) => c), ['#808080', '#808080']);
  assert.deepEqual([...mid.m], [6, 0, 0, 6, 1, 1]);
  const radial = withShape(A, { fill: grad('radial', '#ffffff', '#000000', [8, 0, 0, 8, 2, 2]) });
  assert.equal(tweenShape(a, radial, 0.4).fill.type, 'linear');
  assert.equal(tweenShape(a, radial, 0.6).fill.type, 'radial');
});

// Frames 0..8: frame 0 owns shape A (its tween easing in), 1 to 5 are Blank and empty, frame 6 owns A moved down 24.
function scene(easing = 'easeIn') {
  const frames = Array.from({ length: 9 }, (_, i) => newFrame(i ? 'blank' : 'wipe'));
  frames[0].changes.set('v:a', cellState(A, 0, 0));
  frames[0].tweens = easing ? new Map([['v:a', eased(easing)]]) : null;
  frames[6].changes.set('v:a', cellState(transformed(A, translation(0, 24)), 0, 0));
  return frames;
}

test("a tween runs from a key frame to the shape's next, and puts the eased shape between", () => {
  const frames = scene();
  assert.deepEqual(transformKeys(frames, 3), [{ at: 0, easing: 'easeIn', motion: 'smooth' }, { at: 6, easing: null, motion: 'smooth' }]);
  assert.equal(tweenedAt(frames, 3).get('v:a').shape.m[5], 3);
  assert.deepEqual(tweenedAt(frames, 3).get('v:a').parts.get('transform'), { easing: 'easeIn', motion: 'smooth' });
  assert.equal(tweenedAt(frames, 3).get('v:a').parts.size, PARTS.length);
  assert.equal(tweenedAt(frames, 6).size, 0);
  assert.equal(tweenedAt(frames, 7).size, 0);
  assert.deepEqual(tweenBands(frames, 'v:a'), [{ from: 0, to: 6 }]);
});

test('no easing, a Wipe or Duplicate between, or the shape erased at the far end: no tween', () => {
  const plain = scene(null);
  assert.equal(transformKeys(plain, 3)[0].easing, null);
  assert.equal(tweenedAt(plain, 3).size, 0);
  assert.deepEqual(tweenBands(plain, 'v:a'), []);
  for (const kind of ['wipe', 'duplicate']) {
    const cut = scene();
    cut[4].kind = kind;
    assert.deepEqual(transformKeys(cut, 3).map(({ at }) => at), [0], kind);
    assert.equal(tweenedAt(cut, 3).size, 0, kind);
  }
  const erased = scene();
  erased[6].changes.set('v:a', EMPTY_STATE);
  assert.deepEqual(transformKeys(erased, 3).map(({ at }) => at), [0]);
});

test('two shapes keep their own tweens', () => {
  const frames = scene();
  frames[0].changes.set('v:b', cellState(A, 0, 0));
  frames[0].tweens.set('v:b', eased('linear'));
  frames[8].changes.set('v:b', cellState(transformed(A, translation(8, 0)), 0, 0));
  const at4 = tweenedAt(frames, 4);
  assert.equal(at4.get('v:a').shape.m[5], Math.round(24 * ease('easeIn', 4 / 6) * 1e4) / 1e4);
  assert.equal(at4.get('v:b').shape.m[4], 4);
});

test('a change reaches back to the start of the tween it ends or is in', () => {
  const frames = scene();
  assert.equal(tweenReach(frames, 6), 1);
  assert.equal(tweenReach(frames, 3), 1);
  assert.equal(tweenReach(frames, 7), 1); // a part can fade to frame 7 across the shape's whole life
});

test('a shape turned about its center turns in place, wherever it is', () => {
  const box = rectShape(10, 10, 16, 16, { fill: '#ff0000' });
  const m = tweenShape(box, transformed(box, rotation(Math.PI / 2, 13, 13)), 0.5).m;
  close(m[0] * 13 + m[2] * 13 + m[4], 13);
  close(m[1] * 13 + m[3] * 13 + m[5], 13);
});

test('what a frame shows of a shape: its own, the one carried to it, or where a tween puts it', () => {
  const frames = scene();
  assert.equal(shapeAt(frames, 'v:a', 0), frames[0].changes.get('v:a').cell);
  assert.equal(shapeAt(frames, 'v:a', 3).m[5], 3);
  assert.equal(shapeAt(frames, 'v:a', 7).m[5], 24);
  assert.equal(shapeAt(frames, 'v:b', 3), null);
  frames[4].kind = 'wipe';
  assert.equal(shapeAt(frames, 'v:a', 3).m[5], 0); // no tween across a Wipe: carried
  assert.equal(shapeAt(frames, 'v:a', 5), null);
});

// Parts: a key frame sets only some of a shape; the rest comes from the key frames that set it.
const K = 'v:ball', RED = rectShape(2, 2, 6, 6, { fill: '#ff0000' });
const GRADIENT = { type: 'linear', stops: [[0, '#ff0000'], [1, '#0000ff']], m: [1, 0, 0, 1, 0, 0] };
// Frames 0 to 12: the ball red on 0, moved down 12 on 6 and 24 on 12, each of those setting only its transform.
function ball(easings = {}) {
  const frames = Array.from({ length: 13 }, (_, i) => newFrame(i ? 'blank' : 'wipe'));
  frames[0].changes.set(K, cellState(RED, 0, 0));
  for (const at of [6, 12]) {
    frames[at].changes.set(K, cellState(transformed(RED, translation(0, at * 2)), 0, 0));
    frames[at].parts = new Map([[K, new Set(['transform'])]]);
  }
  for (const [at, easing] of Object.entries(easings)) frames[at].tweens = new Map([[K, typeof easing === 'string' ? eased(easing) : easing]]);
  return frames;
}

test("a part a key frame didn't set comes from the one before that did", () => {
  const frames = ball();
  frames[0].changes.set(K, cellState(withShape(RED, { fill: GRADIENT }), 0, 0));
  for (const [at, y] of [[3, 0], [6, 12], [9, 12], [12, 24]]) {
    assert.deepEqual(shapeAt(frames, K, at).fill, frames[0].changes.get(K).cell.fill, `frame ${at}`);
    assert.equal(shapeAt(frames, K, at).m[5], y, `frame ${at}`);
  }
  assert.deepEqual([...setPartsAt(frames, K, 6)], ['transform']);
  assert.deepEqual(lifeAt(frames, K, 9), [0, 6, 12]);
});

test('a part fades between the key frames that set it, eased by the first, across one that did not', () => {
  const frames = ball({ 0: 'easeIn', 6: 'easeOut' });
  const blue = withShape(transformed(RED, translation(0, 24)), { fill: '#0000ff' });
  frames[12].changes.set(K, cellState(blue, 0, 0));
  frames[12].parts = new Map([[K, new Set(['transform', 'fill'])]]);
  for (const at of [3, 6, 9]) assert.equal(shapeAt(frames, K, at).fill, tweenPart('fill', RED, blue, ease('easeIn', at / 12)).fill, `frame ${at}`);
  assert.equal(shapeAt(frames, K, 6).m[5], 12);
  assert.equal(shapeAt(frames, K, 9).m[5], 12 + 12 * ease('easeOut', 0.5));
  assert.equal(shapeAt(frames, K, 12).fill, '#0000ff');
});

test("each part tweens over its own keys: another part's key between changes nothing", () => {
  const frames = Array.from({ length: 13 }, (_, i) => newFrame(i ? 'blank' : 'wipe'));
  const bent = withShape(RED, { points: RED.points.map((p, j) => (j ? p : [p[0] - 6, ...p.slice(1)])) });
  frames[0].changes.set(K, cellState(RED, 0, 0));
  frames[6].changes.set(K, cellState(bent, 0, 0));
  frames[6].parts = new Map([[K, new Set(['outline'])]]);
  frames[12].changes.set(K, cellState(transformed(RED, translation(22, 0)), 0, 0));
  frames[0].tweens = new Map([[K, new Map([['transform', 'easeInOut'], ['outline', 'linear']])]]);
  frames[6].tweens = new Map([[K, new Map([['outline', 'linear']])]]);
  for (let i = 0; i <= 12; i++) {
    close(shapeAt(frames, K, i).m[4], 22 * ease('easeInOut', i / 12));
    close(shapeAt(frames, K, i).points[0][0], RED.points[0][0] - (i <= 6 ? i : 12 - i));
  }
});

test('a part with no easing on its key holds, then jumps', () => {
  const frames = ball({ 6: 'linear' }); // the Transform eased from 6; nothing from 0
  frames[12].changes.set(K, cellState(withShape(transformed(RED, translation(0, 24)), { fill: '#0000ff' }), 0, 0));
  frames[12].parts = new Map([[K, new Set(['transform', 'fill'])]]);
  for (const at of [3, 6, 9, 11]) assert.equal(shapeAt(frames, K, at).fill, '#ff0000', `frame ${at}`);
  assert.equal(shapeAt(frames, K, 12).fill, '#0000ff');
  assert.equal(shapeAt(frames, K, 3).m[5], 0);
  assert.equal(shapeAt(frames, K, 9).m[5], 18);
});

test("motion snaps the Transform by its own key's motion", () => {
  const plain = moving('cells', 'linear');
  plain[6].changes.set('v:a', cellState(transformed(A, translation(5, 24)), 0, 0));
  const keyed = moving('cells', 'linear');
  keyed[6].changes = plain[6].changes;
  keyed[3].changes.set('v:a', cellState(withShape(A, { fill: '#0000ff' }), 0, 0));
  keyed[3].parts = new Map([['v:a', new Set(['fill'])]]);
  for (let i = 1; i < 6; i++) assert.deepEqual(shapeAt(keyed, 'v:a', i).m, shapeAt(plain, 'v:a', i).m, `frame ${i}`);
  assert.equal(shapeAt(keyed, 'v:a', 1).m[4], 1); // 0.8333, snapped to whole cells
});

test("tweenBands merges the parts' tweens", () => {
  const frames = Array.from({ length: 13 }, (_, i) => newFrame(i ? 'blank' : 'wipe'));
  frames[0].changes.set(K, cellState(RED, 0, 0));
  for (const [at, fill] of [[4, '#0000ff'], [8, '#00ff00']]) {
    frames[at].changes.set(K, cellState(withShape(RED, { fill }), 0, 0));
    frames[at].parts = new Map([[K, new Set(['fill'])]]);
  }
  frames[12].changes.set(K, cellState(transformed(RED, translation(0, 24)), 0, 0));
  frames[0].tweens = new Map([[K, eased('linear', ['transform', 'fill'])]]);
  frames[8].tweens = new Map([[K, eased('linear', ['fill'])]]);
  assert.deepEqual(tweenBands(frames, K), [{ from: 0, to: 12 }]);
  frames[0].tweens = new Map([[K, eased('linear', ['fill'])]]);
  assert.deepEqual(tweenBands(frames, K), [{ from: 0, to: 4 }, { from: 8, to: 12 }]);
});

test("strayEasings finds an easing on a part's last key, or on a part its frame doesn't set", () => {
  const frames = ball();
  frames[0].tweens = new Map([[K, eased('linear', ['transform', 'fill'])]]); // the fill has no key after 0
  frames[6].tweens = new Map([[K, eased('linear', ['transform', 'outline'])]]); // 6 sets only the Transform
  frames[12].tweens = new Map([[K, eased('easeIn', ['transform'])]]); // the last
  assert.deepEqual(strayEasings(frames, K), [{ at: 0, part: 'fill' }, { at: 6, part: 'outline' }, { at: 12, part: 'transform' }]);
  frames[3].tweens = new Map([[K, eased('linear')]]); // left on a frame that isn't a key frame: no tween's, and none counted
  assert.equal(strayEasings(frames, K).length, 3);
});

test("a shape's first key frame, and a Duplicate, set every part", () => {
  const frames = ball();
  frames[0].changes.delete(K);
  assert.deepEqual(shapeAt(frames, K, 6), frames[6].changes.get(K).cell);
  assert.equal(setPartsAt(frames, K, 6).size, 7);
  const dup = ball();
  dup[6].kind = 'duplicate';
  dup[0].changes.set(K, cellState(withShape(RED, { fill: GRADIENT }), 0, 0));
  assert.equal(shapeAt(dup, K, 9).fill, '#ff0000'); // frame 0's fill doesn't reach past the Duplicate
  assert.equal(setPartsAt(dup, K, 6).size, 7);
});

test("a shape first on a later frame shows itself, whatever another shape's key frames do", () => {
  const frames = ball(), late = rectShape(10, 10, 14, 14, { fill: '#00ff00' });
  frames[6].changes.set('v:late', cellState(late, 0, 0));
  frames[0].changes.set(K, cellState(withShape(RED, { fill: GRADIENT }), 0, 0));
  for (const at of [6, 9, 12]) assert.deepEqual(shapeAt(frames, 'v:late', at), late, `frame ${at}`);
  assert.equal(shapeAt(frames, 'v:late', 3), null);
});

test('a change can reach back to the first key frame of a shape with tweens or parts', () => {
  const faded = ball({ 0: 'easeIn', 6: 'easeOut' });
  assert.equal(tweenReach(faded, 12), 1);
  const plain = ball();
  for (const frame of plain) frame.parts = null;
  assert.equal(tweenReach(plain, 12), 12);
});

test('every shape on a frame worked out from its parts or a tween', () => {
  const frames = ball({ 0: 'linear' });
  assert.equal(workedOutAt(frames, 3).get(K).m[5], 6);
  assert.equal(workedOutAt(frames, 9).get(K).m[5], 12);
});

test('Elastic springs past its end and settles there', () => {
  assert.ok(EASINGS.includes('elastic'));
  assert.equal(ease('elastic', 0), 0);
  assert.equal(ease('elastic', 1), 1);
  close(ease('elastic', 0.1), 1.25); // past the end
  close(ease('elastic', 0.5), 1.015625);
});

test('going past the end key frame keeps a stroke width and gradient stops a shape can have', () => {
  const thick = withShape(RED, { width: 4, fill: { type: 'linear', stops: [[0.2, '#ff0000'], [0.9, '#0000ff']], m: [1, 0, 0, 1, 0, 0] } });
  const thin = withShape(RED, { width: 1, fill: { type: 'linear', stops: [[0, '#ff0000'], [1, '#0000ff']], m: [1, 0, 0, 1, 0, 0] } });
  assert.equal(tweenPart('width', thick, thin, 1.5).width, 0);
  assert.deepEqual(tweenPart('fill', thick, thin, 1.5).fill.stops.map(([o]) => o), [0, 1]);
  assert.deepEqual(tweenPart('fill', thin, thick, -0.5).fill.stops.map(([o]) => o), [0, 1]);
});

// scene's tween moving as motion says (frame.motions, on the frame it starts from).
const moving = (motion, easing = 'easeIn') => {
  const frames = scene(easing);
  frames[0].motions = new Map([['v:a', motion]]);
  return frames;
};

test('a tween can move a shape by whole cells or half cells, from where its key frame has it', () => {
  const frames = moving('cells', 'linear'); // down 24 over frames 0 to 6
  frames[6].changes.set('v:a', cellState(transformed(A, translation(5, 24)), 0, 0));
  const smooth = scene('linear');
  smooth[6].changes = frames[6].changes;
  assert.equal(shapeAt(smooth, 'v:a', 1).m[4], 0.8333); // smooth, as before
  assert.deepEqual([shapeAt(frames, 'v:a', 1).m[4], shapeAt(frames, 'v:a', 1).m[5]], [1, 4]);
  assert.equal(shapeAt(scene('easeIn'), 'v:a', 3).m[5], 3);
  assert.equal(shapeAt(moving('cells'), 'v:a', 3).m[5], 4); // a cell is two pixels tall
  assert.equal(shapeAt(moving('half'), 'v:a', 3).m[5], 3);
  assert.equal(shapeAt(moving('cells'), 'v:a', 1).m[5], 0);
  assert.equal(shapeAt(moving('cells'), 'v:a', 6).m[5], 24); // a key frame is where it was put
  assert.equal(workedOutAt(moving('cells'), 3).get('v:a').m[5], 4);
  assert.equal(tweenedAt(moving('cells'), 3).get('v:a').shape.m[5], 4);
  assert.equal(transformKeys(moving('cells'), 3)[0].motion, 'cells');
  assert.equal(transformKeys(scene('easeIn'), 3)[0].motion, 'smooth');
});

test('each tween moves as its own motion says: one snapped, the next smooth', () => {
  const frames = moving('cells', 'linear');
  frames[6].changes.set('v:a', cellState(transformed(A, translation(0, 21)), 0, 0)); // down 21 over frames 0 to 6
  frames[8].changes.set('v:a', cellState(transformed(A, translation(0, 26)), 0, 0)); // and 5 more over frames 6 to 8
  frames[6].tweens = new Map([['v:a', eased('linear')]]);
  assert.equal(shapeAt(frames, 'v:a', 5).m[5], 18); // 17.5, snapped to whole cells
  assert.equal(shapeAt(frames, 'v:a', 7).m[5], 23.5); // smooth
});

test('a shape turning as it moves is snapped by where its middle goes', () => {
  const frames = scene('linear');
  frames[6].changes.set('v:a', cellState(transformed(transformed(A, rotation(Math.PI / 2, 2, 2)), translation(0, 18)), 0, 0));
  frames[0].motions = new Map([['v:a', 'cells']]);
  const m = shapeAt(frames, 'v:a', 1).m;
  close(m[0] * 2 + m[2] * 2 + m[4], 2); // its middle, (2, 2), down 3 rounded to 4: whole cells
  close(m[1] * 2 + m[3] * 2 + m[5], 6);
});
