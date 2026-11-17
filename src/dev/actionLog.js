// Development only: a log of every step taken this session, for a bug report (the side panel's HISTORY tab,
// components/dev/HistoryPanel.vue). Every store action is a step, so a Pinia plugin records them: a top-level action
// only (the ones it calls through `this` are its own business, until it returns; an async one's continuation after an await is a new
// top level, so a step during a long open still shows), none of the names in `skip` (queries, render internals, what
// autosave calls on its own), a repeat of the last line folded into it with a count (a stroke's per-move calls; see folds), and
// arguments summarized, never kept. Window errors are lines too. The newest LIMIT lines stay.
import { shallowReactive } from 'vue';

export const LIMIT = 2000;
const MOST_TEXT = 40; // of a string argument
const MOST_KEYS = 8; // of a plain object's

// Each entry: { at (ms since the log started), kind: 'action' | 'error', text ('project.paintStroke', or the error's
// message), args ('("brush")', or ''), count }. Entries are replaced, never changed in place, so a shallow watch sees them.
export const log = shallowReactive({ entries: [], start: performance.now() });

let busy = false;

export function installActionLog(pinia, skip = new Set()) {
  pinia.use(({ store }) => {
    store.$onAction(({ name, args, after, onError }) => {
      if (busy) return;
      busy = true; // a skipped one's too: what it calls is its own business
      const done = () => { busy = false; };
      after(done); // a sync action: when it returns, so the next action in the same handler is its own line
      onError(done);
      queueMicrotask(done); // an async one: its continuation is a new top level
      if (!skip.has(name)) record(store.$id, name, args.length ? `(${args.map(summarize).join(', ')})` : ''); // before it runs: a throw still leaves its line
    });
  });
  if (typeof window !== 'undefined') {
    window.addEventListener('error', (e) => recordError(e.message));
    window.addEventListener('unhandledrejection', (e) => recordError(e.reason?.message ?? e.reason));
  }
}

export function record(store, name, args) {
  push('action', `${store}.${name}`, args);
}

export function recordError(message) {
  push('error', String(message), '');
}

function push(kind, text, args) {
  const at = performance.now() - log.start, last = log.entries.at(-1);
  if (last && last.kind === kind && last.text === text && folds(args, last.args)) {
    log.entries = [...log.entries.slice(0, -1), { ...last, at, args, count: last.count + 1 }];
    return;
  }
  log.entries = [...log.entries.slice(-(LIMIT - 1)), { at, kind, text, args, count: 1 }];
}

// A repeat folds into the line before it when its arguments are the same, or hold a collection (a stroke's pixels, a
// shape's fields: the per-move calls). A different scalar is a step of its own: this tool, then that one.
const folds = (args, before) => args === before || /[[{]|\w\(\d/.test(args);

export function clearLog() {
  log.entries = [];
}

// One value as a few characters: what it was, never what it held.
export function summarize(value) {
  if (value === null || value === undefined) return String(value);
  if (typeof value === 'string') return value.length > MOST_TEXT ? `${JSON.stringify(value.slice(0, MOST_TEXT)).slice(0, -1)}…` : JSON.stringify(value);
  if (typeof value === 'function') return 'fn';
  if (typeof value !== 'object') return String(value);
  if (ArrayBuffer.isView(value)) return `${value.constructor.name}(${value.length ?? value.byteLength})`;
  if (Array.isArray(value)) return `[${value.length}]`;
  if (value.constructor && value.constructor !== Object) return value.constructor.name;
  const keys = Object.keys(value);
  return `{${keys.slice(0, MOST_KEYS).join(', ')}${keys.length > MOST_KEYS ? '…' : ''}}`;
}

// The whole log as text, headed by the build, browser and viewport, one line per entry.
export function logText({ version, sha, userAgent, viewport }) {
  const lines = log.entries.map(({ at, kind, text, args, count }) => {
    const step = kind === 'error' ? `error  ${text}` : text;
    return `+${(at / 1000).toFixed(1)}s  ${step}${count > 1 ? ` ×${count}` : ''}${args ? ` ${args}` : ''}`;
  });
  return [`Phosphor ${version} (${sha})`, userAgent, viewport, '', ...lines].join('\n');
}
