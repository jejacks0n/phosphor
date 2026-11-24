// Which pre-release a build is, if it is one, by package.json's version (__BUILD__.packageVersion, vite.config.js): an
// 'alpha' with -alpha in it (1.0.0-alpha, 1.0.0-alpha.2), a 'beta' with -beta (1.0.0-beta, 1.0.0-beta.2), and a 'beta'
// too on next.phosphor.work, whatever its version: what's there is main, not yet released. Otherwise null, and always
// null in development. The settings panel's banner (BetaBanner.vue) shows on one and says which.
export function buildStage({ packageVersion = __BUILD__.packageVersion, hostname = globalThis.location?.hostname, dev = import.meta.env.DEV } = {}) {
  if (dev) return null;
  const [, named] = /-(alpha|beta)(?:\.|$)/.exec(packageVersion) ?? [];
  return named ?? (hostname === 'next.phosphor.work' ? 'beta' : null);
}
