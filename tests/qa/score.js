// The keyboard score: of the steps a person takes, how many can be done from the keys.

export const MARKS = { keys: 1, keysLong: 0, mouse: 0 };

// Times in ms that a person notices: a response to a key, a frame while dragging, a long frame, a
// setting's change, opening a file.
export const BUDGETS = { response: 100, frame: 33, longFrame: 50, setting: 250, file: 2000 };

// A step is rated `keys` (three keystrokes or fewer), `keysLong` (a keyboard way, but longer) or `mouse` (no
// keyboard way). A path longer than three keystrokes isn't a path a person would use, so `keysLong` earns
// nothing; it's kept apart from `mouse` so the to-do list tells "make it shorter" from "add one".
export function keyboardScore(steps) {
  const rated = steps.filter((step) => step.rated);
  for (const step of rated) {
    if (!Object.hasOwn(MARKS, step.how)) throw new Error(`step "${step.name}" is rated but has no rating`);
  }
  if (!rated.length) return { score: null, rated: 0, costs: [] };
  const marks = rated.reduce((sum, step) => sum + MARKS[step.how], 0);
  const costs = ['mouse', 'keysLong'].flatMap((how) => rated
    .filter((step) => step.how === how)
    .map((step) => ({ step: step.name, how, want: step.want })));
  return { score: Math.round(100 * marks / rated.length), rated: rated.length, costs };
}

// A warning when a step rated for the keys had no key events counted on the way, or null.
export function eventCheck(step) {
  const { keys = 0, pointers = 0 } = step.events || {};
  if ((step.how === 'keys' || step.how === 'keysLong') && !keys) {
    return `Rated ${step.how} but no keys reached the page (${pointers} pointer events).`;
  }
  return null;
}
