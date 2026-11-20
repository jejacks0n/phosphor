// The hang mark: the plugin whose solver is running its first whole resolve of a visit, kept in the browser until it
// ends. A page that froze there leaves the mark behind, and the next visit's plugin store reads it (hungLastTime). The
// browser may keep nothing (a private window): then there's no mark, and nothing breaks.
export const HANG_KEY = 'phosphor.pluginRunning';

export function beginRun(pluginId) {
  try {
    localStorage.setItem(HANG_KEY, pluginId);
  } catch { /* nothing kept */ }
}

export function endRun() {
  try {
    localStorage.removeItem(HANG_KEY);
  } catch { /* nothing kept */ }
}

// The plugin that was running when the last visit ended, or null; the mark is cleared.
export function hungLastTime() {
  try {
    const pluginId = localStorage.getItem(HANG_KEY);
    localStorage.removeItem(HANG_KEY);
    return pluginId;
  } catch {
    return null;
  }
}
