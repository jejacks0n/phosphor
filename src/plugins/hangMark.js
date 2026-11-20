// The hang mark: the plugin whose script is running its import or a first whole resolve of a visit, kept in the browser
// until it ends, with the page that runs it. A page that froze there leaves the mark behind, and the next plugin store
// to load reads it (hungLastTime). Tabs and the desktop app's windows share the mark, so a page holds a Web Lock named
// after itself for its life: a mark whose page still holds its lock is that page at work, not a hang. The browser may
// keep nothing (a private window): then there's no mark, and nothing breaks.
export const HANG_KEY = 'phosphor.pluginRunning';

const PAGE = globalThis.crypto?.randomUUID?.() ?? String(Math.random());
const lockOf = (page) => `phosphor.page.${page}`;
// Never released: the browser lets it go when the page goes.
try {
  globalThis.navigator?.locks?.request(lockOf(PAGE), () => new Promise(() => {}));
} catch { /* no locks: every mark left is read as a hang, as before */ }

const read = () => {
  const raw = localStorage.getItem(HANG_KEY);
  if (raw === null) return null;
  try {
    const { pluginId, page } = JSON.parse(raw);
    return { raw, pluginId: String(pluginId), page: page ?? null };
  } catch {
    return { raw, pluginId: raw, page: null }; // an earlier Phosphor's mark: the plugin id alone
  }
};

export function beginRun(pluginId) {
  try {
    localStorage.setItem(HANG_KEY, JSON.stringify({ pluginId, page: PAGE }));
  } catch { /* nothing kept */ }
}

// Only this page's own mark is cleared: another page's run goes on.
export function endRun() {
  try {
    if (read()?.page === PAGE) localStorage.removeItem(HANG_KEY);
  } catch { /* nothing kept */ }
}

async function pageAlive(page) {
  if (!page || !globalThis.navigator?.locks) return false;
  try {
    const { held = [], pending = [] } = await navigator.locks.query();
    return [...held, ...pending].some(({ name }) => name === lockOf(page));
  } catch {
    return false;
  }
}

// The plugin that was running when a page that's gone ended, or null; that mark is cleared. A mark of a page still open
// is left as it is.
export async function hungLastTime() {
  try {
    const mark = read();
    if (!mark || (await pageAlive(mark.page))) return null;
    if (localStorage.getItem(HANG_KEY) === mark.raw) localStorage.removeItem(HANG_KEY); // unless another page marked since
    return mark.pluginId;
  } catch {
    return null;
  }
}
