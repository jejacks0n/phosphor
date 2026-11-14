// The addresses this machine's room can be reached at: private LAN addresses first (192.168/16, then 10/8, then
// 172.16/12), as the one to give is the first listed, then any others, and Tailscale's (100.64.0.0/10) last.
// Link-local addresses (169.254/16, a network with no DHCP answer) are left out.
// PHOSPHOR_ADDRESSES (comma-separated, the port added where one isn't given) replaces the list, for the
// end-to-end tests.
import os from 'node:os';
import process from 'node:process';

// Where an address goes in the list, lowest first; null for one left out.
const rank = (ip) => {
  const [a, b] = ip.split('.').map(Number);
  if (a === 169 && b === 254) return null;
  if (a === 192 && b === 168) return 0;
  if (a === 10) return 1;
  if (a === 172 && b >= 16 && b <= 31) return 2;
  return a === 100 && b >= 64 && b <= 127 ? 4 : 3;
};

export function reachableAddresses(interfaces = os.networkInterfaces(), port) {
  const given = process.env.PHOSPHOR_ADDRESSES?.split(',').map((a) => a.trim()).filter(Boolean);
  if (given?.length) return given.map((a) => (/:\d+$/.test(a) ? a : `${a}:${port}`));
  const ips = Object.values(interfaces).flat()
    .filter((i) => !i.internal && (i.family === 'IPv4' || i.family === 4))
    .map((i) => i.address)
    .filter((ip) => rank(ip) !== null);
  return ips.sort((x, y) => rank(x) - rank(y)).map((ip) => `${ip}:${port}`);   // a stable sort: the system's order within a rank
}
