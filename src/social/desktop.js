// The renderer's only door to the desktop app's main process: window.phosphorDesktop, from desktop/preload.cjs
// (startService, serviceInfo, stopService, onQuit, quitReady, and returnWithinMs, which only the end-to-end tests set).
// Null in the web build. Browser tests put a fake in its place with useFakeDesktop, and take it out with resetDesktop.
const real = globalThis.window?.phosphorDesktop ?? null;

export let desktop = real;
export const useFakeDesktop = (fake) => { desktop = fake; };
export const resetDesktop = () => { desktop = real; };
