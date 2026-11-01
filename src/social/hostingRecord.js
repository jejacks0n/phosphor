// What a room's host keeps through a reload, in sessionStorage: it lives through a reload and a crash
// restore and goes with the tab, as the room does. RoomStore says what's in it.
const HOSTING = 'phosphor-hosting';

// True if written; a write that fails (it won't fit) leaves the last good record.
export const keepHostingRecord = (record) => {
  try {
    sessionStorage.setItem(HOSTING, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
};

export const keptHostingRecord = () => {
  try {
    return JSON.parse(sessionStorage.getItem(HOSTING));
  } catch {
    return null;
  }
};

export const forgetHostingRecord = () => {
  try {
    sessionStorage.removeItem(HOSTING);
  } catch { /* no storage: nothing was kept */ }
};

// The tab hosting a room holds this lock from when it knows it's the host until it's done, and a tab that closes lets go.
// A second tab asking waits its turn, so one reloading or copying a tab counts as there.
const TAB_LOCK = 'phosphor-hosting:';

// The function that lets go.
export const holdHostingTab = (id) => {
  let letGo;
  const held = new Promise((resolve) => { letGo = resolve; });
  navigator.locks?.request(TAB_LOCK + id, () => held).catch(() => {});
  return letGo;
};

// Which of these rooms no tab holds. With no Web Locks, none: a closed tab can't be told from an open one, and taking the
// room from an open one is worse than not offering it. (Any browser that can sign in to SOCIAL has them.)
export const hostingTabsGone = async (ids) => {
  if (!navigator.locks) return [];
  const { held = [], pending = [] } = await navigator.locks.query();
  const taken = new Set([...held, ...pending].map((lock) => lock.name));
  return ids.filter((id) => !taken.has(TAB_LOCK + id));
};
