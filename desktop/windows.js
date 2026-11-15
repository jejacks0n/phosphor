// The desktop app's windows, as decisions with no Electron in them: which window a file opens in, where a new window
// sits, and the two-phase leave of a quit or a window closing.

// Where the page's own answer to "is anything unsaved" may take before the window counts as unsaved.
export const UNSAVED_ANSWER_MS = 2000;

// The window a file opens in: the one that has it open, else the focused one when it's empty and not claimed by
// something already opening, else none (a new window).
export function fileTarget(windows, focusedId, file) {
  const open = windows.find((w) => w.file !== null && w.file === file);
  if (open) return { id: open.id, existing: true };
  const focused = windows.find((w) => w.id === focusedId);
  if (focused && !focused.hasImage && !focused.claimed) return { id: focused.id, existing: false };
  return { id: null, existing: false };
}

// A new window's bounds: the size clipped to the work area, a step down and right of the focused window's, and back
// at the work area's top left when that would run past its right or bottom edge. With no focused window, no position.
export function cascade(from, workArea, size = { width: 1400, height: 900 }, step = 28) {
  const width = Math.min(size.width, workArea.width);
  const height = Math.min(size.height, workArea.height);
  if (!from) return { width, height };
  let x = from.x + step;
  let y = from.y + step;
  if (x + width > workArea.x + workArea.width || y + height > workArea.y + workArea.height) {
    x = workArea.x;
    y = workArea.y;
  }
  return { x, y, width, height };
}

// Leaving: first every entry says whether it has unsaved work (one that doesn't answer in time counts as unsaved), and
// each that does is asked in turn whether to leave; the first Stay ends it with false and nothing handed over. Then
// every entry is handed over at once, waited for until all are done or withinMs passes, and it's true.
export async function leave(entries, { unsaved, ask, handOver, withinMs, answerWithinMs = UNSAVED_ANSWER_MS }) {
  const answer = (entry) => new Promise((resolve) => {
    const timer = setTimeout(() => resolve(true), answerWithinMs);
    Promise.resolve(unsaved(entry)).then((value) => resolve(value), () => resolve(true)).finally(() => clearTimeout(timer));
  });
  const flags = await Promise.all(entries.map(answer));
  for (const [i, entry] of entries.entries()) {
    if (flags[i] && !(await ask(entry))) return false;
  }
  let timer;
  const limit = new Promise((resolve) => { timer = setTimeout(resolve, withinMs); });
  const all = Promise.allSettled(entries.map((entry) => handOver(entry)));
  await (withinMs === undefined ? all : Promise.race([all, limit]));
  clearTimeout(timer);
  return true;
}
