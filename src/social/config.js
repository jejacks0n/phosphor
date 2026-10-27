// Where the SOCIAL server is. VITE_SOCIAL_API wins; on localhost it's the local server.
export function apiOrigin(env = import.meta.env, location = globalThis.location) {
  if (env?.VITE_SOCIAL_API) return env.VITE_SOCIAL_API;
  return location.hostname === 'localhost' ? 'http://localhost:8787' : 'https://api.phosphor.work';
}

export const wsOrigin = (origin) => origin.replace(/^http/, 'ws');   // https: -> wss:, http: -> ws:

// The page's own origin: the callback URLs the server sends people back to.
export const appOrigin = (location = globalThis.location) => location.origin;

// The SOCIAL tab is desktop only; the app's mobile breakpoint is max-width: 768px.
export const desktopQuery = '(min-width: 769px)';

// The ICE servers for a room's connections: Cloudflare's STUN, no TURN. VITE_SOCIAL_STUN replaces the
// URL; "none" means no servers (the end-to-end build, where nothing may reach the network).
export function rtcConfig(env = import.meta.env) {
  const stun = env?.VITE_SOCIAL_STUN || 'stun:stun.cloudflare.com:3478';
  return { iceServers: stun === 'none' ? [] : [{ urls: stun }] };
}
