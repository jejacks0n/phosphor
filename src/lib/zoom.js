// The zoom ranges: PIXEL zooms in 1 to 16 (pixels per grid pixel), ANSI out to 25% of its cell size.
export const ANSI_ZOOM_MIN = 0.25;
export const ANSI_ZOOM_MAX = 1;

export const clampZoom = (z) => Math.max(1, Math.min(16, z));
export const clampAnsiZoom = (z) => Math.max(ANSI_ZOOM_MIN, Math.min(ANSI_ZOOM_MAX, z));
