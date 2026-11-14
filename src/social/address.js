// What someone types to join a desktop room: an IPv4 address, a hostname or a bracketed IPv6 address, with a port or
// not. Read as { host, port, address } ('host:port', IPv6 kept in its brackets), or { error } with why it isn't one.
export const DEFAULT_PORT = 31337;   // the room service's first choice

const HOSTNAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i;   // an IPv4 address is one too
const IPV6 = /^[0-9a-f.]*:[0-9a-f:.]*$/i;

export function parseAddress(text) {
  const typed = String(text ?? '').trim().replace(/^(ws|http):\/\//i, '').replace(/\/$/, '').trim();
  if (!typed) return { error: 'empty' };
  const bracketed = /^\[([^\]]*)\](?::(.*))?$/.exec(typed);
  const parts = bracketed ? [bracketed[1], bracketed[2]] : typed.split(':');
  const [host, port] = parts;
  if (parts.length > 2 || !(bracketed ? IPV6 : HOSTNAME).test(host)) return { error: 'bad-host' };   // IPv6 needs its brackets
  const number = port === undefined ? DEFAULT_PORT : /^\d{1,5}$/.test(port) ? Number(port) : 0;
  if (number < 1 || number > 65535) return { error: 'bad-port' };
  return { host, port: number, address: `${bracketed ? `[${host}]` : host}:${number}` };
}
