/**
 * Followers placed on their paths, and guides dropped from what's drawn: one pass over a frame's shapes (key to
 * shape), after every shape on it is worked out, since a follower's place depends on another shape there.
 *
 * placeFollowers(shapes, aspect) gives the shapes with each follower (a record with `follow`) moved onto its path, or the same
 * Map when nothing changes. A follower's path is the shape `follow.key` names, if it's there, has an outline (no art
 * layer) and follows nothing itself (no chains); with none, the follower is left as it is, on its own Transform.
 *   where   the share of the path's length: its Start or End riding one (follow.ride), held to 0..1, else the
 *           follower's own Along, held to 0..1 on an open path, around and around a closed one
 *   center  (centerOf) a shape's: the middle of its own box through its m (the Keys panel's X and Y); an art layer's: its box's
 *           middle, its corner then on whole cells
 *   motion  follow.motion snaps the center to half or whole cells
 *   face    a shape turned by the path's direction there about its center, on top of its own turn: the direction and
 *           the turn as they are on screen, where a grid pixel is aspect as tall as it's wide
 * A placed record is kept per (follower record, path record), with its aspect: records are frozen and replaced on
 * change, so the same pair gives the same object and ShapeLayer sees no change.
 * shownShapes(shapes, aspect) is that with guides then left out: what's drawn. placedShapes(project) is a store's shapes placed,
 * guides kept: what VECTOR shows (its overlay, hits, boxes, the Keys panel's values); edits change the records themselves.
 */
import { allClosed, apply, localBounds, multiply, rotation, transformed, translation } from './shapes.js';
import { isArt } from './artLayers.js';
import { measure } from './pathLength.js';
import { snapPoint } from '../lib/vectorSnap.js';

const placedOf = new WeakMap(); // follower record -> WeakMap(path record -> { aspect, out })

function shareOf(shape, path) {
  const ride = shape.follow.ride, s = ride === 'start' ? path.start ?? 0 : ride === 'end' ? path.end ?? 1 : shape.along ?? 0;
  if (ride || !allClosed(path)) return Math.min(Math.max(s, 0), 1); // a tip past an end is drawn at it (trimmedPath)
  return s < 0 || s > 1 ? s - Math.floor(s) : s; // 1 stays 1: a closed path's end, turned as it comes around
}

export function centerOf(shape) {
  if (isArt(shape)) return { x: shape.m[4] + shape.art.cols / 2, y: shape.m[5] + shape.art.rows };
  const { x0, y0, x1, y1 } = localBounds(shape);
  return apply(shape.m, (x0 + x1) / 2, (y0 + y1) / 2);
}

function place(shape, path, aspect) {
  let byPath = placedOf.get(shape);
  if (!byPath) placedOf.set(shape, byPath = new WeakMap());
  const held = byPath.get(path);
  if (held?.aspect === aspect) return held.out;
  const point = measure(path).at(shareOf(shape, path)), to = snapPoint(point, shape.follow.motion), from = centerOf(shape);
  let w = translation(to.x - from.x, to.y - from.y);
  if (shape.follow.face && !isArt(shape)) {
    const angle = aspect === 1 ? point.angle : Math.atan2(Math.sin(point.angle) * aspect, Math.cos(point.angle)); // on screen
    w = multiply(rotation(angle, to.x, to.y, aspect), w);
  }
  const out = transformed(shape, w); // an art layer's corner lands on whole cells (makeArt)
  byPath.set(path, { aspect, out });
  return out;
}

export function placeFollowers(shapes, aspect = 1) {
  let out = shapes;
  for (const [key, shape] of shapes) {
    const path = shape.follow && shapes.get(shape.follow.key);
    if (!path || isArt(path) || path.follow) continue;
    if (out === shapes) out = new Map(shapes);
    out.set(key, place(shape, path, aspect));
  }
  return out;
}

export const placedShapes = (project) => placeFollowers(project.shapes, project.pixelAspect);

export function shownShapes(shapes, aspect = 1) {
  const placed = placeFollowers(shapes, aspect);
  let out = placed;
  for (const [key, shape] of placed) {
    if (!shape.guide) continue;
    if (out === placed) out = new Map(placed);
    out.delete(key);
  }
  return out;
}
