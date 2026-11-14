// The renderer's only door to the desktop app's main process: window.phosphorDesktop, from desktop/preload.cjs (the
// room service, quitting, the menu bar, files opened and saved, the releases to update to, and returnWithinMs, which
// only the end-to-end tests set). Null in the web build. Browser tests put a fake in its place with useFakeDesktop,
// and take it out with resetDesktop.
const real = globalThis.window?.phosphorDesktop ?? null;

export let desktop = real;
export const useFakeDesktop = (fake) => { desktop = fake; };
export const resetDesktop = () => { desktop = real; };

// A file the main process read ({ path, name, bytes }) as one chosen in the page: a picture typed by its extension, as
// a browser's chooser types it, and desktopPath saying where it is, for Save to write a project back there.
const TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', avif: 'image/avif', svg: 'image/svg+xml' };
export const fileFrom = ({ path, name, bytes }) => {
  const type = TYPES[name.split('.').pop().toLowerCase()] ?? '';
  return Object.assign(new File([bytes], name, { type }), { desktopPath: path });
};
