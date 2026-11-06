// The Keys panel's lanes, frame against x. While every frame fits at a usable width they line up with the scrubber's
// marks: frame i where the range's thumb stops for it, its travel half a thumb short of each end. Past that they're a
// window, px a frame, scrolled along a strip as long as the frames, with the same half thumb at each end.

export const MIN_FRAME_PX = 14, MIN_FRAME_PX_PHONE = 20; // usable: a diamond apart, or a fingertip
export const MOST_FRAME_PX = 60;

// { fits, px, scroll, first, last, fit } and what it was made of. zoom is px a frame (null: fit, at least minPx); a
// zoom that's no wider than fitting fits. first and last are the frames in view.
export function laneLayout({ count, width, thumb, zoom, scroll, minPx }) {
  const fit = count > 1 ? (width - thumb) / (count - 1) : 0;
  const px = Math.max(zoom ?? minPx, fit);
  if (count < 2 || px === fit) return { count, width, thumb, minPx, fit, fits: true, px: fit, scroll: 0, first: 0, last: Math.max(0, count - 1) };
  scroll = Math.min(Math.max(scroll, 0), (count - 1) * px + thumb - width);
  return { count, width, thumb, minPx, fit, fits: false, px, scroll,
    first: Math.max(0, Math.ceil(scroll / px - 1e-6)), last: Math.min(count - 1, Math.floor((scroll + width - thumb) / px + 1e-6)) }; // a frame at an edge is in
}

export const xOf = (i, layout) => layout.thumb / 2 + i * layout.px - layout.scroll;
export const frameAt = (x, layout) => (layout.px ? Math.min(Math.max(Math.round((x + layout.scroll - layout.thumb / 2) / layout.px), 0), layout.count - 1) : 0);

// Frame numbers every 1, 5 or 10 frames, as tight as they are.
export const labelEvery = (px) => (px >= 14 ? 1 : px >= 4 ? 5 : 10);

// The zoom times factor, { zoom, scroll }, with the spot under x where it was. Out as far as fitting, it fits again.
export function zoomAround(layout, factor, x) {
  const zoom = Math.max(Math.min(layout.px * factor, Math.max(MOST_FRAME_PX, layout.fit)), layout.fit);
  if (zoom === layout.fit && layout.fit >= layout.minPx) return { zoom: null, scroll: 0 };
  const at = (layout.scroll + x - layout.thumb / 2) / layout.px;
  return { zoom, scroll: layout.thumb / 2 + at * zoom - x };
}
