// The zoom ranges: PIXEL zooms in 1 to 16 (pixels per grid pixel); the ANSI view (VECTOR's too) 25% to 800% of
// its cell size; a room's art, as a watcher sees it, 25% to 100%.
export const ANSI_ZOOM_MIN = 0.25;
export const ANSI_ZOOM_MAX = 1;
export const VIEW_ZOOM_MAX = 8;

export const clampZoom = (z) => Math.max(1, Math.min(16, z));
export const clampAnsiZoom = (z) => Math.max(ANSI_ZOOM_MIN, Math.min(ANSI_ZOOM_MAX, z));
export const clampViewZoom = (z) => Math.max(ANSI_ZOOM_MIN, Math.min(VIEW_ZOOM_MAX, z));

// The Zoom tool's drag, dx px from where it began: a view's whole range is 1500 px either way (PIXEL's
// is a hundredth a pixel).
export const dragZoom = (from, dx, clamp) => clamp(from + dx * ((clamp(Infinity) - clamp(-Infinity)) / 1500));
// The ANSI view's, by ratios across its range (25% to 800%, 32 times): 300 px halves or doubles it.
export const dragViewZoom = (from, dx) => clampViewZoom(from * (VIEW_ZOOM_MAX / ANSI_ZOOM_MIN) ** (dx / 1500));
