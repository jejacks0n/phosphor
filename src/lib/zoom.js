// The zoom ranges: PIXEL zooms in 1 to 16 (pixels per grid pixel); the ANSI view (VECTOR's too) 25% to 800% of
// its cell size; a room's art, as a watcher sees it, 25% to 100%.
export const ANSI_ZOOM_MIN = 0.25;
export const ANSI_ZOOM_MAX = 1;
export const VIEW_ZOOM_MAX = 8;
export const PIXEL_ZOOM_START = 5; // the zoom PIXEL opens at, and Cmd/Ctrl+0's there (100% is the ANSI view's)

export const clampZoom = (z) => Math.max(1, Math.min(16, z));
export const clampAnsiZoom = (z) => Math.max(ANSI_ZOOM_MIN, Math.min(ANSI_ZOOM_MAX, z));
export const clampViewZoom = (z) => Math.max(ANSI_ZOOM_MIN, Math.min(VIEW_ZOOM_MAX, z));

// The Zoom tool's drag, dx px from where it began: a view's whole range is 1500 px either way (PIXEL's
// is a hundredth a pixel).
export const dragZoom = (from, dx, clamp) => clamp(from + dx * ((clamp(Infinity) - clamp(-Infinity)) / 1500));
// The ANSI view's, by ratios across its range (25% to 800%, 32 times): 300 px halves or doubles it.
export const dragViewZoom = (from, dx) => clampViewZoom(from * (VIEW_ZOOM_MAX / ANSI_ZOOM_MIN) ** (dx / 1500));
// The Zoom tool's click: the next power of two up (out: down) inside the range, from a zoom between steps too (130%
// goes to 200%, or out to 100%). A zoom a hair off a step, from a drag's or a wheel's rounding, counts as on it.
export const stepZoom = (from, out, clamp) => {
  const n = Math.log2(from);
  return clamp(2 ** (out ? Math.ceil(n - 1e-6) - 1 : Math.floor(n + 1e-6) + 1));
};
