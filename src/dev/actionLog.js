// A log of every step taken this session, in every build, for a bug report: an issue report sends it if the person says
// so (components/IssueReportDialog.vue), and the side panel's HISTORY tab shows it (components/dev/HistoryPanel.vue; in
// development, or once phosphor.history(true) has been run: dev/historyTab.js). Every store action is a step, so a
// Pinia plugin records them: a top-level action only (the ones it calls through `this` are its own business, until it
// returns; an async one's continuation after an await is a new top level, so a step during a long open still shows),
// none of the names in `skip` (queries, render internals, what autosave calls on its own), a repeat of the last line
// folded into it with a count (a stroke's per-move calls; see folds), and arguments summarized, never kept. A store
// named in `namesOnly` (the SOCIAL stores: dev/skipped.js) is logged by its actions' names alone, with nothing of what
// they were given: a password, an email address, a code, a line of chat. Window errors are lines too, the first
// MOST_ERROR characters of each. The newest LIMIT lines stay. It's kept in memory only, and goes with the page.
import { shallowReactive, toRaw } from 'vue';

export const LIMIT = 2000;
const MOST_TEXT = 40; // of a string argument
const MOST_KEYS = 8; // of a plain object's
const MOST_ERROR = 200; // of an error's message

// Each entry: { at (ms since the log started), kind: 'action' | 'error', text ('project.paintStroke', or the error's
// message), args ('("brush")', or ''), first (the args of the first of a folded run), count }. Entries are replaced, never
// changed in place, so a shallow watch sees them.
export const log = shallowReactive({ entries: [], start: performance.now() });

let busy = false;

export function installActionLog(pinia, skip = new Set(), namesOnly = new Set()) {
  pinia.use(({ store }) => {
    store.$onAction(({ name, args, after, onError }) => {
      if (busy) return;
      busy = true; // a skipped one's too: what it calls is its own business
      const done = () => { busy = false; };
      after(done); // a sync action: when it returns, so the next action in the same handler is its own line
      onError(done);
      queueMicrotask(done); // an async one: its continuation is a new top level
      if (!skip.has(name)) record(store.$id, name, args.length && !namesOnly.has(store.$id) ? `(${args.map(summarize).join(', ')})` : ''); // before it runs: a throw still leaves its line
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
  const text = String(message);
  push('error', text.length > MOST_ERROR ? `${text.slice(0, MOST_ERROR)}…` : text, '');
}

// A repeat of the last line folds into it with a count. Its arguments are the latest; when they're scalars that changed
// (a zoom's notches, this tool then that), the first ones too: (1 → 2.5), ("brush" → "pencil"). Collections (a stroke's
// pixels, a shape's fields) are the per-move calls' and show the latest alone.
// The list is read here unwatched (toRaw): an action is often called from inside a screen's computed value or its
// render, and a list read there would be that computation's dependency, which the line written a moment later would
// then run again, logging another line, without end. Development stops such a loop after a hundred turns; a built app
// doesn't, and froze. Writing still tells whoever shows the log.
function push(kind, text, args) {
  const { entries, start } = toRaw(log);
  const at = performance.now() - start, last = entries.at(-1);
  if (last && last.kind === kind && last.text === text) {
    const shown = args === last.first || /[[{]|\w\(\d/.test(args) ? args : `(${last.first.slice(1, -1)} → ${args.slice(1, -1)})`;
    log.entries = [...entries.slice(0, -1), { ...last, at, args: shown, count: last.count + 1 }];
    return;
  }
  log.entries = [...entries.slice(-(LIMIT - 1)), { at, kind, text, args, first: args, count: 1 }];
}

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
