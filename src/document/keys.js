// Keys as data: each part's keys (parts.js) in a shape's life (tweens.js), what's listed, how far keys may move, and what
// moving, deleting or adding one changes. A ref is { part, at }, at a frame index. A patch maps a frame index to the
// frame's new { changes, tweens, motions, parts }, all new objects: frames are never changed here.
import { EMPTY_STATE, cellState, sameState, withEases } from './frames.js';
import { PARTS, samePart, withParts } from './parts.js';
import { keyFramesOf, lifeAt, setPartsAt, shapeAt, strayEasings } from './tweens.js';

// A key that can't move or go: a Duplicate's, or a Wipe's past the life's start (each holds its own copy of the shape,
// so nothing can carry through it).
const isFixed = (frames, at, start) => frames[at].kind === 'duplicate' || (frames[at].kind !== 'blank' && at !== start);

// The last frame a life shows: the one before the erase, or the Wipe or Duplicate without it, or the movie's last.
function endOf(frames, key, life) {
  let end = life.at(-1);
  while (end + 1 < frames.length && frames[end + 1].kind === 'blank' && !frames[end + 1].changes.has(key)) end++;
  return end;
}

// Each part's keys in a life, in order, part to [{ at, cell, easing, motion }]: cell the frame's shape (holding the
// part's value), easing null on a holding or last key, motion the eased Transform's (smooth on the rest).
function keysIn(frames, key, life) {
  const sets = life.map((at) => setPartsAt(frames, key, at, life));
  return new Map(PARTS.map((part) => {
    const ats = life.filter((_, j) => sets[j].has(part));
    return [part, ats.map((at, j) => {
      const easing = (j < ats.length - 1 && frames[at].tweens?.get(key)?.get(part)) || null;
      return { at, cell: frames[at].changes.get(key).cell, easing, motion: (part === 'transform' && easing && frames[at].motions?.get(key)) || 'smooth' };
    })];
  }));
}

// The life the refs are in: around the earliest (a life seen from a later frame can start at a Wipe in it).
const lifeOf = (frames, key, refs) => (refs.length ? lifeAt(frames, key, Math.min(...refs.map(({ at }) => at))) : []);

// The refs naming a key in rows (keysIn's).
const matching = (refs, rows) => refs.filter(({ part, at }) => rows.get(part)?.some((k) => k.at === at));

// Whether the refs move a part's key: a ref on the start brings every part's key there.
function movingOf(refs, start) {
  const all = refs.some(({ at }) => at === start), named = new Set(refs.map(({ part, at }) => `${part}@${at}`));
  return (part, at) => (all && at === start) || named.has(`${part}@${at}`);
}

// The life around frame i, { start, end, rows }: rows maps every part to its keys, [{ at, easing, motion, fixed }]; or
// null when frame i doesn't show the shape.
export function partKeys(frames, key, i) {
  const life = lifeAt(frames, key, i);
  if (!life.length) return null;
  const start = life[0], rows = new Map();
  for (const [part, row] of keysIn(frames, key, life)) rows.set(part, row.map(({ at, easing, motion }) => ({ at, easing, motion, fixed: isFixed(frames, at, start) })));
  return { start, end: endOf(frames, key, life), rows };
}

// The parts the life around frame i changes, in PARTS order: those whose keys don't all hold one value, and those a
// Blank key frame after the start keys by name.
export function listedParts(frames, key, i) {
  const life = lifeAt(frames, key, i);
  if (!life.length) return [];
  const rows = keysIn(frames, key, life);
  return PARTS.filter((part) => rows.get(part).some(({ at, cell }) => !samePart(cell, rows.get(part)[0].cell, part)
    || (at !== life[0] && frames[at].kind === 'blank' && !!frames[at].parts?.get(key)?.has(part))));
}

// How far the refs' keys may move together, { least, most } (least <= 0 <= most). The start goes back as far as the
// frame after a Wipe, an erase or another life (not at all from a Wipe), and on to a frame short of the next key that
// stays; the rest stay between the start and the life's end, and can't land on or cross a fixed key.
export function moveRange(frames, key, refs) {
  const life = lifeOf(frames, key, refs), start = life[0], rows = life.length ? keysIn(frames, key, life) : null;
  refs = rows ? matching(refs, rows) : [];
  if (!refs.length || refs.some(({ at }) => isFixed(frames, at, start))) return { least: 0, most: 0 };
  const end = endOf(frames, key, life), moves = movingOf(refs, start), fixed = life.filter((at) => isFixed(frames, at, start));
  const startMoves = moves('transform', start);
  let least = -Infinity, most = Infinity;
  if (startMoves) {
    let before = start - 1;
    while (before >= 0 && frames[before].kind === 'blank' && !frames[before].changes.has(key)) before--;
    least = frames[start].kind === 'blank' ? before + 1 - start : 0;
  }
  for (const [part, row] of rows) {
    for (const { at } of row) {
      if (!moves(part, at)) {
        if (startMoves && at > start) most = Math.min(most, at - 1 - start);
        continue;
      }
      most = Math.min(most, end - at);
      if (!startMoves) least = Math.max(least, start - at);
      for (const f of fixed) {
        if (f > at) most = Math.min(most, f - 1 - at);
        else least = Math.max(least, f + 1 - at);
      }
    }
  }
  return { least, most };
}

