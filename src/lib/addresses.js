// The addresses: which tab and SOCIAL page each path is, and where an address may land.
export const PLACES = [
  ['/pixel', { tab: 'input' }],
  ['/ansi', { tab: 'output' }],
  ['/sauce', { tab: 'sauce' }],
  ['/social', { tab: 'social', page: 'lobby' }],
  ['/social/sign-in', { tab: 'social', page: 'sign-in' }],
  ['/social/create', { tab: 'social', page: 'create' }],
  ['/social/forgot', { tab: 'social', page: 'forgot' }],
  ['/social/account', { tab: 'social', page: 'account' }],
  ['/social/two-factor', { tab: 'social', page: 'two-factor' }],
  ['/social/start', { tab: 'social', page: 'start-room' }],
  ['/social/reset', { tab: 'social', page: 'reset' }],
  ['/social/name', { tab: 'social', page: 'onboarding' }],
];

// The pages a guest watching a room still gets, to sign in to chat.
export const SIGN_IN_PAGES = new Set(['sign-in', 'create', 'forgot', 'two-factor', 'onboarding']);

// The room you host or watch shows in place of the lobby, so its address is /social.
export function pathOf({ tab, page, role }) {
  const inRoom = role === 'host' || (role === 'watch' && !SIGN_IN_PAGES.has(page));
  const shown = tab === 'social' && !inRoom ? page : 'lobby';
  return PLACES.find(([, p]) => p.tab === tab && (tab !== 'social' || p.page === shown))?.[0] ?? '/social';
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
