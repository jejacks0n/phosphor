// The addresses: which tab, SOCIAL page or the lobby each path is, and where an address may land.
export const PLACES = [
  ['/pixel', { tab: 'input' }],
  ['/ansi', { tab: 'output' }],
  ['/vector', { tab: 'vector' }],
  ['/sauce', { tab: 'sauce' }],
  ['/room', { tab: 'room' }],
  ['/social', { lobby: true }],
  ['/social/sign-in', { page: 'sign-in' }],
  ['/social/create', { page: 'create' }],
  ['/social/forgot', { page: 'forgot' }],
  ['/social/account', { page: 'account' }],
  ['/social/blocked', { page: 'blocked' }],
  ['/social/two-factor', { page: 'two-factor' }],
  ['/social/start', { page: 'start-room' }],
  ['/social/reset', { page: 'reset' }],
  ['/social/name', { page: 'onboarding' }],
];

// A SOCIAL page open over the tab is its address; with none it's the tab's. With nothing open the art tabs are
// the start screen, which is /. The lobby (/social) is no place of its own: landing there opens it in the side
// panel, and the tab's address takes its place.
export function pathOf({ tab, page = 'lobby', empty = false }) {
  const open = page !== 'lobby' && PLACES.find(([, p]) => p.page === page);
  if (open) return open[0];
  if (empty && tab !== 'room') return '/';
  return PLACES.find(([, p]) => p.tab === tab)?.[0] ?? '/';
}

// A page that can't be shown goes to the nearest one that can. The desktop app has no accounts: only hosting's page.
export function arrivalPage(page, { signedIn, needsOnboarding, resetToken, codePending, canStart }) {
  if (import.meta.env.VITE_DESKTOP === '1') return page === 'start-room' ? page : 'lobby';
  if (page === 'account' || page === 'blocked') return signedIn ? page : 'sign-in';
  if (page === 'two-factor') return codePending ? page : 'lobby';
  if (page === 'reset') return resetToken ? page : 'lobby';
  if (page === 'sign-in' || page === 'create') return signedIn ? 'lobby' : page;
  if (page === 'onboarding') return needsOnboarding ? page : 'lobby';
  if (page === 'start-room') return canStart ? page : 'lobby';
  return page;
}

// An old hash address (/#/social?room=x, or /?plugins=off#/ansi) as the path address it means: the hash's path, and
// the URL's query with the hash's merged in (the hash's winning). Null for any other URL. Always this origin's.
export function fromHashAddress(href) {
  const url = new URL(href);
  if (!url.hash.startsWith('#/')) return null;
  let inner;
  try {   // (a backslash is a slash to the parser: only one leading one, or it's a host to parse)
    inner = new URL(url.hash.slice(1).replace(/^[/\\]+/, '/'), url.origin);
  } catch {
    return null;
  }
  for (const [name, value] of inner.searchParams) url.searchParams.set(name, value);
  return inner.pathname.replace(/^[/\\]+/, '/') + url.search;
}
