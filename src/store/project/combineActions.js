import { eachSide } from '@/lib/mirror.js';

// The project store's actions as written (and guarded), before Pinia wraps them, for readsOf (shared.js): ProjectStore.js
// fills it. Here, not in shared.js, which imports what imports the store: kept there, it wasn't made yet when the store was.
export const plainActions = {};

// The project store's actions, merged from groups of methods (one file per area, in this folder). A
// name in two groups is an error: with a plain spread, one would silently replace the other.
export function combineActions(...groups) {
  const actions = {};
  for (const group of groups) {
    for (const name of Object.keys(group)) {
      if (name in actions) throw new Error(`Duplicate store action: ${name}`);
      actions[name] = group[name];
    }
  }
  return actions;
}

// Wraps the named actions so they do nothing while refuse(store) is true. Actions call each other through
// the store, so this holds for a call from another action too.
export function guarded(actions, names, refuse) {
  const wrapped = { ...actions };
  for (const name of names) {
    const action = actions[name];
    if (!action) throw new Error(`No store action to guard: ${name}`);
    wrapped[name] = function (...args) {
      return refuse(this) ? undefined : action.apply(this, args);
    };
  }
  return wrapped;
}

// Wraps the named actions ({ name: 'pixels' | 'cells' }: what their first argument is) so that, under the store's
// mirror mark, each also runs for the copies of that argument (lib/mirror.js eachSide). A write they make through the
// store while doing so is plain, so only the outermost one mirrors.
export function mirrored(actions, kinds) {
  const wrapped = { ...actions };
  for (const [name, kind] of Object.entries(kinds)) {
    const action = actions[name];
    if (!action) throw new Error(`No store action to mirror: ${name}`);
    wrapped[name] = function (...args) {
      let result;
      eachSide(this, args[0], (items) => { result = action.apply(this, [items, ...args.slice(1)]) ?? result; }, kind);
      return result;
    };
  }
  return wrapped;
}