// frame with key's entries as entry says ({ cell, parts, eases, motion }), or taken off with none: a new object.
function withKey(frame, key, entry) {
  const put = (map, value) => {
    const next = new Map(map ?? []);
    if (value) next.set(key, value);
    else next.delete(key);
    return next.size ? next : null;
  };
  const changes = new Map(frame.changes);
  if (entry) changes.set(key, cellState(entry.cell, 0, 0));
  else changes.delete(key);
  const motion = entry?.motion !== 'smooth' && entry?.motion;
  return { ...frame, changes, tweens: put(frame.tweens, entry?.eases.size && entry.eases), motions: put(frame.motions, motion), parts: put(frame.parts, entry?.parts) };
}

const entryOf = (frame, key) => JSON.stringify([...[frame.tweens, frame.motions, frame.parts].map((map) => {
  const value = map?.get(key);
  return value instanceof Map || value instanceof Set ? [...value].sort() : value ?? null;
})]);

// The patch that gives a life the keys in rows (as keysIn, the part's value from each key's cell). A frame with no key
// left has none of the shape; each key frame holds the whole shape as it shows after, and the last key of each part
// keeps no easing, nor does any key of the shape's elsewhere that no tween uses.
function rewritten(frames, key, life, rows) {
  const next = frames.slice(), own = new Map(); // frame index to its keys, part to key
  for (const [part, row] of rows) {
    row.forEach((k, j) => {
      if (!own.has(k.at)) own.set(k.at, new Map());
      own.get(k.at).set(part, j < row.length - 1 ? k : { ...k, easing: null });
    });
  }
  const start = Math.min(...own.keys());
  for (const at of life) if (!own.has(at)) next[at] = withKey(frames[at], key, null);
  for (const [at, keys] of own) {
    const cell = [...keys].reduce((shape, [part, k]) => withParts(shape, k.cell, [part]), keys.values().next().value.cell);
    const transform = keys.get('transform');
    next[at] = withKey(frames[at], key, {
      cell,
      parts: at === start || frames[at].kind !== 'blank' || keys.size === PARTS.length ? null : new Set(PARTS.filter((part) => keys.has(part))),
      eases: new Map([...keys].filter(([, k]) => k.easing).map(([part, k]) => [part, k.easing])),
      motion: transform?.easing && transform.motion,
    });
  }
  const after = lifeAt(next, key, start), keyed = keyFramesOf(next, key, after); // one life, every key in it: walked once
  for (const [at, keys] of own) next[at].changes.set(key, cellState(withParts(shapeAt(next, key, at, after, keyed), next[at].changes.get(key).cell, [...keys.keys()]), 0, 0));
  for (const { at, part } of strayEasings(next, key)) { // another life's, left by an edit
    const frame = next[at], eases = new Map(frame.tweens.get(key));
    eases.delete(part);
    next[at] = { ...frame, tweens: withEases(frame.tweens, key, eases), motions: eases.has('transform') ? frame.motions : withKey(frame, key, null).motions };
  }
  const patch = new Map();
  next.forEach((frame, at) => {
    const was = frames[at];
    if (frame === was || (sameState(was.changes.get(key) ?? EMPTY_STATE, frame.changes.get(key) ?? EMPTY_STATE) && entryOf(was, key) === entryOf(frame, key))) return;
    patch.set(at, { changes: frame.changes, tweens: frame.tweens, motions: frame.motions, parts: frame.parts });
  });
  return patch;
}

// The refs' keys moved by `by` frames (within moveRange), { patch, refs }: each with its part's value, easing and
// motion, replacing a key of its part where it lands; refs, those naming a key, where they landed. A moved start moves
// the whole shape.
export function movedKeys(frames, key, refs, by) {
  const life = lifeOf(frames, key, refs), rows = life.length ? keysIn(frames, key, life) : null;
  refs = rows ? matching(refs, rows) : [];
  if (!refs.length || !by) return { patch: new Map(), refs };
  const moves = movingOf(refs, life[0]);
  for (const [part, row] of rows) {
    const moved = row.filter(({ at }) => moves(part, at)).map((k) => ({ ...k, at: k.at + by })), landed = new Set(moved.map(({ at }) => at));
    rows.set(part, [...row.filter(({ at }) => !moves(part, at) && !landed.has(at)), ...moved].sort((a, b) => a.at - b.at));
  }
  return { patch: rewritten(frames, key, life, rows), refs: refs.map(({ part, at }) => ({ part, at: at + by })) };
}

// The refs' keys gone, but the start's and fixed ones: each part tweens from the key before to the key after, eased
// as the one before is.
export function deletedKeys(frames, key, refs) {
  const life = lifeOf(frames, key, refs), start = life[0];
  if (!life.length) return new Map();
  const gone = new Set(refs.filter(({ at }) => at !== start && !isFixed(frames, at, start)).map(({ part, at }) => `${part}@${at}`));
  const rows = keysIn(frames, key, life);
  for (const [part, row] of rows) rows.set(part, row.filter(({ at }) => !gone.has(`${part}@${at}`)));
  return rewritten(frames, key, life, rows);
}

// A key for part on frame at, with the value it shows there; inside the part's tween, eased and moving as that tween
// (both halves keep it). Null when the part has a key there, or the frame doesn't show the shape.
export function addedKey(frames, key, part, at) {
  const life = lifeAt(frames, key, at);
  if (!life.length) return null;
  const rows = keysIn(frames, key, life), row = rows.get(part);
  if (row.some((k) => k.at === at)) return null;
  const { easing, motion } = row.findLast((k) => k.at < at);
  rows.set(part, [...row, { at, cell: shapeAt(frames, key, at), easing, motion }].sort((a, b) => a.at - b.at));
  return rewritten(frames, key, life, rows);
}
