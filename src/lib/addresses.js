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

// A page that can't be shown goes to the nearest one that can.
export function arrivalPage(page, { signedIn, needsOnboarding, resetToken, codePending, canStart }) {
  if (page === 'account') return signedIn ? page : 'sign-in';
  if (page === 'two-factor') return codePending ? page : 'lobby';
  if (page === 'reset') return resetToken ? page : 'lobby';
  if (page === 'sign-in' || page === 'create') return signedIn ? 'lobby' : page;
  if (page === 'onboarding') return needsOnboarding ? page : 'lobby';
  if (page === 'start-room') return canStart ? page : 'lobby';
  return page;
}
